// // utils/firebaseAdmin.js or ./firebaseAdmin.js
// const admin = require("firebase-admin");

// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert(
//       JSON.parse(
//         Buffer.from(
//           process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
//           "base64"
//         ).toString("utf-8")
//       )
//     ),
//     databaseURL: process.env.FIREBASE_DATABASE_URL,
//   });
// }

// const db = admin.database();

// module.exports = { db };
