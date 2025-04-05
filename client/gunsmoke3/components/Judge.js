import React, {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Character } from "@/components/CourtroomPrimatives";

const Judge = forwardRef(function Judge(
  { onReady, params, onIntroComplete, lookTargetRef, ...poseProps },
  ref
) {
  const localJudgeRef = useRef();
  const clock = useRef(new THREE.Clock());
  const [introPlaying, setIntroPlaying] = useState(true);
  const [finalRotation, setFinalRotation] = useState([0, -Math.PI, 0]);

  const waypoints = [
    new THREE.Vector3(0, 0, 10), // Entrance
    new THREE.Vector3(1, 0, -8), // Up the aisle
    new THREE.Vector3(10, 0, -10), // In front of the witness stand
    new THREE.Vector3(15, 0, -15), // Left of the witness stand
    new THREE.Vector3(8, 0, -20), // Smoothing point
    new THREE.Vector3(0, 0, -22), // Behind the witness stand
    new THREE.Vector3(0, 2, -18), // Final judge’s bench position
  ];

  const curve = new THREE.CatmullRomCurve3(waypoints);
  const lookAtOffset = new THREE.Vector3(0, 0.5, 0); // for camera

  const judgeGazeTarget = useRef(new THREE.Object3D());

  useFrame(({ camera }) => {
    const elapsed = clock.current.getElapsedTime();
    const walkElapsed = Math.max(0, elapsed - walkDelay);
    const t = Math.min(walkElapsed / duration, 1);
    const easedT = t * t * (3 - 2 * t);

    const position = curve.getPoint(easedT);
    const tangent = curve.getTangent(easedT);
    const angle = Math.atan2(tangent.x, tangent.z);
    setFinalRotation([0, angle, 0]);

    if (judgeRef.current) {
      judgeRef.current.position.copy(position);
    }

    // Update the global gaze for others without affecting the judge’s own gaze.
    if (
      t < 1 &&
      resolvedCharacterRefs?.judge?.headRef &&
      lookTargetRef?.current
    ) {
      const headPos = new THREE.Vector3();
      resolvedCharacterRefs.judge.headRef.getWorldPosition(headPos);
      headPos.y += 0.25; // adjust the offset if needed
      judgeGazeTarget.current.position.copy(headPos);
      // Now update the global look target using the decoupled gaze object.
      lookTargetRef.current.position.copy(judgeGazeTarget.current.position);
    }

    // Camera follow (for dramatic effect)
    const lookAtOffset = new THREE.Vector3(0, 1.5, 0);
    camera.lookAt(position.clone().add(lookAtOffset));
    const camPos = camStart.clone().lerp(camEnd, easedT);
    camera.position.copy(camPos);
    camera.lookAt(position.clone().add(lookAtOffset));

    if (t >= 1 && onComplete) {
      onComplete();
      onComplete = null;
    }
  });

  // Allow parent to access judge ref
  useImperativeHandle(ref, () => localJudgeRef.current);

  return (
    <group ref={localJudgeRef} {...poseProps}>
      <Character
        ref={onReady}
        params={{
          ...params,
          sitting: params.sitting,
          rotation: introPlaying ? finalRotation : params.rotation || [0, 0, 0],
        }}
      />
    </group>
  );
});

export default Judge;
