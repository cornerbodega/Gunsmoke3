# 🎬 Gunsmoke3D

**Gunsmoke3D** is a 3D courtroom simulation engine that transforms courtroom transcripts into fully animated scenes — complete with synced audio, emotional expressions, and cinematic camera work.

Built with **Next.js**, **React Three Fiber**, and **Supabase**, it supports transcript-driven playback, live recording, Slack integration, and downloadable chapter files.

> 💡 **AI-Powered**: GPT-4 is used to convert raw courtroom transcripts into structured scenes with speaker metadata, camera presets, emotion cues, and line timing.

---

## ✨ Features

- 📜 Transcript-based 3D scene generation
- 🧠 Emotion-aware character expressions
- 👄 Real-time lip sync via viseme + amplitude merging
- 👩‍⚖️ Judge intro walk-in with cinematic camera flythrough
- 🎥 Scene recording (WebM video + audio stream)
- 📁 Downloadable chapter files (`chapters.txt`)
- 🗂️ Scene viewer with metadata and summaries

---

## 📺 Example Output

[Elizabeth Holmes Testimony (Gunsmoke3D)](https://www.youtube.com/watch?v=HhZLryAbja0)  
Transcript sourced from: [SEC.gov](https://www.sec.gov/oso/elizabeth-holmes-transcript)

---

## 🚀 Getting Started

Clone the repo

```bash
git clone https://github.com/cornerbodega/gunsmoke3d.git
```

Install and run the client

```bash
cd gunsmoke3d/client
yarn install
yarn dev
```

Install and run the server

```bash
cd ../server
yarn install
yarn dev
```

---

## 🔐 Environment Variables

Create a `.env` file in each folder:

**`client/.env`**

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_APPLICATION_CREDENTIALS_BASE64=...
NEXT_PUBLIC_SLACK_WEBHOOK_URL=...
```

**`server/.env`**

```env
OPENAI_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GCS_APPLICATION_CREDENTIALS_BASE64=...
GCS_BUCKET_NAME=...
SCRIPT_CREATION_LOGS_SLACK_WEBHOOK_URL=...
```

---

## 🧱 Project Structure

### `client/`

- `pages/index.js` – Entry point and landing UI
- `pages/scenes.js` – Scene browser with summaries
- `pages/create-scene-from-transcript.js` – Upload and convert transcripts
- `pages/courtroom/[sceneId].js` – Scene renderer and playback
- `pages/api/`
  - `audio-proxy.js`, `create-chapters.js`, `upload-to-server.js`, etc.
- `components/`
  - `CourtroomScene.js` – Main animation engine
  - `CameraController.js` – Camera logic
  - `CourtroomPrimatives.js` – 3D environment:
    - `Floor`, `Ceiling`, `Wall`, `WindowedWall`, `DividerWithGate`
    - `JudgeTable`, `WitnessStand`, `LawyerTable`, `SingleChair`, `Bench`
    - `StenographerStation`, `JuryBox`, `CeilingLight`, `Character`
- `utils/`
  - `supabase.js`, `slack.js`, `audio.js`, `viseme.js`

### `server/`

- `server.js` – Express backend (transcript → scene)
- `routes/` – API endpoints
- `utils/`
  - `sendToSlack.js`, `saveToSupabase.js`, `supabase.js`
  - `ffmpeg-merge-command.txt`, `qc-queries.txt`
- `llm-prompts/` – Prompt templates for GPT-4
- `uploads/`, `pdf-prep/`, `videos/` – Processed data

---

## 🧠 How AI Is Used

Transcripts are parsed and structured using GPT-4 with custom system prompts. Each speaker line is assigned metadata:

- `role`, `character_id`, `emotion`, `camera`, `zone`, `eye_target`
- Optionally, `viseme_data` is post-processed from amplitude info

This structured output is rendered into 3D in the client using React Three Fiber.

---

## 📦 Key Dependencies

- `next`, `react`, `three`, `@react-three/fiber`, `@react-three/drei`
- `supabase-js`, `uuid`, `ffmpeg`, `formidable`, `dotenv`
- GPT-4 (via OpenAI API)

---

## 📝 License

MIT © Marvin Rhone
