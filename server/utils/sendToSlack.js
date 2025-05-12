const axios = require("axios");

const sendSlackMessage = async (
  message,
  level = "info",
  channel = "script-creation-logs"
) => {
  return console.log(
    "sendSlackMessage disabled for quota",
    message,
    level,
    channel
  );

  // let webhookUrl = process.env.SCRIPT_CREATION_LOGS_SLACK_WEBHOOK_URL;
  // if (channel != "script-creation-logs") {
  //   // space for future channels
  // }

  // if (!webhookUrl) {
  //   console.warn("⚠️ Slack webhook URL not set in .env");
  //   return;
  // }

  // const emojis = {
  //   info: "🔵",
  //   success: "✅",
  //   error: "❌",
  //   warn: "⚠️",
  // };

  // const payload = {
  //   text: `${emojis[level] || ""} ${message}`,
  // };

  // try {
  //   // Slack is returning 429 Too Many Requests
  //   // await axios.post(webhookUrl, payload);
  // } catch (err) {
  //   console.error("❌ Failed to send Slack message:", err.message || err);
  // }
};

module.exports = sendSlackMessage;
