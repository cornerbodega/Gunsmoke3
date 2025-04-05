import axios from "axios";

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL");

  const nodeProxyUrl = `http://localhost:3001/audio-proxy?url=${encodeURIComponent(url)}`;

  const fetchWithRetry = async (url, options, retries = 3) => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await axios.get(url, options);
      } catch (err) {
        if (err.code === "ECONNRESET" && i < retries) {
          const delay = Math.pow(2, i) * 100;
          console.warn(`Retrying after ECONNRESET (attempt ${i + 1})...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw err;
        }
      }
    }
  };

  try {
    const response = await fetchWithRetry(nodeProxyUrl, {
      responseType: "stream",
      timeout: 10000,
    });

    res.setHeader("Content-Type", response.headers["content-type"] || "audio/mpeg");
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    response.data.pipe(res);
  } catch (err) {
    console.error("❌ Proxy failed:", err.message);
    res.status(502).send("Proxy error");
  }
}
