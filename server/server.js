const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const fs = require("fs");

const app = express();
const port = 3001;

app.use(cors());

const upload = multer({
  dest: "uploads/", // write to disk instead of memory
  limits: { fileSize: 200 * 1024 * 1024 }, // allow up to 200MB
});

const { encode, decode } = require("gpt-3-encoder");

function splitIntoBatches(text, maxTokens = 6500, overlap = 500) {
  const tokens = encode(text);
  const batches = [];

  for (let i = 0; i < tokens.length; i += maxTokens - overlap) {
    const chunk = tokens.slice(i, i + maxTokens);
    const decodedChunk = decode(chunk);
    batches.push(decodedChunk);
  }

  return batches;
}

app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      text: parsed.text,
      numpages: parsed.numpages,
      info: parsed.info,
    });
  } catch (err) {
    console.error("PDF parsing error:", err);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

app.listen(port, () => {
  console.log(`✅ PDF parser server running on http://localhost:${port}`);
});
