const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Add a new job entry in the gs3_jobs table.
 */
async function createJob({ job_id, scene_id = null, user_id }) {
  const { error } = await supabase.from("gs3_jobs").insert({
    job_id,
    scene_id,
    user_id,
    status: "started",
  });

  if (error) {
    console.error(`❌ Failed to create job ${job_id}:`, error.message);
    throw new Error("Failed to create job");
  }

  console.log(`✅ Job ${job_id} created`);
  return job_id;
}

/**
 * Check whether a job has been marked as cancelled.
 */
async function isJobCancelled(job_id) {
  const { data, error } = await supabase
    .from("gs3_jobs")
    .select("status")
    .eq("job_id", job_id)
    .single();

  if (error) {
    console.error(
      `❌ Failed to check job status for ${job_id}:`,
      error.message
    );
    return false;
  }

  return data.status === "cancelled";
}

/**
 * Mark a job as cancelled.
 */
async function cancelJob(job_id) {
  const { error } = await supabase
    .from("gs3_jobs")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("job_id", job_id);

  if (error) {
    console.error(`❌ Failed to cancel job ${job_id}:`, error.message);
    throw new Error("Failed to cancel job");
  }

  console.log(`🚫 Job ${job_id} marked as cancelled`);
  return true;
}

module.exports = {
  createJob,
  isJobCancelled,
  cancelJob,
};
