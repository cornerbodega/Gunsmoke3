// components/CourtroomScene.jsx
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

export default function CourtroomScene({ lines, sceneId }) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  // New state to track the audio's current time for viseme timing.
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const characterRefs = useRef({});
  const audioMap = useRef({});
  // Shared lookTargetRef for non‑speakers
  const lookTargetRef = useRef(new THREE.Object3D());
  // A separate ref for the active speaker’s target (the person the speaker should look at)
  const speakerTargetRef = useRef(new THREE.Object3D());
  const [ready, setReady] = useState(false);
  const [headRefsReady, setHeadRefsReady] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  // --- Audio Setup ---
  useEffect(() => {
    const map = {};
    lines.forEach(({ line_id, line_obj }) => {
      const audio = new Audio(line_obj.audio_url.trim());
      map[line_id] = audio;
    });
    audioMap.current = map;
  }, [lines]);

  // --- Key Handler for Next Line ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!headRefsReady || e.key !== "Enter") return;
      if (currentIndex === -1) {
        setAutoPlay(true); // trigger auto-play
        setCurrentIndex(0); // start from first line
        const firstLine = lines[0];
        const audio = audioMap.current[firstLine.line_id];
        if (audio) {
          audio.currentTime = 0;
          audio.play();
          setActiveSpeakerId(firstLine.line_obj.role);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, lines, headRefsReady]);

  // --- Update currentAudioTime using the active audio element ---
  useEffect(() => {
    if (currentIndex === -1) return;
    const currentLine = lines[currentIndex];
    const audio = audioMap.current[currentLine.line_id];
    if (!audio) return;

    const updateTime = () => {
      setCurrentAudioTime(audio.currentTime);
    };
    audio.addEventListener("timeupdate", updateTime);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
    };
  }, [currentIndex, lines]);

  // --- One-Time Update on New Line ---
  useEffect(() => {
    if (currentIndex === -1) return;
    const currentLine = lines[currentIndex]?.line_obj;
    const speakerId = currentLine?.role;
    const targetId = currentLine?.eye_target; // get the ref of this name

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
    // Prevent self-looking (if speaker and target are the same)
    if (speakerId === targetId) {
      console.warn(
        `Speaker ${speakerId} has a target equal to themselves. Using fallback.`
      );
      targetHead = currentLine.eye_target
        ? characterRefs.current[currentLine.eye_target]?.headRef
        : null;
    }
    // Update shared lookTargetRef (for non‑speakers) to the speaker’s head position.
    if (speakerHead) {
      const pos = new THREE.Vector3();
      speakerHead.getWorldPosition(pos);
      lookTargetRef.current.position.copy(pos);
    }
    // For the active speaker, update speakerTargetRef to the target head’s world position.
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
  useEffect(() => {
    if (!autoPlay || currentIndex === -1) return;

    const currentLine = lines[currentIndex];
    const audio = audioMap.current[currentLine.line_id];
    const pauseBefore = currentLine.line_obj.pause_before ?? 0.5;

    if (!audio) return;

    const handleAudioEnd = () => {
      if (currentIndex < lines.length - 1) {
        setTimeout(() => {
          const nextIndex = currentIndex + 1;
          const nextLine = lines[nextIndex];
          const nextAudio = audioMap.current[nextLine.line_id];
          if (nextAudio) {
            nextAudio.currentTime = 0;
            nextAudio.play();
          }
          setCurrentIndex(nextIndex);
          setActiveSpeakerId(nextLine.line_obj.role);
        }, pauseBefore * 1000);
      }
    };

    audio.addEventListener("ended", handleAudioEnd);

    return () => {
      audio.removeEventListener("ended", handleAudioEnd);
    };
  }, [autoPlay, currentIndex, lines]);

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
      // console.log("👀 Defaulting lookTarget to prosecutor1");
    }
  }, [currentIndex, headRefsReady]);

  const zoneMap = {
    judge_bench: { position: [0, 2, -18], rotation: [0, Math.PI, 0] },
    witness_stand: { position: [-10, 1.1, -15], rotation: [0, Math.PI, 0] },
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
    defense_table_right: { position: [6.5, -0.05, -0.5], rotation: [0, 0, 0] },
    defense_table_left: { position: [3.5, -0.05, -0.5], rotation: [0, 0, 0] },
    cross_examination_well: {
      position: [-10.5, -0.05, -8.5],
      rotation: [0, Math.PI / 1.2, 0],
    },
    clerk_box: { position: [10, 1, -15], rotation: [0, Math.PI, 0] },
  };

  const getLocationPose = (key) =>
    zoneMap[key] || { position: [0, 0, 0], rotation: [0, 0, 0] };

  // --- Main Characters ---
  // In CourtroomScene.jsx, update the mainCharacters array to add the clerk:
  const mainCharacters = [
    {
      id: "judge",
      zone: "judge_bench",
      role: "judge",
      sitting: true,
      colorTorso: "#222",
      emotion: "angry",
    },
    {
      id: "prosecutor1",
      zone: "cross_examination_well",
      role: "prosecutor1",
      sitting: false,
      colorTorso: "#1e90ff",
    },
    {
      id: "defendant",
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
      zone: "witness_stand",
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
      id: "clerk", // New clerk character added here
      zone: "clerk_box", // Uses the new clerk_box zone
      role: "clerk",
      sitting: true,
      colorTorso: "#a0522d", // Sienna color (adjust as desired)
    },
  ];

  // Get the current active line, if any.
  const currentLine = currentIndex !== -1 ? lines[currentIndex].line_obj : null;
  // Build a mapping of character id to their specified style
  const characterStyleMapping = useMemo(() => {
    const mapping = {};
    lines.forEach(({ line_obj }) => {
      const { role, style } = line_obj;
      if (role && style && !mapping[role]) {
        mapping[role] = style;
      }
    });
    console.log("✅ Final style mapping from DB:", mapping);
    return mapping;
  }, [lines]);

  // Helper: Given a character id, return the style from the lines if available,
  // or generate a unique default that is consistent across renders.
  const getStyleForCharacter = (id, role) => {
    const key = role || id;

    // Use DB style if available
    if (characterStyleMapping[key]) {
      console.log(`🎨 Using style from DB for key "${key}"`);
      return characterStyleMapping[key];
    }

    // Sensible defaults for specific roles
    const presetStyles = {
      judge: {
        hair_color: "#2e2e2e",
        hair_style: "short",
        skin_color: "#c68642",
        pants_color: "#000000",
        shirt_color: "#222222", // black robe
      },
      jury: {
        hair_color: "#4b4b4b",
        hair_style: "short",
        skin_color: "#e1b7a1",
        pants_color: "#2e2e2e",
        shirt_color: "#8b4513", // brown tones
      },
      bailiff: {
        hair_color: "#000000",
        hair_style: "buzz",
        skin_color: "#8d5524",
        pants_color: "#00008b", // navy blue
        shirt_color: "#2f4f4f", // dark slate gray
      },
      clerk: {
        hair_color: "#a0522d",
        hair_style: "bun",
        skin_color: "#f5cba7",
        pants_color: "#2e2e2e",
        shirt_color: "#f0e68c",
      },
    };

    if (presetStyles[key]) {
      console.log(`🧑‍⚖️ Using preset style for "${key}"`);
      return presetStyles[key];
    }

    // Fallback if nothing is set
    const fallbackStyle = generateDeterministicStyle(id);
    console.log(`✨ Generated fallback style for "${id}":`, fallbackStyle);
    return fallbackStyle;
  };

  const generateDeterministicStyle = (id) => {
    const palette = {
      hairStyles: ["short", "long", "braids", "bun", "buzz"],
      skinTones: ["#f5cba7", "#e1b7a1", "#c68642", "#8d5524", "#ffdbac"],
      pantsColors: ["#000000", "#2e2e2e", "#4b4b4b", "#5a3e36"],
      shirtColors: ["#ffffff", "#d3d3d3", "#4682b4", "#32cd32", "#ff69b4"],
      hairColors: ["#2e2e2e", "#4b4b4b", "#8b4513", "#a0522d", "#000000"], // realistic shades
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

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows
        camera={{ position: [0, 25, 19], fov: 45 }}
        style={{ background: "#222" }}
        gl={{
          outputEncoding: THREE.sRGBEncoding,
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
          {ready && (
            <>
              {mainCharacters.map(({ id, zone, ref, role, ...rest }) => {
                const isActive = currentLine && currentLine.role === role;
                return (
                  <Character
                    key={id}
                    ref={ref}
                    {...getLocationPose(zone)}
                    onReady={(headRef) => registerCharacter(id, headRef, role)}
                    params={{
                      ...rest,
                      role,
                      style: getStyleForCharacter(id, role),
                      eyeTargetRef: lookTargetRef,
                      activeSpeakerId,
                      speakerTargetRef,
                      characterId: id,
                      // Pass viseme data and currentAudioTime to the active speaker.
                      viseme_data: isActive ? currentLine.viseme_data : null,
                      audioTime: isActive ? currentAudioTime : 0,
                    }}
                  />
                );
              })}
              {[...Array(6)].map((_, i) => (
                <Character
                  key={`jury-${i}`}
                  onReady={(headRef) =>
                    registerCharacter(`jury-${i}`, headRef, "jury")
                  }
                  position={[18, 0, -13 + i * 1.3]}
                  rotation={[0, Math.PI / 2, 0]}
                  params={{
                    sitting: true,
                    colorTorso: "#8b4513",
                    eyeTargetRef: lookTargetRef,
                    activeSpeakerId,
                    speakerTargetRef,
                    characterId: `jury-${i}`,
                    style: getStyleForCharacter(`jury-${i}`, "jury"),
                  }}
                />
              ))}
            </>
          )}

          {/* Bailiff */}
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
