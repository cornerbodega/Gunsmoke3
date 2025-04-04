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
  const [lastViseme, setLastViseme] = useState(null);
  const [lastTextureKey, setLastTextureKey] = useState("rest");

  // Load and map textures
  const texturePaths = {
    AA: "/mouth_visemes/v3/AA.png",
    AE: "/mouth_visemes/v3/AE.png",
    AH: "/mouth_visemes/v3/AH.png",
    AY: "/mouth_visemes/v3/AY.png",
    EH: "/mouth_visemes/v3/EH.png",
    ER: "/mouth_visemes/v3/ER.png",
    EY: "/mouth_visemes/v3/EY.png",
    IH: "/mouth_visemes/v3/IH.png",
    IY: "/mouth_visemes/v3/IY.png",
    AO: "/mouth_visemes/v3/AO.png",
    AW: "/mouth_visemes/v3/AW.png",
    O: "/mouth_visemes/v3/O.png",
    OW: "/mouth_visemes/v3/OW.png",
    UH: "/mouth_visemes/v3/UH.png",
    UW: "/mouth_visemes/v3/UW.png",
    M: "/mouth_visemes/v3/M.png",
    F: "/mouth_visemes/v3/F.png",
    TH: "/mouth_visemes/v3/TH.png",
    L: "/mouth_visemes/v3/L.png",
    S: "/mouth_visemes/v3/S.png",
    W: "/mouth_visemes/v3/W.png",
    rest: "/mouth_visemes/v3/rest.png",
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

  const visemeToTextureKeys = {
    A: ["AA", "AE", "AH", "AY"],
    AA: ["AA"],
    AE: ["AE"],
    AH: ["AH"],
    AY: ["AY"],

    E: ["EH", "ER", "EY", "IH", "IY"],
    EH: ["EH"],
    ER: ["ER"],
    EY: ["EY"],
    IH: ["IH"],
    IY: ["IY"],

    O: ["AO", "AW", "O", "OW"],
    AO: ["AO"],
    AW: ["AW"],
    O_: ["O"],
    OW: ["OW"],

    U: ["UH", "UW"],
    UH: ["UH"],
    UW: ["UW"],

    M: ["M"],
    B: ["M"],
    P: ["M"],
    F: ["F"],
    V: ["F"],
    TH: ["TH"],
    DH: ["TH"],
    S: ["S"],
    Z: ["S"],
    SH: ["S"],
    ZH: ["S"],
    CH: ["S"],
    JH: ["S"],
    L: ["L"],
    W: ["W"],
    R: ["ER"],
    N: ["IH"],
    NG: ["IH"], // approximation
    T: ["EH"],
    D: ["EH"],
    K: ["EH"],
    G: ["EH"],
    Y: ["EY"],
    HH: ["rest"],
    sil: ["rest"],
    rest: ["rest"],
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
        // console.log(`Viseme at ${time}: ${frame.viseme}`);

        return frame.viseme;
      }
    }
    return "rest";
  };

  //   useFrame(() => {
  //     console.log(`[Mouth] audioTime: ${audioTime?.toFixed(2)}`);
  //   });

  useFrame(() => {
    const viseme = getVisemeForTime(audioTime ?? 0);

    if (viseme !== lastViseme) {
      const options = visemeToTextureKeys[viseme] || ["rest"];
      const chosenKey = options[Math.floor(Math.random() * options.length)];

      setLastViseme(viseme);
      setLastTextureKey(chosenKey);
    }

    const nextTexture = textureMap[lastTextureKey] || textureMap["rest"];
    if (nextTexture !== currentTexture) {
      setCurrentTexture(nextTexture);
    }

    // Flip based on camera position
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
