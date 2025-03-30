// components/CourtroomScene.jsx

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import React, { Suspense, useEffect, useRef, useState } from "react";
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
  Character,
} from "@/components/CourtroomPrimatives";
import { loadGetInitialProps } from "next/dist/shared/lib/utils";

export default function CourtroomScene({ lines, sceneId }) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const characterRefs = useRef({});
  const audioMap = useRef({});
  // Shared lookTargetRef for non‑speakers
  const lookTargetRef = useRef(new THREE.Object3D());
  // A separate ref for the active speaker’s target (the person the speaker should look at)
  const speakerTargetRef = useRef(new THREE.Object3D());
  const [ready, setReady] = useState(false);
  const judgeRef = useRef();
  const witnessRef = useRef();
  const [headRefsReady, setHeadRefsReady] = useState(false);

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
      if (!headRefsReady) return;
      if (e.key !== "Enter") return;
      const nextIndex = currentIndex + 1;
      const line = lines[nextIndex];
      if (!line) return;
      const audio = audioMap.current[line.line_id];
      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }
      setCurrentIndex(nextIndex);
      setActiveSpeakerId(line.line_obj.role);
      console.log(`Active Speaker ID: ${line.line_obj.role}`);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, lines, headRefsReady]);

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
    console.log(
      `characterRefs.current for ${speakerId}:`,
      characterRefs.current
    );

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
      console.log(`Speaker ${speakerId} found. speakerHead:`, speakerHead);

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

      // Fallback: use judge's head.
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
      // Update shared lookTargetRef to speaker’s current head position.
      // console.log(
      //   `Updating targets... ${speakerId} ${targetId} ${JSON.stringify(
      //     speakerObj
      //   )}`
      // );
      if (speakerObj && speakerObj.headRef) {
        console.log(`"123`);
        const pos = new THREE.Vector3();
        speakerObj.headRef.getWorldPosition(pos);
        lookTargetRef.current.position.copy(pos);
      }
      // Update active speaker’s target.
      // If the targetId lookup fails, fall back to judge.
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
      console.log("👀 Defaulting lookTarget to prosecutor1");
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
      rotation: [0, Math.PI, 0],
    },
  };

  const getLocationPose = (key) =>
    zoneMap[key] || { position: [0, 0, 0], rotation: [0, 0, 0] };

  // --- Main Characters ---
  // IMPORTANT: The unique id must match the names used in your line data.
  const mainCharacters = [
    {
      id: "judge",
      zone: "judge_bench",
      // ref: judgeRef,
      role: "judge",
      sitting: true,
      colorTorso: "#222",
      emotion: "angry",
    },
    {
      id: "prosecutor1", // active speaker in some lines
      zone: "cross_examination_well",
      role: "prosecutor1",
      sitting: false,
      colorTorso: "#1e90ff",
    },
    {
      id: "defendant", // active speaker in some lines
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
      // ref: witnessRef,
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
  ];

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
          <CameraController />
          {/* Shared lookTarget for non‑speakers */}
          <primitive object={lookTargetRef.current} />
          {/* Continuously update target positions */}
          <TargetUpdater
            currentIndex={currentIndex}
            lines={lines}
            characterRefs={characterRefs}
            lookTargetRef={lookTargetRef}
            speakerTargetRef={speakerTargetRef}
          />
          {/* Lighting */}
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
          <LawyerTable position={[5, 0, -1.75]} />
          <LawyerTable position={[-5, 0, -1.75]} />

          {/* Seating */}
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
              {mainCharacters.map(({ id, zone, ref, role, ...rest }) => (
                <Character
                  key={id}
                  ref={ref}
                  {...getLocationPose(zone)}
                  onReady={(headRef) => registerCharacter(id, headRef, role)}
                  params={{
                    ...rest,
                    role,
                    // For non‑speakers
                    eyeTargetRef: lookTargetRef,
                    // For the active speaker
                    activeSpeakerId,
                    speakerTargetRef,
                    characterId: id,
                  }}
                />
              ))}
              {/* Register jury characters so they can be valid targets */}
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
                  }}
                />
              ))}
            </>
          )}

          {/* Bailiff */}
          <group scale={[1.3, 1.3, 1.3]}>
            <Character
              position={[8, 0, -12]}
              rotation={[0, 0, 0]}
              params={{
                sitting: false,
                torsoLean: -0.1,
                colorTorso: "#2f4f4f",
                colorArms: "#2f4f4f",
                colorLegs: "#00008b",
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
