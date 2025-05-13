// components/CourtroomScene.jsx
import { sendSlackMessage } from "@/utils/slack";

import { v4 as uuidv4 } from "uuid";
import { ClerkBox } from "@/components/CourtroomPrimatives";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import React, {
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
} from "react";
import * as THREE from "three";
import CameraController from "@/components/CameraController";
import {
  Floor,
  Ceiling,
  Wall,
  Box,
  WindowedWall,
  JudgeBackWall,
  SidePaneledWall,
  DividerWithGate,
  JudgeTable,
  WitnessStand,
  LawyerTable,
  SingleChair,
  Bench,
  StenographerStation,
  JuryBox,
  CeilingLight,
} from "@/components/CourtroomPrimatives";
// Optimize Character rendering to avoid unnecessary re-renders
import { Character as RawCharacter } from "@/components/CourtroomPrimatives";

const Character = React.memo(RawCharacter, (prev, next) => {
  return (
    prev.characterId === next.characterId &&
    prev.params?.emotion === next.params?.emotion &&
    prev.params?.style === next.params?.style &&
    prev.params?.activeSpeakerId === next.params?.activeSpeakerId &&
    prev.params?.audioTime === next.params?.audioTime
  );
});

export default function CourtroomScene({
  lines,
  sceneId,
  startFromLineId = 1,
  endLineId = lines.length + 1,
  skipIntro = false,
  folderName,
}) {
  const sessionId = useMemo(() => uuidv4(), []);
  // Proxy that supports resolving aliases seamlessly
  const [showStitchedModal, setShowStitchedModal] = useState(false);
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState(null);

  // NEW: Fetch all lines if the initial prop is limited to 1000 lines.

  const startFromIndex = useMemo(() => {
    if (!startFromLineId) return 0;
    const index = lines.findIndex((line) => line.line_id === startFromLineId);
    return index === -1 ? 0 : index;
  }, [startFromLineId, lines]);
  const endIndex = useMemo(() => {
    if (!endLineId) return lines.length;
    const index = lines.findIndex((line) => line.line_id === endLineId);
    return index === -1 ? lines.length : index;
  }, [endLineId, lines]);
  // console.log("lines");
  // console.log(lines);
  const cameraTargetRef = useRef(new THREE.Object3D());

  const [currentIndex, setCurrentIndex] = useState(-1);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  // State to track the audio's current time for viseme timing.
  const [currentAudioTime, setCurrentAudioTime] = useState(0);

  const [showDefaultClerk, setShowDefaultClerk] = useState(true);
  const [showDefaultJudge, setShowDefaultJudge] = useState(false);
  const [showJury, setShowJury] = useState(true);
  const combinedStreamRef = useRef(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeMessage, setMergeMessage] = useState("Merging...");

  const audienceIds = useMemo(() => {
    const ids = [];
    [5, 8, 11, 14].forEach((z) => {
      [-12, -7.5, -3.5, 3.5, 7.5, 12].forEach((x) => {
        const skip = [
          [-7.5, 5],
          [7.5, 8],
          [-3.5, 11],
          [12, 14],
        ].some(([sx, sz]) => sx === x && sz === z);
        if (!skip) {
          ids.push(`audience-${x}-${z}`);
        }
      });
    });
    return ids;
  }, []);

  const aliasMap = useMemo(() => {
    const map = {
      prosecutor: "prosecutor1",
      prosecutor2: "prosecutor1",
      defense: "defense1",
      jury: "jury-2",
    };
    console.log("lines");
    console.log(lines);
    map.audience = audienceIds[Math.floor(Math.random() * audienceIds.length)];

    // Preserve role-to-character_id mapping from lines
    lines.forEach(({ line_obj }) => {
      const { role, character_id } = line_obj;
      if (role && character_id && !map[role]) {
        map[role] = character_id;
      }
    });

    return map;
  }, [lines]);

  const characterRefs = useRef({});
  const resolvedCharacterRefs = useResolvedCharacterRefs(
    characterRefs,
    aliasMap
  );

  // Shared lookTargetRef for non‑speakers and active speaker target
  const lookTargetRef = useRef(new THREE.Object3D());
  const speakerTargetRef = useRef(new THREE.Object3D());
  const [ready, setReady] = useState(false);
  const [headRefsReady, setHeadRefsReady] = useState(false);
  const [playTriggered, setPlayTriggered] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(true);

  function resolveCharacterId(id) {
    // Return the canonical character ID (characterId > role > alias fallback)
    return aliasMap[id] || id;
  }

  // --- Recording Setup Refs ---
  const canvasRef = useRef(null);
  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const audioContextRef = useRef(null);
  const audioDestRef = useRef(null);

  // Initialize AudioContext and a destination node for recording audio.
  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new AudioContext();
    audioDestRef.current =
      audioContextRef.current.createMediaStreamDestination();
  }, []);
  const [audioReady, setAudioReady] = useState(false); // ⬅️ Add this

  const pollMergeStatus = async (sceneId, maxAttempts = 30, delay = 3000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(`/api/get-stitched-video/${sceneId}`);
        if (res.ok) {
          const { video_url } = await res.json();
          if (video_url) {
            setMergeMessage("✅ Merge complete!");
            setStitchedVideoUrl(`${video_url}?t=${Date.now()}`);

            setShowStitchedModal(true);
            await new Promise((r) => setTimeout(r, 1500));
            setIsMerging(false);
            return;
          }
        } else if (res.status !== 404) {
          // Only log unexpected errors, not 404 (video not ready)
          const error = await res.json();
          console.warn("🔁 Merge polling error:", error);
          setMergeMessage("⚠️ Server error checking status");
        } else {
          setMergeMessage(`Merging... (${attempt}/${maxAttempts})`);
        }
      } catch (err) {
        console.error("❌ Polling failed:", err);
        setMergeMessage("⚠️ Network error");
      }

      await new Promise((r) => setTimeout(r, delay));
    }

    setMergeMessage("❌ Merge timeout or not found.");
    await new Promise((r) => setTimeout(r, 2000));
    setIsMerging(false);
  };

  // --- New Effect: Set audioReady on first user interaction ---
  // This ensures that the browser allows audio playback.
  useEffect(() => {
    const handleUserInteraction = () => {
      // Only play ding if we haven’t already marked audio as ready
      if (!audioReady) {
        const ding = new Audio("/ready-sound.mp3");
        ding
          .play()
          .catch((e) => console.warn("🔇 Could not play ready sound:", e));
      }

      setAudioReady(true);
      window.removeEventListener("click", handleUserInteraction);
    };

    window.addEventListener("click", handleUserInteraction);
    return () => window.removeEventListener("click", handleUserInteraction);
  }, [audioReady]);

  const playIntroAudio = (audioUrl = "/intro_music.mp3") => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";

      let sourceNode = null;

      audio.addEventListener(
        "canplaythrough",
        () => {
          try {
            sourceNode =
              audioContextRef.current.createMediaElementSource(audio);
            sourceNode.connect(audioContextRef.current.destination);
            sourceNode.connect(audioDestRef.current); // ✅ capture for MediaRecorder
            audio.play().catch(reject);
          } catch (e) {
            reject(e);
          }
        },
        { once: true }
      );

      audio.addEventListener("ended", () => {
        try {
          sourceNode?.disconnect();
        } catch (e) {
          console.warn("Audio disconnect failed", e);
        }
        resolve();
      });

      audio.addEventListener("error", reject);
    });
  };

  // --- Helper: playLineAudio (reusable single Audio instance) ---
  const audioRef = useRef(null);
  const sourceNodeRef = useRef(null);

  // Create one Audio + source node on mount
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";

    const ctx = audioContextRef.current;
    const dest = audioDestRef.current;
    const srcNode = ctx.createMediaElementSource(audio);
    srcNode.connect(ctx.destination);
    srcNode.connect(dest);

    audioRef.current = audio;
    sourceNodeRef.current = srcNode;

    return () => {
      srcNode.disconnect();
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Reusable playLineAudio
  const playLineAudio = (lineId, audioUrl) => {
    return new Promise((resolve, reject) => {
      const audio = audioRef.current;
      audio.src = `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`;
      audio.currentTime = 0;

      const cleanup = () => {
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };
      const onEnded = () => {
        cleanup();
        resolve();
      };
      const onError = (e) => {
        cleanup();
        console.error(`Error playing audio for ${lineId}`, e);
        resolve(); // resolve so the loop keeps going
      };

      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.play().catch(onError);
    });
  };
  async function analyzeAmplitude(audioUrl, sliceDuration = 0.05) {
    const res = await fetch(audioUrl);
    const buffer = await res.arrayBuffer();

    const ctx = new (window.OfflineAudioContext ||
      window.webkitOfflineAudioContext)(1, 44100 * 40, 44100);

    const decoded = await ctx.decodeAudioData(buffer);
    const samples = decoded.getChannelData(0);

    const sliceSize = Math.floor(decoded.sampleRate * sliceDuration);
    const result = [];

    for (let i = 0; i < samples.length; i += sliceSize) {
      let sum = 0;
      for (let j = 0; j < sliceSize && i + j < samples.length; j++) {
        sum += Math.abs(samples[i + j]);
      }
      const avg = sum / sliceSize;
      result.push({ time: i / decoded.sampleRate, amplitude: avg });
    }
    // ctx.close();

    return result;
  }

  // --- Helper: runPlayback ---
  // --- Updated runPlayback for Line-Based Cuts ---
  const runPlayback = async () => {
    // Note: this only works for one line start end inclusive. it doens't allow for the intro and anything else to be played together.
    console.log(`📜 Starting playback from line ${startFromIndex}`);
    for (let i = startFromIndex; i <= endIndex; i++) {
      const line = lines[i];
      if (!line || line.line_id === 0) continue; // ⬅️ Skip introLine (handled elsewhere)
      const { line_id, line_obj } = line;

      const originalIndex = startFromIndex + i;
      setCurrentIndex(i); // so UI reflects correct index in the full list
      setActiveSpeakerId(line_obj.character_id);

      // later inside your loop:
      sendSlackMessage(
        `🎙️ Line ${line_id}: ${line_obj.text} Speaker: ${line_obj.character_id}. Target: ${line_obj.eye_target}`
      );

      // Start a new recording segment for this line.
      console.log(`🎤 Starting recording for line ${line_id}`);

      const audioUrl = `/api/audio-proxy?url=${encodeURIComponent(
        line_obj.audio_url
      )}`;
      const amplitudeData = await analyzeAmplitude(audioUrl);

      // Inject silence visemes into the data
      const silenceThreshold = 0.02;
      const augmentedVisemeData = amplitudeData.map(({ time, amplitude }) => ({
        time,
        viseme: amplitude < silenceThreshold ? "sil" : null, // null means let model handle it
      }));

      function mergeVisemes(
        modelFrames = [],
        amplitudeFrames = [],
        silenceViseme = "rest", // or "sil"
        amplitudeThreshold = 0.0075,
        holdDuration = 0.14 // how long a viseme can last before fallback
      ) {
        const merged = [];
        let modelIndex = 0;
        let lastModelViseme = silenceViseme;
        let lastModelTime = 0;

        for (let i = 0; i < amplitudeFrames.length; i++) {
          const { time, amplitude } = amplitudeFrames[i];

          // Advance model frame if its time has passed
          while (
            modelIndex < modelFrames.length &&
            modelFrames[modelIndex].time <= time
          ) {
            lastModelViseme = modelFrames[modelIndex].viseme;
            lastModelTime = modelFrames[modelIndex].time;
            modelIndex++;
          }

          const timeSinceViseme = time - lastModelTime;
          const isSilent = amplitude < amplitudeThreshold;
          const useSilence = isSilent || timeSinceViseme > holdDuration;

          const viseme = useSilence ? silenceViseme : lastModelViseme;

          const last = merged[merged.length - 1];
          if (!last || last.viseme !== viseme) {
            merged.push({ time, viseme });
          }
        }

        return merged;
      }

      // Combine with existing viseme data from DB
      line_obj.viseme_data = {
        frames: mergeVisemes(line_obj.viseme_data?.frames, amplitudeData),
      };

      startRecordingSegment();

      await playLineAudio(line_id, line_obj.audio_url);

      const pause = line_obj.pause_before ?? 0.5;
      await new Promise((r) => setTimeout(r, pause * 1000));

      const blob = await stopRecordingSegment();
      console.log(`🎤 Stopping recording for line ${line_id}`);
      if (combinedStreamRef.current) {
        combinedStreamRef.current.getTracks().forEach((t) => t.stop());
        combinedStreamRef.current = null;
      }

      if (blob) {
        const formData = new FormData();
        formData.append("video", blob, `scene_segment_${line_id}.webm`);
        formData.append("sessionId", sessionId);
        formData.append("line_id", line_id);
        formData.append("sceneId", sceneId);
        formData.append("folderName", folderName);
        try {
          fetch(`http://${process.env.NEXT_PUBLIC_SERVER_URL}/convert`, {
            method: "POST",
            body: formData,
          });
          recordedChunks.current = [];
          mediaRecorder.current = null;
          console.log(`✅ MP4 uploaded for line_id ${line_id}`);
          if (i === endIndex) {
            console.log(`<<Close Virtual Browser>>`);
          }
        } catch (err) {
          console.error("❌ Upload or conversion failed:", err);
        }
      }
    }
  };
  // New functions to record the judge intro segment.
  const startIntroRecording = () => {
    console.log(`🎤 FUNCTION: Starting intro recording...`);

    audioDestRef.current =
      audioContextRef.current.createMediaStreamDestination();
    recordedChunks.current = [];

    if (!canvasRef.current || !audioDestRef.current) {
      console.log(`❌ No canvas or audio destination available`);
      return;
    }

    const canvasStream = canvasRef.current.captureStream(30);
    const audioStream = audioDestRef.current.stream;
    combinedStreamRef.current = new MediaStream([
      ...canvasStream.getTracks(),
      ...audioStream.getTracks(),
    ]);

    mediaRecorder.current = new MediaRecorder(combinedStreamRef.current, {
      mimeType: "video/webm; codecs=vp9",
      videoBitsPerSecond: 4000000, // or 2500000 for 720p
    });

    mediaRecorder.current.ondataavailable = (event) => {
      console.log(`Intro recording data available: ${event.data.size}`);
      if (event.data.size > 0) {
        recordedChunks.current.push(event.data);
      }
    };

    mediaRecorder.current.start(1000); // ← YES! Timeslice = recurring chunks
    console.log("Intro recording started.");
  };

  const stopIntroRecording = () => {
    return new Promise((resolve) => {
      if (
        mediaRecorder.current &&
        mediaRecorder.current.state === "recording"
      ) {
        mediaRecorder.current.onstop = () => {
          const blob = new Blob(recordedChunks.current, {
            type: "video/webm",
          });
          console.log("Intro recording stopped.");
          resolve(blob);
        };

        mediaRecorder.current.stop();
      } else {
        resolve(null);
      }
    });
  };
  const lastUpdate = useRef(0);
  useEffect(() => {
    const updateAudioTime = () => {
      const now = performance.now();
      if (now - lastUpdate.current > 100) {
        lastUpdate.current = now;
        if (audioRef.current && !audioRef.current.paused) {
          setCurrentAudioTime(audioRef.current.currentTime);
        }
      }
      requestAnimationFrame(updateAudioTime);
    };
    updateAudioTime();
  }, []);

  // --- New Recording Segment Functions ---
  const startRecordingSegment = () => {
    // Reinitialize the audio destination
    audioDestRef.current =
      audioContextRef.current.createMediaStreamDestination();
    recordedChunks.current = [];

    // ✅ Reconnect audio source to new recording destination
    if (audioRef.current && audioContextRef.current && sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (e) {
        console.warn("🔌 Could not disconnect previous audio routing:", e);
      }

      try {
        sourceNodeRef.current.connect(audioContextRef.current.destination);
        sourceNodeRef.current.connect(audioDestRef.current);
        console.log("✅ Reconnected audio source to new destination");
      } catch (e) {
        console.error("❌ Failed to reconnect audio for recording:", e);
      }
    } else {
      console.warn("❌ Audio source or context not available for recording.");
      sendSlackMessage(
        "❌ Audio source or context not available for recording."
      );
    }

    if (!canvasRef.current || !audioDestRef.current) {
      sendSlackMessage(
        "❌ No canvas or audio destination available for recording."
      );
      return console.log(`❌ No canvas or audio destination available`);
    }
    const canvasStream = canvasRef.current.captureStream(60);
    const audioStream = audioDestRef.current.stream;
    combinedStreamRef.current = new MediaStream([
      ...canvasStream.getTracks(),
      ...audioStream.getTracks(),
    ]);

    mediaRecorder.current = new MediaRecorder(combinedStreamRef.current, {
      mimeType: "video/webm; codecs=vp9",
    });

    mediaRecorder.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.current.push(event.data);
      }
    };

    mediaRecorder.current.start(1000);
    console.log("🎬 Segment recording started");
  };

  const stopRecordingSegment = () => {
    return new Promise((resolve, reject) => {
      if (
        mediaRecorder.current &&
        mediaRecorder.current.state === "recording"
      ) {
        mediaRecorder.current.onstop = () => {
          if (combinedStreamRef.current) {
            combinedStreamRef.current.getTracks().forEach((t) => t.stop());
            combinedStreamRef.current = null;
          }
          const blob = new Blob(recordedChunks.current, { type: "video/webm" });
          resolve(blob);
        };
        mediaRecorder.current.stop();
        console.log("Segment recording stopped.");
      } else {
        console.log("❌ No recording in progress.");
        sendSlackMessage(
          "❌ No recording in progress. Segment recording stopped."
        );
        resolve(null);
      }
    });
  };

  // --- Key Handler for Conversion ---
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.key.toLowerCase() === "m") {
        const line_id = lines[currentIndex]?.line_id ?? 1;
        const input_gcs_path = `video/alameda-${sceneId}/${line_id}.mp4`;
        const output_name = `${line_id}`;

        setIsMerging(true);
        setMergeMessage("Merging...");

        await stitchVideoViaApi({
          sceneId,
          input_gcs_path,
          output_name,
          line_id,
        });

        await pollMergeStatus(sceneId); // 👈 Updated
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sceneId, sessionId, lines, currentIndex]);

  // --- Key Handler for Start Recording & Serial Playback ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== "Enter") return;

      console.log("↩️ Enter key pressed");
      console.log("audioReady:", audioReady);
      console.log("headRefsReady:", headRefsReady);
      console.log("currentIndex:", currentIndex);

      if (!headRefsReady || !audioReady) {
        console.log("❌ Not ready to start recording");
        return;
      }

      if (currentIndex === -1) {
        setPlayTriggered(true);
        setCurrentIndex(startFromIndex);

        if (
          audioContextRef.current &&
          audioContextRef.current.state === "suspended"
        ) {
          audioContextRef.current
            .resume()
            .then(() => {
              console.log(`enter: skipIntro: ${skipIntro}`);

              if (skipIntro) {
                console.log("⏭️ Skipping intro, starting playback immediately");
                setIntroPlaying(false);
                runPlayback();
              }
            })
            .catch((err) => {
              console.error("Failed to resume AudioContext:", err);
            });
        } else {
          if (skipIntro) {
            console.log("⏭️ Skipping intro, starting playback immediately");
            setIntroPlaying(false);
            runPlayback();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioReady, headRefsReady, currentIndex, skipIntro, runPlayback]);

  // useEffect(() => {
  //   console.log(`[Scene] currentAudioTime: ${currentAudioTime?.toFixed(2)}`);
  // }, [currentAudioTime]);

  // --- One-Time Update on New Line (unchanged) ---
  useEffect(() => {
    if (currentIndex === -1) return;
    const currentLine = lines[currentIndex]?.line_obj;
    const speakerId = currentLine?.role;
    let targetId = currentLine?.eye_target;
    if (targetId) {
      if (targetId === "audience") {
        const randomIndex = currentLine.line_id % audienceIds.length;
        targetId = audienceIds[randomIndex];
      }
      console.log(
        `New active speaker: ${speakerId}, intended target: ${targetId}`
      );
      let speakerHead = null;
      let targetHead = null;
      if (speakerId && resolvedCharacterRefs[speakerId]?.headRef) {
        speakerHead = resolvedCharacterRefs[speakerId].headRef;
      } else {
        console.warn(`Speaker head not found for id: ${speakerId}`);
      }
      if (targetId && resolvedCharacterRefs[targetId]?.headRef) {
        targetHead = resolvedCharacterRefs[targetId].headRef;
      } else {
        console.warn(`Target head not found for id: ${targetId}`);
      }
      // Prevent self-looking.
      if (speakerId === targetId) {
        console.warn(
          `Speaker ${speakerId} is targeting themselves. Using fallback.`
        );
        targetHead = currentLine.eye_target
          ? resolvedCharacterRefs[currentLine.eye_target]?.headRef
          : null;
      }
      if (!targetHead && targetId) {
        console.warn(`❗ No head found for targetId: "${targetId}"`);
      }

      console.log("Looking for target head by role:", targetId);
      console.log(
        "Found target head:",
        resolvedCharacterRefs[targetId]?.headRef
      );

      // Update shared look target for non‑speakers.
      if (speakerHead) {
        const pos = new THREE.Vector3();
        speakerHead.getWorldPosition(pos);
        lookTargetRef.current.position.copy(pos);
      }
      // Update speaker target for the active speaker.
      if (speakerHead && targetHead) {
        const pos2 = new THREE.Vector3();
        targetHead.getWorldPosition(pos2);
        pos2.y += 0.25;
        speakerTargetRef.current.position.copy(pos2);
        console.log(`Speaker ${speakerId} will look at ${targetId}.`);
      } else {
        console.log(
          `Speaker ${speakerId} has no valid target. Falling back to judge.`
        );
        if (resolvedCharacterRefs["judge"]?.headRef) {
          const pos3 = new THREE.Vector3();
          resolvedCharacterRefs["judge"].headRef.getWorldPosition(pos3);
          pos3.y += 0.25;
          speakerTargetRef.current.position.copy(pos3);
          console.log(`Speaker ${speakerId} falling back to judge as target.`);
        }
      }
    }
  }, [currentIndex, lines]);

  // --- Continuously Update Targets (inside Canvas) ---
  function TargetUpdater({ introPlaying }) {
    const lastUpdateRef = useRef(0);
    const judgePos = useRef(new THREE.Vector3());
    const tempPos1 = useRef(new THREE.Vector3());
    const tempPos2 = useRef(new THREE.Vector3());

    useFrame(({ clock }) => {
      const now = clock.getElapsedTime();
      if (now - lastUpdateRef.current < 0.1) return;
      lastUpdateRef.current = now;

      if (introPlaying) {
        const judge = resolvedCharacterRefs["judge"]?.headRef;
        if (!judge) return;

        judge.getWorldPosition(judgePos.current);
        judgePos.current.y += 0.25;
        lookTargetRef.current.position.copy(judgePos.current);
        return;
      }

      const currentLine = lines[currentIndex]?.line_obj;
      if (!currentLine) return;

      const speakerId = currentLine.character_id;
      const targetId = currentLine.eye_target;

      const speakerObj = resolvedCharacterRefs[speakerId];
      const targetObj =
        resolvedCharacterRefs[targetId] || resolvedCharacterRefs["judge"];

      if (speakerObj?.headRef) {
        speakerObj.headRef.getWorldPosition(tempPos1.current);
        lookTargetRef.current.position.copy(tempPos1.current);
      }

      if (targetObj?.headRef) {
        targetObj.headRef.getWorldPosition(tempPos2.current);
        tempPos2.current.y += 0.25;
        speakerTargetRef.current.position.copy(tempPos2.current);
      }
    });

    return null;
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // --- Register Character Head Refs ---
  const registerCharacter = (id, headRef, role) => {
    if (headRef?.current) {
      resolvedCharacterRefs[id] = { headRef: headRef.current };
      if (role) {
        resolvedCharacterRefs[role] = { headRef: headRef.current };
      }
      if (id === "judge" || role === "judge") {
        setHeadRefsReady(true);
      }
    }
  };

  // --- Default lookTarget when scene is not playing ---
  useEffect(() => {
    if (currentIndex !== -1 || !headRefsReady) return;
    const targetHead = resolvedCharacterRefs["prosecutor1"]?.headRef;
    if (targetHead) {
      const pos = new THREE.Vector3();
      targetHead.getWorldPosition(pos);
      const pos2 = new THREE.Vector3();
      targetHead.getWorldPosition(pos2);
      // console.log("📍 Target world position for", targetId, pos2);

      pos.y += 0.25;
      lookTargetRef.current.position.copy(pos);
    }
  }, [currentIndex, headRefsReady]);

  const zoneMap = {
    judge_sitting_at_judge_bench: {
      position: [0, 2, -18],
      rotation: [0, 0, 0],
    },
    // default_judge_sitting_at_judge_bench: {
    //   position: [0, 2, -18],
    //   rotation: [0, Math.PI, 0],
    // },
    witness_at_witness_stand: {
      position: [-10, 1.1, -15],
      rotation: [0, 0, 0],
    },
    stenographer_station: {
      position: [-17.5, 0, -8],
      rotation: [0, Math.PI / 2, 0],
    },
    prosecutor_table_right: {
      position: [-3.5, -0.05, -0.5],
      rotation: [0, Math.PI, 0],
    },
    prosecutor_table_left: {
      position: [-6.5, -0.05, -0.5],
      rotation: [0, Math.PI, 0],
    },
    defense_table_right: {
      position: [6.5, -0.05, -0.5],
      rotation: [0, Math.PI, 0],
    },
    defense_table_left: {
      position: [3.5, -0.05, -0.5],
      rotation: [0, Math.PI, 0],
    },
    prosecutor_at_witness_stand: {
      position: [-10.5, -0.05, -8.5],
      rotation: [0, -Math.PI / 1.2, 0],
    },
    defense_lawyer_at_witness_stand: {
      position: [-7.5, -0.05, -8.5],
      rotation: [0, -Math.PI / 1.2, 0],
    },
    clerk_box: { position: [10, 1, -15], rotation: [0, Math.PI, 0] },
    default_clerk_box: { position: [10, 1, -15], rotation: [0, 0, 0] },
    outside: { position: [0, 1, 20], rotation: [0, 0, 0] },
  };

  const getLocationPose = (key) => {
    // console.log(`🗺️ Looking up location pose for ${key}`);
    if (zoneMap[key]) {
      return zoneMap[key];
    } else {
      console.log(`❗ No location pose found for ${key}`);
    }
  };

  // Build mapping of character id to their specified style.
  const characterStyleMapping = useMemo(() => {
    const mapping = {};
    lines.forEach(({ line_obj }) => {
      // console.log(`🧑‍⚖️ Processing line:`, line_obj);

      const { character_id, role, style } = line_obj;
      if (character_id && style) {
        let styleObj = { ...style };
        if (role === "judge") {
          styleObj = {
            ...style,
            pants_color: "#000000",
            shirt_color: "#000000",
          };
        }
        mapping[character_id] = mapping[character_id] || styleObj;
        if (role) {
          mapping[role] = mapping[role] || styleObj;
        }
      }
    });
    // console.log("✅ Final style mapping from DB:", mapping);
    return mapping;
  }, [lines]);

  const getStyleForCharacter = (id, role) => {
    const key = id;
    // console.log(`🧑‍⚖️ Looking up style for ${key}`);

    if (characterStyleMapping[key]) {
      return characterStyleMapping[key];
    }
    const presetStyles = {
      thecourt: {
        hair_color: "#2e2e2e",
        hair_style: "bald",
        skin_color: "#c68642",
        pants_color: "#000000",
        shirt_color: "#222222",
      },
      judge: {
        hair_color: "#2e2e2e",
        hair_style: "bald",
        skin_color: "#c68642",
        pants_color: "#000000",
        shirt_color: "#222222",
      },
      bailiff: {
        hair_color: "#000000",
        hair_style: "bald",
        skin_color: "#8d5524",
        pants_color: "#00008b",
        shirt_color: "#2f4f4f",
      },
      clerk: {
        hair_color: "#a0522d",
        hair_style: "bald",
        skin_color: "#f5cba7",
        pants_color: "#2e2e2e",
        shirt_color: "#f0e68c",
      },
    };
    // console.log(`🧑‍⚖️ Style for ${key}:`, presetStyles[key]);

    if (presetStyles[key]) {
      return presetStyles[key];
    }
    const fallbackStyle = generateDeterministicStyle(id);
    return fallbackStyle;
  };
  useEffect(() => {
    if (currentIndex !== -1) {
      const currentLine = lines[currentIndex].line_obj;
      console.log("Active emotion:", currentLine.emotion);
    }
  }, [currentIndex, lines]);

  const generateDeterministicStyle = (id) => {
    const palette = {
      hairStyles: ["short", "long", "braids", "bun", "buzz"],
      skinTones: ["#f5cba7", "#e1b7a1", "#c68642", "#8d5524", "#ffdbac"],
      pantsColors: ["#000000", "#2e2e2e", "#4b4b4b", "#5a3e36"],
      shirtColors: ["#ffffff", "#d3d3d3", "#4682b4", "#32cd32", "#ff69b4"],
      hairColors: ["#2e2e2e", "#4b4b4b", "#8b4513", "#a0522d", "#000000"],
    };
    const hash = [...id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      hair_color: palette.hairColors[hash % palette.hairColors.length],
      hair_style: palette.hairStyles[hash % palette.hairStyles.length],
      skin_color: palette.skinTones[hash % palette.skinTones.length],
      pants_color: palette.pantsColors[(hash + 1) % palette.pantsColors.length],
      shirt_color: palette.shirtColors[(hash + 2) % palette.shirtColors.length],
    };
  };

  const getZoneOccupancy = (lines, currentIndex) => {
    const zoneOccupancy = {};
    const characterZones = {};
    const seenCharacters = new Set();

    // Step 1: Simulate movements from the start to currentIndex
    for (let i = 0; i <= currentIndex; i++) {
      const { character_id, zone } = lines[i]?.line_obj || {};
      if (!character_id || !zone) continue;

      // Remove from any previous zone
      for (const z in zoneOccupancy) {
        if (zoneOccupancy[z] === character_id) {
          zoneOccupancy[z] = null;
        }
      }

      // Assign to new zone
      zoneOccupancy[zone] = character_id;
      characterZones[character_id] = zone;
      seenCharacters.add(character_id);
    }

    // Step 2: Look ahead for characters we haven’t seen yet
    for (let i = currentIndex + 1; i < lines.length; i++) {
      const { character_id, zone } = lines[i]?.line_obj || {};
      if (!character_id || !zone || seenCharacters.has(character_id)) continue;

      // Assign this future character to their earliest known zone
      if (!characterZones[character_id]) {
        characterZones[character_id] = zone;
      }

      // Only assign if no one is occupying that zone yet
      if (!Object.values(zoneOccupancy).includes(character_id)) {
        zoneOccupancy[zone] ??= character_id;
      }

      seenCharacters.add(character_id);
    }

    // console.log(`🧭 Zone snapshot at line ${currentIndex}:`, zoneOccupancy);
    return { zoneOccupancy, characterZones };
  };
  function CameraTargetUpdater() {
    useFrame(({ camera }) => {
      cameraTargetRef.current.position.lerp(camera.position, 0.15);
    });
    return null;
  }

  const zoneOccupancyMemo = useMemo(() => {
    return getZoneOccupancy(
      lines,
      currentIndex === -1 ? lines.length - 1 : currentIndex
    ).zoneOccupancy;
  }, [lines, currentIndex]);

  const judgeCharacterId = useMemo(() => {
    const line = lines.find((l) => l.line_obj?.role === "judge");
    return line?.line_obj?.character_id ?? "judge";
  }, [lines]);

  const judgeStyle = getStyleForCharacter(judgeCharacterId, "judge");

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        ref={canvasRef}
        shadows
        camera={{ position: [0, 25, 19], fov: 45 }}
        style={{ background: "#222" }}
        gl={{
          preserveDrawingBuffer: true,
          outputEncoding: THREE.SRGBEncoding,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
      >
        <Suspense fallback={null}>
          <CameraController
            activePreset={
              (currentIndex !== -1 && lines[currentIndex]?.line_obj.camera) ||
              "wide_establishing"
            }
          />

          <primitive object={cameraTargetRef.current} />
          <CameraTargetUpdater />

          <primitive object={lookTargetRef.current} />
          <TargetUpdater
            currentIndex={currentIndex}
            lines={lines}
            characterRefs={characterRefs}
            lookTargetRef={lookTargetRef}
            speakerTargetRef={speakerTargetRef}
            introPlaying={introPlaying}
          />
          <hemisphereLight intensity={0.1} />
          <hemisphereLight skyColor="white" groundColor="#444" intensity={0} />
          <directionalLight
            castShadow
            position={[-50, 30, 0]}
            intensity={1.2}
            color="#fff8e1"
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-near={1}
            shadow-camera-far={100}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
          />
          <directionalLight
            castShadow
            position={[10, 30, 10]}
            intensity={1.5}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0001}
            shadow-normalBias={0.01}
            shadow-camera-near={1}
            shadow-camera-far={100}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
          />
          <Environment background files="/environment2.exr" />
          <OrbitControls maxPolarAngle={Math.PI / 2.2} />

          {/* Room structure */}
          <Floor />
          <Ceiling />
          <Wall position={[0, 11, 20]} />
          <WindowedWall position={[-20, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
          <JudgeBackWall />
          <SidePaneledWall />
          <DividerWithGate />

          {/* Furniture */}
          <JudgeTable />
          <WitnessStand />
          <ClerkBox />
          <LawyerTable position={[5, 0, -1.75]} />
          <LawyerTable position={[-5, 0, -1.75]} />
          {[...[-3.5, -6.5, 3.5, 6.5]].map((x) => (
            <SingleChair key={x} position={[x, 0, -0.5]} />
          ))}
          {[5, 8, 11, 14].flatMap((z) =>
            [-8, 8].map((x) => <Bench key={`${x}-${z}`} position={[x, 0, z]} />)
          )}
          <StenographerStation />
          <JuryBox position={[18, 0, -10]} rotation={[0, Math.PI / 2, 0]} />

          {/* Characters */}
          <>
            {ready && (
              <>
                {/* Dynamic Characters (Based on zoneOccupancy) */}
                {(() => {
                  // Call getZoneOccupancy to define zoneOccupancy.
                  const { zoneOccupancy } = getZoneOccupancy(
                    lines,
                    currentIndex === -1 ? lines.length - 1 : currentIndex
                  );

                  return Object.entries(zoneOccupancy).map(
                    ([zone, characterId]) => {
                      if (!characterId) return <React.Fragment key={zone} />;

                      // Special handling for the judge.
                      if (characterId === judgeCharacterId) {
                        if (playTriggered && introPlaying) {
                          return (
                            <JudgeIntroAnimation
                              key="judge-intro"
                              folderName={folderName}
                              registerCharacter={registerCharacter}
                              lookTargetRef={lookTargetRef}
                              judgeCharacterId={judgeCharacterId}
                              judgeStyle={judgeStyle}
                              endIndex={endIndex}
                              eyeTargetRef={cameraTargetRef}
                              introPlaying={introPlaying}
                              startIntroRecording={startIntroRecording}
                              stopIntroRecording={stopIntroRecording}
                              playTriggered={playTriggered}
                              resolvedCharacterRefs={resolvedCharacterRefs}
                              playIntroAudio={playIntroAudio}
                              sceneId={sceneId}
                              sessionId={sessionId}
                              ready={ready}
                              onComplete={() => {
                                setIntroPlaying(false);
                                setCurrentIndex(startFromIndex);
                                runPlayback();
                              }}
                            />
                          );
                        } else {
                          return (
                            <Character
                              key="judge"
                              {...getLocationPose(
                                "judge_sitting_at_judge_bench"
                              )}
                              onReady={(headRef) =>
                                registerCharacter(
                                  judgeCharacterId,
                                  headRef,
                                  "judge"
                                )
                              }
                              params={{
                                sitting: true,
                                role: "judge",
                                characterId: judgeCharacterId,
                                style: getStyleForCharacter(
                                  judgeCharacterId,
                                  "judge"
                                ),
                                viseme_data:
                                  currentIndex !== -1 &&
                                  lines[currentIndex].line_obj.character_id ===
                                    judgeCharacterId
                                    ? lines[currentIndex].line_obj.viseme_data
                                    : null,
                                audioTime:
                                  currentIndex !== -1 &&
                                  lines[currentIndex].line_obj.character_id ===
                                    judgeCharacterId
                                    ? currentAudioTime
                                    : 0,

                                eyeTargetRef: lookTargetRef,
                                speakerTargetRef,
                                activeSpeakerId,
                                emotion: "angry",
                              }}
                            />
                          );
                        }
                      }

                      // Render other characters normally.
                      const lineData = lines.find(
                        (l) => l.line_obj.character_id === characterId
                      );
                      const role = lineData?.line_obj?.role || characterId;
                      const isActive =
                        currentIndex !== -1 &&
                        lines[currentIndex].line_obj.character_id ===
                          characterId;

                      return (
                        <Character
                          key={characterId}
                          {...getLocationPose(zone)}
                          onReady={(headRef) =>
                            registerCharacter(characterId, headRef, role)
                          }
                          params={{
                            sitting:
                              zone.includes("table") ||
                              zone === "witness_at_witness_stand",
                            role,
                            characterId,
                            style: getStyleForCharacter(characterId, role),
                            viseme_data: isActive
                              ? lines[currentIndex].line_obj.viseme_data
                              : null,
                            audioTime: isActive ? currentAudioTime : 0,
                            eyeTargetRef: lookTargetRef,
                            speakerTargetRef,
                            activeSpeakerId,
                            emotion: isActive
                              ? lines[currentIndex].line_obj.emotion ||
                                "neutral"
                              : "neutral",
                          }}
                        />
                      );
                    }
                  );
                })()}
                {/* Judge (always at bench) */}
                {/* <Character
                 key="judge"
                 {...getLocationPose("judge_sitting_at_judge_bench")}
                 onReady={(headRef) =>
                   registerCharacter("judge", headRef, "judge")
                 }
                 params={{
                   sitting: true,
                   role: "judge",
                   characterId: "judge",
                   style: getStyleForCharacter("judge", "judge"),
                   eyeTargetRef: lookTargetRef,
                   speakerTargetRef,
                   activeSpeakerId,
                   emotion: "angry",
                 }}
               /> */}
                {/* Clerk (always in clerk_box) */}
                {showDefaultClerk && (
                  <Character
                    key="clerk"
                    {...getLocationPose("default_clerk_box")}
                    onReady={(headRef) =>
                      registerCharacter("clerk", headRef, "clerk")
                    }
                    params={{
                      sitting: true,
                      role: "clerk",
                      characterId: "clerk",
                      style: getStyleForCharacter("clerk", "clerk"),
                      eyeTargetRef: lookTargetRef,
                      speakerTargetRef,
                      activeSpeakerId,
                      emotion: "neutral",
                    }}
                  />
                )}
                .{/* Stenographer (always in stenographer_station) */}
                <Character
                  key="stenographer"
                  {...getLocationPose("stenographer_station")}
                  onReady={(headRef) =>
                    registerCharacter("stenographer", headRef, "stenographer")
                  }
                  params={{
                    sitting: true,
                    role: "stenographer",
                    characterId: "stenographer",
                    style: getStyleForCharacter("stenographer", "stenographer"),
                    eyeTargetRef: lookTargetRef,
                    speakerTargetRef,
                    activeSpeakerId,
                    emotion: "neutral",
                  }}
                />
                {showJury && (
                  <>
                    {/* Jury (6 members fixed position) */}
                    {[...Array(6)].map((_, i) => (
                      <Character
                        key={`jury-${i}`}
                        // {...getLocationPose("jury_box")}
                        position={[18, 0, -13 + i * 1.3]}
                        rotation={[0, -Math.PI / 2, 0]}
                        onReady={(headRef) =>
                          registerCharacter(
                            `jury-${i}`,
                            headRef,
                            i === 2 ? "jury" : null
                          )
                        }
                        params={{
                          sitting: true,
                          role: "jury",
                          characterId: `jury-${i}`,
                          style: getStyleForCharacter(`jury-${i}`, "jury"),
                          eyeTargetRef: lookTargetRef,
                          speakerTargetRef,
                          activeSpeakerId,
                          emotion: "neutral",
                        }}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* Bailiff (static) */}
            <group scale={[1.3, 1.3, 1.3]}>
              <Character
                position={[-12, 0, -12]}
                rotation={[0, 0, 0]}
                params={{
                  sitting: false,
                  torsoLean: -0.1,
                  style: getStyleForCharacter("bailiff", "bailiff"),
                  eyeTargetRef: lookTargetRef,
                  activeSpeakerId,
                  speakerTargetRef,
                  characterId: "bailiff",
                  emotion: "neutral",
                }}
              />
            </group>

            {/* Audience */}
            {[5, 8, 11, 14].flatMap((z) =>
              [-12, -7.5, -3.5, 3.5, 7.5, 12].map((x, i) => {
                const skip = [
                  [-7.5, 5],
                  [7.5, 8],
                  [-3.5, 11],
                  [12, 14],
                ].some(([sx, sz]) => sx === x && sz === z);
                if (skip) return null;
                return (
                  <Character
                    key={`audience-${x}-${z}`}
                    position={[x, 0, z]}
                    rotation={[0, Math.PI, 0]}
                    onReady={(headRef) =>
                      registerCharacter(
                        `audience-${x}-${z}`,
                        headRef,
                        "audience"
                      )
                    }
                    params={{
                      sitting: true,
                      colorTorso: ["#b22222", "#4682b4", "#daa520", "#008b8b"][
                        i % 4
                      ],
                      eyeTargetRef: lookTargetRef,
                      activeSpeakerId,
                      speakerTargetRef,
                      role: "audience",
                      characterId: `audience-${x}-${z}`,
                      style: getStyleForCharacter(
                        `audience-${x}-${z}`,
                        "audience"
                      ),
                      emotion: "neutral",
                    }}
                  />
                );
              })
            )}
          </>

          {/* Lights */}
          {[-10, 10].flatMap((x) =>
            [-10, 0, 10].map((z) => (
              <CeilingLight key={`${x}-${z}`} position={[x, 22, z]} />
            ))
          )}
        </Suspense>
      </Canvas>
      {isMerging && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.75)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2rem",
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          {mergeMessage}
        </div>
      )}
      {showStitchedModal && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
        >
          <div
            style={{
              background: "linear-gradient(145deg, #1a1a1a, #111)",
              padding: "2rem",
              borderRadius: "16px",
              maxWidth: "90%",
              maxHeight: "90%",
              boxShadow:
                "0 0 25px rgba(255, 0, 80, 0.35), 0 0 80px rgba(0, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              border: "1px solid #333",
            }}
          >
            <h2
              style={{
                fontSize: "2rem",
                marginBottom: "1.25rem",
                color: "#f8f8f8",
                textShadow: "0 0 12px rgba(255, 255, 255, 0.2)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span role="img" aria-label="clapperboard">
                🎬
              </span>{" "}
              Click the three dots{" "}
              <span style={{ fontWeight: "3em" }}>[ ⋮ ]</span> to download ↘️
              {/* Click the three dots {"->"} Download */}
            </h2>
            <video
              src={stitchedVideoUrl}
              controls
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                marginBottom: "1.5rem",
                borderRadius: "10px",
                boxShadow: "0 0 25px rgba(255, 255, 255, 0.08)",
              }}
            />
            <button
              style={{
                padding: "0.75rem 1.5rem",
                background: "radial-gradient(circle, #ff004c 0%, #660022 100%)",
                color: "#fff",
                fontWeight: "bold",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: "0 0 12px rgba(255, 0, 76, 0.5)",
                transition: "all 0.3s ease",
              }}
              onClick={() => {
                setShowStitchedModal(false);
                setStitchedVideoUrl(null);
              }}
              onMouseEnter={(e) =>
                (e.target.style.boxShadow = "0 0 20px rgba(255, 0, 76, 0.8)")
              }
              onMouseLeave={(e) =>
                (e.target.style.boxShadow = "0 0 12px rgba(255, 0, 76, 0.5)")
              }
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function hashStringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = "#";
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += ("00" + value.toString(16)).slice(-2);
  }
  return color;
}

function useResolvedCharacterRefs(rawRef, aliasMap) {
  return useMemo(() => {
    return new Proxy(rawRef.current, {
      get(target, key) {
        const resolved = aliasMap[key] || key;
        return target[resolved];
      },
    });
  }, [aliasMap]);
  a;
}

function JudgeIntroAnimation({
  onComplete,
  lookTargetRef,
  judgeStyle,
  judgeCharacterId,
  folderName,
  resolvedCharacterRefs,
  registerCharacter,
  startIntroRecording,
  stopIntroRecording,
  playIntroAudio,
  playTriggered,
  introPlaying,
  eyeTargetRef,
  sessionId,
  endIndex,
  sceneId,
}) {
  const judgeRef = useRef();
  const introStartedRef = useRef(false);
  const hasCompletedRef = useRef(false); // ✅ Prevent multiple onComplete calls
  const clock = useRef(new THREE.Clock());

  const [finalRotation, setFinalRotation] = useState([0, 0, 0]);

  const waypoints = [
    new THREE.Vector3(0, 0, 12), // Entrance
    new THREE.Vector3(1, 0, -8), // Up the aisle
    new THREE.Vector3(10, 0, -10), // In front of the witness stand
    new THREE.Vector3(15, 0, -15), // Left of the witness stand
    new THREE.Vector3(8, 0, -20), // Smoothing point
    new THREE.Vector3(0, 0, -22), // Behind the witness stand
    new THREE.Vector3(0, 2, -18), // Judge’s bench final position
  ];

  const curve = new THREE.CatmullRomCurve3(waypoints);

  const camStart = new THREE.Vector3(0, 1.5, 15);
  const camEnd = new THREE.Vector3(0, 4, -10);
  const walkDelay = 0;
  const duration = 14;

  // Start intro playback and recording once
  useEffect(() => {
    if (playTriggered && introPlaying && !introStartedRef.current) {
      console.log("▶️ Triggering intro from useEffect");
      introStartedRef.current = true;
      startIntroRecording();

      playIntroAudio("/intro_music.mp3")
        .then(() => console.log("🎵 Done playing intro music"))
        .catch((err) => console.error("❌ Intro audio error:", err));
    }
  }, [playTriggered, introPlaying]);

  // Animation loop
  useFrame(({ camera }) => {
    const elapsed = clock.current.getElapsedTime();
    const walkElapsed = Math.max(0, elapsed - walkDelay);
    const t = Math.min(walkElapsed / duration, 1);
    const easedT = t * t * (3 - 2 * t); // Ease-in-out

    const position = curve.getPoint(easedT);
    const tangent = curve.getTangent(easedT);
    const lookAtTarget = position.clone().add(tangent);

    if (judgeRef.current) {
      judgeRef.current.position.copy(position);
      const targetFlat = lookAtTarget.clone();
      targetFlat.y = position.y;
      judgeRef.current.lookAt(targetFlat);
    }

    if (
      t < 1 &&
      lookTargetRef?.current &&
      resolvedCharacterRefs?.judge?.headRef
    ) {
      const targetPos = new THREE.Vector3();
      resolvedCharacterRefs.judge.headRef.getWorldPosition(targetPos);
      targetPos.y += 0.25;
      lookTargetRef.current.position.copy(targetPos);
    }

    const lookOffset = new THREE.Vector3(0, 1.5, 0);
    const camPos = camStart.clone().lerp(camEnd, easedT);
    camera.position.copy(camPos);
    camera.lookAt(position.clone().add(lookOffset));

    // Only trigger onComplete once
    if (t >= 1 && !hasCompletedRef.current) {
      hasCompletedRef.current = true;

      stopIntroRecording().then(async (blob) => {
        if (blob) {
          const formData = new FormData();
          formData.append("video", blob, `intro_segment.webm`);
          formData.append("sessionId", sessionId);
          formData.append("sceneId", sceneId);
          formData.append("folderName", folderName);

          try {
            fetch(`http://${process.env.NEXT_PUBLIC_SERVER_URL}/convert`, {
              method: "POST",
              body: formData,
            });
            if (endIndex === 0) {
              console.log("<<Close Virtual Browser>>");
            }
            console.log("✅ Intro segment uploaded.");
          } catch (err) {
            console.error("❌ Upload of intro segment failed:", err);
          }
        }

        onComplete?.(); // Safely trigger onComplete
      });
    }
  });

  // Debug log
  useEffect(() => {
    console.log("JudgeIntroAnimation judgeStyle:", judgeStyle);
  }, [judgeStyle]);

  return (
    <group ref={judgeRef}>
      <Character
        role="judge"
        characterId={judgeCharacterId}
        onReady={(headRef) =>
          registerCharacter(judgeCharacterId, headRef, "judge")
        }
        params={{
          style: judgeStyle,
          sitting: false,
          rotation: finalRotation,
          eyeTargetRef,
          speakerTargetRef: new THREE.Object3D(),
          activeSpeakerId: null,
          emotion: "angry",
        }}
      />
    </group>
  );
}

async function stitchVideoViaApi({
  sceneId,
  input_gcs_path,
  output_name,
  line_id,
  video_type = "converted",
}) {
  try {
    const response = await fetch(`/api/stitch-videos/${sceneId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input_gcs_path,
        output_name,
        line_id,
        video_type,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Video conversion failed");
    }

    console.log("✅ Convert successful:", data.video_url);
    return data;
  } catch (error) {
    console.error("❌ Convert API error:", error);
  }
}
