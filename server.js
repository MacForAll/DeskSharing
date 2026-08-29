const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

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

const db = new sqlite3.Database('./data.db');

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
db.serialize(() => {

  db.run(`CREATE TABLE IF NOT EXISTS desks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    x REAL,
    y REAL,
    w REAL,
    h REAL,
    mode TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deskId INTEGER,
    date TEXT,
    user TEXT,
    startTime TEXT,
    endTime TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    passwordHash TEXT,
    initialPasswordHash TEXT
  )`);

// ==================== DEFAULT ADMIN USER ====================
async function ensureDefaultAdminUser() {
  const adminUser = await db.get(
    'SELECT * FROM users WHERE username = ?',
    ['admin']
  );

  if (!adminUser) {
    console.log("Erstelle Standard-Admin: admin/admin");

    const hash = bcrypt.hashSync("admin", 10);

    await db.run(
      'INSERT INTO users (username, passwordHash, initialPasswordHash) VALUES (?, ?, ?)',
      ['admin', hash, hash]
    );
  }
}

// Funktion ausführen
ensureDefaultAdminUser();


// ==================== USER LOGIN ====================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username=?", [username], (err, row) => {
    if (err || !row) return res.json({ success: false });

    const ok = bcrypt.compareSync(password, row.passwordHash);
    if (!ok) return res.json({ success: false });

    req.session.loggedIn = true;
    req.session.username = username;

    const mustChange = bcrypt.compareSync(password, row.initialPasswordHash);

    res.json({ success: true, mustChange });
  });
});

// ==================== USER PASSWORD CHANGE ====================
app.post('/change-password', (req, res) => {
  const { username } = req.session;
  const { newPassword } = req.body;

  if (!username) return res.json({ success: false });

  const newHash = bcrypt.hashSync(newPassword, 10);

  db.run(
    `UPDATE users SET passwordHash=?, initialPasswordHash=NULL WHERE username=?`,
    [newHash, username],
    function(err) {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    }
  );
});

// ==================== SESSION CHECK ====================
app.get('/session-check', async (req, res) => {
  if (!req.session.loggedIn) {
    return res.json({
      loggedIn: false
    });
  }

  const user = await db.get(
    'SELECT username, passwordHash, initialPasswordHash FROM users WHERE username = ?',
    [req.session.username]
  );

  if (!user) {
    return res.json({ loggedIn: false });
  }

  const mustChangePassword = user.initialPasswordHash !== null &&
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
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await db.get(
    'SELECT * FROM users WHERE username = ?',
    [username]
  );

  if (!user) {
    return res.json({ success: false });
  }

  const valid = bcrypt.compareSync(password, user.passwordHash);

  if (!valid) {
    return res.json({ success: false });
  }

  // Admin erkannt
  req.session.loggedIn = true;
  req.session.username = username;

  // Admin muss Passwort ändern, wenn initialPasswordHash == passwordHash
  const mustChangePassword = user.passwordHash === user.initialPasswordHash;

  req.session.mustChangePassword = mustChangePassword;

  res.json({
    success: true,
    mustChangePassword
  });
});

// ==================== ADMIN PASSWORD CHANGE ====================
app.post('/api/admin/change-password', async (req, res) => {
  const { username } = req.session;
  const { newPassword } = req.body;

  if (!username) {
    return res.json({ success: false, error: "Not logged in" });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  await db.run(
    'UPDATE users SET passwordHash = ?, initialPasswordHash = NULL WHERE username = ?',
    [hash, username]
  );

  req.session.mustChangePassword = false;

  res.json({ success: true });
});

// ==================== ADMIN LOGOUT ====================
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ==================== ADMIN: CREATE USER ====================
app.post('/api/admin/create-user', (req, res) => {
  const { username, initialPassword } = req.body;

  const hash = bcrypt.hashSync(initialPassword, 10);

  db.run(
    `INSERT INTO users (username, passwordHash, initialPasswordHash)
     VALUES (?, ?, ?)`,
    [username, hash, hash],
    function(err) {
      if (err) return res.json({ success: false, reason: "exists" });
      res.json({ success: true });
    }
  );
});

// ==================== FLOORPLAN UPLOAD ====================
app.post('/upload-floorplan', upload.single('file'), (req, res) => {
  res.json({ success: true });
});

// ==================== DESKS API ====================
app.get('/api/desks', (req, res) => {
  db.all("SELECT * FROM desks", (err, desks) => {
    db.all("SELECT * FROM bookings", (err2, bookings) => {
      res.json({ desks, bookings });
    });
  });
});

app.post('/api/desks', (req, res) => {
  const { name, x, y, w, h, mode } = req.body;
  db.run(
    `INSERT INTO desks (name, x, y, w, h, mode) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, x, y, w, h, mode],
    function(err) {
      res.json({ success: !err, id: this.lastID });
    }
  );
});

app.put('/api/desks/:id', (req, res) => {
  const { x, y, w, h } = req.body;
  db.run(
    `UPDATE desks SET x=?, y=?, w=?, h=? WHERE id=?`,
    [x, y, w, h, req.params.id],
    function(err) {
      res.json({ success: !err });
    }
  );
});

app.delete('/api/desks/:id', (req, res) => {
  db.run(`DELETE FROM desks WHERE id=?`, [req.params.id], function(err) {
    if (err) return res.json({ success: false });

    db.run(`DELETE FROM bookings WHERE deskId=?`, [req.params.id], function(err2) {
      res.json({ success: !err2 });
    });
  });
});

// ==================== BOOKING ====================
app.post('/api/book', (req, res) => {
  const { deskId, date, user, startTime, endTime } = req.body;

  const normalizedDate = date.trim().slice(0, 10);

  db.all(
    `SELECT * FROM bookings WHERE deskId=? AND date=?`,
    [deskId, normalizedDate],
    (err, rows) => {
      if (err) return res.json({ success: false });

      if (!startTime && !endTime) {
        if (rows.length > 0) return res.json({ success: false, reason: "Ganztag blockiert" });
      } else {
        for (const r of rows) {
          if (!r.startTime || !r.endTime) {
            return res.json({ success: false, reason: "Ganztag blockiert" });
          }
          if (!(endTime <= r.startTime || startTime >= r.endTime)) {
            return res.json({ success: false, reason: "Zeitüberschneidung" });
          }
        }
      }

      db.run(
        `INSERT INTO bookings (deskId, date, user, startTime, endTime)
         VALUES (?, ?, ?, ?, ?)`,
        [deskId, normalizedDate, user, startTime, endTime],
        function(err2) {
          res.json({ success: !err2 });
        }
      );
    }
  );
});
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
