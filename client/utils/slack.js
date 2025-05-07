// utils/slack.js
export async function sendSlackMessage(message) {
  try {
    const response = await fetch("/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Slack proxy error: ${result.error || "Unknown error"}`);
    }

    console.log("✅ Slack message sent via proxy:", message);
  } catch (err) {
    console.error("❌ Failed to send Slack message:", err.message);
  }
}
