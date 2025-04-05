import axios from "axios";

export default async function fetchWithRetry(url, options = {}, maxRetries = 5) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await axios.get(url, options);
      return response; // success
    } catch (err) {
      const isLast = attempt === maxRetries;

      const status = err.response?.status;
      const code = err.code;

      const retryable =
        [502, 503, 504].includes(status) ||
        ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(code);

      if (!retryable || isLast) {
        console.error(`❌ Failed after ${attempt} retries`, err.message || code);
        throw err;
      }

      const backoff = Math.pow(2, attempt) * 100 + Math.random() * 100; // exponential + jitter
      console.warn(`⚠️ Retry ${attempt + 1}/${maxRetries} in ${backoff.toFixed(0)}ms...`);
      await new Promise((r) => setTimeout(r, backoff));

      attempt++;
    }
  }
}
