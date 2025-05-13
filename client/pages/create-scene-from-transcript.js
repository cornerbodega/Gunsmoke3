import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

export default function CreateScene() {
  const [logs, setLogs] = useState([]);
  const [sceneId, setSceneId] = useState(null);
  const [pdfPercent, setPdfPercent] = useState(100);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phase, setPhase] = useState(null); // 'preview' | 'processing'
  const [previewData, setPreviewData] = useState(null);
  const [gcsPath, setGcsPath] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const autoScrollEnabled = useRef(true);
  const logRef = useRef(null);
  const user = useUser();
  console.log(`create scene user?.id: ${user?.id}`);
  const isLoading = phase === "preview" || phase === "processing";

  const handleCancel = async () => {
    const jobId = previewData?.sessionId;
    if (!jobId) {
      alert("No active job to cancel.");
      return;
    }

    try {
      const res = await fetch("/api/cancel-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (res.ok) {
        setStatusMessage("🛑 Job cancelled.");
        setPhase(null);
      } else {
        const result = await res.json();
        setStatusMessage(`❌ Cancel failed: ${result.error}`);
      }
    } catch (err) {
      console.error("Cancel failed:", err);
      setStatusMessage("❌ Cancel request failed.");
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhase("preview");
    setUploadProgress(0);
    setStatusMessage("📤 Generating preview...");

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("user_id", user?.id || "");

    let fakeProgress = 0;
    const interval = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + Math.random() * 2, 98);
      setUploadProgress(Math.round(fakeProgress));
    }, 120);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/preview-pdf", true);

    xhr.onload = () => {
      clearInterval(interval);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 200) {
          setUploadProgress(100);
          setPreviewData(data);
          setGcsPath(data.gcsPath);
          setStatusMessage("✅ Preview ready. Review below.");
        } else {
          setUploadProgress(0);
          setStatusMessage("❌ Preview failed. Check logs.");
        }
      } catch {
        setUploadProgress(0);
        setStatusMessage("❌ Failed to parse preview response.");
      }
    };

    xhr.onerror = () => {
      clearInterval(interval);
      setUploadProgress(0);
      setStatusMessage("❌ Upload failed.");
    };

    xhr.send(formData);
  };

  const handleProcess = async () => {
    setPhase("processing");
    setUploadProgress(0);
    setStatusMessage("⚙️ Processing full PDF into scene...");

    const res = await fetch("/api/process-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gcsPath,
        pdf_percent: pdfPercent,
        user_id: user.id,
        scene_id: previewData?.scene_id,
      }),
    });

    const result = await res.json();

    if (res.ok) {
      setStatusMessage("✅ Scene processing complete!");
      setPhase(null); // hide cancel button
    } else {
      setStatusMessage("❌ Processing failed. Check logs.");
    }
  };

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const handleScroll = () => {
      autoScrollEnabled.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);
  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connect = () => {
      const rawUrl =
        process.env.NODE_ENV === "development"
          ? "localhost:8080/ws"
          : `${window.location.host}/ws`;

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${rawUrl}`);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLogs((prev) => [...prev.slice(-300), data]);
        } catch (err) {
          console.error("❌ WS parse error:", err.message);
        }
      };

      ws.onclose = () => {
        console.warn("🔁 WebSocket closed. Reconnecting in 2s...");
        reconnectTimeout = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    // Strip protocol if present
    const rawUrl =
      process.env.NODE_ENV === "development"
        ? "localhost:8080/ws"
        : `${window.location.host}/ws`;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${rawUrl}`);

    ws.onmessage = (event) => {
      try {
        const payload = event.data.trim();

        if (payload.startsWith("event: progress")) {
          const json = JSON.parse(payload.split("\n")[1].replace("data: ", ""));
          const raw = json.percent || 0;
          const scaled = Math.min(100, Math.round((raw / pdfPercent) * 100));
          setUploadProgress(
            phase === "processing" && pdfPercent > 0 ? scaled : raw
          );
        } else if (payload.startsWith("event: scene_id")) {
          const json = JSON.parse(payload.split("\n")[1].replace("data: ", ""));
          setSceneId(json.message);
        } else {
          const data = JSON.parse(payload.replace(/^data:\s*/, ""));
          setLogs((prev) => [...prev.slice(-300), data]);
        }
      } catch (err) {
        console.error("❌ Failed to parse WS log message:", err.message);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return () => ws.close();
  }, [phase, pdfPercent]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || !autoScrollEnabled.current) return;
    const timeout = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timeout);
  }, [logs]);

  return (
    <div
      style={{
        padding: "60px 30px",
        maxWidth: "900px",
        margin: "0 auto",
        backgroundColor: "#000",
        color: "#39ff14",
        fontFamily: "'Source Code Pro', monospace",
        textShadow: "0 0 5px #39ff14",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: 30 }}>
        Upload Courtroom PDF
      </h1>

      {sceneId && (
        <div
          style={{
            backgroundColor: "#111",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid #39ff14",
            marginBottom: "30px",
          }}
        >
          <strong>🧾 Scene ID:</strong> {sceneId} <br />
          <Link href={`/courtroom/${sceneId}`} target="_blank">
            <span
              style={{
                color: "#4EA1F3",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              🔗 View Scene
            </span>
          </Link>
        </div>
      )}

      {previewData && phase !== "processing" && (
        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="pdfPercent">
            How much of the PDF to use: {pdfPercent}%
            {/* {JSON.stringify(previewData)} */}
          </label>
          <input
            type="range"
            min="1"
            max="100"
            value={pdfPercent}
            onChange={(e) => setPdfPercent(Number(e.target.value))}
            id="pdfPercent"
            disabled={phase === "processing"}
            style={{
              width: "100%",
              marginTop: "8px",
              accentColor: "#39ff14",
            }}
          />
        </div>
      )}

      {phase && (
        <div style={{ marginBottom: "20px" }}>
          <strong>{statusMessage}</strong>
          <div
            style={{
              position: "relative",
              height: "24px",
              backgroundColor: "#111",
              borderRadius: "4px",
              overflow: "hidden",
              marginTop: "10px",
              border: "1px solid #39ff14",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${uploadProgress}%`,
                backgroundColor: "#39ff14",
                transition: "width 0.3s ease",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: "100%",
                textAlign: "center",
                top: 0,
                fontSize: "0.9rem",
              }}
            >
              {uploadProgress}%
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileUpload}
        disabled={isLoading}
        style={{
          marginBottom: "20px",
          padding: "12px",
          borderRadius: "6px",
          backgroundColor: isLoading ? "#333" : "#111",
          color: "#39ff14",
          border: "1px solid #39ff14",
          width: "100%",
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.6 : 1,
        }}
      />

      {previewData && phase !== "processing" && (
        <>
          <button
            onClick={handleProcess}
            style={{
              padding: "12px 24px",
              backgroundColor: "#4EA1F3",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              marginTop: "12px",
              marginBottom: "20px",
            }}
          >
            ✅ Confirm & Process PDF
          </button>

          <div style={{ marginBottom: "30px" }}>
            <h3 style={{ color: "#4EA1F3" }}>🧪 Preview Summary</h3>
            <pre
              style={{
                background: "#111",
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid #333",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
              }}
            >
              {typeof previewData.sampleOutput === "string"
                ? JSON.stringify(JSON.parse(previewData.sampleOutput), null, 2)
                : JSON.stringify(previewData.sampleOutput, null, 2)}
            </pre>
          </div>
        </>
      )}
      {phase === "processing" && uploadProgress < 100 && (
        <button
          onClick={handleCancel}
          style={{
            padding: "10px 20px",
            backgroundColor: "#ff4d4d",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 600,
            marginTop: "12px",
            marginLeft: "12px",
          }}
        >
          ❌ Cancel Job
        </button>
      )}

      <div style={{ marginTop: "40px" }}>
        <h3 style={{ marginBottom: "10px", color: "#4EA1F3" }}>
          📡 Real-time Logs
        </h3>
        <div
          ref={logRef}
          style={{
            backgroundColor: "#000",
            padding: "20px",
            borderRadius: "10px",
            border: "1px solid #39ff14",
            height: "500px",
            overflowY: "scroll",
            fontSize: "0.9rem",
            position: "relative",
          }}
        >
          {logs.map((log, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap" }}>
              <span style={{ color: "#555" }}>[{log.timestamp}]</span>{" "}
              <span style={{ color: getColor(log.type) }}>{log.message}</span>
            </div>
          ))}

          {/* Matrix background lines */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "100%",
              pointerEvents: "none",
              backgroundImage:
                "linear-gradient(rgba(0,255,0,0.08) 1px, transparent 1px)",
              backgroundSize: "100% 22px",
              opacity: 0.15,
            }}
          />
        </div>
      </div>
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
      return "#39ff14"; // default neon green
  }
}
