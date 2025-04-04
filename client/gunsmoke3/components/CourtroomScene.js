// components/CourtroomScene.jsx
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
import { getSupabase } from "@/utils/supabase";
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
  Character, // make sure this Character includes your MouthViseme rendering
} from "@/components/CourtroomPrimatives";

export default function CourtroomScene({
  lines,
  sceneId,
  startFromLineId = 1,
}) {
  const sessionId = useMemo(() => uuidv4(), []);
  const startFromIndex = useMemo(() => {
    if (!startFromLineId) return 0;
    const index = lines.findIndex((line) => line.line_id === startFromLineId);
    return index === -1 ? 0 : index;
  }, [startFromLineId, lines]);

  const [currentIndex, setCurrentIndex] = useState(-1);

  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  // State to track the audio's current time for viseme timing.
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const characterRefs = useRef({});
  // (Removed audioMap since we no longer preload thousands of audio files)
  // Shared lookTargetRef for non‑speakers and active speaker target
  const lookTargetRef = useRef(new THREE.Object3D());
  const speakerTargetRef = useRef(new THREE.Object3D());
  const [ready, setReady] = useState(false);
  const [headRefsReady, setHeadRefsReady] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

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

  // --- New Effect: Set audioReady on first user interaction ---
  // This ensures that the browser allows audio playback.
  useEffect(() => {
    const handleUserInteraction = () => {
      setAudioReady(true);
      window.removeEventListener("click", handleUserInteraction);
    };
    window.addEventListener("click", handleUserInteraction);
    return () => window.removeEventListener("click", handleUserInteraction);
  }, []);

  // --- Helper: playLineAudio ---
  // Loads a single audio clip, routes it to the recording destination,
  // plays it, and then cleans up the source node and audio element.
  const playLineAudio = async (lineId, audioUrl) => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(
        `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`
      );
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";

      let sourceNode = null;

      const onEnded = () => {
        // Disconnect and allow cleanup of the audio element.
        if (sourceNode) {
          try {
            sourceNode.disconnect();
          } catch (e) {
            console.warn(`Failed to disconnect for ${lineId}`, e);
          }
          sourceNode = null;
        }
        // Remove the audio element so it can be garbage collected.
        audio.remove();
        resolve();
      };

      const onError = (err) => {
        console.error(`Error playing audio for ${lineId}`, err);
        reject(err);
      };

      audio.addEventListener(
        "canplaythrough",
        () => {
          try {
            sourceNode =
              audioContextRef.current.createMediaElementSource(audio);
            // Connect to both the default destination and the MediaStreamDestination for recording.
            sourceNode.connect(audioContextRef.current.destination);
            sourceNode.connect(audioDestRef.current);
            audio.play().catch(onError);
          } catch (e) {
            onError(e);
          }
        },
        { once: true }
      );

      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });
    });
  };

  // --- Helper: runPlayback ---
  // --- Updated runPlayback for Line-Based Cuts ---
  const runPlayback = async () => {
    const linesToPlay = lines.slice(startFromIndex);
    for (let i = 0; i < linesToPlay.length; i++) {
      const line = linesToPlay[i];
      const { line_id, line_obj } = line;

      const originalIndex = startFromIndex + i;
      setCurrentIndex(originalIndex); // so UI reflects correct index in the full list
      setActiveSpeakerId(line_obj.character_id);

      console.log(`🎤 Starting recording for line ${line_id}`);
      startRecordingSegment();
      await playLineAudio(line_id, line_obj.audio_url);

      const pause = line_obj.pause_before ?? 0.5;
      await new Promise((r) => setTimeout(r, pause * 1000));

      const blob = await stopRecordingSegment();
      console.log(`🎤 Stopping recording for line ${line_id}`);

      if (blob) {
        const formData = new FormData();
        formData.append("video", blob, `scene_segment_${line_id}.webm`);
        formData.append("sessionId", sessionId);
        formData.append("line_id", line_id);
        formData.append("sceneId", sceneId);

        try {
          await fetch("http://localhost:3001/convert", {
            method: "POST",
            body: formData,
          });
          console.log(`✅ MP4 uploaded for line_id ${line_id}`);
        } catch (err) {
          console.error("❌ Upload or conversion failed:", err);
        }
      }
    }
  };

  // --- New Recording Segment Functions ---
  const startRecordingSegment = () => {
    // Reinitialize the audio destination for a fresh stream segment.
    audioDestRef.current =
      audioContextRef.current.createMediaStreamDestination();
    // Reset previously recorded chunks.
    recordedChunks.current = [];
    if (!canvasRef.current || !audioDestRef.current) return;
    const canvasStream = canvasRef.current.captureStream(60);
    const audioStream = audioDestRef.current.stream;
    const combinedStream = new MediaStream([
      ...canvasStream.getTracks(),
      ...audioStream.getTracks(),
    ]);
    mediaRecorder.current = new MediaRecorder(combinedStream, {
      mimeType: "video/webm; codecs=vp9",
    });
    mediaRecorder.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.current.push(event.data);
      }
    };
    // Start recording with a timeslice (e.g., 1000ms).
    mediaRecorder.current.start(1000);
    console.log("Segment recording started with timeslice 1000ms.");
  };

  const stopRecordingSegment = () => {
    return new Promise((resolve, reject) => {
      if (
        mediaRecorder.current &&
        mediaRecorder.current.state === "recording"
      ) {
        mediaRecorder.current.onstop = () => {
          const blob = new Blob(recordedChunks.current, { type: "video/webm" });
          resolve(blob);
        };
        mediaRecorder.current.stop();
        console.log("Segment recording stopped.");
      } else {
        resolve(null);
      }
    });
  };

  // --- Start Recording Function ---
  // const startRecording = () => {
  //   if (!canvasRef.current || !audioDestRef.current) return;
  //   // Capture the canvas at 60 fps (ensure preserveDrawingBuffer is enabled)
  //   const canvasStream = canvasRef.current.captureStream(60);
  //   // Get the audio stream from our MediaStreamDestination.
  //   const audioStream = audioDestRef.current.stream;
  //   // Combine video and audio tracks.
  //   const combinedStream = new MediaStream([
  //     ...canvasStream.getTracks(),
  //     ...audioStream.getTracks(),
  //   ]);
  //   mediaRecorder.current = new MediaRecorder(combinedStream, {
  //     mimeType: "video/webm; codecs=vp9",
  //   });
  //   mediaRecorder.current.ondataavailable = (event) => {
  //     if (event.data.size > 0) {
  //       recordedChunks.current.push(event.data);
  //     }
  //   };
  //   mediaRecorder.current.onstop = () => {
  //     const blob = new Blob(recordedChunks.current, { type: "video/webm" });
  //     const formData = new FormData();
  //     formData.append("video", blob, "scene.webm");
  //     formData.append("sessionId", sessionId);

  //     // add sceneId to formData

  //     fetch("http://localhost:3001/convert", {
  //       method: "POST",
  //       body: formData,
  //     })
  //       .then(async (res) => {
  //         const blob = await res.blob();
  //         const url = URL.createObjectURL(blob);
  //         const link = document.createElement("a");
  //         link.href = url;
  //         link.download = "scene.mp4";
  //         document.body.appendChild(link);
  //         link.click();
  //         document.body.removeChild(link);
  //         URL.revokeObjectURL(url);
  //         console.log("✅ MP4 downloaded");
  //       })
  //       .catch((err) => {
  //         console.error("❌ Upload or conversion failed:", err);
  //       });
  //   };

  //   mediaRecorder.current.start();
  //   console.log("Recording started.");
  // };

  // --- Key Handler for Start Recording & Serial Playback ---
  useEffect(() => {
    const handleKeyDown = async (e) => {
      console.log("↩️ Enter key pressed");
      console.log("audioReady:", audioReady);
      console.log("headRefsReady:", headRefsReady);
      console.log("currentIndex:", currentIndex);
      // Check that headRefs and audio are ready, and key is Enter.
      if (!headRefsReady || !audioReady || e.key !== "Enter") {
        return console.log(`❌ Not ready to start recording`);
      }
      if (currentIndex === -1) {
        setAutoPlay(true); // trigger auto-play
        setCurrentIndex(startFromIndex); // start from the first line

        // Resume AudioContext if it is suspended.
        if (
          audioContextRef.current &&
          audioContextRef.current.state === "suspended"
        ) {
          await audioContextRef.current.resume();
        }
        // startRecording();
        // Start serial playback for all lines.
        runPlayback();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, lines, headRefsReady, audioReady]);

  // --- (Removed update effect using audioMap for currentAudioTime) ---
  // Since we no longer store audio elements in audioMap, this effect has been removed.
  // If needed, you could implement a separate mechanism to track the currently playing audio.

  // --- One-Time Update on New Line (unchanged) ---
  useEffect(() => {
    if (currentIndex === -1) return;
    const currentLine = lines[currentIndex]?.line_obj;
    const speakerId = currentLine?.role;
    const targetId = currentLine?.eye_target;
    console.log(
      `New active speaker: ${speakerId}, intended target: ${targetId}`
    );
    let speakerHead = null;
    let targetHead = null;
    if (speakerId && characterRefs.current[speakerId]?.headRef) {
      speakerHead = characterRefs.current[speakerId].headRef;
    } else {
      console.warn(`Speaker head not found for id: ${speakerId}`);
    }
    if (targetId && characterRefs.current[targetId]?.headRef) {
      targetHead = characterRefs.current[targetId].headRef;
    } else {
      console.warn(`Target head not found for id: ${targetId}`);
    }
    // Prevent self-looking.
    if (speakerId === targetId) {
      console.warn(
        `Speaker ${speakerId} is targeting themselves. Using fallback.`
      );
      targetHead = currentLine.eye_target
        ? characterRefs.current[currentLine.eye_target]?.headRef
        : null;
    }
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
      if (characterRefs.current["judge"]?.headRef) {
        const pos3 = new THREE.Vector3();
        characterRefs.current["judge"].headRef.getWorldPosition(pos3);
        pos3.y += 0.25;
        speakerTargetRef.current.position.copy(pos3);
        console.log(`Speaker ${speakerId} falling back to judge as target.`);
      }
    }
  }, [currentIndex, lines]);

  // --- Continuously Update Targets (inside Canvas) ---
  function TargetUpdater() {
    useFrame(() => {
      if (currentIndex === -1) return;
      const currentLine = lines[currentIndex]?.line_obj;
      if (!currentLine) return;
      const speakerId = currentLine.character_id;
      const targetId = currentLine.eye_target;
      const speakerObj = characterRefs.current[speakerId];
      if (speakerObj && speakerObj.headRef) {
        const pos = new THREE.Vector3();
        speakerObj.headRef.getWorldPosition(pos);
        lookTargetRef.current.position.copy(pos);
      }
      const targetObj =
        (targetId && characterRefs.current[targetId]) ||
        characterRefs.current["judge"];
      if (speakerObj && targetObj && targetObj.headRef) {
        const pos2 = new THREE.Vector3();
        targetObj.headRef.getWorldPosition(pos2);
        pos2.y += 0.25;
        speakerTargetRef.current.position.copy(pos2);
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
      characterRefs.current[id] = { headRef: headRef.current };
      if (role && role !== id) {
        characterRefs.current[role] = { headRef: headRef.current };
      }
      if (id === "judge" || role === "judge") {
        setHeadRefsReady(true);
      }
    }
  };

  // --- Default lookTarget when scene is not playing ---
  useEffect(() => {
    if (currentIndex !== -1 || !headRefsReady) return;
    const targetHead = characterRefs.current["prosecutor1"]?.headRef;
    if (targetHead) {
      const pos = new THREE.Vector3();
      targetHead.getWorldPosition(pos);
      pos.y += 0.25;
      lookTargetRef.current.position.copy(pos);
    }
  }, [currentIndex, headRefsReady]);

  const zoneMap = {
    judge_sitting_at_judge_bench: {
      position: [0, 2, -18],
      rotation: [0, Math.PI, 0],
    },
    witness_at_witness_stand: {
      position: [-10, 1.1, -15],
      rotation: [0, Math.PI, 0],
    },
    stenographer_station: {
      position: [-17.5, 0, -8],
      rotation: [0, -Math.PI / 2, 0],
    },
    prosecutor_table_right: {
      position: [-3.5, -0.05, -0.5],
      rotation: [0, 0, 0],
    },
    prosecutor_table_left: {
      position: [-6.5, -0.05, -0.5],
      rotation: [0, 0, 0],
    },
    defense_table_right: {
      position: [6.5, -0.05, -0.5],
      rotation: [0, 0, 0],
    },
    defense_table_left: { position: [3.5, -0.05, -0.5], rotation: [0, 0, 0] },
    prosecutor_at_witness_stand: {
      position: [-10.5, -0.05, -8.5],
      rotation: [0, Math.PI / 1.2, 0],
    },
    defense_lawyer_at_witness_stand: {
      position: [-7.5, -0.05, -8.5],
      rotation: [0, Math.PI / 1.2, 0],
    },
    clerk_box: { position: [10, 1, -15], rotation: [0, Math.PI, 0] },
  };

  const getLocationPose = (key) =>
    zoneMap[key] || { position: [0, 0, 0], rotation: [0, 0, 0] };

  // --- Main Characters ---
  const mainCharacters = [
    {
      id: "judge",
      zone: "judge_sitting_at_judge_bench",
      role: "judge",
      sitting: true,
      colorTorso: "#222",
      emotion: "angry",
    },
    {
      id: "prosecutor1",
      zone: "prosecutor_at_witness_stand",
      role: "prosecutor1",
      sitting: false,
      colorTorso: "#1e90ff",
    },
    {
      id: "prosecutor2",
      zone: "prosecutor_table_right",
      role: "prosecutor2",
      sitting: true,
      colorTorso: "#1e90ff",
    },
    {
      id: "defense1",
      zone: "defense_table_left",
      role: "defense1",
      sitting: true,
      colorTorso: "#32cd32",
    },
    {
      id: "defense2",
      zone: "defense_table_right",
      role: "defense2",
      sitting: true,
      colorTorso: "#32cd32",
    },
    {
      id: "witness",
      zone: "witness_at_witness_stand",
      role: "witness",
      sitting: true,
      colorTorso: "#ffd700",
    },
    {
      id: "stenographer",
      zone: "stenographer_station",
      role: "stenographer",
      sitting: true,
      colorTorso: "#9932cc",
    },
    {
      id: "clerk", // New clerk character
      zone: "clerk_box",
      role: "clerk",
      sitting: true,
      colorTorso: "#a0522d",
    },
  ];

  // Get the current active line, if any.
  const currentLine = currentIndex !== -1 ? lines[currentIndex].line_obj : null;
  // Build mapping of character id to their specified style.
  const characterStyleMapping = useMemo(() => {
    const mapping = {};
    lines.forEach(({ line_obj }) => {
      const { role, style } = line_obj;
      if (role && style && !mapping[role]) {
        mapping[role] = style;
      }
    });
    // console.log("✅ Final style mapping from DB:", mapping);
    return mapping;
  }, [lines]);

  const getStyleForCharacter = (id, role) => {
    const key = role || id;
    if (characterStyleMapping[key]) {
      return characterStyleMapping[key];
    }
    const presetStyles = {
      judge: {
        hair_color: "#2e2e2e",
        hair_style: "bald",
        skin_color: "#c68642",
        pants_color: "#000000",
        shirt_color: "#222222",
      },
      // jury: {
      //   hair_color: "#4b4b4b",
      //   hair_style: "bald",
      //   skin_color: "#e1b7a1",
      //   pants_color: "#2e2e2e",
      //   shirt_color: "#8b4513",
      // },
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
    if (presetStyles[key]) {
      return presetStyles[key];
    }
    const fallbackStyle = generateDeterministicStyle(id);
    return fallbackStyle;
  };

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
          <primitive object={lookTargetRef.current} />
          <TargetUpdater
            currentIndex={currentIndex}
            lines={lines}
            characterRefs={characterRefs}
            lookTargetRef={lookTargetRef}
            speakerTargetRef={speakerTargetRef}
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
                  const { zoneOccupancy, characterZones } = getZoneOccupancy(
                    lines,
                    currentIndex === -1 ? lines.length - 1 : currentIndex
                  );
                  // Force 'prosecutor_table_right' if not already set.
                  if (!zoneOccupancy["prosecutor_table_right"]) {
                    zoneOccupancy["prosecutor_table_right"] = "prosecutor";
                  }
                  return Object.entries(zoneOccupancy).map(
                    ([zone, characterId]) => {
                      if (!characterId) return null;

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
                          }}
                        />
                      );
                    }
                  );
                })()}

                {/* Judge (always at bench) */}
                <Character
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
                  }}
                />

                {/* Clerk (always in clerk_box) */}
                <Character
                  key="clerk"
                  {...getLocationPose("clerk_box")}
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
                  }}
                />

                {/* Stenographer (always in stenographer_station) */}
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
                  }}
                />

                {/* Jury (6 members fixed position) */}
                {[...Array(6)].map((_, i) => (
                  <Character
                    key={`jury-${i}`}
                    {...getLocationPose("jury_box")}
                    position={[18, 0, -13 + i * 1.3]}
                    rotation={[0, Math.PI / 2, 0]}
                    onReady={(headRef) =>
                      registerCharacter(`jury-${i}`, headRef, "jury")
                    }
                    params={{
                      sitting: true,
                      role: "jury",
                      characterId: `jury-${i}`,
                      style: getStyleForCharacter(`jury-${i}`, "jury"),
                      eyeTargetRef: lookTargetRef,
                      speakerTargetRef,
                      activeSpeakerId,
                    }}
                  />
                ))}
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
                    rotation={[0, 0, 0]}
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
