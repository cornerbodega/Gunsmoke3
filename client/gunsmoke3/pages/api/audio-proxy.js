import axios from "axios";

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL");

  try {
    // Request audio from your Node proxy server (on port 3001)
    const nodeProxyUrl = `http://localhost:3001/audio-proxy?url=${encodeURIComponent(
      url
    )}`;

    const response = await axios.get(nodeProxyUrl, {
      responseType: "stream", // stream it back to the browser
    });

    // Forward headers
    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "audio/mpeg"
    );
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Pipe the audio data back to the browser
    response.data.pipe(res);
  } catch (err) {
    console.error("Next.js API proxy error:", err.message);
    res.status(500).send("Proxy failed");
  }
}
