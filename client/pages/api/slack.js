// pages/api/slack.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;

  const webhookUrl = process.env.NEXT_PUBLIC_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: "Missing webhook URL" });
  }

  try {
    const slackRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: message }),
    });

    if (!slackRes.ok) {
      const errorText = await slackRes.text();
      return res.status(500).json({ error: "Slack error", details: errorText });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Request failed", details: err.message });
  }
}
