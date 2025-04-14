import { useState } from "react";

export default function CreateScene() {
  const [pdfText, setPdfText] = useState("");
  const [fullTranscript, setFullTranscript] = useState("");
  const [lines, setLines] = useState([]);

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
      const combinedText = data.cleanedChunks.join("<<<CHUNK_BREAK>>>");
      setPdfText(combinedText);
      setFullTranscript(data.transcript || "");
      setLines(data.lines || []);
    }

    console.log("data");
    console.log(data);
  };

  return (
    <div
      style={{
        padding: "60px 30px",
        maxWidth: "900px",
        margin: "0 auto",
        backgroundColor: "#0f0f0f",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "30px" }}>
        Create Scene
      </h1>

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileUpload}
        style={{
          marginBottom: "40px",
          padding: "10px",
          border: "1px solid #444",
          borderRadius: "6px",
          backgroundColor: "#1a1a1a",
          color: "#ddd",
          cursor: "pointer",
        }}
      />
      {/* lines */}
      {JSON.stringify(lines)}
      {fullTranscript && (
        <div
          style={{
            backgroundColor: "#1a1a1a",
            padding: "20px",
            borderRadius: "10px",
            border: "1px solid #333",
            marginBottom: "40px",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          <h2
            style={{
              fontSize: "1.2rem",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#4EA1F3",
            }}
          >
            🧵 Full Combined Transcript
          </h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: "0.9rem",
              lineHeight: 1.6,
              color: "#ccc",
            }}
          >
            {fullTranscript}
          </pre>
        </div>
      )}

      {pdfText && (
        <div style={{ maxHeight: "500px", overflowY: "auto" }}>
          {pdfText.split("<<<CHUNK_BREAK>>>").map((chunk, i) => (
            <div
              key={i}
              style={{
                marginBottom: "30px",
                padding: "20px",
                backgroundColor: "#191919",
                border: "1px solid #333",
                borderRadius: "10px",
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  fontSize: "1rem",
                  marginBottom: "10px",
                  color: "#88ccff",
                }}
              >
                Chunk {i + 1}
              </p>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                  color: "#ddd",
                }}
              >
                {chunk}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
