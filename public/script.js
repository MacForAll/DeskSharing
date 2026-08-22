let desks = [];
let bookings = [];
let placingMode = false;
let currentDesk = null;
let currentUser = prompt("Dein Name:", "Max Mustermann") || "Anonym";

let isAdmin = false;

let calendarStart = new Date();
calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay() + 1); // Montag

// ==================== INIT ====================
setMinMaxDate();
loadFromServer();
setupAdminLogin();
setupExportButtons();

window.addEventListener('load', () => {
  const saved = localStorage.getItem('floorplanUrl');
  if (saved) document.getElementById('floorImg').src = saved;
});

// ==================== ADMIN LOGIN ====================
function setupAdminLogin() {
  const adminArea = document.getElementById('adminArea');
  const loginBtn = document.getElementById('adminLoginBtn');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  adminArea.style.display = "none";
  logoutBtn.style.display = "none";

  loginBtn.onclick = () => {
    openLoginModal();
  };

  logoutBtn.onclick = () => {
    isAdmin = false;
    adminArea.style.display = "none";
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
  };
}

// Öffnet das Login-Modal
function openLoginModal() {
  document.getElementById("loginModal").style.display = "flex";
}

// Schließt das Login-Modal
function closeLoginModal() {
  document.getElementById("loginModal").style.display = "none";
}

// Bestätigt den Admin-Login
function confirmAdminLogin() {
  const userInput = document.getElementById("loginUser").value.trim();
  const passInput = document.getElementById("loginPass").value.trim();

  const storedUser = localStorage.getItem("adminUser") || "admin";
  const storedPass = localStorage.getItem("adminPass") || "admin";

  if (userInput === storedUser && passInput === storedPass) {
    isAdmin = true;
    document.getElementById('adminArea').style.display = "block";
    document.getElementById('adminLoginBtn').style.display = "none";
    document.getElementById('adminLogoutBtn').style.display = "inline-block";
    closeLoginModal();
  } else {
    alert("Falsche Zugangsdaten");
  }
}

// ==================== ADMIN – PASSWORT ÄNDERN ====================
function openPwModal() {
  document.getElementById("pwModal").style.display = "flex";
}

function closePwModal() {
  document.getElementById("pwModal").style.display = "none";
}

function confirmPasswordChange() {
  const storedUser = localStorage.getItem("adminUser") || "admin";
  const storedPass = localStorage.getItem("adminPass") || "admin";

  const user = document.getElementById("pwUser").value.trim();
  const oldPass = document.getElementById("pwOld").value.trim();
  const newPass1 = document.getElementById("pwNew1").value.trim();
  const newPass2 = document.getElementById("pwNew2").value.trim();

  if (user !== storedUser) return alert("Unbekannter Benutzer.");
  if (oldPass !== storedPass) return alert("Altes Passwort falsch.");
  if (!newPass1 || !newPass2) return alert("Neues Passwort darf nicht leer sein.");
  if (newPass1 !== newPass2) return alert("Neue Passwörter stimmen nicht überein.");

  localStorage.setItem("adminPass", newPass1);

  alert("Passwort erfolgreich geändert.");
  closePwModal();
}

// ==================== EXPORT BUTTONS ====================
function setupExportButtons() {
  document.getElementById("exportDayBtn").onclick = () => {
    const date = document.getElementById("selectedDate").value;
    exportDay(date);
  };

  document.getElementById("exportWeekBtn").onclick = () => {
    exportWeek();
  };
}

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

// ==================== SERVER ====================
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

// ==================== UI ====================
function setMinMaxDate() {
  const today = new Date().toISOString().split('T')[0];
  const max = new Date();
  max.setDate(max.getDate() + 14);

  const input = document.getElementById('selectedDate');
  input.min = today;
  input.max = max.toISOString().split('T')[0];
  input.value = today;

  input.addEventListener('change', renderDesks);
}

function renderDesks() {
  const fp = document.getElementById('floorplan');
  const img = document.getElementById('floorImg');
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

// ==================== ADMIN ====================
async function uploadFloorplan() {
  if (!isAdmin) return alert("Nur Admins dürfen den Grundriss ändern.");

  const file = document.getElementById('floorplanUpload').files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('floorImg').src = e.target.result;
    localStorage.setItem('floorplanUrl', e.target.result);
  };
  reader.readAsDataURL(file);
}

function enablePlacingMode() {
  if (!isAdmin) return alert("Nur Admins dürfen Tische platzieren.");
  placingMode = true;
  alert("Klicke auf den Grundriss, um einen neuen Tisch zu platzieren.");
}

document.getElementById('floorplan').addEventListener('click', async (e) => {
  if (!placingMode) return;

  const img = document.getElementById('floorImg');
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
});

// ==================== Drag & Resize ====================
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

// ==================== Kalender – Arbeitswoche ====================
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
