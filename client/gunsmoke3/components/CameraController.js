// components/CameraController.jsx
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useMemo } from "react";
import * as THREE from "three";

export default function CameraController({ activePreset }) {
  const { camera } = useThree();
  const cameraTarget = useRef(new THREE.Vector3());

  // Updated camera presets with new bailiff_reaction and added clerk_view
  const cameraPresets = useMemo(
    () => ({
      wide_establishing: {
        position: new THREE.Vector3(0, 10, 19.6),
        lookAt: new THREE.Vector3(0, 5, 0),
      },
      crossExaminationFromWell: {
        position: new THREE.Vector3(-17, 4, -10.5),
        lookAt: new THREE.Vector3(0, 3, -10),
      },
      judge_closeup: {
        position: new THREE.Vector3(0, 8, -10),
        lookAt: new THREE.Vector3(0, 4, -18),
      },
      witness_closeup: {
        position: new THREE.Vector3(-9, 6, -10),
        lookAt: new THREE.Vector3(-10, 3, -15),
      },
      prosecutor_table: {
        position: new THREE.Vector3(-4, 3.5, 3),
        lookAt: new THREE.Vector3(-4.5, 2.5, -0.5),
      },
      defense_table: {
        position: new THREE.Vector3(5.5, 2.8, 3.5),
        lookAt: new THREE.Vector3(4.5, 2.5, -0.5),
      },
      bailiff_reaction: {
        // New bailiff location near the witness
        position: new THREE.Vector3(-8, 3, 0),
        lookAt: new THREE.Vector3(-11, 2.5, -15),
      },
      clerk_view: {
        // Clerk now occupies the former bailiff position
        position: new THREE.Vector3(9, 3, -6),
        lookAt: new THREE.Vector3(8, 2.5, -12),
      },
      wide_view_from_jury: {
        position: new THREE.Vector3(17, 3, -7),
        lookAt: new THREE.Vector3(-20, 3, -7),
      },
    }),
    []
  );

  const presetNames = Object.keys(cameraPresets);
  const current = useRef(presetNames.indexOf(activePreset) || 0);

  useEffect(() => {
    current.current = presetNames.indexOf(activePreset);
  }, [activePreset, presetNames]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key.toLowerCase() === "c") {
        current.current = (current.current + 1) % presetNames.length;
        console.log("📷 Manual camera angle:", presetNames[current.current]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [presetNames]);

  useFrame(() => {
    const target =
      cameraPresets[presetNames[current.current]] ||
      cameraPresets["wide_establishing"];
    camera.position.copy(target.position); // Instant jump to new position
    camera.lookAt(target.lookAt); // Instant jump to new lookAt
  });

  return null;
}
