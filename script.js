const API = "http://localhost:3000"; // change this when you deploy
const $ = (id) => document.getElementById(id);

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ---------- Display settings ----------
const root = document.documentElement;
const contrastBtn = $("contrast");
let textSize = load("textSize", 100);
let highContrast = load("highContrast", false);

function applyDisplay() {
  root.style.setProperty("--size", textSize + "%");
  if (highContrast) root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
  contrastBtn.setAttribute("aria-pressed", String(highContrast));
}
applyDisplay();

$("textUp").addEventListener("click", () => {
  textSize = Math.min(160, textSize + 10); save("textSize", textSize); applyDisplay();
});
$("textDown").addEventListener("click", () => {
  textSize = Math.max(80, textSize - 10); save("textSize", textSize); applyDisplay();
});
contrastBtn.addEventListener("click", () => {
  highContrast = !highContrast; save("highContrast", highContrast); applyDisplay();
});

// ---------- Quick exit ----------
function quickExit() { window.location.replace("https://www.google.com"); }
$("quickExit").addEventListener("click", quickExit);

let lastEsc = 0;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const now = Date.now();
  if (now - lastEsc < 600) quickExit();
  lastEsc = now;
});

// ---------- API helper ----------
let token = load("token", null);
let contacts = []; // kept in memory only, never saved in the browser

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
  });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new Error((data && data.error) || "Request failed.");
  return data;
}

// ---------- Login / register ----------
let mode = "login";

$("authToggle").addEventListener("click", () => {
  mode = mode === "login" ? "register" : "login";
  const reg = mode === "register";
  $("nameRow").hidden = !reg;
  $("aName").required = reg;
  $("auth-title").textContent = reg ? "Create your SafeHaven account" : "Log in to SafeHaven";
  $("authSubmit").textContent = reg ? "Register" : "Log in";
  $("authToggle").textContent = reg ? "Already have an account? Log in" : "Need an account? Register";
  $("aPass").autocomplete = reg ? "new-password" : "current-password";
  $("authMsg").textContent = "";
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("authMsg").textContent = "Please wait...";
  const body = { email: $("aEmail").value, password: $("aPass").value };
  if (mode === "register") body.displayName = $("aName").value;
  try {
    const data = await api("/api/" + mode, { method: "POST", body: JSON.stringify(body) });
    token = data.token;
    save("token", token);
    $("authForm").reset();
    $("authMsg").textContent = "";
    showState();
  } catch (err) {
    $("authMsg").textContent = err.message;
  }
});

function logout() {
  token = null;
  contacts = [];
  save("token", null);
  showState();
}
$("logout").addEventListener("click", logout);

function showState() {
  const loggedIn = Boolean(token);
  $("authCard").hidden = loggedIn;
  $("appCard").hidden = !loggedIn;
  if (loggedIn) loadContacts();
}

// ---------- Contacts ----------
async function loadContacts() {
  try {
    contacts = await api("/api/contacts");
    $("contactMsg").textContent = "";
  } catch (err) {
    $("contactMsg").textContent = err.message;
  }
  renderContacts();
}

function renderContacts() {
  const list = $("contactList");
  list.innerHTML = "";
  if (contacts.length === 0) {
    list.innerHTML = "<li>No contacts added yet.</li>";
    return;
  }
  contacts.forEach((c) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    const state = c.status === "confirmed" ? "Confirmed" : "Waiting for confirmation";
    span.textContent = `${c.name} – ${c.phone} (${state})`;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Remove";
    del.setAttribute("aria-label", "Remove " + c.name);
    del.addEventListener("click", async () => {
      try {
        await api("/api/contacts/" + c.id, { method: "DELETE" });
        loadContacts();
      } catch (err) {
        $("contactMsg").textContent = err.message;
      }
    });
    li.append(span, del);
    list.append(li);
  });
}

$("contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name: $("cName").value, phone: $("cPhone").value }),
    });
    $("contactForm").reset();
    $("contactMsg").textContent = "Contact added. They have been sent a confirmation text.";
    const list = await api("/api/contacts");
    contacts = list;
    renderContacts();
  } catch (err) {
    $("contactMsg").textContent = err.message;
  }
});

// ---------- Help dialog ----------
const dialog = $("helpDialog");
const statusEl = $("status");

$("helpBtn").addEventListener("click", () => {
  statusEl.textContent = "";
  dialog.showModal();
});
$("closeDlg").addEventListener("click", () => dialog.close());

$("sendLoc").addEventListener("click", () => {
  if (!token) {
    statusEl.textContent = "Please log in first. If you are in danger, call 112 now.";
    return;
  }
  if (!navigator.geolocation) {
    statusEl.textContent = "Location is not available on this device. Please call 112.";
    return;
  }
  statusEl.textContent = "Getting your location...";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const data = await api("/api/alert", {
          method: "POST",
          body: JSON.stringify({ latitude, longitude }),
        });
        statusEl.textContent = `Alert sent to ${data.sent} contact(s). Please also call 112.`;
      } catch (err) {
        // Fallback: open the phone's messaging app with confirmed contacts
        const confirmed = contacts.filter((c) => c.status === "confirmed");
        if (confirmed.length === 0) {
          statusEl.textContent = err.message + " Please call 112.";
          return;
        }
        const link = "https://maps.google.com/?q=" + latitude + "," + longitude;
        const msg = "I feel unsafe and need help. My location: " + link;
        window.location.href =
          "sms:" + confirmed.map((c) => c.phone).join(",") + "?body=" + encodeURIComponent(msg);
      }
    },
    () => {
      statusEl.textContent = "Could not get your location. Please call 112 or a trusted contact.";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

showState();