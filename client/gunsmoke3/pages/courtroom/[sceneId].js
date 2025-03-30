import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Cylinder } from "@react-three/drei";
import { Suspense } from "react";
import React, { forwardRef, useImperativeHandle } from "react";
import CameraController from "@/components/CameraController";
import { useCallback } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import { useEffect, useRef, useState } from "react";

import { useFrame } from "@react-three/fiber";
import { getSupabase } from "@/utils/supabase";

export async function getServerSideProps(context) {
  const supabase = getSupabase();
  const { sceneId } = context.params;

  const { data: lines, error } = await supabase
    .from("gs3_lines")
    .select("line_id, line_obj")
    .eq("scene_id", sceneId)
    .order("line_id", { ascending: true });

  if (error) {
    console.error("❌ Error fetching lines:", error.message);
    return { props: { lines: [], sceneId } };
  }
  console.log(`✅ Fetched ${lines.length} lines for scene ${sceneId}`);

  return {
    props: {
      lines,
      sceneId,
    },
  };
}

// Reusable box mesh
function Box({ position, rotation, args, color = "#5b3b1d", ...props }) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
      {...props}
    >
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

// Floor & Ceiling
const Floor = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[40, 40]} />
    <meshStandardMaterial color="#6b4b2a" roughness={0.6} metalness={0.1} />
  </mesh>
);
const Ceiling = () => (
  <Box position={[0, 22, 0]} args={[40, 0.5, 40]} color="#bbb" />
);

// Walls
const Wall = ({ position, rotation }) => (
  <Box
    position={position}
    rotation={rotation}
    args={[40, 22, 0.5]}
    color="#4a2c14"
  />
);

// Chairs
const SingleChair = ({ position = [0, 0, 0], rotation = [0, 0, 0] }) => (
  <group position={position} rotation={rotation}>
    <Box position={[0, 0.5, 0]} args={[1.2, 0.2, 1.2]} />
    <Box position={[0, 1, 0.5]} args={[1.2, 1, 0.2]} />
    {[0.4, -0.4].flatMap((x) =>
      [0.4, -0.4].map((z) => (
        <Box
          key={`${x}-${z}`}
          position={[x, 0.25, z]}
          args={[0.1, 0.5, 0.1]}
          color="#4a2c14"
        />
      ))
    )}
  </group>
);

// Bench
const Bench = ({ position = [0, 0, 0] }) => {
  const width = 12;
  return (
    <group position={position}>
      <Box position={[0, 0.5, 0]} args={[width, 0.2, 1]} />
      <Box position={[0, 1, 0.4]} args={[width, 1, 0.2]} />
      {[2.8, -2.8].flatMap((x) =>
        [0.4, -0.4].map((z) => (
          <Box
            key={`${x}-${z}`}
            position={[x, 0.25, z / 2]}
            args={[0.2, 0.5, 0.2]}
            color="#4a2c14"
          />
        ))
      )}
    </group>
  );
};

// Jury Box
const JuryBox = ({ position, rotation }) => (
  <group position={position} rotation={rotation}>
    <Box position={[0, 0.1, 0]} args={[10, 0.2, 4]} color="#4a2c14" />
    <Box position={[0, 1.1, -2]} args={[10, 2, 0.2]} />
    <Box position={[-5, 1.1, 0]} args={[0.2, 2, 4]} />
    <Box position={[5, 1.1, 0]} args={[0.2, 2, 4]} />
    {[...Array(10)].map((_, i) => (
      <SingleChair key={i} position={[-4.5 + i, 0, 1]} />
    ))}
  </group>
);

// Divider with gate
const DividerWithGate = () => {
  const height = 1,
    width = 0.2,
    span = 40,
    gate = 4;
  const side = (span - gate) / 2;
  return (
    <group position={[0, height / 2, 3]}>
      <Box
        position={[-(gate / 2 + side / 2), 0, 0]}
        args={[side, height, width]}
      />
      <Box
        position={[gate / 2 + side / 2, 0, 0]}
        args={[side, height, width]}
      />
      <Box position={[0, 0.25, 0]} args={[gate, 0.5, width]} />
    </group>
  );
};

const StenographerStation = ({
  position = [-16, 0, -8],
  rotation = [0, Math.PI / 2, 0],
}) => (
  <group position={position} rotation={rotation}>
    {/* Desk top */}
    <Box position={[0, 1, 0]} args={[4, 0.2, 2]} color="#3c2f2f" />

    {/* Inner keyboard surface */}
    <Box position={[0, 1.01, 0]} args={[3.5, 0.05, 1.2]} color="#2e2e2e" />

    {/* Legs */}
    {[1.7, -1.7].flatMap((x) =>
      [0.9, -0.9].map((z) => (
        <Box
          key={`${x}-${z}`}
          position={[x, 0.5, z]}
          args={[0.2, 1, 0.2]}
          color="#4a2c14"
        />
      ))
    )}

    {/* Modesty panel */}
    <Box position={[0, 0.6, 0.95]} args={[3.8, 0.6, 0.1]} color="#4a2c14" />

    {/* Chair */}
    <SingleChair position={[0, 0, -1.5]} rotation={[0, Math.PI, 0]} />
  </group>
);

// Windowed Wall
const WindowedWall = ({ position, rotation }) => {
  const wallHeight = 22,
    wallWidth = 40,
    thick = 0.5;
  const winW = 3,
    winH = 16,
    winB = 2,
    gap = 4,
    count = 4;
  const winY = winB + winH / 2;
  const totalSpan = count * winW + (count - 1) * gap;
  const leftEdge = -totalSpan / 2;
  const sideWidth = (wallWidth - totalSpan) / 2;

  return (
    <group position={position} rotation={rotation}>
      <Box
        position={[-wallWidth / 2 + sideWidth / 2, wallHeight / 2, 0]}
        args={[sideWidth, wallHeight, thick]}
        color="#4a2c14"
      />
      <Box
        position={[wallWidth / 2 - sideWidth / 2, wallHeight / 2, 0]}
        args={[sideWidth, wallHeight, thick]}
        color="#4a2c14"
      />
      <Box
        position={[0, wallHeight - (wallHeight - (winY + winH / 2)) / 2, 0]}
        args={[totalSpan, wallHeight - (winY + winH / 2), thick]}
        color="#4a2c14"
      />
      <Box
        position={[0, winB / 2, 0]}
        args={[totalSpan, winB, thick]}
        color="#4a2c14"
      />
      {[...Array(count + 1)].map((_, i) => {
        const x = leftEdge + i * (winW + gap) - gap / 2;
        return (
          <Box
            key={i}
            position={[x, winY, 0]}
            args={[gap, winH, thick]}
            color="#4a2c14"
          />
        );
      })}
    </group>
  );
};

// Main Scene
export default function Home({ lines, sceneId }) {
  const standingRef = useRef();
  const sittingRef = useRef();
  const [ready, setReady] = useState(false);
  const judgeRef = useRef();
  const witnessRef = useRef();
  const [judgeHeadRef, setJudgeHeadRef] = useState(null);
  const [witnessHeadRef, setWitnessHeadRef] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(-1);
  const [audioMap, setAudioMap] = useState({});
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);

  const characterRefs = useRef({}); // All character refs

  const visemePlayer = useVisemePlayer(); // 👇 defined in Step 2 below

  // Register characters by their unique character_id
  const registerCharacter = (id, ref) => {
    if (ref && ref.current) {
      characterRefs.current[id] = ref.current;
    }
  };

  // Get headRef of whoever is speaking
  const getSpeakerHeadRef = () => {
    return activeSpeakerId
      ? characterRefs.current[activeSpeakerId]?.headRef
      : null;
  };
  useEffect(() => {
    const map = {};
    lines.forEach(({ line_id, line_obj }) => {
      const audio = new Audio(line_obj.audio_url.trim());
      audio.preload = "auto";
      map[line_id] = audio;
    });
    setAudioMap(map);
  }, [lines]);
  function useVisemePlayer() {
    const [viseme, setViseme] = useState("rest");
    const timeouts = useRef([]);

    const play = (visemeData, onDone) => {
      stop();
      visemeData?.frames?.forEach((frame) => {
        const timeout = setTimeout(() => {
          setViseme(frame.viseme);
        }, frame.time * 1000);
        timeouts.current.push(timeout);
      });
      const done = setTimeout(() => {
        setViseme("rest");
        onDone?.();
      }, visemeData.duration * 1000);
      timeouts.current.push(done);
    };

    const stop = () => {
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
      setViseme("rest");
    };

    return { viseme, play, stop };
  }
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== "Enter") return;

      const nextIndex = currentIndex + 1;
      if (nextIndex >= lines.length) return;

      const { line_id, line_obj } = lines[nextIndex];
      const audio = audioMap[line_id];

      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }

      setActiveSpeakerId(line_obj.character_id);

      visemePlayer.play(line_obj.viseme_data, () => {
        console.log("🎤 Finished line", line_id);
      });

      setCurrentIndex(nextIndex);
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, lines, audioMap]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const sharedPositions = {
    atWell: {
      position: [-10.5, -0.05, -8.5],
      rotation: [0, Math.PI, 0],
    },
    atWitnessStand: {
      position: [-10, 1.1, -15],
      rotation: [0, Math.PI, 0],
    },
  };

  const zoneMap = {
    // Judge
    judge_bench: {
      position: [0, 2, -18],
      rotation: [0, Math.PI, 0],
    },

    // Witness
    witness_stand: {
      position: [-10, 1.1, -15],
      rotation: [0, Math.PI, 0],
    },

    // Stenographer
    stenographer_station: {
      position: [-17.5, 0, -8],
      rotation: [0, -Math.PI / 2, 0],
    },

    // Bailiff
    bailiff_post: {
      position: [8, 0, -12],
      rotation: [0, 0, 0],
      scale: [1.3, 1.3, 1.3],
    },

    // Prosecutor / Plaintiff table
    prosecutor_table_left: {
      position: [-6.5, -0.05, -0.5],
      rotation: [0, 0, 0],
    },
    prosecutor_table_right: {
      position: [-3.5, -0.05, -0.5],
      rotation: [0, 0, 0],
    },

    // Defense table
    defense_table_left: {
      position: [3.5, -0.05, -0.5],
      rotation: [0, 0, 0],
    },
    defense_table_right: {
      position: [6.5, -0.05, -0.5],
      rotation: [0, 0, 0],
    },

    // At the well (standing)
    cross_examination_well: {
      position: [-10.5, -0.05, -8.5],
      rotation: [0, Math.PI, 0],
    },
  };
  const getLocationPose = (zoneKey) => {
    const zone = zoneMap[zoneKey];
    return {
      position: zone?.position ?? [0, 0, 0],
      rotation: zone?.rotation ?? [0, 0, 0],
      scale: zone?.scale ?? [1, 1, 1],
    };
  };

  const getPose = (role, overridePose = null) => {
    if (overridePose && sharedPositions[overridePose]) {
      return sharedPositions[overridePose];
    }
    return characterDefaults[role] ?? {};
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
          <CameraController />

          {/* Lighting */}
          {/* <Environment preset="city" background={false} /> */}
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
          <Floor />
          <Ceiling />
          {/* Structure */}
          {/* <Wall position={[0, 11, -20]} /> */}
          <Wall position={[0, 11, 20]} />
          <WindowedWall position={[-20, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
          {/* <Wall position={[20, 11, 0]} rotation={[0, -Math.PI / 2, 0]} /> */}
          <JudgeBackWall />
          <SidePaneledWall />
          <DividerWithGate />
          {/* Furniture */}
          <JudgeTable />
          {/* <Box position={[-10, 1, -16]} args={[2.5, 2, 2.5]} /> */}
          <WitnessStand />
          {/* <Box position={[5, 1, -5]} args={[6, 1, 2]} />
          <Box position={[-5, 1, -5]} args={[6, 1, 2]} /> */}
          <LawyerTable position={[5, 0, -1.75]} />
          <LawyerTable position={[-5, 0, -1.75]} />

          {/* Chairs */}
          {[-3.5, -6.5, 3.5, 6.5].map((x) => (
            <SingleChair key={x} position={[x, 0, -0.5]} />
          ))}

          {/* Benches */}
          {[5, 8, 11, 14].flatMap((z) =>
            [-8, 8].map((x) => <Bench key={`${x}-${z}`} position={[x, 0, z]} />)
          )}

          {/* Jury + Steno */}
          <StenographerStation />
          <JuryBox position={[18, 0, -10]} rotation={[0, Math.PI / 2, 0]} />
          {/* Standing Character */}
          {ready && (
            <>
              {/* Judge */}
              <Character
                ref={(ref) => registerCharacter("judge", ref)}
                {...getLocationPose("judge_bench")}
                onReady={(ref) => registerCharacter("judge", ref)}
                params={{
                  role: "judge",
                  sitting: true,
                  colorTorso: "#222",
                  eyeTargetRef: getSpeakerHeadRef(),
                  emotion: "angry",
                }}
              />

              {/* Plaintiff at the well */}
              <Character
                ref={(ref) => registerCharacter("jessicachan", ref)}
                {...getLocationPose("cross_examination_well")}
                onReady={(ref) => registerCharacter("jessicachan", ref)}
                params={{
                  role: "plaintiff1",
                  sitting: false,
                  colorTorso: "#1e90ff",
                  eyeTargetRef: getSpeakerHeadRef(),
                }}
              />

              {/* Plaintiff 2 at table (right seat) */}
              <Character
                ref={(ref) => registerCharacter("plaintiff2", ref)}
                {...getLocationPose("prosecutor_table_right")}
                onReady={(ref) => registerCharacter("plaintiff2", ref)}
                params={{
                  role: "plaintiff2",
                  sitting: true,
                  colorTorso: "#1e90ff",
                  eyeTargetRef: getSpeakerHeadRef(),
                }}
              />

              {/* Defense team */}
              <Character
                ref={(ref) => registerCharacter("defense1", ref)}
                {...getLocationPose("defense_table_left")}
                onReady={(ref) => registerCharacter("defense1", ref)}
                params={{
                  role: "defense1",
                  sitting: true,
                  colorTorso: "#32cd32",
                  eyeTargetRef: getSpeakerHeadRef(),
                }}
              />
              <Character
                ref={(ref) => registerCharacter("defense2", ref)}
                {...getLocationPose("defense_table_right")}
                onReady={(ref) => registerCharacter("defense2", ref)}
                params={{
                  role: "defense2",
                  sitting: true,
                  colorTorso: "#32cd32",
                  eyeTargetRef: getSpeakerHeadRef(),
                }}
              />

              {/* Witness */}
              <Character
                ref={(ref) => registerCharacter("elizabethholmes", ref)}
                {...getLocationPose("witness_stand")}
                onReady={(ref) => registerCharacter("elizabethholmes", ref)}
                params={{
                  role: "witness",
                  sitting: true,
                  colorTorso: "#ffd700",
                  eyeTargetRef: getSpeakerHeadRef(),
                }}
              />

              {/* Stenographer */}
              <Character
                ref={(ref) => registerCharacter("stenographer", ref)}
                {...getLocationPose("stenographer_station")}
                onReady={(ref) => registerCharacter("stenographer", ref)}
                params={{
                  role: "stenographer",
                  sitting: true,
                  colorTorso: "#9932cc",
                  eyeTargetRef: getSpeakerHeadRef(),
                }}
              />

              {/* Jury */}
              {[...Array(6)].map((_, i) => (
                <Character
                  key={`jury-${i}`}
                  ref={(ref) => registerCharacter(`jury-${i}`, ref)}
                  position={[18, 0, -13 + i * 1.3]}
                  rotation={[0, Math.PI / 2, 0]}
                  onReady={(ref) => registerCharacter(`jury-${i}`, ref)}
                  params={{
                    sitting: true,
                    colorTorso: "#8b4513",
                    eyeTargetRef: getSpeakerHeadRef(),
                  }}
                />
              ))}

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

                  const id = `audience-${x}-${z}`;
                  return (
                    <Character
                      key={id}
                      ref={(ref) => registerCharacter(id, ref)}
                      position={[x, 0, z]}
                      rotation={[0, 0, 0]}
                      onReady={(ref) => registerCharacter(id, ref)}
                      params={{
                        sitting: true,
                        colorTorso: [
                          "#b22222",
                          "#4682b4",
                          "#daa520",
                          "#008b8b",
                        ][i % 4],
                        eyeTargetRef: getSpeakerHeadRef(),
                      }}
                    />
                  );
                })
              )}
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
                eyeTargetRef: judgeRef.current?.headRef,
              }}
            />
          </group>

          {/* Ceiling Lights */}
          {[-10, 0, 10].flatMap((x) =>
            x === 0
              ? [] // skip the middle column
              : [-10, 0, 10].map((z) => (
                  <CeilingLight
                    key={`ceiling-light-${x}-${z}`}
                    position={[x, 22, z]}
                  />
                ))
          )}
          <Environment
            background
            files="/environment2.exr"
            ground={{ height: 5, radius: 60, scale: 100 }}
          />
          <OrbitControls maxPolarAngle={Math.PI / 2.2} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Lawyer Table with Legs
const LawyerTable = ({ position = [0, 0, 0] }) => (
  <group position={position}>
    {/* Tabletop */}
    <Box position={[0, 1, 0]} args={[6, 0.2, 2]} color="#3c2f2f" />
    {/* Legs */}
    {[2.8, -2.8].flatMap((x) =>
      [0.9, -0.9].map((z) => (
        <Box
          key={`${x}-${z}`}
          position={[x, 0.5, z]}
          args={[0.2, 1, 0.2]}
          color="#4a2c14"
        />
      ))
    )}
  </group>
);

const WitnessStand = ({
  position = [-10, 0, -15],
  rotation = [0, Math.PI, 0],
}) => (
  <group position={position} rotation={rotation}>
    {/* Platform */}
    <Box position={[0, 0.25, 0]} args={[4.5, 0.5, 4.5]} color="#3c2f2f" />

    {/* Front wall (faces audience) */}
    <Box position={[0, 1.5, -2.25]} args={[4, 2, 0.2]} color="#4a2c14" />

    {/* Side walls */}
    <Box position={[-2, 1.5, 0]} args={[0.2, 2, 4.5]} color="#4a2c14" />
    <Box position={[2, 1.5, 0]} args={[0.2, 2, 4.5]} color="#4a2c14" />

    {/* Back modesty panel (facing the judge) */}
    <Box position={[0, 1.5, 2.25]} args={[4, 2, 0.2]} color="#4a2c14" />

    {/* Top rails for detail */}
    <Box position={[0, 2.55, -2.25]} args={[4, 0.1, 0.1]} color="#3c2f2f" />
    <Box position={[-2, 2.55, 0]} args={[0.1, 0.1, 4.5]} color="#3c2f2f" />
    <Box position={[2, 2.55, 0]} args={[0.1, 0.1, 4.5]} color="#3c2f2f" />
    <Box position={[0, 2.55, 2.25]} args={[4, 0.1, 0.1]} color="#3c2f2f" />

    {/* Internal table */}
    <Box position={[0, 2, -1.2]} args={[3.5, 0.2, 1]} color="#3c2f2f" />
    <Box position={[0, 2.15, -1.2]} args={[3.5, 0.05, 1]} color="#2e2e2e" />

    {/* Chair, now facing forward relative to stand */}
    <SingleChair position={[0, 0, 1.2]} rotation={[0, 0, 0]} />
  </group>
);

const JudgeTable = ({ position = [0, 0, -16], width = 16 }) => {
  const depth = 3;
  const height = 3;
  const platformHeight = 0.5;
  const platformYOffset = platformHeight / 2;
  const deskYOffset = height / 2 + platformHeight;
  const tabletopThickness = 0.2;

  return (
    <group position={position}>
      {/* Platform */}
      <Box
        position={[0, platformYOffset, 0]}
        args={[width, platformHeight, depth + 1]}
        color="#4a2c14"
      />

      {/* Main Desk */}
      <Box
        position={[0, deskYOffset, 0]}
        args={[width, height, depth]}
        color="#5b3b1d"
      />

      {/* Tabletop */}
      <Box
        position={[0, deskYOffset + height / 2 + tabletopThickness / 2, 0]}
        args={[width + 0.2, tabletopThickness, depth + 0.2]}
        color="#3c2f2f"
      />

      {/* Modesty panel (front) */}
      <Box
        position={[0, deskYOffset, depth / 2 + 0.05]}
        args={[width, height, 0.1]}
        color="#4a2c14"
      />

      {/* Side panels */}
      <Box
        position={[-width / 2, deskYOffset, 0]}
        args={[0.1, height, depth]}
        color="#4a2c14"
      />
      <Box
        position={[width / 2, deskYOffset, 0]}
        args={[0.1, height, depth]}
        color="#4a2c14"
      />

      {/* Back panel */}
      <Box
        position={[0, deskYOffset + 0.5, -depth / 2]}
        args={[width, 1.5, 0.1]}
        color="#4a2c14"
      />
    </group>
  );
};

const JudgeBackWall = ({ position = [0, 0, -20], rotation = [0, 0, 0] }) => {
  const wallHeight = 22;
  const wallWidth = 40;
  const panelWidth = 6;
  const panelCount = Math.floor(wallWidth / panelWidth);
  const usedWidth = panelCount * panelWidth;

  // Load painting texture
  const paintingTexture = useLoader(TextureLoader, "/textures/painting.jpg"); // Adjust path to your image

  return (
    <group position={position} rotation={rotation}>
      {/* Main wall */}
      <Box
        position={[0, wallHeight / 2, 0]}
        args={[wallWidth, wallHeight, 0.5]}
        color="#3a2415"
      />

      {/* Large vertical panels */}
      {[...Array(panelCount)].map((_, i) => {
        const x = -usedWidth / 2 + panelWidth * i + panelWidth / 2;
        return (
          <Box
            key={`panel-${i}`}
            position={[x, wallHeight / 2, 0.26]}
            args={[panelWidth - 0.3, wallHeight - 3, 0.05]}
            color="#5b3b1d"
          />
        );
      })}

      {/* Crown & baseboard */}
      <Box
        position={[0, wallHeight - 0.25, 0.27]}
        args={[wallWidth, 0.5, 0.1]}
        color="#2e1a0e"
      />
      <Box
        position={[0, 0.25, 0.27]}
        args={[wallWidth, 0.5, 0.1]}
        color="#2e1a0e"
      />

      {/* Central painting */}
      <mesh position={[0, 8, 0.4]}>
        <planeGeometry args={[12, 8]} />
        <meshStandardMaterial map={paintingTexture} />
      </mesh>
    </group>
  );
};
const SidePaneledWall = ({
  position = [20, 0, 0],
  rotation = [0, -Math.PI / 2, 0],
}) => {
  const wallHeight = 22;
  const wallLength = 40;
  const sectionCount = 8;
  const sectionWidth = wallLength / sectionCount;

  return (
    <group position={position} rotation={rotation}>
      {/* Base wall */}
      <Box
        position={[0, wallHeight / 2, 0]}
        args={[wallLength, wallHeight, 0.5]}
        color="#4a2c14"
      />

      {/* Vertical panel sections */}
      {[...Array(sectionCount)].map((_, i) => {
        const x = -wallLength / 2 + sectionWidth * i + sectionWidth / 2;
        return (
          <Box
            key={i}
            position={[x, wallHeight / 2, 0.26]}
            args={[sectionWidth - 0.3, wallHeight - 2, 0.05]}
            color="#5b3b1d"
          />
        );
      })}

      {/* Trim top and bottom */}
      <Box
        position={[0, wallHeight - 0.25, 0.27]}
        args={[wallLength, 0.5, 0.1]}
        color="#3c2f2f"
      />
      <Box
        position={[0, 0.25, 0.27]}
        args={[wallLength, 0.5, 0.1]}
        color="#3c2f2f"
      />
    </group>
  );
};

const CeilingLight = ({ position = [0, 0, 0], chainLength = 12.5 }) => {
  const linkCount = 10;
  const linkSpacing = chainLength / linkCount;

  const fixtureHeight = 0.1;
  const bulbHeight = 0.5;

  const fixtureY = -chainLength - fixtureHeight / 2;
  const bulbY = fixtureY - bulbHeight / 2;

  return (
    <group position={position}>
      {/* Chain */}
      <group>
        {Array.from({ length: linkCount }).map((_, i) => (
          <Cylinder
            key={i}
            args={[0.05, 0.05, linkSpacing * 0.8, 8]}
            position={[0, -i * linkSpacing - linkSpacing / 2, 0]}
          >
            <meshStandardMaterial attach="material" color="#666" />
          </Cylinder>
        ))}
      </group>

      {/* Fixture base */}
      <Box
        position={[0, fixtureY, 0]}
        args={[0.8, fixtureHeight, 0.8]}
        color="#333"
      />

      {/* Bulb */}
      <Box
        position={[0, bulbY, 0]}
        args={[0.5, bulbHeight, 0.5]}
        color="orange"
      />

      {/* Point Light centered inside bulb */}
      <pointLight
        position={[0, bulbY, 0]}
        intensity={50}
        distance={12}
        decay={2}
        color="orange"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.005}
      />
    </group>
  );
};

const Character = forwardRef(function Character(
  { position = [0, 0, 0], rotation = [0, 0, 0], params = {}, onReady },
  ref
) {
  const headRef = useRef();
  const leftPupilRef = useRef();
  const rightPupilRef = useRef();
  const leftEyelidRef = useRef();
  const rightEyelidRef = useRef();

  useEffect(() => {
    if (headRef.current && typeof onReady === "function") {
      onReady(headRef);
    }
  }, [headRef.current]);

  useImperativeHandle(ref, () => ({
    headRef,
  }));
  useFrame(() => {
    if (!params.eyeTargetRef?.current || !headRef.current) return;

    const headWorldPos = new THREE.Vector3();
    const eyeTargetWorldPos = new THREE.Vector3();

    headRef.current.getWorldPosition(headWorldPos);
    params.eyeTargetRef.current.getWorldPosition(eyeTargetWorldPos);

    const headParent = headRef.current.parent;
    if (headParent) {
      const targetPosLocal = new THREE.Vector3();
      headParent.worldToLocal(targetPosLocal.copy(eyeTargetWorldPos));

      const dx = targetPosLocal.x;
      const dy = targetPosLocal.y;
      const dz = targetPosLocal.z;

      const yaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

      const maxYaw = THREE.MathUtils.degToRad(25);
      const maxPitch = THREE.MathUtils.degToRad(10);

      headRef.current.rotation.y = THREE.MathUtils.clamp(yaw, -maxYaw, maxYaw);
      headRef.current.rotation.x = THREE.MathUtils.clamp(
        -pitch,
        -maxPitch,
        maxPitch
      );
    }

    const dir = new THREE.Vector3()
      .subVectors(eyeTargetWorldPos, headWorldPos)
      .normalize();

    const localDir = headRef.current
      .worldToLocal(headWorldPos.clone().add(dir))
      .normalize();

    const maxOffset = 0.03;
    const pupilX = THREE.MathUtils.clamp(
      localDir.x * 0.1,
      -maxOffset,
      maxOffset
    );
    const pupilY = THREE.MathUtils.clamp(
      localDir.y * 0.1,
      -maxOffset,
      maxOffset
    );

    if (leftPupilRef.current)
      leftPupilRef.current.position.set(pupilX, pupilY, 0.0005);
    if (rightPupilRef.current)
      rightPupilRef.current.position.set(pupilX, pupilY, 0.0005);

    // === Eyelid Logic ===
    const emotion = params.emotion || "neutral";
    const baseLidY = 0.02;

    const lidOffsets = {
      neutral: 0.03,
      angry: -0.01,
      happy: 0.005,
      sad: 0.07,
      surprised: -0.01,
      tired: 0.08,
    };

    const lidRotations = {
      neutral: 0,
      angry: -Math.PI / 10,
      happy: 0,
      sad: 0,
      surprised: 0,
      tired: 0,
    };

    const targetLidY = baseLidY + (lidOffsets[emotion] ?? 0);
    const targetRotZ = lidRotations[emotion] ?? 0;
    const lerpFactor = 0.2;

    if (leftEyelidRef.current) {
      leftEyelidRef.current.position.y = THREE.MathUtils.lerp(
        leftEyelidRef.current.position.y,
        targetLidY,
        lerpFactor
      );
      leftEyelidRef.current.rotation.z = THREE.MathUtils.lerp(
        leftEyelidRef.current.rotation.z,
        targetRotZ,
        lerpFactor
      );
    }

    if (rightEyelidRef.current) {
      rightEyelidRef.current.position.y = THREE.MathUtils.lerp(
        rightEyelidRef.current.position.y,
        targetLidY,
        lerpFactor
      );
      rightEyelidRef.current.rotation.z = THREE.MathUtils.lerp(
        rightEyelidRef.current.rotation.z,
        -targetRotZ, // mirror rotation for symmetry
        lerpFactor
      );
    }
  });

  const {
    sitting = false,
    torsoLean = 0,
    colorTorso = "#ff4444",
    colorLegs = "#4444ff",
    colorArms = "#4444ff",
    colorHead = "#ffe0bd",
    role = "none",
  } = params;

  const legHeight = 0.75;
  const torsoHeight = 1.25;
  const headSize = 0.7;
  const armHeight = 1;

  const legRotation = sitting ? Math.PI / 2.2 : 0;
  const hipY = legHeight;
  const hipZ = sitting ? 0.4 : 0;
  const finalRotation = sitting
    ? [rotation[0], rotation[1] + Math.PI, rotation[2]]
    : rotation;

  const torsoCenterY = torsoHeight / 2;
  const headCenterY = torsoHeight + headSize / 2;
  const armCenterY = torsoHeight / 2;

  const eyeOffsetX = 0.15;
  const eyeOffsetY = 0.1;
  const eyeZ = headSize / 2 + 0.01;
  const eyeSize = 0.08;

  return (
    <group position={position} rotation={finalRotation}>
      {/* Legs */}
      <group position={[0, hipY, hipZ]}>
        {[-0.25, 0.25].map((x, idx) => (
          <group key={idx} position={[x, 0, 0]} rotation={[legRotation, 0, 0]}>
            <Box
              position={[0, -legHeight / 2, 0]}
              args={[0.3, legHeight, 0.3]}
              color={colorLegs}
            />
          </group>
        ))}
      </group>

      {/* Torso + Arms + Head */}
      <group position={[0, hipY, 0]} rotation={[torsoLean, 0, 0]}>
        {/* Torso */}
        <Box
          position={[0, torsoCenterY, 0]}
          args={[1, torsoHeight, 0.6]}
          color={colorTorso}
        />
        {/* Arms */}
        <Box
          position={[-0.65, armCenterY, 0]}
          args={[0.3, armHeight, 0.3]}
          color={colorArms}
        />
        <Box
          position={[0.65, armCenterY, 0]}
          args={[0.3, armHeight, 0.3]}
          color={colorArms}
        />
        {/* Head */}
        <group ref={headRef} position={[0, headCenterY, 0]}>
          <Box
            position={[0, 0, 0]}
            args={[headSize, headSize, headSize]}
            color={colorHead}
          />
          {/* Left Eye */}
          <group position={[-eyeOffsetX, eyeOffsetY, eyeZ]}>
            {/* Eye white */}
            <mesh>
              <circleGeometry args={[eyeSize, 16]} />
              <meshStandardMaterial color="white" />
            </mesh>

            {/* Pupil */}
            <mesh ref={leftPupilRef} position={[0, 0, 0.01]}>
              <circleGeometry args={[eyeSize / 3, 16]} />
              <meshStandardMaterial color="black" />
            </mesh>

            {/* Upper Eyelid */}
            <mesh ref={leftEyelidRef} position={[0, -0.015, 0.005]}>
              <circleGeometry args={[eyeSize * 1.2, 16, 0, Math.PI]} />
              <meshStandardMaterial color={colorHead} />
            </mesh>
          </group>

          {/* Right Eye */}
          <group position={[eyeOffsetX, eyeOffsetY, eyeZ]}>
            {/* Eye white */}
            <mesh>
              <circleGeometry args={[eyeSize, 16]} />
              <meshStandardMaterial color="white" />
            </mesh>

            {/* Pupil */}
            <mesh ref={rightPupilRef} position={[0, 0, 0.01]}>
              <circleGeometry args={[eyeSize / 3, 16]} />
              <meshStandardMaterial color="black" />
            </mesh>

            {/* Upper Eyelid */}
            <mesh ref={rightEyelidRef} position={[0, -0.015, 0.005]}>
              <circleGeometry args={[eyeSize * 1.2, 16, 0, Math.PI]} />
              <meshStandardMaterial color={colorHead} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
});
