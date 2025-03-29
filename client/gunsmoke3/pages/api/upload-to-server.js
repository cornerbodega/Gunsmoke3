import { formidable } from "formidable";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import axios from "axios";

// Disable built-in body parsing
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const uploadDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(uploadDir, { recursive: true });

  const form = formidable({
    uploadDir,
    keepExtensions: true,
    maxFileSize: 200 * 1024 * 1024, // ✅ 200MB
    allowEmptyFiles: false,
    multiples: false,
  });

  form.on("progress", (bytesReceived, bytesExpected) => {
    console.log(`Upload progress: ${bytesReceived}/${bytesExpected}`);
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ error: "Failed to parse uploaded file" });
    }

    const file = files.pdf;
    const filePath = Array.isArray(file) ? file[0].filepath : file.filepath;
    const filename = Array.isArray(file)
      ? file[0].originalFilename
      : file.originalFilename;

    try {
      const fileStream = fs.createReadStream(filePath);
      const formData = new FormData();
      formData.append("pdf", fileStream, filename);

      const response = await axios.post(
        "http://localhost:3001/upload",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      fs.unlinkSync(filePath); // ✅ Clean up

      res.status(200).json(response.data);
    } catch (err) {
      console.error("Forwarding error:", err.response?.data || err.message);
      res.status(500).json({ error: "Failed to send file to PDF server" });
    }
  });
}
