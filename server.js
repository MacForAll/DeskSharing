const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use(session({
  secret: 'deskbooker-secret',
  resave: false,
  saveUninitialized: false
}));

const db = new Database('data.db');

// ==================== MULTER UPLOAD ====================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, 'floorplan.png');
  }
});
const upload = multer({ storage });

// ==================== TABELLEN ====================
db.exec(`
CREATE TABLE IF NOT EXISTS desks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  x REAL,
  y REAL,
  w REAL,
  h REAL,
  mode TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deskId INTEGER,
  date TEXT,
  user TEXT,
  startTime TEXT,
  endTime TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  passwordHash TEXT,
  initialPasswordHash TEXT
);
`);

// ==================== DEFAULT ADMIN USER ====================
function ensureDefaultAdminUser() {
  const adminUser = db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).get('admin');

  if (!adminUser) {
    console.log("Erstelle Standard-Admin: admin/admin");

    const hash = bcrypt.hashSync("admin", 10);

    db.prepare(`
      INSERT INTO users (username, passwordHash, initialPasswordHash)
      VALUES (?, ?, ?)
    `).run('admin', hash, hash);
  }
}

// Funktion ausführen
ensureDefaultAdminUser();

// ==================== RATE LIMITING ====================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP
  message: 'Zu viele Login-Versuche. Bitte später erneut versuchen.',
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== USER LOGIN ====================
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  const row = db.prepare(
    "SELECT * FROM users WHERE username=?"
  ).get(username);

  if (!row) return res.json({ success: false });

  const ok = bcrypt.compareSync(password, row.passwordHash);
  if (!ok) return res.json({ success: false });

  req.session.loggedIn = true;
  req.session.username = username;

  const mustChange = row.initialPasswordHash !== null &&
                     row.passwordHash === row.initialPasswordHash;

  res.json({ success: true, mustChange });
});

// ==================== USER PASSWORD CHANGE ====================
app.post('/change-password', generalLimiter, (req, res) => {
  const { username } = req.session;
  const { oldPassword, newPassword } = req.body;

  if (!username) return res.json({ success: false });

  const user = db.prepare(
    'SELECT passwordHash FROM users WHERE username = ?'
  ).get(username);

  if (!user) return res.json({ success: false, reason: 'user' });

  const validOld = bcrypt.compareSync(oldPassword, user.passwordHash);
  if (!validOld) return res.json({ success: false, reason: 'old' });

  const newHash = bcrypt.hashSync(newPassword, 10);

  db.prepare(`
    UPDATE users SET passwordHash=?, initialPasswordHash=NULL WHERE username=?
  `).run(newHash, username);

  res.json({ success: true });
});

// ==================== FORCED PASSWORD CHANGE (first-time) ====================
app.post('/force-change-password', generalLimiter, (req, res) => {
  const { username } = req.session;
  const { newPassword } = req.body;

  if (!username) return res.json({ success: false });

  const user = db.prepare(
    'SELECT passwordHash, initialPasswordHash FROM users WHERE username = ?'
  ).get(username);

  if (!user) return res.json({ success: false });

  if (user.initialPasswordHash === null || user.passwordHash !== user.initialPasswordHash) {
    return res.json({ success: false, reason: 'not_initial' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);

  db.prepare(`
    UPDATE users SET passwordHash=?, initialPasswordHash=NULL WHERE username=?
  `).run(newHash, username);

  res.json({ success: true });
});

// ==================== SESSION CHECK ====================
app.get('/session-check', (req, res) => {
  if (!req.session.loggedIn) {
    return res.json({ loggedIn: false });
  }

  const user = db.prepare(`
    SELECT username, passwordHash, initialPasswordHash
    FROM users WHERE username = ?
  `).get(req.session.username);

  if (!user) return res.json({ loggedIn: false });

  const mustChangePassword =
    user.initialPasswordHash !== null &&
    user.passwordHash === user.initialPasswordHash;

  res.json({
    loggedIn: true,
    username: user.username,
    mustChangePassword,
    isAdmin: user.username === "admin" && !mustChangePassword
  });
});

// ==================== LOGOUT ====================
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect("/index.html");
  });
});

// ==================== ADMIN LOGIN ====================
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).get(username);

  if (!user) return res.json({ success: false });

  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) return res.json({ success: false });

  req.session.loggedIn = true;
  req.session.username = username;

  const mustChangePassword =
    user.initialPasswordHash !== null &&
    user.passwordHash === user.initialPasswordHash;

  req.session.mustChangePassword = mustChangePassword;

  res.json({ success: true, mustChangePassword });
});

// ==================== ADMIN PASSWORD CHANGE ====================
app.post('/api/admin/change-password', generalLimiter, (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  if (!username) {
    return res.json({ success: false, reason: 'user' });
  }

  const user = db.prepare(
    'SELECT passwordHash FROM users WHERE username = ?'
  ).get(username);

  if (!user) {
    return res.json({ success: false, reason: 'user' });
  }

  const validOld = bcrypt.compareSync(oldPassword, user.passwordHash);
  if (!validOld) {
    return res.json({ success: false, reason: 'old' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  db.prepare(`
    UPDATE users SET passwordHash = ?, initialPasswordHash = NULL WHERE username = ?
  `).run(hash, username);

  res.json({ success: true });
});

// ==================== ADMIN LOGOUT ====================
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ==================== ADMIN: CREATE USER ====================
app.post('/api/admin/create-user', generalLimiter, (req, res) => {
  const { username, initialPassword } = req.body;

  const hash = bcrypt.hashSync(initialPassword, 10);

  try {
    db.prepare(`
      INSERT INTO users (username, passwordHash, initialPasswordHash)
      VALUES (?, ?, ?)
    `).run(username, hash, hash);

    res.json({ success: true });
  } catch {
    res.json({ success: false, reason: "exists" });
  }
});

// ==================== FLOORPLAN UPLOAD ====================
app.post('/upload-floorplan', generalLimiter, upload.single('file'), (req, res) => {
  res.json({ success: true });
});

// ==================== DESKS API ====================
// GET all desks and bookings
app.get('/api/desks', (req, res) => {
  const desks = db.prepare("SELECT * FROM desks").all();
  const bookings = db.prepare("SELECT * FROM bookings").all();
  res.json({ desks, bookings });
});

// POST a new desk
app.post('/api/desks', (req, res) => {
  const { name, x, y, w, h, mode } = req.body;

  const stmt = db.prepare(`
    INSERT INTO desks (name, x, y, w, h, mode)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(name, x, y, w, h, mode);

  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT update a desk
app.put('/api/desks/:id', (req, res) => {
  const { x, y, w, h } = req.body;

  db.prepare(`
    UPDATE desks SET x=?, y=?, w=?, h=? WHERE id=?
  `).run(x, y, w, h, req.params.id);

  res.json({ success: true });
});

// DELETE a desk and its bookings
app.delete('/api/desks/:id', (req, res) => {
  db.prepare(`DELETE FROM desks WHERE id=?`).run(req.params.id);
  db.prepare(`DELETE FROM bookings WHERE deskId=?`).run(req.params.id);
  res.json({ success: true });
});

// ==================== BOOKING ====================
app.post('/api/book', generalLimiter, (req, res) => {
  const { deskId, date, user, startTime, endTime } = req.body;

  const normalizedDate = date.trim().slice(0, 10);

  const rows = db.prepare(`
    SELECT * FROM bookings WHERE deskId=? AND date=?
  `).all(deskId, normalizedDate);

  if (!startTime && !endTime) {
    if (rows.length > 0)
      return res.json({ success: false, reason: "Ganztag blockiert" });
  } else {
    for (const r of rows) {
      if (!r.startTime || !r.endTime)
        return res.json({ success: false, reason: "Ganztag blockiert" });

      if (!(endTime <= r.startTime || startTime >= r.endTime))
        return res.json({ success: false, reason: "Zeitüberschneidung" });
    }
  }

  db.prepare(`
    INSERT INTO bookings (deskId, date, user, startTime, endTime)
    VALUES (?, ?, ?, ?, ?)
  `).run(deskId, normalizedDate, user, startTime, endTime);

  res.json({ success: true });
});

// ==================== ICS EXPORT ====================
app.get('/api/ical', (req, res) => {
  let { deskId, date } = req.query;

  const normalizedDate = date.trim().slice(0, 10);

  db.all(
    `SELECT desks.name AS deskName, bookings.*
     FROM bookings
     JOIN desks ON desks.id = bookings.deskId
     WHERE bookings.deskId=? AND bookings.date=?`,
    [deskId, normalizedDate],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.status(404).send("Keine Buchungen gefunden");
      }

      let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DeskBooker//DE\n";

      rows.forEach(r => {
        const dt = r.date.replace(/-/g, "");
        const start = r.startTime ? r.startTime.replace(":", "") : "0900";
        const end = r.endTime ? r.endTime.replace(":", "") : "1700";

        ics += "BEGIN:VEVENT\n";
        ics += `SUMMARY:${r.user} – ${r.deskName}\n`;
        ics += `DTSTART:${dt}T${start}00\n`;
        ics += `DTEND:${dt}T${end}00\n`;
        ics += `DESCRIPTION:Buchung für ${r.deskName}\n`;
        ics += "END:VEVENT\n";
      });

      ics += "END:VCALENDAR";

      res.setHeader("Content-Type", "text/calendar");
      res.setHeader("Content-Disposition", `attachment; filename="desk_${deskId}_${normalizedDate}.ics"`);
      res.send(ics);
    }
  );
});

// ==================== ICS WEEK ====================
app.get('/api/ical-week', (req, res) => {
  let { start } = req.query;
  const startDate = start.trim().slice(0, 10);

  const weekDays = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    weekDays.push(d.toISOString().slice(0, 10));
  }

  db.all(
    `SELECT desks.name AS deskName, bookings.*
     FROM bookings
     JOIN desks ON desks.id = bookings.deskId
     WHERE bookings.date IN (${weekDays.map(() => '?').join(',')})`,
    weekDays,
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.status(404).send("Keine Buchungen gefunden");
      }

      let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DeskBooker//DE\n";

      rows.forEach(r => {
        const dt = r.date.replace(/-/g, "");
        const start = r.startTime ? r.startTime.replace(":", "") : "0900";
        const end = r.endTime ? r.endTime.replace(":", "") : "1700";

        ics += "BEGIN:VEVENT\n";
        ics += `SUMMARY:${r.user} – ${r.deskName}\n`;
        ics += `DTSTART:${dt}T${start}00\n`;
        ics += `DTEND:${dt}T${end}00\n`;
        ics += `DESCRIPTION:Buchung für ${r.deskName}\n`;
        ics += "END:VEVENT\n";
      });

      ics += "END:VCALENDAR";

      res.setHeader("Content-Type", "text/calendar");
      res.setHeader("Content-Disposition", `attachment; filename="week_${startDate}.ics"`);
      res.send(ics);
    }
  );
});

// ==================== FRONTEND ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
