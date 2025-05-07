import { useState, useEffect, useRef } from "react";
import Link from "next/link";

export default function CreateScene() {
  const [logs, setLogs] = useState([]);
  const [sceneId, setSceneId] = useState(null);
  const [pdfPercent, setPdfPercent] = useState(100);
  const [uploadProgress, setUploadProgress] = useState(0); // NEW
  const [isUploading, setIsUploading] = useState(false); // NEW
  const autoScrollEnabled = useRef(true); // ⬅️ new

  const logRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("pdf_percent", String(pdfPercent));

    setIsUploading(true);
    setUploadProgress(0);

    const res = await fetch("/api/upload-to-server", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      console.log("✅ Upload complete", data);
      setUploadProgress(100);
      setIsUploading(false);
    } else {
      console.error("❌ Upload failed", data);
      setIsUploading(false);
    }
  };
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;

    const handleScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      autoScrollEnabled.current = nearBottom;
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource("/api/logs");

    eventSource.addEventListener("progress", (event) => {
      const data = JSON.parse(event.data);
      setUploadProgress(data.percent || 0);
    });

    eventSource.addEventListener("scene_id", (event) => {
      const data = JSON.parse(event.data);
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
  // Auto-scroll to the bottom of the logs
  useEffect(() => {
    const el = logRef.current;
    if (!el || !autoScrollEnabled.current) return;

    // Delay scroll to allow DOM to render first
    const timeout = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 50); // ~50ms is usually enough

    return () => clearTimeout(timeout); // Cleanup on next run
  }, [logs]);

  return (
    <div
      style={{
        padding: "60px 30px",
        maxWidth: "900px",
        margin: "0 auto",
        backgroundColor: "#0f0f0f",
        color: "#39ff14",
        fontFamily: "'Source Code Pro', 'Courier New', Courier, monospace",
        textShadow: "0 0 5px #39ff14",
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
            color: "#4EA1F3",
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
              }}
            >
              Watch Scene
            </span>
          </Link>
        </div>
      )}

      {/* NEW: Slider */}
      <div style={{ marginBottom: "20px" }}>
        <label
          htmlFor="pdfPercent"
          style={{ display: "block", marginBottom: "8px" }}
        >
          How much of the PDF to use: {pdfPercent}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={pdfPercent}
          onChange={(e) => setPdfPercent(Number(e.target.value))}
          id="pdfPercent"
          style={{ width: "100%" }}
          disabled={isUploading}
        />
      </div>
      {isUploading && (
        <div
          style={{
            position: "relative",
            height: "24px",
            backgroundColor: "#222",
            borderRadius: "4px",
            overflow: "hidden",
            marginBottom: "20px",
            border: "1px solid #444",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${uploadProgress}%`,
              backgroundColor: "#39ff14",
              transition: "width 0.2s ease",
              zIndex: 1,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0f0",
              fontWeight: 600,
              fontSize: "0.9rem",
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            {uploadProgress}%
          </div>
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
          color: "#39ff14",
          cursor: "pointer",
        }}
      />

      <div
        ref={logRef}
        style={{
          backgroundColor: "#000",
          padding: "20px",
          borderRadius: "10px",
          border: "1px solid #333",
          height: "500px",
          overflowY: "scroll",
          boxShadow: "0 0 20px rgba(0, 255, 0, 0.2)",
          fontSize: "0.95rem",
          lineHeight: "1.4",
          position: "relative",
        }}
      >
        {logs.map((log, i) => (
          <div
            key={i}
            style={{
              animation: "fadeIn 0.25s ease-out",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <span
              style={{
                color: "#444",
                textShadow: "0 0 2px #0f0",
              }}
            >
              [{log.timestamp}]
            </span>{" "}
            <span
              style={{
                color: getColor(log.type),
                textShadow:
                  getColor(log.type) === "#39ff14" ? "0 0 5px #39ff14" : "none",
              }}
            >
              {log.message}
            </span>
          </div>
        ))}

        {/* Matrix-style overlay lines */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "100%",
            pointerEvents: "none",
            backgroundImage:
              "linear-gradient(rgba(0,255,0,0.05) 1px, transparent 1px)",
            backgroundSize: "100% 22px",
            opacity: 0.15,
          }}
        />
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function getColor(type) {
  switch (type) {
    case "error":
      return "#ff4d4d";
    case "warn":
      return "#f9c74f";
    case "info":
      return "#4EA1F3";
    default:
      return "#39ff14"; // bright neon green
  }
}
