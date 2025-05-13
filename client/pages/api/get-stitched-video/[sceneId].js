export default async function handler(req, res) {
  const { sceneId } = req.query;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!sceneId) {
    return res.status(400).json({ error: "Missing sceneId in URL" });
  }

  try {
    const backendUrl = `http://${process.env.NEXT_PUBLIC_SERVER_URL}/get-stitched-video/${sceneId}`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Proxy failed:", err);
    return res.status(500).json({ error: "Proxy to stitched video failed" });
  }
}
