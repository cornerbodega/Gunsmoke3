// pages/api/preview-pdf.js
import Busboy from "busboy";
import axios from "axios";
import FormData from "form-data";

export const config = {
  api: {
    bodyParser: false, // Required to handle file uploads via streams
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

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (fieldname === "pdf") {
      formData.append("pdf", file, filename || "upload.pdf");
      fileProcessed = true;
    }
  });

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "user_id") {
      formData.append("user_id", val);
    }
  });

  busboy.on("error", (err) => {
    console.error("Busboy error:", err);
    return res.status(500).json({ error: "Error processing upload stream" });
  });

  busboy.on("finish", async () => {
    if (!fileProcessed) {
      return res.status(400).json({ error: "PDF file is required" });
    }

    try {
      const response = await axios.post(SERVER_URL, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      return res.status(200).json(response.data);
    } catch (err) {
      console.error("Forwarding error:", err.response?.data || err.message);
      return res
        .status(500)
        .json({ error: "Failed to upload PDF for preview" });
    }
  });

  req.pipe(busboy);
}
