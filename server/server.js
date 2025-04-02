require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const saveToSupabase = require("./utils/saveToSupabase");

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

const textToSpeech = require("@google-cloud/text-to-speech");
const client = new textToSpeech.TextToSpeechClient();
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const os = require("os");
const path = require("path");
const { error } = require("console");

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

const MAX_CHUNKS = 4;

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

app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    console.log("📥 Received PDF upload...");

    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    const docMetadata = await analyzeRawDocument(parsed.text);
    console.log("🧠 Document Analysis Result:", docMetadata);

    fs.unlinkSync(filePath);
    console.log("📄 PDF parsed successfully");

    const chunks = splitTextByChars(parsed.text, textChunkSize, 500);
    const limit = Math.min(MAX_CHUNKS, chunks.length);
    console.log(`🔢 Processing ${limit} of ${chunks.length} chunks`);

    // 🔍 Extract characters
    console.log("🔍 Extracting character list...");
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
            voice: assignVoiceForSpeaker(char.id), // assign voice now
          });
        }
      }
    }

    console.log("👥 Final Speaker Map:", Object.fromEntries(speakerMap));

    // const characters = {
    //   characters: Array.from(characterSet).map((key) => {
    //     const [speaker_label, name] = key.split("-");
    //     return { name, role: "", speaker_label };
    //   }),
    //   last_speaker: { name: "", speaker_label: "" },
    // };

    // console.log(
    //   `👥 Identified ${characters.characters.length} unique speakers`
    // );

    // 🧠 Process chunks
    const processedChunks = [];
    let lastSpeaker = null;
    let lastLine = null;

    for (let i = 0; i < limit; i++) {
      console.log(`🧼 Cleaning chunk ${i + 1} of ${chunks.length}`);
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
    const lines = finalTranscript.split("\n").filter(Boolean);
    const sceneId = crypto.randomUUID(); // or whatever UUID you generate

    const CONTEXT_WINDOW = 10;
    let previousLines = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(.+?):\s*(.+)$/);
      if (!match) continue;

      const [_, speaker, text] = match;

      const metadata = await generateMetadataForLine({
        sceneId,
        lineIndex: i,
        speaker,
        text,
        previousLines, // Pass the sliding window of previous lines
      });
      const speakerId = normalizeSpeakerId(speaker);
      const speakerInfo = speakerMap.get(speakerId);
      if (!speakerInfo) {
        console.warn(`⚠️ Unknown speaker encountered: ${speaker}`);
      }
      function normalizeSpeakerId(name) {
        return name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      }

      const lineObj = {
        character_id: speakerId,
        text,
        posture: metadata.posture,
        emotion: metadata.emotion,
        zone: metadata.zone,
        camera: metadata.camera,
        eye_target: metadata.eye_target,
        pause_before: metadata.pause_before,
        audio_url: metadata.audio_url,
        viseme_data: metadata.viseme_data,
        role:
          metadata.zone === "witness_at_witness_stand" &&
          speakerInfo?.role === "defendant"
            ? "witness"
            : speakerInfo?.role || "unknown",
      };

      // Save the line to Supabase (unchanged)
      const lineData = {
        scene_id: sceneId,
        line_id: i + 1,
        line_obj: lineObj,
      };
      await saveToSupabase("gs3_lines", lineData).catch((error) =>
        console.error(`❌ Error saving line ${i + 1}:`, error.message)
      );
      console.log("gs3_lines", lineData);
      console.log(`✅ Line ${i + 1} saved to Supabase`);

      // Update previousLines sliding window: add the current line and remove the oldest if needed
      previousLines.push(lineObj);
      if (previousLines.length > CONTEXT_WINDOW) {
        previousLines.shift();
      }
    }

    async function generateMetadataForLine({
      sceneId,
      lineIndex,
      speaker,
      text,
      previousLines,
    }) {
      const metadata = await generateSceneMetadata({
        text,
        speaker,
        previousLines, // Pass the entire sliding window for context
      });

      return {
        ...metadata,
        audio_url: "audioUrl", // placeholder; your audio logic remains the same
        viseme_data: {
          duration: 2.3,
          frames: [
            { time: 0.0, viseme: "rest" },
            { time: 0.3, viseme: "AA" },
            { time: 1.2, viseme: "N" },
            { time: 2.2, viseme: "rest" },
          ],
        },
      };
    }

    async function generateSceneMetadata({ text, speaker, previousLines }) {
      const prompt = `
      You're helping animate courtroom scenes. Given a character's current line of dialog and the full metadata of the previous line, return updated metadata for the current line in the following JSON format using the exact value options if specified. Do not create new values or change the numbers. Lawyer roles can be shared across characters.
      
      {
        "posture": "sitting" or "standing",
        "emotion": "neutral" or "tense" or "confident" or "nervous" or "defensive",
        "role": "witness" or "prosecutor1" or "prosecutor2" or "defense1" or "defendant" (if seated at defendant seat, witness if at the witness stand),
        "eye_target": "judge" or "witness" or "prosecutor1" or "prosecutor2"" or "defense1" or "defendant" or "jury",
        "pause_before": "choose a number with respect to previous line for cinematic timing. 0.5 is a good default.",
      }
      Note that each character can only go in a zone that they are allowed in starting with their role name. Only the witness can be in the witness stand. 
      Use the prior metadata to keep scene continuity but adapt based on the new dialog. DO NOT wrap your response in markdown or explanation — just return the raw JSON only.
      Defense team all have zone of defense_table_left.
      
      Current speaker: ${speaker}
      Current line: "${text}"

      Previous Lines:
      ${JSON.stringify(
        previousLines.map((p) => {
          return {
            character_id: p.character_id,
            text: p.text,
            posture: p.posture,
            emotion: p.emotion,
          };
        }),
        null,
        2
      )}


      `;
      console.log("\n📤 Sending scene metadata prompt to OpenAI:\n", prompt);
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: prompt }],
        });

        const content = response.choices[0].message.content.trim();

        // Strip any possible markdown (just in case)
        const jsonText = content
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/, "")
          .trim();

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

    console.log("✅ All lines saved. Starting audio generation...");
    await generateAudioAndVisemes(sceneId);
    await generateCharacterStyles(sceneId);
    await assignZones(sceneId);
    // Build the knownCharacters array from speakerMap
    const knownCharacters = Array.from(speakerMap.values()).map((char) => ({
      name: char.name,
      character_id:
        char.id || char.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    }));

    // Call the batch assignment function
    await assignCharactersBatch(sceneId, knownCharacters);

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

    res.json({
      message: "✅ Transcript processed",
      chunkCount: chunks.length,
      processedChunkCount: processedChunks.length,
      numpages: parsed.numpages,
      info: parsed.info,
      characters: Array.from(speakerMap.values()), // ✅ Replace this
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
    // Fetch all lines for the scene from Supabase
    const { data: rows, error } = await supabase
      .from("gs3_lines")
      .select("line_id, line_obj")
      .eq("scene_id", sceneId)
      .order("line_id", { ascending: true });

    if (error) throw new Error(error.message);

    // Process lines in batches
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      // Construct a prompt with the batch of lines
      const prompt = `
You are analyzing a courtroom transcript and need to determine the correct character for each line of dialogue. You will receive a list of lines, each with a unique line ID and the text spoken by the character. Your task is to assign the correct character to each line based on the context of the dialogue. The existing character IDs are not necessarily correct, so you need to analyze the text and assign the correct character.
Use the following list of known characters to select the appropriate character for each line.
Each character is represented by a name and a normalized ID (lowercase with no spaces or punctuation).

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
          "Error parsing batch assignment JSON:",
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
          console.warn(`No matching line found for line_id ${line_id}`);
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
    const { data: rows, error } = await supabase
      .from("gs3_lines")
      .select("line_id, line_obj")
      .eq("scene_id", sceneId)
      .order("line_id", { ascending: true });

    if (error) throw new Error(error.message);

    const CONTEXT_WINDOW = 15;
    const priorLines = [];

    for (const row of rows) {
      const { line_id, line_obj } = row;
      const { character_id, role, text } = line_obj;

      const prompt = `
You are assigning spatial zones and camera angles in a courtroom animation based on dialogue context.

Rules:
- The **witness** must always be in "witness_at_witness_stand".
- **Defense** roles should only be in "defense_table_left" or "defense_table_right".
- **Prosecutors** must be in "prosecutor_table_left", "prosecutor_table_right", or "prosecutor_at_witness_stand".
- Do not invent new zones. Choose the most contextually accurate location based on previous line zones and speaker roles.
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
    // Remove the legacy ACL as uniform bucket-level access is enabled
  });

  return `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${destinationPath}`;
}

async function generateTTS({ text, speaker, voiceName, sceneId, lineIndex }) {
  const request = {
    input: { text },
    voice: { languageCode: "en-US", name: voiceName },
    audioConfig: {
      audioEncoding: "LINEAR16",
      enableTimePointing: ["WORD"],
    },
  };

  const [response] = await client.synthesizeSpeech(request);

  const { audioContent, timepoints } = response;

  const filename = `line_${String(lineIndex + 1).padStart(3, "0")}.mp3`;
  const destinationPath = `audio/scene_${sceneId}/${filename}`;

  return {
    audioUrl: await uploadToGCS(response.audioContent, destinationPath),
    timepoints: response.timepoints || [],
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
    const { data: rows, error } = await supabase
      .from("gs3_lines")
      .select("line_id, line_obj")
      .eq("scene_id", sceneId)
      .order("line_id", { ascending: true });

    if (error) throw new Error(error.message);

    for (const row of rows) {
      const { line_id, line_obj } = row;
      const { text, character_id } = line_obj;
      const voice = assignVoiceForSpeaker(character_id);

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

      console.log(`gs3_lines`, updatedLineObj);

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
      "Character extraction error:",
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
      
      ⚠️ If the transcript includes any redaction codes (such as (b)(6), (b)(7)(C), or similar), replace them with "Redacted". Ensure redacted portions are cleanly replaced and do not break sentence structure.`;

    const sampleInput = `version, how many tests could it run 18 at that time in 2010? 19 A I don't know exactly what the number was...`;
    const sampleOutput = `Jessica Chan: Version, how many tests could it run at that time in 2010?\nElizabeth Holmes: I don't know exactly what the number was...`;

    console.log(
      "\n📤 Sending transcript cleaning prompt to OpenAI:\n",
      contextPrompt
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
    console.log("────────────────────────────────────────────");

    return result;
  } catch (error) {
    console.error("GPT-4o-mini error:", error.response?.data || error.message);
    throw new Error("Failed to process chunk with GPT-4o-mini");
  }
}

async function removeOverlapIteratively(cleanedChunks) {
  if (cleanedChunks.length === 0) return "";
  let mergedTranscript = cleanedChunks[0];
  for (let i = 1; i < cleanedChunks.length; i++) {
    const prompt = `
Below are two consecutive transcript segments with some overlapping dialog.
Remove duplicate or repeated lines and merge them into one clean transcript.

Segment 1:
${mergedTranscript}

Segment 2:
${cleanedChunks[i]}

Return only the merged transcript in the "Speaker Name: line" format.
`;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
    });
    mergedTranscript = response.choices[0].message.content.trim();
  }
  return mergedTranscript;
}

const availableVoices = [
  "en-US-Wavenet-A",
  "en-US-Wavenet-B",
  "en-US-Wavenet-C",
  "en-US-Wavenet-D",
  "en-US-Wavenet-E",
  "en-US-Wavenet-F",
  "en-US-Wavenet-G",
  "en-US-Wavenet-H",
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function assignVoiceForSpeaker(speaker) {
  // use ai for this! also keep a list of voices used
  const index = Math.abs(hashString(speaker)) % availableVoices.length;
  return availableVoices[index];
}

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
        { role: "user", content: text.slice(0, 12000) }, // safe token cap
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
    const { data: rows, error } = await supabase
      .from("gs3_lines")
      .select("line_id, line_obj")
      .eq("scene_id", sceneId);

    if (error) throw new Error(error.message);

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
    }; // fallback
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

    // Set proper headers for CORS and content-type
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
  const inputPath = req.file.path;
  const outputPath = `${inputPath}.mp4`;

  ffmpeg(inputPath)
    .output(outputPath)
    .videoCodec("libx264")
    .audioCodec("aac")
    .on("end", () => {
      res.download(outputPath, "scene.mp4", (err) => {
        // Clean up temp files
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        if (err) console.error("Download error:", err);
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
      fs.unlinkSync(inputPath);
      res.status(500).send("Conversion failed");
    })
    .run();
});

app.listen(port, () => {
  console.log(`✅ PDF parser server running on http://localhost:${port}`);
});
