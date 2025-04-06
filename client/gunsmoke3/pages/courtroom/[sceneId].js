// pages/[sceneId].jsx

import CourtroomScene from "@/components/CourtroomScene";
import { getSupabase } from "@/utils/supabase";

export async function getServerSideProps(context) {
  const supabase = getSupabase();
  const { sceneId } = context.params;
  const pageSize = 1000;

  async function fetchLinesRecursively(from = 0, accumulatedLines = []) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("gs3_lines")
      .select("line_id, line_obj")
      .eq("scene_id", sceneId)
      .order("line_id", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("❌ Error fetching lines:", error.message);
      return { lines: accumulatedLines, error };
    }

    if (!data || data.length === 0) {
      // No more data; return the accumulated lines.
      return { lines: accumulatedLines, error: null };
    }

    const newAccumulated = accumulatedLines.concat(data);

    // If the data length is less than our pageSize, we've reached the end.
    if (data.length < pageSize) {
      return { lines: newAccumulated, error: null };
    }

    // Otherwise, fetch the next page recursively.
    return await fetchLinesRecursively(from + pageSize, newAccumulated);
  }

  const { lines, error } = await fetchLinesRecursively();
  const introLine = {
    line_id: 0,
    line_obj: {
      character_id: "judge",
      role: "judge",
      eye_target: "witness",
      zone: "judge_sitting_at_judge_bench",
      text: "Please rise for the honorable judge entering the courtroom.",
      audio_url: "/audio/intro.mp3", // swap with your actual audio
      pause_before: 0.5,
      emotion: "neutral",
      camera: "wide_establishing",
    },
  };

  if (error) {
    return { props: { lines: [], sceneId } };
  }

  return {
    props: {
      lines: [introLine, ...lines],
      sceneId,
    },
  };
}

export default function ScenePage({ lines, sceneId }) {
  return <CourtroomScene lines={lines} sceneId={sceneId} startFromLineId={1} />;
}
