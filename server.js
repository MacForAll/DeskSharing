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

// Multer für Raumplan-Upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, 'floorplan.png');
  }
});

const upload = multer({ storage: storage });

app.post('/upload-floorplan', upload.single('file'), (req, res) => {
  // Optional: Admin-Check
  // if (!req.session || !req.session.isAdmin) {
  //   return res.status(403).json({ success: false });
  // }
  res.json({ success: true });
});

// Tabellen erstellen
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

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    passwordHash TEXT
  )`);

  // Standard-Admin anlegen, falls nicht vorhanden
  db.get("SELECT * FROM admins WHERE username = 'admin'", (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync("admin", 10);
      db.run(
        "INSERT INTO admins (username, passwordHash) VALUES (?, ?)",
        ["admin", hash],
        () => console.log("Standard-Admin angelegt: admin / admin")
      );
    }
  });
});

// Admin-Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM admins WHERE username = ?", [username], (err, row) => {
    if (err || !row) return res.json({ success: false });

    const ok = bcrypt.compareSync(password, row.passwordHash);
    if (!ok) return res.json({ success: false });

    req.session.isAdmin = true;
    req.session.adminUser = username;
    res.json({ success: true });
  });
});

// Admin-Status
app.get('/api/admin/status', (req, res) => {
  res.json({ isAdmin: req.session?.isAdmin === true, user: req.session?.adminUser || null });
});

// Admin-Logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Admin-Passwort ändern
app.post('/api/admin/change-password', (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  db.get("SELECT * FROM admins WHERE username = ?", [username], (err, row) => {
    if (err || !row) return res.json({ success: false, reason: "user" });

    const ok = bcrypt.compareSync(oldPassword, row.passwordHash);
    if (!ok) return res.json({ success: false, reason: "old" });

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.run(
      "UPDATE admins SET passwordHash=? WHERE id=?",
      [newHash, row.id],
      (err2) => {
        if (err2) return res.json({ success: false });
        res.json({ success: true });
      }
    );
  });
});

// Tische + Buchungen laden
app.get('/api/desks', (req, res) => {
  db.all("SELECT * FROM desks", (err, desks) => {
    db.all("SELECT * FROM bookings", (err2, bookings) => {
      res.json({ desks, bookings });
    });
  });
});

// Tisch anlegen
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

// Tisch aktualisieren
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

// Tisch löschen + Buchungen löschen
app.delete('/api/desks/:id', (req, res) => {
  db.run(`DELETE FROM desks WHERE id=?`, [req.params.id], function(err) {
    if (err) return res.json({ success: false });

    db.run(`DELETE FROM bookings WHERE deskId=?`, [req.params.id], function(err2) {
      res.json({ success: !err2 });
    });
  });
});

// Buchen mit Zeitüberschneidungsprüfung
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

// ICS EXPORT – einzelner Tag / einzelner Tisch
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

// ICS EXPORT – ganze Woche (eine Datei)
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

// Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
