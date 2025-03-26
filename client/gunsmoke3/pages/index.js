import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Suspense } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
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
    <group position={[0, height / 2, -0.5]}>
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
export default function Home() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows
        camera={{ position: [0, 25, 40], fov: 45 }}
        style={{ background: "#222" }}
        gl={{
          outputEncoding: THREE.sRGBEncoding,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <Environment preset="city" background={false} />
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
          <LawyerTable position={[5, 0, -5]} />
          <LawyerTable position={[-5, 0, -5]} />
          {/* Chairs */}
          {[-3.5, -6.5, 3.5, 6.5].map((x) => (
            <SingleChair key={x} position={[x, 0, -3.5]} />
          ))}
          {/* Benches */}
          {[2, 6, 10, 14].flatMap((z) =>
            [-8, 8].map((x) => <Bench key={`${x}-${z}`} position={[x, 0, z]} />)
          )}
          {/* Jury + Steno */}
          <StenographerStation />
          <JuryBox position={[18, 0, -10]} rotation={[0, Math.PI / 2, 0]} />
          {/* Standing */}
          <Character position={[0, 0, -10]} />

          {/* Sitting in chair */}
          <Character
            position={[-3.5, 0, -3.5]}
            params={{
              sitting: true,
              // torsoLean: 0.3, // leaning forward
              torsoLean: 0, // neutral
              // torsoLean: -0.3, // leaning back
            }}
          />

          {/* Ceiling Lights */}
          {[-10, 0, 10].flatMap((x) =>
            x === 0
              ? [] // skip the middle column
              : [-10, 0, 10].map((z) => (
                  <CeilingLight
                    key={`ceiling-light-${x}-${z}`}
                    position={[x, 8, z]}
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

const CeilingLight = ({ position = [0, 0, 0] }) => {
  return (
    <group position={position}>
      {/* Light fixture base (plate on the ceiling) */}
      <Box position={[0, 0, 0]} args={[0.8, 0.1, 0.8]} color="#333" />

      {/* Light bulb or lamp shape */}
      <Box position={[0, -0.25, 0]} args={[0.5, 0.5, 0.5]} color="yellow" />

      {/* Emitting light */}
      <pointLight
        position={[0, 0, 0]}
        intensity={22}
        distance={12}
        decay={2}
        color="yellow"
        castShadow
        visible
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.005}
      />
    </group>
  );
};

function Character({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  params = {},
}) {
  // Extract and default params
  const {
    sitting = false,
    torsoLean = 0,
    colorTorso = "#ff4444",
    colorLegs = "#4444ff",
    colorArms = "#4444ff",
    colorHead = "#ffe0bd",
  } = params;

  // Dimensions
  const legHeight = 0.75;
  const torsoHeight = 1.25;
  const headSize = 0.7;
  const armHeight = 1;

  const legWidth = 0.3;
  const torsoWidth = 1;
  const armWidth = 0.3;

  const legRotation = sitting ? Math.PI / 2.2 : 0;

  const hipY = legHeight;
  const hipZ = sitting ? 0.4 : 0;

  const finalRotation = sitting
    ? [rotation[0], rotation[1] + Math.PI, rotation[2]]
    : rotation;

  const torsoCenterY = torsoHeight / 2;
  const headCenterY = torsoHeight + headSize / 2;
  const armCenterY = torsoHeight / 2;

  return (
    <group position={position} rotation={finalRotation}>
      {/* Legs */}
      <group position={[0, hipY, hipZ]}>
        <group position={[-0.25, 0, 0]} rotation={[legRotation, 0, 0]}>
          <Box
            position={[0, -legHeight / 2, 0]}
            args={[legWidth, legHeight, legWidth]}
            color={colorLegs}
          />
        </group>
        <group position={[0.25, 0, 0]} rotation={[legRotation, 0, 0]}>
          <Box
            position={[0, -legHeight / 2, 0]}
            args={[legWidth, legHeight, legWidth]}
            color={colorLegs}
          />
        </group>
      </group>

      {/* Torso, Arms, Head */}
      <group position={[0, hipY, 0]} rotation={[torsoLean, 0, 0]}>
        {/* Torso */}
        <Box
          position={[0, torsoCenterY, 0]}
          args={[torsoWidth, torsoHeight, 0.6]}
          color={colorTorso}
        />

        {/* Arms */}
        <Box
          position={[-(torsoWidth / 2 + armWidth / 2), armCenterY, 0]}
          args={[armWidth, armHeight, armWidth]}
          color={colorArms}
        />
        <Box
          position={[torsoWidth / 2 + armWidth / 2, armCenterY, 0]}
          args={[armWidth, armHeight, armWidth]}
          color={colorArms}
        />

        {/* Head */}
        <Box
          position={[0, headCenterY, 0]}
          args={[headSize, headSize, headSize]}
          color={colorHead}
        />
      </group>
    </group>
  );
}
