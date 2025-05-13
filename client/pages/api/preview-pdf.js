import formidable from "formidable";
import { IncomingForm } from "formidable";
import FormData from "form-data";
import { PassThrough } from "stream";
import axios from "axios";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log("🔥 /api/preview-pdf route hit");

  const buffers = [];
  let fileInfo = null;

  const form = new IncomingForm({
    fileWriteStreamHandler: () => {
      const stream = new PassThrough();
      stream.on("data", (chunk) => buffers.push(chunk));
      return stream;
    },
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Parse error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }

    const userId = Array.isArray(fields.user_id)
      ? fields.user_id[0]
      : fields.user_id;

    // Sometimes you need to manually attach this
    fileInfo = files.pdf || Object.values(files)[0];
    const buffer = Buffer.concat(buffers);

    const formData = new FormData();
    formData.append("user_id", userId);
    formData.append("pdf", buffer, {
      filename: fileInfo.originalFilename || "upload.pdf",
      contentType: fileInfo.mimetype || "application/pdf",
    });

    try {
      const result = await axios.post(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/preview-pdf`,
        formData,
        {
          headers: formData.getHeaders(),
        }
      );

      res.status(200).json(result.data);
    } catch (e) {
      console.error("❌ Error forwarding to server:", e.message);
      res.status(500).json({ error: "Forwarding failed" });
    }
  });
}
