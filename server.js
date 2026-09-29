require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { sendSms } = require("./sms");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
app.use(express.json({ limit: "10kb" }));

// Stops someone using the endpoint to spam people with SMS messages
app.use("/api/", rateLimit({ windowMs: 60 * 1000, max: 5 }));

// Accepts 0821234567 or +27821234567, returns +27... or null
function normalisePhone(raw) {
  const d = String(raw).replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(d)) return "+27" + d.slice(1);
  if (/^\+27\d{9}$/.test(d)) return d;
  return null;
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/alert", async (req, res) => {
  const { contacts, latitude, longitude } = req.body || {};

  if (!Array.isArray(contacts) || contacts.length < 1 || contacts.length > 5) {
    return res.status(400).json({ error: "Provide between 1 and 5 contacts." });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "Invalid location." });
  }

  const numbers = contacts.map((c) => normalisePhone(c && c.phone)).filter(Boolean);
  if (numbers.length === 0) {
    return res.status(400).json({ error: "No valid phone numbers." });
  }

  const link = `https://maps.google.com/?q=${lat},${lng}`;
  const message = `SafeHaven ALERT: someone you know feels unsafe and needs help. Location: ${link}. Please call them and contact 112 if needed.`;

  const results = await Promise.allSettled(numbers.map((n) => sendSms(n, message)));
  const sent = results.filter((r) => r.status === "fulfilled").length;

  // Note: we deliberately do NOT log coordinates or full numbers
  res.json({ sent, failed: numbers.length - sent });
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: "Something went wrong." });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SafeHaven API running on port ${port}`));