// pages/api/preview-pdf.js
import Busboy from "busboy";
import axios from "axios";
import FormData from "form-data";

export const config = {
  api: {
    bodyParser: false,
  },
};

const SERVER_URL = `${process.env.NEXT_PUBLIC_SERVER_URL}/preview-pdf`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST method allowed" });
  }

  const busboy = Busboy({ headers: req.headers });
  const formData = new FormData();
  let fileProcessed = false;
  let userId = null;

  busboy.on("file", (fieldname, file, filename) => {
    if (fieldname === "pdf") {
      formData.append("pdf", file, filename || "upload.pdf");
      fileProcessed = true;
    }
  });

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "user_id") {
      formData.append("user_id", val);
      userId = val;
    }
  });

  busboy.on("finish", async () => {
    if (!fileProcessed) {
      return res.status(400).json({ error: "PDF file is required" });
    }

    try {
      await axios.post(SERVER_URL, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      return res.status(202).json({
        message: "✅ PDF preview job started. It will be processed shortly.",
        user_id: userId,
      });
    } catch (err) {
      console.error("❌ Failed to forward PDF:", err.message);
      return res.status(500).json({ error: "Failed to forward PDF" });
    }
  });

  req.pipe(busboy);
}
