// server.js
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

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

const os = require("os");
const path = require("path");

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
const storage = new Storage();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

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

// const MAX_CHUNKS = 518;
// const MAX_CHUNKS = 44;
const MAX_CHUNKS = 10;
const DEV_MAX_CHUNKS = Infinity; // For local testing
// const DEV_MAX_CHUNKS = 44; // For local testing
const textChunkSize = 7000;

function splitBySpeakerAndLength(text, maxChars = 7000) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const chunks = [];
  let currentChunk = "";

  for (const line of lines) {
    // Always start new chunk on a new speaker or if maxChars is reached
    if (
      currentChunk.length + line.length + 1 > maxChars ||
      /^[A-Z][A-Z\s]*:/.test(line) // crude speaker label match like "Q:", "A:", "THE COURT:"
    ) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk += "\n" + line;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());

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
    );

    const sceneId = crypto.randomUUID();
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    const docMetadata = await analyzeRawDocument(parsed.text);
    fs.unlinkSync(filePath);

    console.log("📄 PDF parsed successfully");
    sendSlackMessage(
      `📄 PDF Parsed Successfully.`,
      "success",
      "script-creation-logs"
    );

    const chunks = splitBySpeakerAndLength(parsed.text, textChunkSize);
    const speakerMap = await buildSpeakerMap(chunks);

    const allLines = [];
    const lineHistory = [];
    let lineCounter = 1;

    let processedChunks = 0;

    for (let start = 0; start < chunks.length; start += MAX_CHUNKS) {
      if (processedChunks >= DEV_MAX_CHUNKS) break;

      const end = Math.min(
        start + MAX_CHUNKS,
        chunks.length,
        start + DEV_MAX_CHUNKS - processedChunks
      );
      const chunkBatch = chunks.slice(start, end);

      console.log(`🧼 Processing chunk batch ${start + 1} to ${end}`);
      sendSlackMessage(
        `🧼 Processing chunk batch ${start + 1} to ${end}`,
        "info",
        "script-creation-logs"
      );

      const batchLines = await processChunkBatch(
        chunkBatch,
        lineHistory,
        lineCounter
      );

      for (const line of batchLines) {
        await saveToSupabase("gs3_lines", {
          scene_id: sceneId,
          line_id: line.line_id,
          line_obj: line.line_obj,
        });
        allLines.push(line);
        lineCounter++;
      }

      // After lines are saved
      await generateAudioAndVisemes(
        sceneId,
        lineCounter - batchLines.length,
        lineCounter
      );
      await generateCharacterStyles(
        sceneId,
        lineCounter - batchLines.length,
        lineCounter
      );
      await assignZones(sceneId, lineCounter - batchLines.length, lineCounter);

      processedChunks += chunkBatch.length;

      // ✅ Emit scene ID after first chunk batch is processed and saved
      // if (start === 0) {
      console.log(`🔗 Sending scene ID to clients: ${sceneId}`);

      sendToClients({ type: "scene_id", message: sceneId });
      // }
    }

    sendSlackMessage(
      `✅ All lines saved. Starting audio generation...`,
      "success",
      "script-creation-logs"
    );

    // await generateAudioAndVisemes(sceneId);
    // await generateCharacterStyles(sceneId);
    // await assignZones(sceneId);

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

    await saveToSupabase("gs3_scenes", sceneMetadata);

    sendSlackMessage(
      `📄 Scene metadata saved for ${sceneId}`,
      "success",
      "script-creation-logs"
    );

    res.json({
      message: "✅ Full transcript processed",
      chunkCount: chunks.length,
      processedChunkCount: allLines.length,
      numpages: parsed.numpages,
      info: parsed.info,
      characters: Array.from(speakerMap.values()),
      lines: allLines.map((l) => l.line_obj),
    });

    // ────────────── INTERNAL SUBFUNCTIONS ──────────────

    async function buildSpeakerMap(chunks) {
      const map = new Map();

      for (let i = 0; i < Math.min(chunks.length, MAX_CHUNKS); i++) {
        const detected = await extractCharactersFromChunk(chunks[i], map);
        for (const char of detected) {
          if (!map.has(char.id)) {
            map.set(char.id, {
              name: char.name,
              speaker_label: char.speaker_label,
              role: char.role,
            });
          }
        }
      }

      map.set("clerk", {
        name: "Clerk",
        speaker_label: "Clerk",
        role: "clerk",
        voice: "en-US-Wavenet-C",
      });

      // map.set("audience", {
      //   name: "Audience",
      //   speaker_label: "Audience",
      //   role: "audience",
      //   voice: "en-US-Wavenet-C",
      // });

      console.log("👥 Final Speaker Map:", Object.fromEntries(map));
      sendSlackMessage(
        `👥 Final Speaker Map: ${JSON.stringify(Object.fromEntries(map))}`,
        "info",
        "script-creation-logs"
      );

      return map;
    }

    async function processChunkBatch(chunks, lineHistory, startingLineId) {
      const batchLines = [];
      let lineId = startingLineId;

      for (let i = 0; i < chunks.length; i++) {
        const structuredLines = await processChunk(
          chunks[i],
          speakerMap,
          lineHistory
        );

        for (const lineObj of structuredLines) {
          lineObj.voice = assignVoiceForSpeaker(lineObj.character_id);

          batchLines.push({ line_id: lineId, line_obj: lineObj });

          lineHistory.push({
            speaker:
              speakerMap.get(lineObj.character_id)?.name ||
              lineObj.character_id,
            text: lineObj.text,
          });

          if (lineHistory.length > 15) lineHistory.shift();

          lineId++;
        }
      }

      return batchLines;
    }
  } catch (err) {
    console.error("❌ PDF parsing error:", err);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

async function assignZones(sceneId, startLineId = 0, endLineId = Infinity) {
  try {
    const rows = (await getAllLinesForScene(sceneId)).filter(
      (r) =>
        r.line_id >= startLineId &&
        r.line_id < endLineId &&
        (!r.line_obj.zone || !r.line_obj.camera)
    );
    const CONTEXT_WINDOW = 15;
    const priorLines = [];

    // 🧭 Role → Zone mapping
    function getZone(role) {
      const zoneMap = {
        judge: "judge_sitting_at_judge_bench",
        witness: "witness_at_witness_stand",
        defense: "defense_table_left",
        prosecutor: "prosecutor_table_left",
        clerk: "clerk_box",
      };
      return zoneMap[role] || "outside";
    }

    // 🎥 Generate cinematic camera angle based on role, text, and recent shots
    function getCamera({ role, text, previousShots }) {
      const lastCamera = previousShots.at(-1)?.camera;
      const emotional = /shock|cry|pause|silence|tears|angry|emotional/i.test(
        text
      );
      const reset =
        /court is in session|let's begin|good morning|all rise|recess/i.test(
          text.toLowerCase()
        );
      const wideShots = ["wide_establishing", "wide_view_from_jury"];

      const shouldInjectWide =
        reset ||
        (emotional && Math.random() < 0.4) ||
        (previousShots.length % 7 === 0 && Math.random() < 0.6);

      if (shouldInjectWide && lastCamera !== "wide_establishing") {
        return Math.random() < 0.5
          ? "wide_establishing"
          : "wide_view_from_jury";
      }

      const cameraMap = {
        judge: ["judge_closeup", "wide_view_from_jury"],
        witness: ["witness_closeup", "crossExaminationFromWell"],
        prosecutor: ["prosecutor_table", "wide_establishing"],
        defense: ["defense_table", "wide_establishing"],
        clerk: ["bailiff_reaction", "wide_view_from_jury"],
      };

      const options = cameraMap[role] || wideShots;
      const filtered = options.filter((c) => c !== lastCamera);
      const final = filtered.length ? filtered : options;
      const index = (previousShots.length + text.length) % final.length;
      return final[index];
    }

    for (const row of rows) {
      const { line_id, line_obj } = row;
      const { character_id, role, text } = line_obj;

      console.log(`🎬 Assigning zone + camera for line ${line_id}...`);

      const zone = getZone(role);
      const camera = getCamera({ role, text, previousShots: priorLines });

      const updatedLineObj = {
        ...line_obj,
        zone,
        camera,
      };

      const { error } = await supabase
        .from("gs3_lines")
        .update({ line_obj: updatedLineObj })
        .eq("scene_id", sceneId)
        .eq("line_id", line_id);

      if (error) {
        console.error(`❌ Failed to update line ${line_id}:`, error.message);
      } else {
        console.log(
          `✅ Line ${line_id} assigned zone="${zone}", camera="${camera}"`
        );
        sendSlackMessage(
          `Zone assignment for line ${line_id}: ${zone}, camera: ${camera}`,
          "success",
          "script-creation-logs"
        );
      }

      priorLines.push({ character_id, role, text, zone, camera });
      if (priorLines.length > CONTEXT_WINDOW) priorLines.shift();
    }

    console.log("🎉 All zones and cameras assigned successfully.");
    sendSlackMessage(
      `🎉 All zones and cameras assigned successfully.`,
      "success",
      "script-creation-logs"
    );
    return;
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
  console.log(`🔊 Generating TTS for line ${lineIndex + 1}...`);

  if (!text || !voiceName || !sceneId) {
    throw new Error(
      "Missing required TTS parameters: text, voiceName, sceneId."
    );
  }

  const cleanedText = text.trim().toLowerCase();
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
    sendSlackMessage(
      `❌ TTS generation error for line ${lineIndex + 1}: ${err.message}`,
      "error",
      "script-creation-logs"
    );

    console.error("Google TTS failed:", err);
    throw new Error(`TTS generation failed for line ${lineIndex + 1}`);
  }

  const { audioContent, timepoints = [] } = response;

  if (!audioContent) {
    sendSlackMessage(
      `❌ No audio content returned from TTS for line ${lineIndex + 1}`,
      "error",
      "script-creation-logs"
    );
    throw new Error(`No audio content returned from TTS for: "${cleanedText}"`);
  }

  // Upload audio to GCS
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

async function generateAudioAndVisemes(
  sceneId,
  startLineId = 0,
  endLineId = Infinity
) {
  try {
    //todo: delete lines with no text
    // Fetch all lines using pagination
    const rows = (await getAllLinesForScene(sceneId)).filter(
      (r) =>
        r.line_id >= startLineId &&
        r.line_id < endLineId &&
        !r.line_obj?.audio_url // ❗ prevents repeat
    );
    console.log(
      `📦 generateAudioAndVisemes Fetched ${rows.length} rows for scene ${sceneId}`
    );
    sendSlackMessage(
      `📦 generateAudioAndVisemes Fetched ${rows.length} rows for scene ${sceneId}`,
      "info",
      "script-creation-logs"
    );

    for (const row of rows) {
      const { line_id, line_obj } = row;
      const { text, character_id } = line_obj;
      line_obj.voice = assignVoiceForSpeaker(character_id);

      const voice = line_obj.voice; // ✅ already injected by metadata process
      console.log(`Voice for ${character_id}: ${voice}`);
      console.log(
        `${JSON.stringify({
          text,
          speaker: character_id,
          voiceName: voice,
          sceneId,
          lineIndex: line_id - 1,
        })}`
      );

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
        sendSlackMessage(
          `❌ Failed to update line ${line_id}: ${updateErr.message}`,
          "error",
          "script-creation-logs"
        );
      } else {
        sendSlackMessage(
          `✅ Updated line ${line_id} of ${rows.length} = ${(
            (line_id / rows.length) *
            100
          ).toFixed(2)}% with audio and visemes`,
          "success",
          "script-creation-logs"
        );
        console.log(`✅ Updated line ${line_id} with audio and visemes`);
      }
    }

    console.log("🎉 All audio and viseme updates complete.");
    sendSlackMessage(
      `🎉 All audio and viseme updates complete.`,
      "success",
      "script-creation-logs"
    );
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
    - Role (one of these: judge, witness, prosecutor, defense)
    - A normalized ID (lowercase, no spaces or punctuation — used for database keys)
    Return an array like:
    
    [
      {
        "name": "Mr. Bankman-Fried",
        "speaker_label": "A",
        "role": "witness",
        "id": "samuelbankmanfried"
      },
      {
        "name": "Ms. Sassoon",
        "speaker_label": "Q",
        "role": "prosecutor",
        "id": "mssassoon"
      },
      {
        "name": "Mr. Cohen",
        "speaker_label": "Q",
        "role": "defense",
        "id": "mrcohen"
      }
    ]

    ⚠️ Use context to infer the roles:
    The name must be a real name, not Q or A or Unknown. If you don't know, don't return it.
    ⚠️ Do NOT wrap your response in markdown. Return raw JSON only.
    `;

    const slicedInput = chunkText.slice(0, 3000);
    console.log(
      "\n📤 Sending character extraction prompt to OpenAI:\n",
      prompt
    );
    console.log("📄 With input:\n", slicedInput);
    sendSlackMessage(
      `📤 Sending character extraction prompt to OpenAI:\n${prompt}\n\nWith input:\n${slicedInput}`,
      "info",
      "script-creation-logs"
    );

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

async function processChunk(chunkText, speakerMap, previousLines) {
  // Expect full line objects with metadata instead of plain text
  return await cleanText(chunkText, speakerMap, previousLines);
}

async function cleanText(chunkText, speakerMap, previousLines) {
  const sampleInput = `

(Proceedings commenced at 9:06 a.m. as follows:)
THE COURT: Good morning. Be seated.
MR. MARTINEZ: Good morning, Your Honor.
THE COURT: We are with the direct of Mr. Arce, right,
is going to continue?
MR. MARTINEZ: Yes, Your Honor. I have a procedural
question I would like to address with the Court at the
beginning.
THE COURT: Go ahead.
MR. MARTINEZ: With respect to the pro offer, Your
Honor, I have two questions --
THE COURT: Wait a minute. You're talking about an
offer of proof that you intend to make sometime in the future,
right?
MR. MARTINEZ: So one question was when you want me to
do it.
THE COURT: Right. Okay.
MR. MARTINEZ: And if you want me to do it in your
presence or just to the court reporter? I'd prefer to read it
at this time, but I don't know when you want it.
THE COURT: Well, you want to make it orally, right?
MR. MARTINEZ: Yes.
THE COURT: Let's do it right after lunch, how's that?
MR. MARTINEZ: That's fine, Your Honor. I just needed
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
UNITED STATES DISTRICT COURT
6
to know when you wanted it.
THE COURT: Let's do that. That's fine.
MR. MARTINEZ: Okay. Thank you.
SEAN ARCE, WITNESS, PREVIOUSLY SWORN
DIRECT EXAMINATION (RESUMED)
BY MR. MARTINEZ:
Q. Good morning, Mr. Arce.
A. Good morning.
Q. I'm going to try and stick to one mic and not wander.
MR. MARTINEZ: Let me ask you, can you please bring up
Exhibit 541? I believe 541 has been admitted or is stipulated
to as an exhibit, Your Honor. These are the Huppenthal
findings. I was checking with counsel that she agreed it was
stipulated to.
MS. COOPER: There's just a housekeeping matter that
we would like to address, if it's all right with the Court.
MR. MARTINEZ: Can we deal --
THE COURT: I'm sorry, a what matter?
MS. COOPER: A housekeeping matter with respect to a
couple of exhibits. But we can address it later.
THE COURT: All right. Fine. Let's do it later.
MR. MARTINEZ: Okay. I just wanted to confirm on
541 --
MS. COOPER: Yes.
MR. MARTINEZ: -- it's an admitted exhibit.
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
UNITED STATES DISTRICT COURT
7
MR. QUINN: Richard, it's admitted.
MS. COOPER: Yes, Your Honor.
MR. MARTINEZ: Thank you.
BY MR. MARTINEZ:
Q. Mr. Arce, I just want to give you a minute to look through
these three pages, so if you could just read Page 1, Page 2,`;

  const sampleOutput = `${JSON.stringify([
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "Good morning. Be seated.",
      eye_target: "audience",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Good morning, Your Honor.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "We are with the direct of Mr. Arce, right, is going to continue?",
      eye_target: "martinez",
      pause_before: 1,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Yes, Your Honor. I have a procedural question I would like to address with the Court at the beginning.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "Go ahead.",
      eye_target: "martinez",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "With respect to the pro offer, Your Honor, I have two questions --",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "curious",
      text: "Wait a minute. You're talking about an offer of proof that you intend to make sometime in the future, right?",
      eye_target: "martinez",
      pause_before: 0.7,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "So one question was when you want me to do it.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "Right. Okay.",
      eye_target: "martinez",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "And if you want me to do it in your presence or just to the court reporter? I'd prefer to read it at this time, but I don't know when you want it.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "Well, you want to make it orally, right?",
      eye_target: "martinez",
      pause_before: 0.6,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Yes.",
      eye_target: "court",
      pause_before: 0.3,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "Let's do it right after lunch, how's that?",
      eye_target: "martinez",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "That's fine, Your Honor. I just needed to know when you wanted it.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "Let's do that. That's fine.",
      eye_target: "martinez",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "grateful",
      text: "Okay. Thank you.",
      eye_target: "court",
      pause_before: 0.4,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Good morning, Mr. Arce.",
      eye_target: "arce",
      pause_before: 0.5,
    },
    {
      character_id: "arce",
      role: "witness",
      posture: "seated",
      emotion: "neutral",
      text: "Good morning.",
      eye_target: "martinez",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "I'm going to try and stick to one mic and not wander.",
      eye_target: "arce",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Let me ask you, can you please bring up Exhibit 541? I believe 541 has been admitted or is stipulated to as an exhibit, Your Honor. These are the Huppenthal findings. I was checking with counsel that she agreed it was stipulated to.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "cooper",
      role: "defense",
      posture: "standing",
      emotion: "neutral",
      text: "There's just a housekeeping matter that we would like to address, if it's all right with the Court.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Can we deal --",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "confused",
      text: "I'm sorry, a what matter?",
      eye_target: "cooper",
      pause_before: 0.5,
    },
    {
      character_id: "cooper",
      role: "defense",
      posture: "standing",
      emotion: "neutral",
      text: "A housekeeping matter with respect to a couple of exhibits. But we can address it later.",
      eye_target: "court",
      pause_before: 0.5,
    },
    {
      character_id: "court",
      role: "judge",
      posture: "seated",
      emotion: "neutral",
      text: "All right. Fine. Let's do it later.",
      eye_target: "cooper",
      pause_before: 0.5,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Okay. I just wanted to confirm on 541 --",
      eye_target: "cooper",
      pause_before: 0.5,
    },
    {
      character_id: "cooper",
      role: "defense",
      posture: "standing",
      emotion: "neutral",
      text: "Yes.",
      eye_target: "martinez",
      pause_before: 0.4,
    },
    {
      character_id: "quinn",
      role: "prosecutor",
      posture: "seated",
      emotion: "neutral",
      text: "Richard, it's admitted.",
      eye_target: "martinez",
      pause_before: 0.4,
    },
    {
      character_id: "cooper",
      role: "defense",
      posture: "standing",
      emotion: "neutral",
      text: "Yes, Your Honor.",
      eye_target: "court",
      pause_before: 0.4,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Thank you.",
      eye_target: "court",
      pause_before: 0.4,
    },
    {
      character_id: "martinez",
      role: "prosecutor",
      posture: "standing",
      emotion: "neutral",
      text: "Mr. Arce, I just want to give you a minute to look through these three pages, so if you could just read Page 1, Page 2,",
      eye_target: "arce",
      pause_before: 0.5,
    },
  ])}`;

  const CONTEXT_WINDOW = 15;
  try {
    let contextPrompt = `You are cleaning and formatting courtroom transcript lines into structured JSON. Each line of dialog should include:
- character_id (use character map),
- role,
- posture,
- emotion,
- text (just the spoken text),
- eye_target (character_id of the person being spoken to, not the speaker. Pick from speakermap. Use "audience" for general audience or unknowns),
- pause_before (number, seconds — cinematic timing),

If something is not dialog, like a description of events or other metadata, ignore it.

USE COMMON SENSE TO ASSIGN THE SPEAKER. For example, people don't tell themselves Good morning. They say it to someone else. Use the context of the dialog to infer who is speaking and who is being spoken to.

Output an array of JSON objects — one per line. No explanations.

`;

    if (previousLines.length) {
      const priorContext = previousLines
        .slice(-CONTEXT_WINDOW)
        .map((line) => `${line.speaker}: ${line.text}`)
        .join("\n");
      contextPrompt += `\n\nPrevious dialog:\n${priorContext}`;
    }

    contextPrompt += `\n\nSpeaker map:\n${JSON.stringify(
      Array.from(speakerMap.entries()).map(([id, val]) => ({
        character_id: id,
        name: val.name,
        role: val.role,
        label: val.speaker_label,
      })),
      null,
      2
    )}`;

    const prompt = `
${chunkText}
    `;

    console.log(`📤 Sending chunk to OpenAI:\n`, contextPrompt);
    console.log(`📤 Sending chunk to OpenAI:\n`, prompt);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: contextPrompt },
        {
          role: "user",
          content: `${sampleInput}`,
        },
        { role: "assistant", content: `${sampleOutput}` },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0].message.content.trim();
    const jsonText = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "");
    const parsedLines = JSON.parse(jsonText);
    console.log("📥 OpenAI response (parsed):", JSON.stringify(parsedLines));
    return parsedLines; // Return structured lines, not plain text
  } catch (error) {
    console.error("❌ GPT error in cleanText:", error.message || error);
    throw new Error("Failed to clean transcript chunk");
  }
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

async function generateCharacterStyles(
  sceneId,
  startLineId = 0,
  endLineId = Infinity
) {
  try {
    // Fetch all lines using pagination
    const rows = (await getAllLinesForScene(sceneId)).filter(
      (r) => r.line_id >= startLineId && r.line_id < endLineId
    );

    // Step 1: Build set of unique character_ids
    const characterIds = new Set();
    for (const row of rows) {
      const { line_obj } = row;
      const style = line_obj.style || {};
      const hasValidStyle =
        style.hair_color && style.skin_color && style.shirt_color;

      if (!hasValidStyle && line_obj.character_id) {
        characterIds.add(line_obj.character_id);
      }
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

async function fetchWithRetry(url, options = {}, retries = 5) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      const delay = Math.pow(2, i) * 100;
      console.warn(
        `🔁 Retry ${i + 1}/${retries} after ${delay}ms due to:`,
        err.message
      );
      await new Promise((r) => setTimeout(r, delay));
    }
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

    const response = await fetchWithRetry(decodedUrl, {}, 5);

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
    console.error("Audio Proxy error:", err);
    console.log(`url: ${url}`);
    res.status(500).send("Proxy failed");
  }
});
app.post("/convert", upload.single("video"), (req, res) => {
  const sceneId = req.body.sceneId;
  const sessionId = req.body.sessionId;
  const line_id = req.body.line_id || `0`;
  let folderName = "";
  if (!req.body.folderName) {
    folderName = `${sessionId}-${sceneId}`;
  } else {
    folderName = `${req.body.folderName}-${sceneId}`;
  }

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
        "courtroom-scene-logs"
      );
      fs.unlinkSync(inputPath);
      res.json({ message: "Video segment converted and saved" });
    })
    .on("error", (err) => {
      console.error("❌ FFmpeg error:", err.message || err);
      sendSlackMessage(
        `FFmpeg error: ${err.message || err}`,
        "error",
        "courtroom-scene-logs"
      );
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      res.status(500).send("Conversion failed");
    })
    .save(outputPath);
});

app.get("/create-chapters/:sceneId", async (req, res) => {
  const { sceneId } = req.params;

  try {
    const rows = await getAllLinesForScene(sceneId);

    if (!rows.length) {
      return res.status(404).json({ error: "No lines found for this scene." });
    }

    // Step 1: Calculate timestamps
    let currentTime = 0;
    const timedLines = rows.map((row) => {
      const pause = row.line_obj.pause_before || 0;
      const duration = row.line_obj.viseme_data?.duration || 5.0; // fallback if no duration
      const start = currentTime + pause;
      currentTime = start + duration;

      return {
        line_id: row.line_id,
        character_id: row.line_obj.character_id,
        text: row.line_obj.text,
        timestamp: start,
      };
    });

    // Step 2: Group into chapters (every 60 seconds for now)
    const CHAPTER_INTERVAL = 60; // seconds
    const chapters = [];
    let lastMark = 0;
    let chapterLines = [];

    for (const line of timedLines) {
      if (
        line.timestamp - lastMark >= CHAPTER_INTERVAL &&
        chapterLines.length
      ) {
        const startTime = formatTime(chapterLines[0].timestamp);
        chapters.push({
          time: startTime,
          title: chapterLines[0].text.slice(0, 40).replace(/\n/g, " ") + "...",
        });
        lastMark = chapterLines[0].timestamp;
        chapterLines = [];
      }
      chapterLines.push(line);
    }

    // Final chapter
    if (chapterLines.length) {
      const startTime = formatTime(chapterLines[0].timestamp);
      chapters.push({
        time: startTime,
        title: chapterLines[0].text.slice(0, 40).replace(/\n/g, " ") + "...",
      });
    }

    // Step 3: Format as YouTube-compatible .txt
    const output = chapters.map((c) => `${c.time} ${c.title}`).join("\n");

    res.setHeader("Content-Type", "text/plain");
    res.send(output);
  } catch (err) {
    console.error("❌ Error creating chapters:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/redo-audio/:sceneId", async (req, res) => {
  console.log(`🔄 Re-generating audio for scene ${req.params.sceneId}`);
  sendSlackMessage(
    `🔄 Re-generating audio for scene ${req.params.sceneId}`,
    "info",
    "script-creation-logs"
  );
  await generateAudioAndVisemes(req.params.sceneId);
  console.log(
    `✅ Audio re-generation completed for scene ${req.params.sceneId}`
  );
  sendSlackMessage(
    `🔄 Done re-generating audio for scene ${req.params.sceneId}`,
    "success",
    "script-creation-logs"
  );
  res.json({ message: "Audio re-generation triggered." });
});
// Helper to format seconds into HH:MM:SS
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map((n) => String(n).padStart(2, "0")).join(":");
}

app.post("/create-chapters", async (req, res) => {
  const { scene_id } = req.body;
  if (!scene_id) {
    return res.status(400).json({ error: "Missing scene_id in body." });
  }
  const rows = await getAllLinesForScene(scene_id);
  if (!rows.length) {
    return res.status(404).json({ error: "No lines found for this scene." });
  }
  const totalDuration = 8 * 60 * 60; // // 8 hours
  const chapters = [];
  const chapterDuration = 15 * 60; // 30 minutes
  const numChapters = Math.ceil(totalDuration / chapterDuration);
  const linesPerChapter = Math.ceil(rows.length / numChapters);
  console.log(
    `Total lines: ${rows.length}, Lines per chapter: ${linesPerChapter}`
  );
  console.log(
    `Total chapters: ${numChapters}, Chapter duration: ${chapterDuration}`
  );
  console.log(`Total duration: ${totalDuration}`);
  console.log(`Chapter duration: ${chapterDuration}`);
  console.log(`Lines per chapter: ${linesPerChapter}`);
  console.log(`Number of chapters: ${numChapters}`);
  console.log(`Rows: ${JSON.stringify(rows, null, 2)}`);
  console.log(`Rows length: ${rows.length}`);

  for (let i = 0; i < numChapters; i++) {
    // get from open ai the summary for the chapter
    const startLine = i * linesPerChapter;
    const endLine = Math.min((i + 1) * linesPerChapter, rows.length);
    const chapterLines = rows.slice(startLine, endLine);
    const chapterText = chapterLines.map((row) => row.line_obj.text).join("\n");
    const prompt = `
You are a legal analyst. Given the following lines from a courtroom transcript, summarize the chapter in 1-2 sentences. Do not include any speaker labels or timestamps.
    ${chapterText}

    Chapter summary:
    `;
    console.log(`Prompt for chapter ${i + 1}:`, prompt);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
    });
    const summary = response.choices[0].message.content.trim();
    chapters.push({
      startLine,
      endLine,
      summary,
    });
    console.log(`Chapter ${i + 1} summary:`, summary);
  }
  function formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const mins = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  }

  const output = chapters
    .map((c, i) => {
      const timestamp = formatTimestamp(i * chapterDuration);
      return `${timestamp} ${c.summary}`;
    })
    .join("\n");

  res.setHeader("Content-Type", "text/plain");
  console.log(`Output for chapters:`, output);

  const chapterTitlePrompt = `
  You are a creative editor for legal video content. Below is a list of timestamped summaries from a courtroom transcript. Rewrite this list by replacing the summaries with *chapter titles only* — short, compelling, and cohesive with narrative flow. Think of it like titling a documentary series: make each title unique, interconnected, and engaging, but still professional.
  
  Do not include summaries or extra explanation. Keep the exact same timestamp format.
  
  Example:
  00:00 Opening Moves  
  00:30 The Witness Takes the Stand  
  ...
  
  Here is the original list:
  ${output}
  
  Now rewrite it with chapter titles only:
  `;

  const refinedResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: chapterTitlePrompt }],
  });

  const tocOutput = refinedResponse.choices[0].message.content.trim();
  console.log("Generated chapter titles:\n", tocOutput);

  res.setHeader("Content-Type", "text/plain");
  res.send(tocOutput);
});

app.get("/extract-highlights/:sceneId", async (req, res) => {
  const { sceneId } = req.params;

  const rows = await getAllLinesForScene(sceneId);
  if (!rows?.length) {
    return res.status(404).json({ error: "No lines found for this scene." });
  }

  const { data: scenes, error: sceneErr } = await supabase
    .from("gs3_scenes")
    .select("*")
    .eq("scene_id", sceneId)
    .single();

  if (sceneErr || !scenes) {
    return res.status(404).json({ error: "Scene metadata not found." });
  }

  const originalMetadata = scenes.metadata || {};
  const chunkSize = 12;
  const stepSize = 6;
  const maxTotalDuration = 150;
  const highlightCandidates = [];

  for (let i = 0; i <= rows.length - chunkSize; i += stepSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const chunkTextList = chunk.map(
      (r, index) => `${index + 1}. ${r.line_obj.text}`
    );
    const fullChunkText = chunkTextList.join("\n");

    const durationPerLine = chunk.map((line) => {
      const pause = line.line_obj.pause_before || 0;
      const dur = line.line_obj.viseme_data?.duration || 1.5;
      return pause + dur;
    });

    const prompt = `
You are a courtroom video editor. Below is a transcript chunk.

1. Identify the most **dramatic subsegment**: the smallest line range that feels tense, climactic, or cliffhanger-worthy.
2. Return a JSON object with:
   - "score" (0.0 to 1.0)
   - "reason" (short explanation)
   - "best_start_index" (1-based)
   - "best_end_index" (inclusive, 1-based)

Transcript chunk:
${fullChunkText}
    `.trim();

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
      });

      const parsed = JSON.parse(
        response.choices[0].message.content
          .replace(/^```(?:json)?/, "")
          .replace(/```$/, "")
          .trim()
      );

      const { best_start_index, best_end_index } = parsed;
      const start = Math.max(best_start_index - 1, 0);
      const end = Math.min(best_end_index, chunk.length - 1);

      const selectedLines = chunk.slice(start, end + 1);
      const selectedDuration = durationPerLine
        .slice(start, end + 1)
        .reduce((a, b) => a + b, 0);

      highlightCandidates.push({
        ...parsed,
        lineObjs: selectedLines.map((r) => ({
          line_id: r.line_id,
          line_obj: r.line_obj,
        })),
        totalDuration: selectedDuration,
      });
    } catch (err) {
      console.warn(
        `⚠️ Failed to extract subsegment from chunk ${i}-${i + chunkSize}:`,
        err.message
      );
    }
  }

  // 5. Sort by score, collect until we hit max duration
  const sorted = highlightCandidates.sort((a, b) => b.score - a.score);
  const highlights = [];
  let runningTime = 0;

  for (const h of sorted) {
    if (runningTime + h.totalDuration > maxTotalDuration) continue;
    highlights.push(h);
    runningTime += h.totalDuration;
  }

  const flatLines = highlights.flatMap((h) => h.lineObjs);

  // 6. Create new scene
  const newSceneId = crypto.randomUUID();
  const newSceneMetadata = {
    ...originalMetadata,
    title: `Highlights from ${originalMetadata.title || sceneId}`,
    summary: `This is a cinematic highlight reel extracted from scene ${sceneId}.`,
    source_scene: sceneId,
    extracted_at: new Date().toISOString(),
    runtime_seconds: runningTime.toFixed(2),
  };

  await saveToSupabase("gs3_scenes", {
    scene_id: newSceneId,
    scene_name: `Highlights from ${sceneId}`,
    metadata: newSceneMetadata,
  });

  // 7. Save selected lines
  for (let i = 0; i < flatLines.length; i++) {
    await saveToSupabase(
      "gs3_lines",
      {
        scene_id: newSceneId,
        line_id: i + 1,
        line_obj: flatLines[i].line_obj,
      },
      { onConflict: ["scene_id", "line_id"] }
    );
  }

  console.log(
    `🎬 Highlight scene created: ${newSceneId} with ${flatLines.length} lines`
  );

  res.json({
    new_scene_id: newSceneId,
    total_runtime_seconds: runningTime.toFixed(2),
    highlight_line_ids: flatLines.map((l) => l.line_id),
    line_objs: flatLines.map((l) => l.line_obj),
  });
});

// SSE endpoint for streaming logs
const clients = [];

app.get("/logs", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    const i = clients.indexOf(res);
    if (i !== -1) clients.splice(i, 1);
  });
});

function sendToClients(data) {
  let payload = "";

  if (data.type === "scene_id") {
    // Named event for scene ID
    payload = `event: scene_id\n` + `data: ${JSON.stringify(data)}\n\n`;
  } else {
    // Generic log event
    payload = `data: ${JSON.stringify(data)}\n\n`;
  }

  clients.forEach((res) => res.write(payload));
}

["log", "info", "warn", "error"].forEach((method) => {
  const original = console[method];
  console[method] = (...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(String).join(" ");
    sendToClients({ type: method, message, timestamp });
    original(`[${timestamp}]`, ...args);
  };
});

app.listen(port, () => {
  console.log(`✅ PDF parser server running on http://localhost:${port}`);
});
