import Link from "next/link";
import { getSupabase } from "../utils/supabase";

export async function getServerSideProps() {
  const supabase = getSupabase();

  const { data: scenes, error } = await supabase
    .from("gs3_scenes")
    .select("scene_id, scene_name, metadata")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error fetching scenes:", error.message);
    return { props: { scenes: [] } };
  }

  return { props: { scenes } };
}

export default function ScenesPage({ scenes }) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Courtroom Scenes</h1>
      {scenes.length === 0 ? (
        <p>No scenes available.</p>
      ) : (
        <ul className="space-y-6">
          {scenes.map((scene) => (
            <li
              key={scene.scene_id}
              className="border border-gray-300 rounded-lg p-4 shadow hover:shadow-md transition"
            >
              <Link href={`/courtroom/${scene.scene_id}`}>
                <p className="text-xl font-semibold text-blue-600 hover:underline">
                  {scene.metadata?.title || scene.scene_name}
                </p>
              </Link>
              {scene.metadata?.summary && (
                <p className="text-gray-700 mt-2">{scene.metadata.summary}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
