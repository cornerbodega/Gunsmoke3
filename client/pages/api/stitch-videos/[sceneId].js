export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sceneId } = req.query;
  console.log(
    "🔥 HIT /api/stitch-videos/[sceneId]",
    req.method,
    req.query.sceneId
  );

  if (!sceneId) {
    return res.status(400).json({ error: "Missing sceneId in URL" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 min

    const backendResponse = await fetch(
      `http://${process.env.NEXT_PUBLIC_SERVER_URL}/stitch-videos/${sceneId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body), // forward the body
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      return res.status(backendResponse.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Stitch proxy failed:", err.message || err);
    return res.status(500).json({
      error: "Proxy to /stitch-videos failed",
      details: err.message,
    });
  }
}
