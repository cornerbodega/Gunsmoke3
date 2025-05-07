import { useState, useEffect, useRef } from "react"; // ✅ 1. import useRef
import Link from "next/link";
export default function CreateScene() {
  const [logs, setLogs] = useState([]);
  const [sceneId, setSceneId] = useState(null);

  const logRef = useRef(null); // ✅ 2. ref for scrolling

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("pdf", file);

    const res = await fetch("/api/upload-to-server", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (res.ok) {
      console.log("✅ Upload complete", data);
    } else {
      console.error("❌ Upload failed", data);
    }
  };
  useEffect(() => {
    const eventSource = new EventSource("/api/logs");

    eventSource.addEventListener("scene_id", (event) => {
      const data = JSON.parse(event.data);
      console.log("🎯 Scene ID received:", data.message);
      setSceneId(data.message);
    });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLogs((prev) => [...prev.slice(-300), data]);
    };

    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
    };

    return () => eventSource.close();
  }, []);

  // ✅ 3. Scroll to bottom on new logs
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs]);

  return (
    <div
      style={{
        padding: "60px 30px",
        maxWidth: "900px",
        margin: "0 auto",
        backgroundColor: "#0f0f0f",
        color: "#fff",
        fontFamily: "monospace",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "30px" }}>
        Upload PDF & Watch Logs
      </h1>
      {sceneId && (
        <div
          style={{
            backgroundColor: "#1a1a1a",
            padding: "20px",
            borderRadius: "10px",
            border: "1px solid #333",
            marginBottom: "30px",
          }}
        >
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginBottom: "10px",
            }}
          >
            Scene ID: {sceneId}
          </h2>
          <Link href={`/courtroom/${sceneId}`} target="_blank">
            🔗{" "}
            <span
              style={{
                color: "#4EA1F3",
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Watch Scene
            </span>
          </Link>
        </div>
      )}

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileUpload}
        style={{
          marginBottom: "30px",
          padding: "10px",
          border: "1px solid #444",
          borderRadius: "6px",
          backgroundColor: "#1a1a1a",
          color: "#ddd",
          cursor: "pointer",
        }}
      />

      <div
        ref={logRef} // ✅ use ref here
        style={{
          backgroundColor: "#000",
          padding: "20px",
          borderRadius: "10px",
          border: "1px solid #333",
          height: "500px",
          overflowY: "scroll",
        }}
      >
        {logs.map((log, i) => (
          <div key={i}>
            <span style={{ color: "#666" }}>[{log.timestamp}]</span>{" "}
            <span style={{ color: getColor(log.type) }}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getColor(type) {
  switch (type) {
    case "error":
      return "#ff5c5c";
    case "warn":
      return "#f9c74f";
    case "info":
      return "#4EA1F3";
    default:
      return "#0f0";
  }
}
