// components/Nameplate.jsx
import { useThree, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useRef } from "react";

export default function Nameplate({
  position = [0, 0, 0],
  role,
  id,
  isSpeaking,
}) {
  const { camera } = useThree();
  const groupRef = useRef();

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.lookAt(camera.position); // Billboard it
    }
  });

  // 💡 Don't render anything if this is an audience member
  if (role === "audience") return null;
  // remove numbers from role
  const label =
    role === "jury"
      ? role
      : role === id
      ? role
      : `${isSpeaking ? "🔊 " : ""}${role || ""} (${id})`
          .replace(/\d+/g, "")
          .trim();

  return (
    <group ref={groupRef} position={position}>
      <Text
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="black"
      >
        {label}
      </Text>
    </group>
  );
}
