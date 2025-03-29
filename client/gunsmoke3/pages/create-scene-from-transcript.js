import { useState } from "react";

export default function CreateScene() {
  const [pdfText, setPdfText] = useState("");

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
      setPdfText(data.text);
    } else {
      console.error("Error:", data.error);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Create Scene</h1>

      {/* 
          ✅ OUTLINE
          1. Accept pdf. 
          2. Extract text. 
          3. Split into overlapping batches. 
          4. Process each batch through Dolphin3, clean and generate metadata.
          5. QA the whole output using different sized batches.
          6. Save to Supabase
      */}

      <input type="file" accept="application/pdf" onChange={handleFileUpload} />

      {pdfText && (
        <div className="mt-4 whitespace-pre-wrap border p-4 rounded bg-gray-100 max-h-[500px] overflow-auto">
          {pdfText}
        </div>
      )}
    </div>
  );
}
