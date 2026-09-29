require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const db = require("./db");
const { sendSms, provider } = require("./sms");
const { signToken, requireAuth } = require("./auth");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET missing or too short.");
  process.exit(1);
}
if (provider === "bulksms" && (!process.env.BULKSMS_TOKEN_ID || !process.env.BULKSMS_TOKEN_SECRET)) {
  console.error("SMS_PROVIDER is bulksms but credentials are missing.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
app.use(express.json({ limit: "10kb" }));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const alertLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
app.use("/api/", apiLimiter);

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const UUID = /^[0-9a-f-]{36}$/i;

function normalisePhone(raw) {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(d)) return "+27" + d.slice(1);
  if (/^\+27\d{9}$/.test(d)) return d;
  return null;
}
const cleanName = (s) => String(s || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 40);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- Accounts ----------
app.post("/api/register", authLimiter, wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const displayName = cleanName(req.body.displayName);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !displayName || password.length < 10) {
    return res.status(400).json({ error: "Valid email, name, and a password of 10+ characters are required." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id",
      [email, hash, displayName]
    );
    res.status(201).json({ token: signToken(rows[0].id) });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Could not create account." });
    throw e;
  }
}));

app.post("/api/login", authLimiter, wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const { rows } = await db.query("SELECT id, password_hash FROM users WHERE email = $1", [email]);
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });
  res.json({ token: signToken(rows[0].id) });
}));

// ---------- Contacts ----------
app.get("/api/contacts", requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, name, phone, status FROM contacts WHERE user_id = $1 ORDER BY created_at",
    [req.userId]
  );
  res.json(rows);
}));

app.post("/api/contacts", requireAuth, wrap(async (req, res) => {
  const name = cleanName(req.body.name);
  const phone = normalisePhone(req.body.phone);
  if (!name || !phone) return res.status(400).json({ error: "Valid name and SA phone number required." });

  const count = await db.query("SELECT count(*) FROM contacts WHERE user_id = $1", [req.userId]);
  if (Number(count.rows[0].count) >= 5) return res.status(400).json({ error: "Maximum of 5 contacts." });

  const token = crypto.randomBytes(16).toString("hex");
  let contact;
  try {
    const r = await db.query(
      `INSERT INTO contacts (user_id, name, phone, confirm_token)
       VALUES ($1, $2, $3, $4) RETURNING id, name, phone, status`,
      [req.userId, name, phone, token]
    );
    contact = r.rows[0];
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Contact already added." });
    throw e;
  }

  const u = await db.query("SELECT display_name FROM users WHERE id = $1", [req.userId]);
  const msg = `SafeHaven: ${u.rows[0].display_name} added you as an emergency contact. Confirm: ${process.env.API_URL}/api/contacts/confirm/${token}`;
  sendSms(phone, msg).catch(() => {});
  res.status(201).json(contact);
}));

app.delete("/api/contacts/:id", requireAuth, wrap(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: "Invalid id." });
  await db.query("DELETE FROM contacts WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
  res.status(204).end();
}));

// The contact opens this link from their SMS
app.get("/api/contacts/confirm/:token", wrap(async (req, res) => {
  const { rowCount } = await db.query(
    "UPDATE contacts SET status = 'confirmed', confirm_token = NULL WHERE confirm_token = $1",
    [/^[0-9a-f]{32}$/.test(req.params.token) ? req.params.token : ""]
  );
  res.type("html").send(
    rowCount
      ? "<h1>Thank you</h1><p>You are now a SafeHaven emergency contact.</p>"
      : "<h1>Link not valid</h1><p>This link was already used or is invalid.</p>"
  );
}));

// ---------- Alert ----------
app.post("/api/alert", requireAuth, alertLimiter, wrap(async (req, res) => {
  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "Invalid location." });
  }

  const { rows } = await db.query(
    "SELECT phone FROM contacts WHERE user_id = $1 AND status = 'confirmed'",
    [req.userId]
  );
  if (rows.length === 0) {
    return res.status(400).json({ error: "No confirmed contacts yet. Please call 112." });
  }

  const link = `https://maps.google.com/?q=${lat},${lng}`;
  const message = `SafeHaven ALERT: someone who trusts you feels unsafe. Location: ${link} Call them or 112.`;
  const results = await Promise.allSettled(rows.map((c) => sendSms(c.phone, message)));
  const sent = results.filter((r) => r.status === "fulfilled").length;

  await db.query("INSERT INTO alerts (user_id, contacts_notified) VALUES ($1, $2)", [req.userId, sent]);
  res.json({ sent, failed: rows.length - sent });
}));

app.use((err, req, res, next) => {
  console.error(err.message); // message only, never request bodies
  res.status(500).json({ error: "Something went wrong." });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SafeHaven API running on port ${port}`));