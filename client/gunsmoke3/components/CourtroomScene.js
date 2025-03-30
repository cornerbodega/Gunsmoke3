// components/CourtroomScene.jsx

import { Canvas } from "@react-three/fiber";
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

export default function CourtroomScene({ lines, sceneId }) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const characterRefs = useRef({});
  const audioMap = useRef({});
  const lookTargetRef = useRef(new THREE.Object3D());
  const [ready, setReady] = useState(false);
  const judgeRef = useRef();
  const witnessRef = useRef();
  const [headRefsReady, setHeadRefsReady] = useState(false);

  // Set up character audio
  useEffect(() => {
    const map = {};
    lines.forEach(({ line_id, line_obj }) => {
      const audio = new Audio(line_obj.audio_url.trim());
      map[line_id] = audio;
    });
    audioMap.current = map;
  }, [lines]);

  // Enter to play next line
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!headRefsReady) return;

      const currentLine = lines[currentIndex]?.line_obj;

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
      setActiveSpeakerId(line.line_obj.character_id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, lines, headRefsReady]);

  // Eye look-at logic
  useEffect(() => {
    const currentLine = lines[currentIndex]?.line_obj;
    const targetId = currentLine?.eye_target;
    const speakerId = currentLine?.character_id;

    let targetHead = null;

    if (targetId && characterRefs.current[targetId]?.headRef) {
      targetHead = characterRefs.current[targetId].headRef;
      console.log(`👀 Looking at eye_target: ${targetId}`);
    } else if (speakerId && characterRefs.current[speakerId]?.headRef) {
      targetHead = characterRefs.current[speakerId].headRef;
      console.log(`👀 Looking at speaker: ${speakerId}`);
    } else if (characterRefs.current["judge"]?.headRef) {
      targetHead = characterRefs.current["judge"].headRef;
      console.log(`👀 Defaulting to judge`);
    }

    const pos = new THREE.Vector3();
    if (targetHead) {
      targetHead.getWorldPosition(pos);
      pos.y += 0.25;
      lookTargetRef.current.position.copy(pos);
    } else {
      console.log(`👀 Could not find a valid headRef, hiding target`);
      lookTargetRef.current.position.set(0, -1000, 0); // Hide below ground
    }
  }, [currentIndex, lines]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const registerCharacter = (id, headRef) => {
    if (headRef?.current) {
      characterRefs.current[id] = { headRef: headRef.current };
      if (id === "judge") {
        setHeadRefsReady(true);
      }
    }
  };

  useEffect(() => {
    if (currentIndex !== -1 || !headRefsReady) return;

    const targetHead = characterRefs.current["plaintiff1"]?.headRef;

    if (targetHead) {
      const pos = new THREE.Vector3();
      targetHead.getWorldPosition(pos);
      pos.y += 0.25;
      lookTargetRef.current.position.copy(pos);
      console.log("👀 Judge defaulting to plaintiff1");
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

  const mainCharacters = [
    {
      id: "judge",
      zone: "judge_bench",
      ref: judgeRef,
      role: "judge",
      sitting: true,
      colorTorso: "#222",
      emotion: "angry",
    },
    {
      id: "plaintiff1",
      zone: "cross_examination_well",
      role: "plaintiff1",
      sitting: false,
      colorTorso: "#1e90ff",
    },
    {
      id: "plaintiff2",
      zone: "prosecutor_table_right",
      role: "plaintiff2",
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
      ref: witnessRef,
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
          <primitive object={lookTargetRef.current} />

          <hemisphereLight intensity={0.1} />

          {/* Lighting */}
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
              {mainCharacters.map(({ id, zone, ref, ...rest }) => (
                <Character
                  key={id}
                  ref={ref}
                  {...getLocationPose(zone)}
                  onReady={(headRef) => registerCharacter(id, headRef)}
                  params={{
                    ...rest,
                    eyeTargetRef: lookTargetRef,
                  }}
                />
              ))}
              {[...Array(6)].map((_, i) => (
                <Character
                  key={`jury-${i}`}
                  position={[18, 0, -13 + i * 1.3]}
                  rotation={[0, Math.PI / 2, 0]}
                  params={{
                    sitting: true,
                    colorTorso: "#8b4513",
                    eyeTargetRef: lookTargetRef,
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
