// pages/api/create-chapters.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { scene_id } = req.body;

  if (!scene_id) {
    return res.status(400).json({ error: "Missing scene_id in request body" });
  }

  try {
    const response = await fetch("http://localhost:3001/create-chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene_id }),
    });

    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch chapters");
    }

    const txt = await response.text();

    res.setHeader("Content-Type", "text/plain");
    res.send(txt);
  } catch (err) {
    console.error("Create Chapters Proxy error:", err);
    res.status(500).json({ error: "Proxy request failed" });
  }
}
