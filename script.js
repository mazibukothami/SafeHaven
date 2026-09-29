// ---------- Display settings ----------
const root = document.documentElement;
const contrastBtn = document.getElementById("contrast");

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

let textSize = load("textSize", 100);
let highContrast = load("highContrast", false);

function applyDisplay() {
  root.style.setProperty("--size", textSize + "%");

  if (highContrast) {
    root.setAttribute("data-contrast", "high");
  } else {
    root.removeAttribute("data-contrast");
  }

  contrastBtn.setAttribute("aria-pressed", String(highContrast));
}

applyDisplay();

document.getElementById("textUp").addEventListener("click", () => {
  textSize = Math.min(160, textSize + 10);
  save("textSize", textSize);
  applyDisplay();
});

document.getElementById("textDown").addEventListener("click", () => {
  textSize = Math.max(80, textSize - 10);
  save("textSize", textSize);
  applyDisplay();
});

contrastBtn.addEventListener("click", () => {
  highContrast = !highContrast;
  save("highContrast", highContrast);
  applyDisplay();
});


// ---------- Quick exit ----------
function quickExit() {
  window.location.replace("https://www.google.com");
}

document.getElementById("quickExit").addEventListener("click", quickExit);

let lastEsc = 0;

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const now = Date.now();

  if (now - lastEsc < 600) {
    quickExit();
  }

  lastEsc = now;
});


// ---------- Trusted contacts ----------
const form = document.getElementById("contactForm");
const list = document.getElementById("contactList");

let contacts = load("contacts", []);

function renderContacts() {
  list.innerHTML = "";

  if (contacts.length === 0) {
    list.innerHTML = "<li>No contacts added yet.</li>";
    return;
  }

  contacts.forEach((c, i) => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = c.name + " – " + c.phone;

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Remove";
    del.setAttribute("aria-label", "Remove " + c.name);

    del.addEventListener("click", () => {
      contacts.splice(i, 1);
      save("contacts", contacts);
      renderContacts();
    });

    li.append(span, del);
    list.append(li);
  });
}

renderContacts();

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = document.getElementById("cName").value.trim();

  const phone = document
    .getElementById("cPhone")
    .value
    .replace(/[^\d+]/g, "");

  if (!name || phone.length < 9) {
    return;
  }

  contacts.push({
    name: name,
    phone: phone
  });

  save("contacts", contacts);

  form.reset();

  renderContacts();
});


// ---------- Help dialog ----------
const dialog = document.getElementById("helpDialog");
const statusEl = document.getElementById("status");

document.getElementById("helpBtn").addEventListener("click", () => {
  statusEl.textContent = "";
  dialog.showModal();
});

document.getElementById("closeDlg").addEventListener("click", () => {
  dialog.close();
});


// ---------- Send emergency alert ----------
document.getElementById("sendLoc").addEventListener("click", () => {

  // Make sure the user has added a trusted contact
  if (contacts.length === 0) {
    statusEl.textContent =
      "Add at least one trusted contact first.";
    return;
  }

  // Check whether the browser supports location
  if (!navigator.geolocation) {
    statusEl.textContent =
      "Location is not available on this device. Please call 112.";
    return;
  }

  statusEl.textContent = "Getting your location...";

  navigator.geolocation.getCurrentPosition(

    // ---------- SUCCESS ----------
    async (pos) => {

      const { latitude, longitude } = pos.coords;

      try {

        // Try sending the alert through your backend server
        const res = await fetch(
          "http://localhost:3000/api/alert",
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json"
            },

            body: JSON.stringify({
              contacts: contacts,
              latitude: latitude,
              longitude: longitude
            })
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Alert failed");
        }

        statusEl.textContent =
          `Alert sent to ${data.sent} contact(s). Please also call 112.`;

      } catch (error) {

        // ---------- FALLBACK ----------
        // If the backend cannot be reached,
        // open the phone's SMS application.

        const link =
          "https://maps.google.com/?q=" +
          latitude +
          "," +
          longitude;

        const msg =
          "I feel unsafe and need help. My location: " +
          link;

        const numbers =
          contacts.map((c) => c.phone).join(",");

        statusEl.textContent =
          "Opening your messages app...";

        window.location.href =
          "sms:" +
          numbers +
          "?body=" +
          encodeURIComponent(msg);
      }
    },

    // ---------- LOCATION ERROR ----------
    () => {
      statusEl.textContent =
        "Could not get your location. Please call 112 or a trusted contact.";
    },

    // ---------- LOCATION OPTIONS ----------
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
});
