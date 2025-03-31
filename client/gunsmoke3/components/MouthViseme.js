import { useMemo, useState, useEffect, useRef } from "react";
import { useLoader, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export default function MouthViseme({
  visemeData,
  audioTime = 0,
  size = [0.4, 0.2],
}) {
  const mouthRef = useRef();
  const { camera } = useThree();

  // Load and map textures
  const texturePaths = {
    E: "/mouth_visemes/E1.png",
    F: "/mouth_visemes/F1.png",
    M: "/mouth_visemes/M1.png",
    O: "/mouth_visemes/O1.png",
    S: "/mouth_visemes/S1.png",
  };
  const textureKeys = Object.keys(texturePaths);
  const textureUrls = Object.values(texturePaths);
  const loadedTextures = useLoader(THREE.TextureLoader, textureUrls);
  useMemo(() => {
    loadedTextures.forEach((texture) => {
      texture.magFilter = THREE.NearestFilter; // keeps pixel edges sharp
      texture.minFilter = THREE.NearestFilter; // avoids blurry mipmaps
      texture.generateMipmaps = false; // avoids outline blur at distance
      texture.anisotropy = 1; // consistency across angles
      texture.needsUpdate = true;
    });
  }, [loadedTextures]);
  const textureMap = useMemo(() => {
    const map = {};
    textureKeys.forEach((key, idx) => {
      map[key] = loadedTextures[idx];
    });
    return map;
  }, [loadedTextures]);

  const visemeToTextureKey = {
    AA: "E",
    AE: "E",
    AH: "E",
    AY: "E",
    EH: "E",
    ER: "E",
    EY: "E",
    IH: "E",
    IY: "E",
    O: "O",
    AO: "O",
    AW: "O",
    OW: "O",
    UH: "O",
    UW: "O",
    S: "S",
    Z: "S",
    SH: "S",
    ZH: "S",
    TH: "S",
    DH: "S",
    M: "M",
    B: "M",
    P: "M",
    F: "F",
    V: "F",
    T: "E",
    D: "E",
    K: "E",
    G: "E",
    N: "E",
    L: "E",
    rest: "M",
  };

  const [currentTexture, setCurrentTexture] = useState(textureMap.M || null);

  // Reset texture when visemeData changes
  useEffect(() => {
    if (!visemeData || !visemeData.frames?.length) {
      setCurrentTexture(textureMap.M);
    }
  }, [visemeData, textureMap]);

  const getVisemeForTime = (time) => {
    if (!visemeData?.frames?.length) return "rest";
    for (let i = 0; i < visemeData.frames.length; i++) {
      const frame = visemeData.frames[i];
      const next = visemeData.frames[i + 1];
      if (time >= frame.time && (!next || time < next.time)) {
        return frame.viseme;
      }
    }
    return "rest";
  };

  useFrame(() => {
    // === Update viseme texture ===
    const viseme = getVisemeForTime(audioTime ?? 0);
    const textureKey = visemeToTextureKey[viseme] || "E";
    const nextTexture = textureMap[textureKey] || textureMap.M;
    if (nextTexture !== currentTexture) {
      setCurrentTexture(nextTexture);
    }

    // === Flip mouth based on camera position ===
    if (mouthRef.current?.parent) {
      const localCamPos = mouthRef.current.parent.worldToLocal(
        camera.position.clone()
      );
      const shouldFlip = localCamPos.x > 0;
      mouthRef.current.scale.x = shouldFlip ? -1 : 1;
    }
  });

  return (
    <mesh ref={mouthRef} position={[0, -0.13, 0.37]}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={currentTexture}
        transparent
        alphaTest={0.5} // hides fully transparent pixels, cuts soft edges
      />
    </mesh>
  );
}
