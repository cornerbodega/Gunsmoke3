// pages/api/all-lines.js

export default async function handler(req, res) {
  const { sceneId } = req.query;

  try {
    const backendRes = await fetch(
      `${process.env.NEXT_PUBLIC_SERVER_URL}/api/lines/all?sceneId=${sceneId}`
    );
    const data = await backendRes.json();
    res.status(200).json(data);
  } catch (error) {
    console.error("All lines Proxy error:", error);
    res.status(500).json({ error: "Failed to fetch data from server" });
  }
}
