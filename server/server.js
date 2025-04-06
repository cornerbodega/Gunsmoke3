require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const saveToSupabase = require("./utils/saveToSupabase");
const crypto = require("crypto");

const sendSlackMessage = require("./utils/sendToSlack.js"); // adjust path if needed

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const fs = require("fs");
const OpenAI = require("openai");
const speakerVoiceMap = new Map();
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

const os = require("os");
const path = require("path");
const { error, log } = require("console");

// Enhance console logging with timestamps and iTerm-friendly format
["log", "info", "warn", "error"].forEach((method) => {
  const original = console[method];
  console[method] = (...args) => {
    const timestamp = new Date().toTimeString().split(" ")[0]; // "HH:MM:SS"
    original(`[${timestamp}] |`, ...args);
  };
});

function setupGoogleCredentialsFromBase64() {
  const base64 = process.env.GCS_APPLICATION_CREDENTIALS_BASE64;

  if (!base64) {
    throw new Error("❌ Missing GCS_APPLICATION_CREDENTIALS_BASE64");
  }

  const creds = Buffer.from(base64, "base64").toString("utf8");
  const credsPath = path.join(os.tmpdir(), "gcs-creds.json");

  fs.writeFileSync(credsPath, creds);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;

  console.log("🔐 Google credentials written to:", credsPath);
}

setupGoogleCredentialsFromBase64(); // 🧠 MUST be before using any GCP clients

const textToSpeech = require("@google-cloud/text-to-speech");
const client = new textToSpeech.TextToSpeechClient();
const { Storage } = require("@google-cloud/storage");
const { get } = require("http");
const storage = new Storage();
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

const app = express();
const port = 3001;

app.use(cors());

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 200 * 1024 * 1024 },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const cmuDict = new Map();

function loadCmuDict(
  filePath = path.join(__dirname, "./utils/cmudict-0.7b.txt")
) {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");

  for (const line of lines) {
    if (line.startsWith(";;;")) continue;

    const [rawWord, ...rest] = line.trim().split(/\s+/);
    const word = rawWord.replace(/\(\d+\)/, ""); // Handle CMU multiple entries like WORD(1)
    const phonemes = rest.map((p) => p.replace(/\d/g, "")); // Remove stress numbers

    if (!cmuDict.has(word)) {
      cmuDict.set(word, phonemes);
    }
  }
}
loadCmuDict();
const phonemeToViseme = {
  AA: "A",
  AE: "A",
  AH: "A",
  AO: "O",
  AW: "O",
  AY: "A",
  EH: "E",
  ER: "E",
  EY: "E",
  IH: "E",
  IY: "E",
  UH: "U",
  UW: "U",
  B: "M",
  P: "M",
  M: "M",
  F: "F",
  V: "F",
  TH: "TH",
  DH: "TH",
  S: "S",
  Z: "S",
  SH: "SH",
  ZH: "SH",
  CH: "CH",
  JH: "CH",
  K: "K",
  G: "K",
  T: "T",
  D: "T",
  N: "N",
  NG: "N",
  R: "R",
  L: "L",
  Y: "Y",
  W: "W",
  HH: "rest",
  sil: "rest",
};

const MAX_CHUNKS = 1;
const textChunkSize = 7000;

function splitTextByChars(text, maxChars = textChunkSize, overlap = 500) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    chunks.push(text.slice(i, end));
    i += maxChars - overlap;
  }
  return chunks;
}

/**
 * Helper to fetch all rows for a given scene using pagination.
 */
async function getAllLinesForScene(sceneId) {
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  let fetchedRows = [];

  do {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("gs3_lines")
      .select("line_id, line_obj")
      .eq("scene_id", sceneId)
      .order("line_id", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("❌ Error fetching rows:", error.message);
      break;
    }
    console.log(`📦 Fetched ${data.length} rows [${from}-${to}]`);
    fetchedRows = data;
    allRows = allRows.concat(fetchedRows);
    from += pageSize;
  } while (fetchedRows.length === pageSize);

  return allRows;
}

app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    console.log("📥 Received PDF upload...");
    sendSlackMessage(
      `📥 Received PDF upload...`,
      "info",
      "script-creation-logs"
    ); // Slack message

    const sceneId = crypto.randomUUID(); // or whatever UUID you generate
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    const docMetadata = await analyzeRawDocument(parsed.text);
    console.log("🧠 Document Analysis Result:", docMetadata);

    fs.unlinkSync(filePath);
    console.log("📄 PDF parsed successfully");
    sendSlackMessage(
      `📥 PDF Parsed Successfully.`,
      "success",
      "script-creation-logs"
    ); // Slack message
    const chunks = splitTextByChars(parsed.text, textChunkSize, 500);
    const limit = Math.min(MAX_CHUNKS, chunks.length);
    console.log(`🔢 Processing ${limit} of ${chunks.length} chunks`);

    // 🔍 Extract characters
    console.log("🔍 Extracting character list...");
    sendSlackMessage(
      `🔍 Extracting character list...`,
      "info",
      "script-creation-logs"
    ); // Slack message
    // 🔍 Unified speaker map
    const speakerMap = new Map(); // id => { name, role, label, voice }

    for (let i = 0; i < limit; i++) {
      const detected = await extractCharactersFromChunk(chunks[i], speakerMap);
      for (const char of detected) {
        if (!speakerMap.has(char.id)) {
          speakerMap.set(char.id, {
            name: char.name,
            speaker_label: char.speaker_label,
            role: char.role,
          });
        }
      }
    }
    speakerMap.set("clerk", {
      name: "Clerk",
      speaker_label: "Clerk",
      role: "clerk",
      voice: "en-US-Wavenet-C",
    });
    // Step here to clean speakerMap
    console.log("👥 Final Speaker Map:", Object.fromEntries(speakerMap));
    sendSlackMessage(
      `👥 Final Speaker Map: ${JSON.stringify(Object.fromEntries(speakerMap))}`,
      "info",
      "script-creation-logs"
    ); // Slack message
    // Log the start of the character cleaning process
    console.log("[INFO] Starting character cleaning process...");
    sendSlackMessage(
      `[INFO] Starting character cleaning process...`,
      "info",
      "script-creation-logs"
    ); // Slack message
    // Call OpenAI to clean up the speakerMap and get unique characters
    console.log("[INFO] Sending speaker map to OpenAI for cleaning...");
    const charactersResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert in courtroom transcripts. Given a list of characters, clean up the list by removing duplicates and ensuring consistent naming conventions. Each character should have a unique ID, and their roles should be clearly defined. Return the same JSON format. Remove any Unknowns. Do not explain your answer.`,
        },
        {
          role: "user",
          content: JSON.stringify(Array.from(speakerMap.values())),
        },
      ],
    });

    // Log the raw response received from OpenAI
    const rawCharacters = charactersResponse.choices[0].message.content;
    console.log("[DEBUG] Raw characters response from OpenAI:", rawCharacters);

    // Remove markdown formatting from the response
    const cleanedCharacters = rawCharacters
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
    console.log("[DEBUG] Cleaned characters JSON string:", cleanedCharacters);

    // Parse the cleaned JSON into an object
    let parsedCharacters;
    try {
      parsedCharacters = JSON.parse(cleanedCharacters);
      console.log("[INFO] Successfully parsed cleaned characters.");
      sendSlackMessage(
        `[INFO] Successfully parsed cleaned characters.`,
        "info",
        "script-creation-logs"
      );
    } catch (parseError) {
      console.error(
        "[ERROR] Failed to parse cleaned characters JSON:",
        parseError
      );
      sendSlackMessage(
        `[ERROR] Failed to parse cleaned characters JSON:`,
        "error",
        "script-creation-logs"
      );
      throw parseError;
    }

    // Clear and update the speakerMap with cleaned characters using the unique "id"
    speakerMap.clear();
    for (const char of parsedCharacters) {
      speakerMap.set(char.id, {
        name: char.name,
        speaker_label: char.speaker_label,
        role: char.role,
      });
    }
    // await assignVoicesForAllSpeakers(speakerMap, openai);

    console.log(
      "[INFO] Updated speaker map with cleaned characters:",
      Object.fromEntries(speakerMap)
    );

    // 🧠 Process chunks
    const processedChunks = [];
    let lastSpeaker = null;
    let lastLine = null;

    for (let i = 0; i < limit; i++) {
      console.log(`🧼 Cleaning chunk ${i + 1} of ${chunks.length}`);
      sendSlackMessage(
        `🧼 Cleaning chunk ${i + 1} of ${
          chunks.length
        } (up to Max Chunks = ${MAX_CHUNKS})`,
        "info",
        "script-creation-logs"
      );
      const cleanedText = await processChunk(
        chunks[i],
        speakerMap,
        lastSpeaker,
        lastLine
      );

      processedChunks.push({
        chunkIndex: i,
        originalText: chunks[i],
        cleanedText,
      });

      const lines = cleanedText.split("\n").filter(Boolean);
      const lastDialogLine = lines[lines.length - 1];
      const match = lastDialogLine.match(/^(.+?):\s*(.+)$/);
      if (match) {
        lastSpeaker = match[1];
        lastLine = match[2];
      }
    }

    // 🧵 AI-powered de-overlap
    const finalTranscript = await removeOverlapIteratively(
      processedChunks.map((c) => c.cleanedText)
    );
    const CONTEXT_WINDOW = 10;
    const lines = finalTranscript.split("\n").filter(Boolean);
    let previousLines = [];

    for (let i = 0; i < lines.length; i++) {
      const metadata = await generateMetadataForLine({
        text: lines[i],
        previousLines,
      });

      const lineObj = {
        character_id: metadata.character_id,
        text: metadata.text,
        posture: metadata.posture,
        emotion: metadata.emotion,
        zone: metadata.zone,
        camera: metadata.camera,
        eye_target: metadata.eye_target,
        pause_before: metadata.pause_before,
        audio_url: metadata.audio_url,
        viseme_data: metadata.viseme_data,
        role: metadata.role,
      };

      const lineData = {
        scene_id: sceneId,
        line_id: i + 1,
        line_obj: lineObj,
      };

      await saveToSupabase("gs3_lines", lineData).catch((error) =>
        console.error(`❌ Error saving line ${i + 1}:`, error.message)
      );
      console.log(
        `✅ Line ${i + 1} of ${lines.length} = ${(
          (i / lines.length) *
          100
        ).toFixed(2)}% saved to Supabase`
      );
      sendSlackMessage(
        `✅ Line ${i + 1} of ${lines.length} = ${(
          (i / lines.length) *
          100
        ).toFixed(2)}% saved to Supabase`,
        "info",
        "script-creation-logs"
      );
      previousLines.push(lineObj);
      if (previousLines.length > CONTEXT_WINDOW) previousLines.shift();
    }

    async function generateMetadataForLine({ text, previousLines }) {
      const metadata = await generateSceneMetadata({
        text,
        previousLines, // Pass the entire sliding window for context
      });

      return {
        ...metadata,
      };
    }

    async function generateSceneMetadata({ text, previousLines }) {
      let speakerLine = "";
      let currentLineText = "";

      if (typeof text === "string" && text.includes(":")) {
        const [rawSpeaker, ...lineParts] = text.split(":");
        const estimatedSpeaker = rawSpeaker.trim();
        const currentLine = lineParts.join(":").trim();

        speakerLine = `Estimated speaker (potentially incorrect): "${estimatedSpeaker}"`;
        currentLineText = `Current line: "${currentLine}"`;
      }

      const prompt = `
      You're helping animate courtroom scenes. Given a character's current line of dialog and the full metadata of the previous line, return updated metadata for the current line in the following JSON format using the exact value options if specified. Do not create new values or change the numbers. Lawyer roles can be shared across characters.
      
      {
        "posture": "sitting" or "standing",
        "emotion": "neutral" or "tense" or "confident" or "nervous" or "defensive",
        "role": "witness" or "prosecutor1" or "prosecutor2" or "defense1",
        "eye_target": "judge" or "witness" or "prosecutor1" or "prosecutor2"" or "defense1" or "defendant" or "jury",
        "pause_before": "choose a number with respect to previous line for cinematic timing. 0.5 is a good default.",
        "text": "Return only the speech of the character.",
        "character_id": "The character_id of the character speaking the line. Make your best guess from the list.",
      }
      
      Use the prior metadata to keep scene continuity but adapt based on the new dialog. DO NOT wrap your response in markdown or explanation — just return the raw JSON only.
      Defense team all have zone of defense_table_left.
      
      ${speakerLine}
      ${currentLineText}

     Previous Lines:
    ${JSON.stringify(
      previousLines.map((p) => ({
        character_id: p.character_id,
        text: p.text,
        posture: p.posture,
        emotion: p.emotion,
      })),
      null,
      2
    )}
    Characters: ${JSON.stringify(
      Array.from(speakerMap.values()).map((char) => ({
        name: char.name,
        character_id:
          char.id || char.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        role: char.role,
      })),
      null,
      2
    )}
      `;
      console.log("\n📤 Sending scene metadata prompt to OpenAI:\n", prompt);
      console.log(`Sent at: ${new Date().toISOString()}`);

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: prompt }],
        });

        const content = response.choices[0].message.content.trim();
        const jsonText = content
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/, "")
          .trim();
        console.log(`OpenAI Response at: ${new Date().toISOString()}`);

        return JSON.parse(jsonText);
      } catch (err) {
        console.error(
          "❌ Error generating scene metadata:",
          err.message || err
        );
        return {};
      }
    }

    console.log("🧵 Final transcript assembled");
    sendSlackMessage(
      `🧵 Final transcript assembled`,
      "success",
      "script-creation-logs"
    );
    console.log("✅ All lines saved. Starting audio generation...");
    sendSlackMessage(
      `✅ All lines saved. Starting audio generation...`,
      "success",
      "script-creation-logs"
    );
    await generateAudioAndVisemes(sceneId);
    sendSlackMessage(
      `🎙️ Audio and visemes generated`,
      "success",
      "script-creation-logs"
    );

    await generateCharacterStyles(sceneId);
    sendSlackMessage(
      `🧑‍🎨 Character styles generated`,
      "success",
      "script-creation-logs"
    );

    await assignZones(sceneId);
    sendSlackMessage(`📦 Zones assigned`, "success", "script-creation-logs");

    // Build the knownCharacters array from speakerMap
    const knownCharacters = Array.from(speakerMap.values()).map((char) => ({
      name: char.name,
      character_id:
        char.id || char.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    }));

    // Call the batch assignment function
    await assignCharactersBatch(sceneId, knownCharacters);
    sendSlackMessage(
      `🧠 Characters assigned`,
      "success",
      "script-creation-logs"
    );

    const sceneMetadata = {
      scene_id: sceneId,
      scene_name:
        docMetadata.title ||
        parsed.info.Title ||
        `Scene ${sceneId.slice(0, 8)}`,
      metadata: {
        ...docMetadata,
        character_ids: Array.from(speakerMap.keys()),
        numpages: parsed.numpages,
        doc_info: parsed.info,
      },
    };

    await saveToSupabase("gs3_scenes", sceneMetadata).catch((err) => {
      console.error("❌ Failed to save scene metadata:", err.message);
    });
    sendSlackMessage(
      `📄 Scene metadata saved for ${sceneId}`,
      "success",
      "script-creation-logs"
    );

    res.json({
      message: "✅ Transcript processed",
      chunkCount: chunks.length,
      processedChunkCount: processedChunks.length,
      numpages: parsed.numpages,
      info: parsed.info,
      characters: Array.from(speakerMap.values()),
      transcript: finalTranscript,
      cleanedChunks: processedChunks.map((c) => c.cleanedText),
    });
  } catch (err) {
    console.error("❌ PDF parsing error:", err);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

async function assignCharactersBatch(sceneId, knownCharacters, batchSize = 10) {
  try {
    // Fetch all lines for the scene using pagination
    const rows = await getAllLinesForScene(sceneId);

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      // Construct a prompt with the batch of lines
      const prompt = `
You are analyzing a courtroom transcript and need to determine the correct character for each line of dialogue. You will receive a list of lines, each with a unique line ID and the text spoken by the character. Your task is to assign the correct character to each line based on the context of the dialogue. The existing character IDs are not necessarily correct, so you need to analyze the text and assign the correct character.
Use the following list of known characters to select the appropriate character for each line.
Each character is represented by a name and a normalized ID (lowercase with no spaces or punctuation).
If the character says something meta like "this concludes... or "this resumes..." assign them to the judge.

Known characters:
${JSON.stringify(knownCharacters, null, 2)}

For each of the following transcript lines, return an array of JSON objects with the following keys:
- "line_id": (number) the line's unique identifier,
- "name": (string) the character's full name,
- "character_id": (string) the normalized ID.

Transcript lines:
${batch
  .map(
    (row) =>
      `Line ID ${row.line_id}: "${row.line_obj.text.replace(/"/g, '\\"')}"`
  )
  .join("\n")}

Return only the JSON array.
      `.trim();

      // Request the LLM for the batch assignment
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
      });

      let content = response.choices[0].message.content.trim();
      content = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```$/, "")
        .trim();

      let assignments;
      try {
        assignments = JSON.parse(content);
      } catch (parseErr) {
        console.error(
          "🚨 Error parsing batch assignment JSON:",
          parseErr,
          content
        );
        continue;
      }

      // Update each line with the assigned character from the batch response
      for (const assignment of assignments) {
        const { line_id, name, character_id } = assignment;

        // Find the matching line in the batch (for logging or additional logic)
        const lineData = batch.find((r) => r.line_id === line_id);
        if (!lineData) {
          console.warn(`⚠️ No matching line found for line_id ${line_id}`);
          continue;
        }

        const updatedLineObj = {
          ...lineData.line_obj,
          assigned_character: { name, character_id },
        };

        const { error: updateErr } = await supabase
          .from("gs3_lines")
          .update({ line_obj: updatedLineObj })
          .eq("scene_id", sceneId)
          .eq("line_id", line_id);

        if (updateErr) {
          console.error(
            `❌ Failed to update character for line ${line_id}:`,
            updateErr.message
          );
        } else {
          console.log(
            `✅ Updated character for line ${line_id}: ${name} (${character_id})`
          );
        }
      }
    }
  } catch (err) {
    console.error("🚨 Error during batch character assignment:", err.message);
  }
}

async function assignZones(sceneId) {
  try {
    // Fetch all lines using pagination
    const rows = await getAllLinesForScene(sceneId);
    const CONTEXT_WINDOW = 15;
    const priorLines = [];

    for (const row of rows) {
      const { line_id, line_obj } = row;
      const { character_id, role, text } = line_obj;
      console.log(`Zone Assignment Beginning Line Object:`, line_obj);

      const prompt = `
You are assigning spatial zones and camera angles in a courtroom animation based on dialogue context.

Rules:
- The **witness** must always be in "witness_at_witness_stand".
- **Defendants** must be in "defense_table_right" or "witness_at_witness_stand".
- **Defense** roles should only be in "defense_table_left".
- **Prosecutors** must be in "prosecutor_table_left", "prosecutor_at_witness_stand", "prosecutor_table_right",
- **Judge** is in "judge_sitting_at_judge_bench"
- **Clerk** in "clerk_box".
- Do not invent new zones. Choose the most contextually accurate location based on previous line zones and speaker roles and courtroom logic.
Camera angles:
- Choose a shot: "wide_establishing" or "crossExaminationFromWell" or "judge_closeup" or "witness_closeup" or "prosecutor_table" or "defense_table" or "bailiff_reaction" or "wide_view_from_jury",

Return JSON only in this format:
{
  "zone": "...",
  camera": "...",
}

Current line:
{
  "character_id": "${character_id}",
  "role": "${role}",
  "text": "${text}"
}

Prior lines:
${JSON.stringify(
  priorLines.map((l) => ({
    character_id: l.character_id,
    role: l.role,
    text: l.text,
    zone: l.zone,
    camera: l.camera,
  })),
  null,
  2
)}
`.trim();

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
      });

      const content = response.choices[0].message.content.trim();
      const json = content
        .replace(/^```(?:json)?/, "")
        .replace(/```$/, "")
        .trim();

      const { zone, camera } = JSON.parse(json);
      console.log(`Zone assignment for line ${line_id}:`, zone, camera);

      const updatedLineObj = {
        ...line_obj,
        zone,
        camera,
      };

      const { error: updateErr } = await supabase
        .from("gs3_lines")
        .update({ line_obj: updatedLineObj })
        .eq("scene_id", sceneId)
        .eq("line_id", line_id);

      if (updateErr) {
        console.error(
          `❌ Failed to update zone for line ${line_id}:`,
          updateErr.message
        );
      } else {
        console.log(`🗺️ Assigned zone for line ${line_id}: ${zone}`);
      }

      // Update sliding context
      priorLines.push({ character_id, role, text, zone });
      if (priorLines.length > CONTEXT_WINDOW) priorLines.shift();
    }

    console.log("✅ All zones assigned.");
  } catch (err) {
    console.error("🚨 assignZones error:", err.message);
  }
}

async function uploadToGCS(
  buffer,
  destinationPath,
  contentType = "audio/mpeg"
) {
  const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
  const bucket = storage.bucket(GCS_BUCKET_NAME);
  const file = bucket.file(destinationPath);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false, // Just set the file to be uploaded
  });

  return `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${destinationPath}`;
}

async function generateTTS({
  text,
  speaker,
  voiceName,
  sceneId,
  lineIndex,
  debug = false,
  audioFormat = "LINEAR16",
}) {
  if (!text || !voiceName || !sceneId) {
    throw new Error(
      "Missing required TTS parameters: text, voiceName, sceneId."
    );
  }

  const cleanedText = text.trim();
  const filenameBase = `line_${String(lineIndex + 1).padStart(3, "0")}`;
  const filename = `${filenameBase}.${audioFormat === "MP3" ? "mp3" : "wav"}`;
  const destinationPath = `audio/scene_${sceneId}/${filename}`;

  const request = {
    input: { text: cleanedText },
    voice: {
      languageCode: "en-US",
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: audioFormat,
      enableTimePointing: ["WORD"],
      pitch: 0, // customizable
      speakingRate: 1.0, // customizable
    },
  };

  let response;
  try {
    [response] = await client.synthesizeSpeech(request);
  } catch (err) {
    console.error("Google TTS failed:", err);
    throw new Error(`TTS generation failed for line ${lineIndex + 1}`);
  }

  const { audioContent, timepoints = [] } = response;

  if (!audioContent) {
    throw new Error(`No audio content returned from TTS for: "${cleanedText}"`);
  }

  const audioUrl = await uploadToGCS(audioContent, destinationPath);

  if (debug) {
    console.log(`🗣️  Generated audio for line ${lineIndex + 1}`);
    console.log(`📄 Text: "${cleanedText}"`);
    console.log(
      `⏱️ Timepoints (${timepoints.length}):`,
      timepoints
        .map((tp) => `${tp.markName}@${tp.timeSeconds.toFixed(2)}s`)
        .join(" | ")
    );
  }

  return {
    audioUrl,
    timepoints,
    metadata: {
      text: cleanedText,
      wordCount: cleanedText.split(/\s+/).length,
      durationEstimate: (timepoints.at(-1)?.timeSeconds || 0) + 0.5,
      sceneId,
      lineIndex,
      speaker,
    },
  };
}

function alignVisemesWithTimings(text, timepoints, cmuDict) {
  const words = text.toUpperCase().split(/\s+/);
  const visemeFrames = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^A-Z]/g, "");
    const phonemes = cmuDict.get(word) || ["sil"];
    const start = timepoints[i]?.timeSeconds || i * 0.4;
    const phonemeDuration = 0.4 / phonemes.length;

    phonemes.forEach((p, j) => {
      const time = +(start + j * phonemeDuration).toFixed(2);
      visemeFrames.push({
        time,
        viseme: phonemeToViseme[p.replace(/\d/g, "")] || "rest",
      });
    });
  }

  return {
    duration:
      timepoints?.slice(-1)[0]?.timeSeconds + 0.5 || visemeFrames.length * 0.3,
    frames: visemeFrames,
  };
}

async function generateAudioAndVisemes(sceneId) {
  try {
    // Fetch all lines using pagination
    const rows = await getAllLinesForScene(sceneId);

    for (const row of rows) {
      const { line_id, line_obj } = row;
      const { text, character_id } = line_obj;
      line_obj.voice = assignVoiceForSpeaker(character_id);

      const voice = line_obj.voice; // ✅ already injected by metadata process

      // 🎙️ Generate TTS
      const { audioUrl, timepoints } = await generateTTS({
        text,
        speaker: character_id,
        voiceName: voice,
        sceneId,
        lineIndex: line_id - 1,
      });

      const visemeData = alignVisemesWithTimings(text, timepoints, cmuDict);

      // 📝 Update Supabase line_obj with audio_url + visemes
      const updatedLineObj = {
        ...line_obj,
        audio_url: audioUrl,
        viseme_data: visemeData,
      };

      const { error: updateErr } = await supabase
        .from("gs3_lines")
        .update({ line_obj: updatedLineObj })
        .eq("scene_id", sceneId)
        .eq("line_id", line_id);

      if (updateErr) {
        console.error(
          `❌ Failed to update line ${line_id}:`,
          updateErr.message
        );
      } else {
        sendSlackMessage(
          `✅ Updated line ${line_id} with audio and visemes`,
          "success",
          "script-creation-logs"
        );
        console.log(`✅ Updated line ${line_id} with audio and visemes`);
      }
    }

    console.log("🎉 All audio and viseme updates complete.");
  } catch (err) {
    console.error("🚨 Error during audio + viseme generation:", err.message);
  }
}

async function extractCharactersFromChunk(chunkText, speakerMap) {
  try {
    const prompt = `
    The following is text from a courtroom transcript. Extract all **unique speakers**, and return their:
    
    - Full name
    - Speaker label (e.g., "Q", "A", "THE COURT")
    - Role (one of these: judge, witness, defense1, defense2, prosecutor1, prosecutor2, defendant)
    - A normalized ID (lowercase, no spaces or punctuation — used for database keys)
    Return an array like:
    
    [
      {
        "name": "Elizabeth Holmes",
        "speaker_label": "A",
        "role": "defendant",
        "id": "elizabethholmes"
      },
      {
        "name": "Jessica Chan",
        "speaker_label": "Q",
        "role": "prosecutor1",
        "id": "jessicachan"
      }
    ]
    
    ⚠️ Do NOT wrap your response in markdown. Return raw JSON only.
    `;

    const slicedInput = chunkText.slice(0, 3000);
    console.log(
      "\n📤 Sending character extraction prompt to OpenAI:\n",
      prompt
    );
    console.log("📄 With input:\n", slicedInput);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `Input: ${slicedInput}.\n\n Characters so far: ${JSON.stringify(
            speakerMap
          )}`,
        },
      ],
    });

    let jsonText = response.choices[0].message.content.trim();
    console.log("📥 OpenAI response (raw):\n", jsonText);
    console.log("────────────────────────────────────────────");

    jsonText = jsonText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error(
      "❌ Character extraction error:",
      error.response?.data || error.message
    );
    return [];
  }
}

async function processChunk(chunkText, speakerMap, lastSpeaker, lastLine) {
  return await cleanText(chunkText, speakerMap, lastSpeaker, lastLine);
}

async function cleanText(chunkText, speakerMap, lastSpeaker, lastLine) {
  try {
    let contextPrompt = `You are cleaning and reformatting dialog from a legal transcript. Based on the prior speaker and last spoken line, continue appropriately.\n\n`;

    if (lastSpeaker && lastLine) {
      contextPrompt += `Previous speaker: ${lastSpeaker}\nPrevious line: "${lastLine}"\n\n`;
    }

    contextPrompt += `Identify speakers using this list: ${JSON.stringify(
      Array.from(speakerMap.values()).map((s) => {
        return { name: s.name, role: s.role, label: s.speaker_label };
      })
    )}. Return dialog only, in the format "Speaker Name: line". Do not explain or summarize. Omit narration or non-dialog text. 
      
      ⚠️ If the transcript includes any redaction codes (such as (b)(6), (b)(7)(C), or similar), replace them with "Redacted". Ensure redacted portions are cleanly replaced and do not break sentence structure.
      
      Note: If the speaker's eye target would change over the course of a statement, split each statement into its own line.
      `;

    const sampleInput = `version, how many tests could it run 18 at that time in 2010? 19 A I don't know exactly what the number was...`;
    const sampleOutput = `Jessica Chan: Version, how many tests could it run at that time in 2010?\nElizabeth Holmes: I don't know exactly what the number was...`;

    console.log(
      "\n📤 Sending transcript cleaning prompt to OpenAI:\n",
      contextPrompt
    );
    sendSlackMessage(
      `📤 Sending transcript cleaning prompt to OpenAI:`,
      "info",
      "script-creation-logs"
    );
    console.log(
      "📄 With input (first 1000 chars):\n",
      chunkText.slice(0, 1000)
    );

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: contextPrompt },
        { role: "user", content: sampleInput },
        { role: "assistant", content: sampleOutput },
        { role: "user", content: chunkText },
      ],
    });

    const result = response.choices[0].message.content;
    console.log(
      "📥 OpenAI response (transcript chunk):\n",
      result.slice(0, 1000)
    );
    sendSlackMessage(
      `📥 OpenAI response (transcript chunk): ${result.slice(0, 100)}`,
      "info",
      "script-creation-logs"
    );
    console.log("────────────────────────────────────────────");

    return result;
  } catch (error) {
    console.error(
      "❌ GPT-4o-mini error:",
      error.response?.data || error.message
    );
    throw new Error("Failed to process chunk with GPT-4o-mini");
  }
}

async function removeOverlapIteratively(cleanedChunks, overlapSize = 1000) {
  if (cleanedChunks.length === 0) return "";

  let mergedTranscript = cleanedChunks[0];

  for (let i = 1; i < cleanedChunks.length; i++) {
    const leftOverlap = mergedTranscript.slice(-overlapSize);
    const rightOverlap = cleanedChunks[i].slice(0, overlapSize);

    const prompt = `
Two courtroom transcript segments may have overlapping or repeated dialogue at their boundaries. Your task is to merge them cleanly **only at the overlap**, keeping only one version of repeated lines.

Return the clean merged result in "Speaker: line" format. No explanations, no markdown.

LEFT (end of previous segment):
${leftOverlap}

RIGHT (start of current segment):
${rightOverlap}

Merged segment:
`.trim();

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
      });

      const mergedBoundary = response.choices[0].message.content.trim();

      // Stitch together: previous non-overlap + merged + next non-overlap
      const leftPreserved = mergedTranscript.slice(0, -overlapSize);
      const rightPreserved = cleanedChunks[i].slice(overlapSize);
      mergedTranscript = leftPreserved + mergedBoundary + rightPreserved;

      console.log(
        `✅ Merged chunk ${i - 1} + ${i} (${mergedBoundary.length} chars)`
      );
    } catch (err) {
      console.warn(`⚠️ Failed to merge chunks ${i - 1} + ${i}:`, err.message);
      mergedTranscript += "\n" + cleanedChunks[i]; // fallback: append as-is
    }
  }

  return mergedTranscript;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function assignVoiceForSpeaker(speaker) {
  const availableVoices = [
    "en-US-Wavenet-A",
    "en-US-Wavenet-B",
    // "en-US-Wavenet-C",
    "en-US-Wavenet-D",
    "en-US-Wavenet-E",
    "en-US-Wavenet-F",
    "en-US-Wavenet-G",
    "en-US-Wavenet-H",
  ];
  // use ai for this! also keep a list of voices used
  const index = Math.abs(hashString(speaker)) % availableVoices.length;
  return availableVoices[index];
}
// function hashString(str) {
//   let hash = 0;
//   for (let i = 0; i < str.length; i++) {
//     hash = (hash << 5) - hash + str.charCodeAt(i);
//     hash |= 0;
//   }
//   return hash;
// }

// function assignVoicesForAllSpeakers(speakerMap) {
//   const availableVoices = [
//     // "en-US-Wavenet-A",
//     "en-US-Wavenet-B",
//     "en-US-Wavenet-C",
//     "en-US-Wavenet-D",
//     "en-US-Wavenet-E",
//     "en-US-Wavenet-F",
//     "en-US-Wavenet-G",
//     "en-US-Wavenet-H",
//     "en-US-Wavenet-I",
//     "en-US-Wavenet-J",
//   ];

//   const voiceHistory = []; // rolling window of recent voices
//   const maxRecent = 3;

//   for (const [id, character] of speakerMap.entries()) {
//     let voice = availableVoices.find((v) => !voiceHistory.includes(v));

//     if (!voice) {
//       // fallback: use hash-based selection to keep it stable
//       const hash = Math.abs(hashString(id));
//       voice = availableVoices[hash % availableVoices.length];
//     }

//     // assign and update rolling history
//     character.voice = voice;
//     voiceHistory.push(voice);
//     if (voiceHistory.length > maxRecent) {
//       voiceHistory.shift(); // keep window size in check
//     }
//   }

//   console.log("🔊 Assigned voices (spread):", Object.fromEntries(speakerMap));
// }

async function analyzeRawDocument(text) {
  const prompt = `
  You're an expert legal analyst. Given the raw text of a legal document, return a summary of what kind of document it is, who is involved, the court type (federal, state, criminal, civil, etc.), and any other key metadata.
  
  Return JSON only in the following format:
  {
    "title": "string",                // optional — extracted or inferred
    "type": "transcript" | "pleading" | "brief" | "exhibit" | "motion" | "ruling" | "other",
    "court_type": "federal" | "state" | "civil" | "criminal" | "unknown",
    "participants": ["names or roles"], 
    "summary": "1-2 sentence description of what this document is"
  }
  
  ⚠️ DO NOT include markdown or explanation — return raw JSON only.
    `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text.slice(0, 12000) },
      ],
    });

    const content = response.choices[0].message.content.trim();
    const jsonText = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();

    return JSON.parse(jsonText);
  } catch (err) {
    console.error("❌ Error analyzing raw document:", err.message || err);
    return {
      type: "unknown",
      court_type: "unknown",
      participants: [],
      summary: "Could not analyze document",
    };
  }
}

async function generateCharacterStyles(sceneId) {
  try {
    // Fetch all lines using pagination
    const rows = await getAllLinesForScene(sceneId);

    // Step 1: Build set of unique character_ids
    const characterIds = new Set();
    for (const row of rows) {
      const characterId = row.line_obj.character_id;
      if (characterId) characterIds.add(characterId);
    }

    // Step 2: Generate all styles in memory
    const styleMap = new Map();
    for (const characterId of characterIds) {
      const style = await getStyleForCharacter(characterId);
      styleMap.set(characterId, style);
    }

    // Step 3: Update lines using the styleMap
    for (const row of rows) {
      const { line_id, line_obj } = row;
      const characterId = line_obj.character_id;

      const updatedLineObj = {
        ...line_obj,
        style: styleMap.get(characterId),
      };

      const { error: updateErr } = await supabase
        .from("gs3_lines")
        .update({ line_obj: updatedLineObj })
        .eq("scene_id", sceneId)
        .eq("line_id", line_id);

      if (updateErr) {
        console.error(
          `❌ Failed to update style for line ${line_id}:`,
          updateErr.message
        );
      } else {
        console.log(`🎨 Applied style for ${characterId} on line ${line_id}`);
      }
    }

    console.log("🎉 All character styles applied successfully.");
  } catch (err) {
    console.error("🚨 Error in generateCharacterStyles:", err.message);
  }
}

async function getStyleForCharacter(character_id) {
  const example = {
    hair_color: "#hex code",
    hair_style: 'choose either "long" or "bald"',
    skin_color: "#hex code",
    shirt_color: "#hex code",
    pants_color: "#hex code",
  };

  const prompt = `
You are creating stylized character designs for a courtroom animation. Given the character ID (like "jessicachan" or "elizabethholmes"), create a consistent color/styling profile.

Return JSON only in this format:

${JSON.stringify(example, null, 2)}

Only use hex codes for colors. Elizabeth holmes is famously blonde and wears all black for example. Choose appropriate combinations for professional courtroom attire.
Do NOT wrap your response in markdown.
Character ID: ${character_id}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
    });

    const content = response.choices[0].message.content.trim();
    const jsonText = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();

    return JSON.parse(jsonText);
  } catch (err) {
    console.error(
      `❌ Failed to generate style for ${character_id}:`,
      err.message || err
    );
    return {
      hair_color: "#000000",
      hair_style: "short",
      skin_color: "#cccccc",
      shirt_color: "#888888",
      pants_color: "#444444",
    };
  }
}

app.get("/audio-proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL");

  try {
    const decodedUrl = decodeURIComponent(url);

    // Optional: whitelist only your GCS bucket
    const allowedHost = "storage.googleapis.com";
    const parsed = new URL(decodedUrl);
    if (!parsed.hostname.endsWith(allowedHost)) {
      return res.status(403).send("Forbidden: Invalid host");
    }

    const response = await fetch(decodedUrl);

    if (!response.ok) {
      return res.status(response.status).send("Upstream fetch failed");
    }

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "audio/mpeg"
    );
    res.setHeader(
      "Content-Length",
      response.headers.get("content-length") || "0"
    );
    res.setHeader("Access-Control-Allow-Origin", "*");

    const reader = response.body.getReader();

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };

    await pump();
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Proxy failed");
  }
});
app.post("/convert", upload.single("video"), (req, res) => {
  const sceneId = req.body.sceneId;
  const sessionId = req.body.sessionId;
  const line_id = req.body.line_id || `0`;
  const folderName = `${sessionId}-${sceneId}`;
  const folderPath = path.join(__dirname, "videos", folderName);

  if (!req.file) {
    return res.status(400).send("No video file uploaded.");
  }

  const inputPath = req.file.path;
  const outputFileName = `${line_id}.mp4`;
  const outputPath = path.join(folderPath, outputFileName);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  if (!fs.existsSync(inputPath)) {
    console.error("❌ Input file missing:", inputPath);
    return res.status(400).send("Missing uploaded file.");
  }

  const stats = fs.statSync(inputPath);

  console.log(
    `📹 Converting ${inputPath} (${(stats.size / 1024 / 1024).toFixed(
      2
    )} MB) to ${outputPath}`
  );

  ffmpeg(inputPath)
    .inputFormat("webm")
    .videoCodec("libx264")
    .audioCodec("aac")
    .videoFilters("scale=ceil(iw/2)*2:ceil(ih/2)*2")
    .outputOptions(["-movflags +faststart", "-pix_fmt yuv420p", "-r 30"])
    // .on("start", (cmd) => console.log("🎬 FFmpeg started:", cmd))
    // .on("stderr", (line) => console.log("🧪 FFmpeg stderr:", line))
    .on("end", () => {
      console.log(`✅ Conversion finished: ${outputPath}`);
      sendSlackMessage(
        `FFmpeg success: ${outputPath}`,
        "success",
        "script-creation-logs"
      );
      fs.unlinkSync(inputPath);
      res.json({ message: "Video segment converted and saved" });
    })
    .on("error", (err) => {
      console.error("❌ FFmpeg error:", err.message || err);
      sendSlackMessage(
        `FFmpeg error: ${err.message || err}`,
        "error",
        "script-creation-logs"
      );
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      res.status(500).send("Conversion failed");
    })
    .save(outputPath);
});

app.listen(port, () => {
  console.log(`✅ PDF parser server running on http://localhost:${port}`);
});
