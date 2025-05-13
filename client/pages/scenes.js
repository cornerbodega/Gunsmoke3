import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/utils/supabase";
export async function getServerSideProps() {
  const { data: scenes } = await supabase.from("gs3_scenes").select("*");
  const { data: lineCounts } = await supabase
    .from("gs3_line_counts")
    .select("*");

  const countMap = new Map(
    lineCounts.map((row) => [row.scene_id, row.line_count])
  );
  const scenesWithCount = scenes
    .map((scene) => ({
      ...scene,
      line_count: countMap.get(scene.scene_id) || 0,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return { props: { scenes: scenesWithCount } };
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ScenesPage({ scenes }) {
  const refs = useRef([]);
  const [visibleIndices, setVisibleIndices] = useState([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (entry.isIntersecting) {
            const idx = refs.current.findIndex((r) => r === entry.target);
            if (!visibleIndices.includes(idx)) {
              setVisibleIndices((prev) => [...prev, idx]);
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    refs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      refs.current.forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
    };
  }, [refs.current]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(to bottom, #000, #111)",
        color: "#fff",
        padding: "60px 40px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          fontWeight: 800,
          marginBottom: "40px",
          textAlign: "center",
          backgroundImage: "linear-gradient(to right, red, orange, red)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          animation: "pulse 2s infinite",
        }}
      >
        🎥 Courtroom Scenes
      </h1>

      {scenes.length === 0 ? (
        <p style={{ color: "#888", fontStyle: "italic", textAlign: "center" }}>
          No scenes available.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "30px",
          }}
        >
          {scenes.map((scene, i) => (
            <div
              key={scene.scene_id}
              ref={(el) => (refs.current[i] = el)}
              style={{
                backgroundColor: "#1a1a1a",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 0 20px rgba(255, 255, 255, 0.05)",
                transform: visibleIndices.includes(i)
                  ? "none"
                  : "translateY(60px)",
                opacity: visibleIndices.includes(i) ? 1 : 0,
                animation: visibleIndices.includes(i)
                  ? "bounceIn 0.6s ease-out forwards"
                  : "none",
              }}
            >
              <Link href={`/courtroom/${scene.scene_id}`}>
                <p
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    color: "#ff3d3d",
                    cursor: "pointer",
                    marginBottom: "8px",
                  }}
                >
                  {scene.metadata?.title || scene.scene_name}
                </p>
              </Link>

              <p
                style={{
                  fontSize: "0.9rem",
                  color: "#aaa",
                  marginBottom: "6px",
                }}
              >
                {scene.line_count} {scene.line_count === 1 ? "line" : "lines"}
              </p>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#777",
                  marginBottom: "10px",
                }}
              >
                {formatDateTime(scene.created_at)}
              </p>

              {scene.metadata?.summary && (
                <p
                  style={{
                    fontSize: "0.95rem",
                    lineHeight: 1.5,
                    color: "#ccc",
                    marginBottom: "12px",
                  }}
                >
                  {scene.metadata.summary}
                </p>
              )}

              <form
                action="/api/create-chapters"
                method="POST"
                target="_blank"
                style={{ textAlign: "right", marginTop: "10px" }}
              >
                <input type="hidden" name="scene_id" value={scene.scene_id} />
                <button
                  type="submit"
                  style={{
                    fontSize: "0.75rem",
                    backgroundColor: "transparent",
                    border: "none",
                    color: "#888",
                    cursor: "pointer",
                    opacity: 0.6,
                  }}
                >
                  📥 Download Chapters.txt
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes bounceIn {
          0% {
            transform: translateY(60px);
            opacity: 0;
          }
          60% {
            transform: translateY(-10px);
            opacity: 1;
          }
          80% {
            transform: translateY(5px);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
