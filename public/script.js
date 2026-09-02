// ==================== USER LOGIN ====================
document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;

            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!data.success) {
                document.getElementById("loginMessage").textContent = "Login fehlgeschlagen!";
                return;
            }

            // Passwort muss geändert werden?
            if (data.mustChange) {
                document.getElementById("userPwModal").style.display = "flex";
            } else {
                window.location.href = "main.html";
            }
        });
    }
});

// ==================== USER PASSWORD CHANGE ====================
async function confirmUserPasswordChange() {
    const oldPass = document.getElementById("userNewPass1").value;
    const newPass1 = document.getElementById("userNewPass2").value;
    const newPass2 = document.getElementById("userNewPass3").value;

    if (!oldPass || !newPass1 || !newPass2) {
        alert("Bitte alle Felder ausfüllen.");
        return;
    }

    if (newPass1 !== newPass2) {
        alert("Neue Passwörter stimmen nicht überein.");
        return;
    }

    const res = await fetch('/change-password', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass1 })
    });

    const data = await res.json();

    if (data.success) {
        window.location.href = "main.html";
    } else if (data.reason === 'old') {
        alert("Altes Passwort falsch.");
    } else {
        alert("Fehler beim Speichern.");
    }
}

// ==================== GLOBAL VARS ====================
let desks = [];
let bookings = [];
let placingMode = false;
let currentDesk = null;
let currentUser = "Unbekannt"; // später Session-basiert

let isAdmin = false;

let calendarStart = new Date();
calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay() + 1); // Montag

// ==================== MAIN PAGE CHECK ====================
const isMainPage = document.getElementById('floorplan') !== null;

// ==================== INIT (nur auf main.html) ====================
if (isMainPage) {
    initializeMainPage();

    // Floorplan reload
    window.addEventListener('load', () => {
        const img = document.getElementById('floorImg');
        if (img) img.src = '/uploads/floorplan.png?' + Date.now();
    });

    // Klick-Handler für Tischplatzierung
    const fp = document.getElementById('floorplan');
    if (fp) {
        fp.addEventListener('click', async (e) => {
            if (!placingMode) return;
            placeDesk(e);
        });
    }

    async function initializeMainPage() {
        const response = await fetch('/session-check');
        const sessionData = await response.json();

        if (!sessionData.loggedIn) {
            window.location.replace("index.html");
            return;
        }

        currentUser = sessionData.username || "Unbekannt";
        isAdmin = sessionData.isAdmin === true;

        setMinMaxDate();
        await loadFromServer();
        setupExportButtons();
    }
}

// ==================== ADMIN LOGIN ====================
function setupAdminLogin() {
  const adminArea = document.getElementById('adminArea');
  const loginBtn = document.getElementById('adminLoginBtn');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  adminArea.style.display = "none";
  logoutBtn.style.display = "none";

  loginBtn.onclick = () => openLoginModal();
  logoutBtn.onclick = () => adminLogout();

  checkAdminStatus();
}

async function checkAdminStatus() {
  const resp = await fetch('/api/admin/status');
  const data = await resp.json();

  if (data.isAdmin) {
    isAdmin = true;
    document.getElementById('adminArea').style.display = "block";
    document.getElementById('adminLoginBtn').style.display = "none";
    document.getElementById('adminLogoutBtn').style.display = "inline-block";
  }
}

function openLoginModal() {
  document.getElementById("loginModal").style.display = "flex";
}

function closeLoginModal() {
  document.getElementById("loginModal").style.display = "none";
}

async function confirmAdminLogin() {
  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value.trim();

  const resp = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await resp.json();

  if (data.success) {
    isAdmin = true;
    document.getElementById('adminArea').style.display = "block";
    document.getElementById('adminLoginBtn').style.display = "none";
    document.getElementById('adminLogoutBtn').style.display = "inline-block";
    closeLoginModal();
  } else {
    alert("Login fehlgeschlagen");
  }
}

async function adminLogout() {
  await fetch('/api/admin/logout', { method: 'POST' });

  isAdmin = false;
  document.getElementById('adminArea').style.display = "none";
  document.getElementById('adminLoginBtn').style.display = "inline-block";
  document.getElementById('adminLogoutBtn').style.display = "none";
}

// ==================== ADMIN: USER CREATE ====================
async function createUser() {
  const username = document.getElementById("newUserName").value.trim();
  const useralias = document.getElementById("newUserAlias").value.trim();
  const initialPassword = document.getElementById("newUserPass").value.trim();

  if (!username || !useralias || !initialPassword) {
    alert("Bitte Benutzername, Useralias und Initialpasswort eingeben.");
    return;
  }

  const res = await fetch('/api/admin/create-user', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, useralias, initialPassword })
  });

  const data = await res.json();

  if (data.success) {
    alert("Benutzer angelegt.");
  } else if (data.reason === "alias") {
    alert("Useralias existiert bereits.");
  } else if (data.reason === "missing") {
    alert("Bitte alle Felder ausfüllen.");
  } else {
    alert("Benutzer existiert bereits.");
  }
}

// ==================== ADMIN PASSWORD CHANGE ====================
function openPwModal() {
  document.getElementById("pwModal").style.display = "flex";
}

function closePwModal() {
  document.getElementById("pwModal").style.display = "none";
}

async function confirmPasswordChange() {
  const username = document.getElementById("pwUser").value.trim();
  const oldPass = document.getElementById("pwOld").value.trim();
  const newPass1 = document.getElementById("pwNew1").value.trim();
  const newPass2 = document.getElementById("pwNew2").value.trim();

  if (!newPass1 || !newPass2) return alert("Neues Passwort darf nicht leer sein.");
  if (newPass1 !== newPass2) return alert("Neue Passwörter stimmen nicht überein.");

  const resp = await fetch('/api/admin/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      oldPassword: oldPass,
      newPassword: newPass1
    })
  });

  const data = await resp.json();

  if (!data.success) {
    if (data.reason === "user") alert("Unbekannter Benutzer.");
    else if (data.reason === "old") alert("Altes Passwort falsch.");
    else alert("Fehler beim Speichern.");
    return;
  }

  alert("Passwort erfolgreich geändert.");
  closePwModal();
}

// ==================== FLOORPLAN UPLOAD ====================
function uploadFloorplan() {
  if (!isAdmin) return alert("Nur Admins dürfen den Grundriss ändern.");

  const fileInput = document.getElementById('floorplanInput');
  const file = fileInput.files[0];

  if (!file) {
    alert("Bitte eine Datei auswählen.");
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  fetch('/upload-floorplan', {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      document.getElementById('floorImg').src = '/uploads/floorplan.png?' + Date.now();
    } else {
      alert("Fehler beim Hochladen.");
    }
  })
  .catch(err => {
    console.error(err);
    alert("Upload fehlgeschlagen.");
  });
}

// ==================== LOAD FROM SERVER ====================
async function loadFromServer() {
  const resp = await fetch('/api/desks');
  const data = await resp.json();

  desks = data.desks;
  bookings = data.bookings;

  renderDesks();
  if (document.getElementById('calendarView').style.display === 'block') {
    renderCalendar();
  }
}

// ==================== DATE LIMIT ====================
function setMinMaxDate() {
  const input = document.getElementById('selectedDate');
  if (!input) return; // <-- verhindert Login-Seiten-Absturz

  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

  const max = new Date();
  max.setDate(max.getDate() + 14);
  const maxDate = max.toLocaleDateString('sv-SE'); // YYYY-MM-DD

  input.min = today;
  input.max = maxDate;
  input.value = today;
  input.addEventListener('change', renderDesks);
}

// ==================== RENDER DESKS ====================
function renderDesks() {
  const fp = document.getElementById('floorplan');
  const img = document.getElementById('floorImg');
  if (!fp || !img) return;

  const date = normalizeDate(document.getElementById('selectedDate').value);

  const scaleX = img.width / 1000;
  const scaleY = img.height / 700;

  document.querySelectorAll('.desk').forEach(el => el.remove());

  desks.forEach(desk => {
    const div = document.createElement('div');
    div.className = 'desk';

    div.style.left = (desk.x * scaleX) + 'px';
    div.style.top = (desk.y * scaleY) + 'px';
    div.style.width = (desk.w * scaleX) + 'px';
    div.style.height = (desk.h * scaleY) + 'px';

    div.innerText = desk.name;

    const bookedToday = bookings.filter(b => b.deskId === desk.id && b.date === date);
    if (bookedToday.length > 0) {
      div.classList.add('booked');
      div.innerText += "\n" + bookedToday.map(b =>
        b.startTime && b.endTime ? `${b.user} ${b.startTime}-${b.endTime}` : `${b.user} (ganztags)`
      ).join("\n");
    }

    div.onclick = () => {
      if (placingMode) return;
      openModal(desk, date);
    };

    div.oncontextmenu = async (e) => {
      e.preventDefault();
      if (!isAdmin) return alert("Nur Admins dürfen löschen.");
      if (!confirm(`Tisch "${desk.name}" löschen?`)) return;
      await fetch(`/api/desks/${desk.id}`, { method: 'DELETE' });
      loadFromServer();
    };

    if (isAdmin) makeDraggableResizable(div, desk);
    fp.appendChild(div);
  });
}

// ==================== PLACE NEW DESK ====================
async function placeDesk(e) {
    const img = document.getElementById('floorImg');
    if (!img) return;

    const scaleX = 1000 / img.width;
    const scaleY = 700 / img.height;

    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const newDesk = {
        name: document.getElementById('newDeskName').value,
        x,
        y,
        w: 120,
        h: 80,
        mode: document.getElementById('newDeskMode').value
    };

    await fetch('/api/desks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDesk)
    });

    placingMode = false;
    loadFromServer();
}

function enablePlacingMode() {
  if (!isAdmin) return alert("Nur Admins dürfen Tische platzieren.");
  placingMode = true;
  alert("Klicke auf den Grundriss, um einen neuen Tisch zu platzieren.");
}

// ==================== DRAG & RESIZE ====================
function makeDraggableResizable(div, desk) {
  let startX, startY, startW, startH;

  div.onmousedown = (e) => {
    if (!e.shiftKey && !e.altKey) return;

    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    startW = div.offsetWidth;
    startH = div.offsetHeight;

    document.onmousemove = async (ev) => {
      if (ev.buttons !== 1) return;

      const img = document.getElementById('floorImg');
      const scaleX = 1000 / img.width;
      const scaleY = 700 / img.height;

      if (e.shiftKey) {
        div.style.width = startW + (ev.clientX - startX) + 'px';
        div.style.height = startH + (ev.clientY - startY) + 'px';
      } else if (e.altKey) {
        div.style.left = div.offsetLeft + (ev.clientX - startX) + 'px';
        div.style.top = div.offsetTop + (ev.clientY - startY) + 'px';
        startX = ev.clientX;
        startY = ev.clientY;
      }

      const newX = parseFloat(div.style.left) * scaleX;
      const newY = parseFloat(div.style.top) * scaleY;
      const newW = div.offsetWidth * scaleX;
      const newH = div.offsetHeight * scaleY;

      await fetch(`/api/desks/${desk.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: newX, y: newY, w: newW, h: newH })
      });
    };

    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
    };
  };
}

// ==================== BOOKING MODAL ====================
function openModal(desk, date) {
  currentDesk = desk;

  document.getElementById('deskName').innerText = desk.name;
  document.getElementById('deskInfo').innerText = `Datum: ${date}`;

  document.getElementById('hourlyOption').style.display =
    desk.mode === 'HOURLY' ? 'block' : 'none';

  document.getElementById('overlay').style.display = 'block';
  document.getElementById('modal').style.display = 'block';

  document.getElementById('btnFullDay').onclick = () => book('FULLDAY');
  document.getElementById('btnHourly').onclick = () => book('HOURLY');
}

function closeModal() {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('modal').style.display = 'none';
}

// ==================== BOOKING ====================
async function book(mode) {
  const date = normalizeDate(document.getElementById('selectedDate').value);

  let start = null, end = null;

  if (mode === 'HOURLY') {
    start = document.getElementById('startTime').value;
    end = document.getElementById('endTime').value;
    if (!start || !end || start >= end) return alert("Ungültige Zeit");
  }

  const resp = await fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deskId: currentDesk.id,
      date,
      user: currentUser,
      startTime: start,
      endTime: end
    })
  });

  const data = await resp.json();
  if (!data.success) {
    if (data.reason === "Zeitüberschneidung") alert("Zeitüberschneidung!");
    else if (data.reason === "Ganztag blockiert") alert("Ganztagsbuchung blockiert den Tag!");
    else alert("Fehler beim Buchen");
    return;
  }

  closeModal();
  loadFromServer();
}

// ==================== CALENDAR ====================
function showCalendar() {
  document.getElementById('calendarView').style.display = 'block';
  renderCalendar();
}

function nextWeek() {
  calendarStart.setDate(calendarStart.getDate() + 7);
  renderCalendar();
}

function prevWeek() {
  calendarStart.setDate(calendarStart.getDate() - 7);
  renderCalendar();
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}

function renderCalendar() {
  const tbody = document.querySelector('#calendarTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const weekDays = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(calendarStart);
    d.setDate(d.getDate() + i);
    weekDays.push(d.toISOString().split('T')[0]);
  }

  document.getElementById('calDay1').innerText = formatShortDate(weekDays[0]);
  document.getElementById('calDay2').innerText = formatShortDate(weekDays[1]);
  document.getElementById('calDay3').innerText = formatShortDate(weekDays[2]);
  document.getElementById('calDay4').innerText = formatShortDate(weekDays[3]);
  document.getElementById('calDay5').innerText = formatShortDate(weekDays[4]);

  desks.forEach(desk => {
    const tr = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.innerText = desk.name;
    tr.appendChild(nameCell);

    weekDays.forEach(day => {
      const td = document.createElement('td');

      const booked = bookings.filter(b => b.deskId === desk.id && b.date === day);

      if (booked.length > 0) {
        td.classList.add('calendar-booked');
        td.innerText = booked.map(b =>
          b.startTime && b.endTime
            ? `${b.user} ${b.startTime}-${b.endTime}`
            : `${b.user} (ganztags)`
        ).join("\n");
        td.onclick = () => {
          downloadICS(desk.id, day);
        };

      } else {
        td.classList.add('calendar-free');
        td.innerText = "frei";
        td.onclick = () => {
          openCalendarBooking(desk, day);
        };
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ==================== CALENDAR BOOKING ====================
function openCalendarBooking(desk, date) {
  currentDesk = desk;

  document.getElementById('deskName').innerText = desk.name;
  document.getElementById('deskInfo').innerText = `Datum: ${date}`;

  document.getElementById('hourlyOption').style.display =
    desk.mode === 'HOURLY' ? 'block' : 'none';

  document.getElementById('overlay').style.display = 'block';
  document.getElementById('modal').style.display = 'block';

  document.getElementById('btnFullDay').onclick = () => bookCalendar('FULLDAY', date);
  document.getElementById('btnHourly').onclick = () => bookCalendar('HOURLY', date);
}

async function bookCalendar(mode, date) {
  date = normalizeDate(date);

  let start = null, end = null;

  if (mode === 'HOURLY') {
    start = document.getElementById('startTime').value;
    end = document.getElementById('endTime').value;
    if (!start || !end || start >= end) return alert("Ungültige Zeit");
  }

  const resp = await fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deskId: currentDesk.id,
      date,
      user: currentUser,
      startTime: start,
      endTime: end
    })
  });

  const data = await resp.json();

  if (!data.success) {
    if (data.reason === "Zeitüberschneidung") alert("Zeitüberschneidung!");
    else if (data.reason === "Ganztag blockiert") alert("Ganztagsbuchung blockiert den Tag!");
    else alert("Fehler beim Buchen");
    return;
  }

  closeModal();
  loadFromServer();
  renderCalendar();
}

// ==================== ICS EXPORT ====================
function normalizeDate(date) {
  return date.trim().slice(0, 10);
}

function downloadICS(deskId, date) {
  date = normalizeDate(date);
  const url = `/api/ical?deskId=${deskId}&date=${date}`;
  window.location.href = url;
}

function exportDay(date) {
  date = normalizeDate(date);
  desks.forEach(desk => {
    downloadICS(desk.id, date);
  });
}

function exportWeek() {
  const start = calendarStart.toISOString().slice(0, 10);
  window.location.href = `/api/ical-week?start=${start}`;
}

function setupExportButtons() {
  const dayBtn = document.getElementById("exportDayBtn");
  const weekBtn = document.getElementById("exportWeekBtn");

  if (dayBtn) {
    dayBtn.onclick = () => {
      const date = document.getElementById("selectedDate").value;
      exportDay(date);
    };
  }

  if (weekBtn) {
    weekBtn.onclick = () => {
      exportWeek();
    };
  }
}

// ======================================================
// ADMIN LOGIN – MODAL SETUP
// ======================================================

const adminModal = document.getElementById('adminModal');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminConfirmBtn = document.getElementById('adminConfirmBtn');
const adminCancelBtn = document.getElementById('adminCancelBtn');

// Modal öffnen
if (adminLoginBtn) {
  adminLoginBtn.onclick = () => {
    adminModal.style.display = "flex";
  };
}

// Modal schließen
if (adminCancelBtn) {
  adminCancelBtn.onclick = () => {
    adminModal.style.display = "none";
  };
}

// ======================================================
// MODAL SCHLIESSEN BEI KLICK AUSSERHALB
// ======================================================

window.addEventListener('click', (event) => {
  if (event.target === adminModal) {
    adminModal.style.display = "none";
  }
});

// ======================================================
// MODAL SCHLIESSEN MIT ESC-TASTE
// ======================================================

window.addEventListener('keydown', (event) => {
  if (event.key === "Escape") {
    adminModal.style.display = "none";
  }
});

// ======================================================
// ADMIN-MODAL: FELDER AUTOMATISCH LEEREN
// ======================================================

function clearAdminFields() {
  const userField = document.getElementById('adminUser');
  const passField = document.getElementById('adminPass');

  if (userField) userField.value = "";
  if (passField) passField.value = "";
}

// Beim Öffnen leeren
if (adminLoginBtn) {
  adminLoginBtn.onclick = () => {
    clearAdminFields();
    adminModal.style.display = "flex";
  };
}

// Beim Schließen leeren
if (adminCancelBtn) {
  adminCancelBtn.onclick = () => {
    clearAdminFields();
    adminModal.style.display = "none";
  };
}

// ESC schließt + leert
window.addEventListener('keydown', (event) => {
  if (event.key === "Escape") {
    clearAdminFields();
    adminModal.style.display = "none";
  }
});

// Klick außerhalb schließt + leert
window.addEventListener('click', (event) => {
  if (event.target === adminModal) {
    clearAdminFields();
    adminModal.style.display = "none";
  }
});

// ======================================================
// ADMIN-MODAL: INLINE-FEHLERMELDUNGEN + VALIDIERUNG
// ======================================================

function showAdminError(msg) {
  const errBox = document.getElementById('adminError');
  if (!errBox) return;

  errBox.textContent = msg;
  errBox.style.display = "block";
}

function clearAdminError() {
  const errBox = document.getElementById('adminError');
  if (!errBox) return;

  errBox.textContent = "";
  errBox.style.display = "none";
}

// ======================================================
// ADMIN LOGIN – BACKEND CALL
// ======================================================

if (adminConfirmBtn) {
  adminConfirmBtn.onclick = () => {
    const username = document.getElementById('adminUser').value.trim();
    const password = document.getElementById('adminPass').value.trim();

clearAdminError();

if (!username || !password) {
  showAdminError("Bitte Benutzername und Passwort eingeben.");
  return;
}

if (username.length < 3) {
  showAdminError("Der Benutzername muss mindestens 3 Zeichen lang sein.");
  return;
}

if (password.length < 3) {
  showAdminError("Das Passwort muss mindestens 3 Zeichen lang sein.");
  return;
}

    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        adminModal.style.display = "none";
        window.location.href = "main.html";
      } else {
        showAdminError("Admin Login fehlgeschlagen. Bitte prüfen Sie Benutzername und Passwort.");
      }
    })
    .catch(err => {
      console.error("Admin Login Fehler:", err);
      alert("Serverfehler beim Admin Login.");
    });
  };
}
