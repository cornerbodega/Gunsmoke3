// pages/[sceneId].jsx

import CourtroomScene from "@/components/CourtroomScene";
import { getSupabase } from "@/utils/supabase";

export async function getServerSideProps(context) {
  const supabase = getSupabase();
  const { sceneId } = context.params;

  const { data: lines, error } = await supabase
    .from("gs3_lines")
    .select("line_id, line_obj")
    .eq("scene_id", sceneId)
    .order("line_id", { ascending: true });

  if (error) {
    console.error("❌ Error fetching lines:", error.message);
    return { props: { lines: [], sceneId } };
  }

  return {
    props: {
      lines,
      sceneId,
    },
  };
}

export default function ScenePage({ lines, sceneId }) {
  return <CourtroomScene lines={lines} sceneId={sceneId} startFromLineId={1} />;
}
