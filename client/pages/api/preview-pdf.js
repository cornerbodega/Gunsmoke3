// pages/api/preview-pdf.js
import { IncomingForm } from "formidable";
import Busboy from "busboy";
import axios from "axios";
import FormData from "form-data";

export const config = {
  api: {
    bodyParser: false, // required to handle streams manually
  },
};

const SERVER_URL = `${process.env.NEXT_PUBLIC_SERVER_URL}/preview-pdf`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const busboy = Busboy({ headers: req.headers });
  const formData = new FormData();

  let userId = null;

  let fileProcessed = false;

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (fieldname === "pdf") {
      formData.append("pdf", file, { filename, contentType: mimetype });
      fileProcessed = true;
    }
  });

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "user_id") {
      userId = val;
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
      console.error("Upload error:", err.response?.data || err.message);
      return res
        .status(500)
        .json({ error: "Failed to upload PDF for preview" });
    }
  });

  req.pipe(busboy);
}
