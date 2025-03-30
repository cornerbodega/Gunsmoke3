// components/CourtroomPrimitives.jsx

import React, {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { Cylinder } from "@react-three/drei";
import * as THREE from "three";
import { TextureLoader } from "three";

// Reusable box mesh
export function Box({ position, rotation, args, color = "#5b3b1d", ...props }) {
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

export const Floor = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[40, 40]} />
    <meshStandardMaterial color="#6b4b2a" roughness={0.6} metalness={0.1} />
  </mesh>
);

export const Ceiling = () => (
  <Box position={[0, 22, 0]} args={[40, 0.5, 40]} color="#bbb" />
);

export const Wall = ({ position, rotation }) => (
  <Box
    position={position}
    rotation={rotation}
    args={[40, 22, 0.5]}
    color="#4a2c14"
  />
);

export const WindowedWall = ({ position, rotation }) => {
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

export const JudgeBackWall = ({
  position = [0, 0, -20],
  rotation = [0, 0, 0],
}) => {
  const wallHeight = 22;
  const wallWidth = 40;
  const panelWidth = 6;
  const panelCount = Math.floor(wallWidth / panelWidth);
  const usedWidth = panelCount * panelWidth;
  const paintingTexture = useLoader(TextureLoader, "/textures/painting.jpg");

  return (
    <group position={position} rotation={rotation}>
      <Box
        position={[0, wallHeight / 2, 0]}
        args={[wallWidth, wallHeight, 0.5]}
        color="#3a2415"
      />
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
      <mesh position={[0, 8, 0.4]}>
        <planeGeometry args={[12, 8]} />
        <meshStandardMaterial map={paintingTexture} />
      </mesh>
    </group>
  );
};

export const SidePaneledWall = ({
  position = [20, 0, 0],
  rotation = [0, -Math.PI / 2, 0],
}) => {
  const wallHeight = 22,
    wallLength = 40,
    sectionCount = 8;
  const sectionWidth = wallLength / sectionCount;
  return (
    <group position={position} rotation={rotation}>
      <Box
        position={[0, wallHeight / 2, 0]}
        args={[wallLength, wallHeight, 0.5]}
        color="#4a2c14"
      />
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

export const DividerWithGate = () => {
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

export const SingleChair = ({ position = [0, 0, 0], rotation = [0, 0, 0] }) => (
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

export const Bench = ({ position = [0, 0, 0] }) => {
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

export const JuryBox = ({ position, rotation }) => (
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

export const StenographerStation = ({
  position = [-16, 0, -8],
  rotation = [0, Math.PI / 2, 0],
}) => (
  <group position={position} rotation={rotation}>
    <Box position={[0, 1, 0]} args={[4, 0.2, 2]} color="#3c2f2f" />
    <Box position={[0, 1.01, 0]} args={[3.5, 0.05, 1.2]} color="#2e2e2e" />
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
    <Box position={[0, 0.6, 0.95]} args={[3.8, 0.6, 0.1]} color="#4a2c14" />
    <SingleChair position={[0, 0, -1.5]} rotation={[0, Math.PI, 0]} />
  </group>
);

// The rest (JudgeTable, WitnessStand, LawyerTable, CeilingLight, Character) continue...
// ...continuing from previous exports

export const LawyerTable = ({ position = [0, 0, 0] }) => (
  <group position={position}>
    <Box position={[0, 1, 0]} args={[6, 0.2, 2]} color="#3c2f2f" />
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

export const WitnessStand = ({
  position = [-10, 0, -15],
  rotation = [0, Math.PI, 0],
}) => (
  <group position={position} rotation={rotation}>
    <Box position={[0, 0.25, 0]} args={[4.5, 0.5, 4.5]} color="#3c2f2f" />
    <Box position={[0, 1.5, -2.25]} args={[4, 2, 0.2]} color="#4a2c14" />
    <Box position={[-2, 1.5, 0]} args={[0.2, 2, 4.5]} color="#4a2c14" />
    <Box position={[2, 1.5, 0]} args={[0.2, 2, 4.5]} color="#4a2c14" />
    <Box position={[0, 1.5, 2.25]} args={[4, 2, 0.2]} color="#4a2c14" />
    <Box position={[0, 2.55, -2.25]} args={[4, 0.1, 0.1]} color="#3c2f2f" />
    <Box position={[-2, 2.55, 0]} args={[0.1, 0.1, 4.5]} color="#3c2f2f" />
    <Box position={[2, 2.55, 0]} args={[0.1, 0.1, 4.5]} color="#3c2f2f" />
    <Box position={[0, 2.55, 2.25]} args={[4, 0.1, 0.1]} color="#3c2f2f" />
    <Box position={[0, 2, -1.2]} args={[3.5, 0.2, 1]} color="#3c2f2f" />
    <Box position={[0, 2.15, -1.2]} args={[3.5, 0.05, 1]} color="#2e2e2e" />
    <SingleChair position={[0, 0, 1.2]} rotation={[0, 0, 0]} />
  </group>
);

export const JudgeTable = ({ position = [0, 0, -16], width = 16 }) => {
  const depth = 3;
  const height = 3;
  const platformHeight = 0.5;
  const platformYOffset = platformHeight / 2;
  const deskYOffset = height / 2 + platformHeight;
  const tabletopThickness = 0.2;

  return (
    <group position={position}>
      <Box
        position={[0, platformYOffset, 0]}
        args={[width, platformHeight, depth + 1]}
        color="#4a2c14"
      />
      <Box
        position={[0, deskYOffset, 0]}
        args={[width, height, depth]}
        color="#5b3b1d"
      />
      <Box
        position={[0, deskYOffset + height / 2 + tabletopThickness / 2, 0]}
        args={[width + 0.2, tabletopThickness, depth + 0.2]}
        color="#3c2f2f"
      />
      <Box
        position={[0, deskYOffset, depth / 2 + 0.05]}
        args={[width, height, 0.1]}
        color="#4a2c14"
      />
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
      <Box
        position={[0, deskYOffset + 0.5, -depth / 2]}
        args={[width, 1.5, 0.1]}
        color="#4a2c14"
      />
    </group>
  );
};

export const CeilingLight = ({ position = [0, 0, 0], chainLength = 12.5 }) => {
  const linkCount = 10;
  const linkSpacing = chainLength / linkCount;
  const fixtureHeight = 0.1;
  const bulbHeight = 0.5;
  const fixtureY = -chainLength - fixtureHeight / 2;
  const bulbY = fixtureY - bulbHeight / 2;

  return (
    <group position={position}>
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
      <Box
        position={[0, fixtureY, 0]}
        args={[0.8, fixtureHeight, 0.8]}
        color="#333"
      />
      <Box
        position={[0, bulbY, 0]}
        args={[0.5, bulbHeight, 0.5]}
        color="orange"
      />
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

// =========================
// CHARACTER COMPONENT
// =========================
export const Character = forwardRef(function Character(
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

    leftPupilRef.current?.position.set(pupilX, pupilY, 0.0005);
    rightPupilRef.current?.position.set(pupilX, pupilY, 0.0005);

    const emotion = params.emotion || "neutral";
    const baseLidY = 0.02;

    const lidOffsets = {
      neutral: 0.03,
      angry: 0.015,
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
        -targetRotZ,
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

      <group position={[0, hipY, 0]} rotation={[torsoLean, 0, 0]}>
        <Box
          position={[0, torsoCenterY, 0]}
          args={[1, torsoHeight, 0.6]}
          color={colorTorso}
        />
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

        <group ref={headRef} position={[0, headCenterY, 0]}>
          <Box
            position={[0, 0, 0]}
            args={[headSize, headSize, headSize]}
            color={colorHead}
          />

          {/* Eyes */}
          {[
            [-eyeOffsetX, "left"],
            [eyeOffsetX, "right"],
          ].map(([x, side]) => (
            <group key={side} position={[x, eyeOffsetY, eyeZ]}>
              <mesh>
                <circleGeometry args={[eyeSize, 16]} />
                <meshStandardMaterial color="white" />
              </mesh>
              <mesh
                ref={side === "left" ? leftPupilRef : rightPupilRef}
                position={[0, 0, 0.01]}
              >
                <circleGeometry args={[eyeSize / 3, 16]} />
                <meshStandardMaterial color="black" />
              </mesh>
              <mesh
                ref={side === "left" ? leftEyelidRef : rightEyelidRef}
                position={[0, -0.015, 0.005]}
              >
                <circleGeometry args={[eyeSize * 1.2, 16, 0, Math.PI]} />
                <meshStandardMaterial color={colorHead} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
});
