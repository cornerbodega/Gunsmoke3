import Link from "next/link";
import { getSupabase } from "../utils/supabase";

export async function getServerSideProps() {
  const supabase = getSupabase();

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
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Most recent first

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
  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "60px 30px",
        backgroundColor: "#0f0f0f",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", fontWeight: 700, marginBottom: "40px" }}>
        Courtroom Scenes
      </h1>

      {scenes.length === 0 ? (
        <p style={{ color: "#888", fontStyle: "italic" }}>
          No scenes available.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {scenes.map((scene, index) => (
            <li
              key={scene.scene_id}
              style={{
                borderBottom:
                  index < scenes.length - 1 ? "1px solid #333" : "none",
                paddingBottom: "28px",
                marginBottom: "28px",
              }}
            >
              <Link href={`/courtroom/${scene.scene_id}`}>
                <p
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 600,
                    color: "#4EA1F3",
                    cursor: "pointer",
                    marginBottom: "6px",
                  }}
                >
                  {scene.metadata?.title || scene.scene_name}
                </p>
              </Link>
              <p
                style={{
                  fontSize: "0.9rem",
                  color: "#bbb",
                  marginTop: "4px",
                }}
              >
                {scene.line_count} {scene.line_count === 1 ? "line" : "lines"}
              </p>

              <p
                style={{
                  fontSize: "0.85rem",
                  color: "#aaa",
                  marginBottom: "12px",
                }}
              >
                {formatDateTime(scene.created_at)}
              </p>

              {scene.metadata?.summary && (
                <p
                  style={{
                    fontSize: "1rem",
                    lineHeight: 1.6,
                    color: "#ccc",
                  }}
                >
                  {scene.metadata.summary}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
