// pages/api/process-pdf.js
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const response = await axios.post(
      "http://localhost:3001/process-pdf",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json(response.data);
  } catch (err) {
    console.error("Process PDF error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to process PDF" });
  }
}
