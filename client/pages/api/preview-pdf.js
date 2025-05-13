// pages/api/preview-pdf.js
import { formidable } from "formidable";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import axios from "axios";

export const config = {
  api: { bodyParser: false },
};

const SERVER_URL = `http://localhost:3001/preview-pdf`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const uploadDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(uploadDir, { recursive: true });

  const form = formidable({
    uploadDir,
    keepExtensions: true,
    maxFileSize: 200 * 1024 * 1024,
    allowEmptyFiles: false,
    multiples: false,
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
      const fileBuffer = fs.readFileSync(filePath);
      const formData = new FormData();
      formData.append("pdf", fileBuffer, filename);
      formData.append("user_id", fields.user_id?.[0] || fields.user_id); // ✅ forward user_id

      const response = await axios.post(SERVER_URL, formData, {
        headers: { ...formData.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      fs.unlinkSync(filePath);

      return res.status(200).json(response.data);
    } catch (err) {
      console.error("Forwarding error:", err.response?.data || err.message);
      return res
        .status(500)
        .json({ error: "Failed to upload PDF for preview" });
    }
  });
}
