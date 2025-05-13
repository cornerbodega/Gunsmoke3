const admin = require("firebase-admin");

if (!admin.apps.length) {
  const decoded = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
      "utf8"
    )
  );

  admin.initializeApp({
    credential: admin.credential.cert(decoded),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function logToFirebase(userId = "anonymous", level = "log", ...args) {
  const db = admin.database();
  const timestamp = Date.now();

  let payload = { type: level, timestamp };

  if (typeof args[0] === "object" && args.length === 1) {
    payload = { ...payload, ...args[0] };
  } else {
    const message = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    payload.message = message;
  }

  const key = Date.now();

  db.ref(`logs/${userId}/latest/entries/${key}`)
    .set(payload)
    .catch((err) => {
      console.error(
        `[${timestamp}] ❌ Firebase log write failed:`,
        err.message
      );
    });
}

module.exports = { logToFirebase };
