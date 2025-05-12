export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { job_id } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: "Missing job_id" });
  }

  try {
    const response = await fetch("http://localhost:3001/cancel-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Proxy cancel job failed:", err.message);
    res.status(500).json({ error: "Failed to cancel job" });
  }
}
