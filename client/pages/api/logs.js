export default async function handler(req, res) {
  const upstream = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/logs`, {
    headers: { Accept: "text/event-stream" },
  });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
      res.flush?.(); // try flushing, if supported
    }
    res.end();
  };

  pump().catch((err) => {
    console.error("SSE proxy error:", err.message);
    res.end();
  });
}
