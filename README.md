# 🎬 Gunsmoke3D

**Gunsmoke3D** is a 3D courtroom simulation engine that transforms courtroom transcripts into fully animated scenes — complete with synced audio, emotional expressions, and cinematic camera work.

Built with **Next.js**, **React Three Fiber**, and **Supabase**, it supports transcript-driven playback, live recording, Slack integration, and downloadable chapter files.

---

## ✨ Features

- 📜 Transcript-based 3D scene generation
- 🧠 Emotion-aware character expressions
- 👄 Real-time lip sync via viseme + amplitude merging
- 👩‍⚖️ Judge intro walk-in with cinematic camera flythrough
- 🎥 Scene recording (WebM video + audio stream)
- 📁 Downloadable chapter files
- 🗂️ Scene viewer with metadata and summaries

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/cornerbodega/gunsmoke3d.git
```

### 2. Install & Run the Client

```bash
cd gunsmoke3d/client
yarn install
yarn dev
```

### 3. Install & Run the Server

```bash
cd gunsmoke3d/server
yarn install
yarn dev
```

### 4. Configure Environment Variables

#### `/client/.env`

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_APPLICATION_CREDENTIALS_BASE64=...
NEXT_PUBLIC_SLACK_WEBHOOK_URL=...
```

#### `/server/.env`

```env
OPENAI_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GCS_APPLICATION_CREDENTIALS_BASE64=...
GCS_BUCKET_NAME=...
SCRIPT_CREATION_LOGS_SLACK_WEBHOOK_URL=...
```

### 5. Access the App

Visit: [http://localhost:3000](http://localhost:3000)

---

## 🧱 Project Structure

### 📁 `client/`

#### Pages

- `pages/index.tsx` – Landing page & links
- `pages/scenes.tsx` – Scene browser & summaries
- `pages/courtroom/[scene_id].tsx` – Scene renderer & playback

#### Core Components

- `CourtroomScene.jsx` – 3D scene manager
- `CameraController.jsx` – Preset camera transitions
- `CourtroomPrimatives.jsx` – Modular 3D components:
  - Room: `Floor`, `Ceiling`, `Wall`, `DividerWithGate`
  - Furniture: `JudgeTable`, `WitnessStand`, `LawyerTable`, `Chair`, `Bench`
  - People: `Character`, `JuryBox`, `StenographerStation`, `ClerkBox`
  - Lighting: `CeilingLight`, `Environment`

#### Utilities

- `utils/supabase.js` – Supabase client
- `utils/slack.js` – Slack alert helper
- `utils/audio.js` – Audio playback, proxy, and recording
- `utils/viseme.js` – (Optional) amplitude-based viseme generator

---

### 📁 `server/`

- `server.js` – API for transcript → scene processing
- `routes/` – Audio proxy, chapter generator
- `lib/` – Audio conversion, FFmpeg, file handling

---

## 📦 Key Dependencies

- [`next`](https://nextjs.org)
- [`react`](https://reactjs.org)
- [`@react-three/fiber`](https://github.com/pmndrs/react-three-fiber)
- [`@react-three/drei`](https://github.com/pmndrs/drei)
- [`three`](https://threejs.org)
- [`supabase-js`](https://github.com/supabase/supabase-js)
- [`uuid`](https://www.npmjs.com/package/uuid)
- [`ffmpeg`](https://ffmpeg.org) – used in the server for conversion

---

## 📝 License

MIT © Marvin Rhone
