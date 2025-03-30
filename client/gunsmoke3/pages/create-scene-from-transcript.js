import { useState } from "react";

export default function CreateScene() {
  const [pdfText, setPdfText] = useState("");
  const [fullTranscript, setFullTranscript] = useState("");

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
      setFullTranscript(data.transcript || ""); // 🧵 Set full combined transcript
    }
    console.log("data");
    console.log(data);
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Create Scene</h1>

      <input type="file" accept="application/pdf" onChange={handleFileUpload} />

      {fullTranscript && (
        <div className="p-4 border rounded bg-white shadow max-h-[400px] overflow-auto">
          <h2 className="text-xl font-semibold mb-2">
            🧵 Full Combined Transcript
          </h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">
            {fullTranscript}
          </pre>
        </div>
      )}

      {pdfText && (
        <div className="space-y-6 max-h-[500px] overflow-auto">
          {pdfText.split("<<<CHUNK_BREAK>>>").map((chunk, i) => (
            <div
              key={i}
              className="whitespace-pre-wrap border p-4 rounded bg-gray-100"
            >
              <strong>Chunk {i + 1}</strong>
              <div className="mt-2">{chunk}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
