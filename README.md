<p align="center">
  <img src="public/assets/social-preview.png" alt="Desksharing Banner" width="100%">
</p>

# DeskSharing

DeskSharing ist eine einfache Web‑Anwendung zur Verwaltung von Schreibtisch‑Belegungen.
Dieses Dokument beschreibt sowohl die lokale Entwicklung als auch die vollständige Installation auf einem Raspberry Pi für den produktiven Betrieb.

---

## 🚀 Features
- Übersichtliche Darstellung freier und belegter Arbeitsplätze
- SQLite‑Datenbank (keine externe Abhängigkeit)
- Minimaler Ressourcenverbrauch → ideal für Raspberry Pi
- Einfaches Setup mit Node.js

---

# 🧩 1. Lokale Installation (Entwicklung)

## Voraussetzungen
- Node.js 22.x (oder ≥ 18)
- npm

## Installation
```bash
git clone https://github.com/MacForAll/DeskSharing
cd DeskSharing
npm install
npm start
```

Die Anwendung läuft anschließend unter:
```bash
http://localhost:3000
```

Ersetze <username> durch deinen Linux‑Benutzernamen.

---

# 🍓 2. Raspberry Pi Installation (Produktivbetrieb)

## 2.1 Raspberry Pi vorbereiten
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install git nginx -y
```

## 📦 3. nvm installieren (Node Version Manager)
Damit mehrere Node‑Versionen parallel genutzt werden können:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
```

Test:
```bash
nvm --version
```

## 🔧 4. Node.js installieren
DeskSharing benötigt Node.js 22.x (oder ≥ 18):
```bash
nvm install 22
```

Oder für ältere Systeme:
```bash
nvm install 18
```

## 📁 5. Projekt installieren
```bash
mkdir -p /home/<username>/Public
cd /home/<username>/Public
git clone https://github.com/MacForAll/DeskSharing
cd DeskSharing
nvm use 22
npm install
```

## 🚀 6. Anwendung starten (Test)
```bash
nvm use 22
npm start
```

Die Seite ist erreichbar unter:
```bash
http://<IP-des-Pi>:3000
```

## 🔁 7. PM2 Autostart einrichten
PM2 sorgt dafür, dass DeskSharing automatisch startet und überwacht wird.

### PM2 installieren
```bash
nvm use 22
npm install -g pm2
```

### Anwendung registrieren
```bash
cd /home/<username>/Public/DeskSharing
pm2 start server.js --name desksharing
pm2 save
pm2 startup

```

PM2 startet DeskSharing nun automatisch nach jedem Neustart.

## 🌐 8. Reverse Proxy mit Nginx (empfohlen)
Damit die Anwendung unter Port 80/443 erreichbar ist:

### Nginx‑Konfiguration erstellen
```bash
sudo nano /etc/nginx/sites-available/desksharing
```

Inhalt:
```bash
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

```

Aktivieren:
```bash
sudo ln -s /etc/nginx/sites-available/desksharing /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 🔐 9. HTTPS aktivieren (Let’s Encrypt)
Falls eine Domain vorhanden ist:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx
```

Zertifikate werden automatisch erneuert.

## 🗄️ 10. SQLite‑Datenbank sichern
Die Datenbank liegt im Projektordner:
```bash
/home/<username>/Public/DeskSharing/data.db
```

Backup:
```bash
cp /home/<username>/Public/DeskSharing/data.db /home/<username>/Public/DeskSharing/backups/data_$(date +%F).db
```

## 🔒 11. Sicherheitshinweise
• **Standard‑Passwort im Admin‑Bereich ändern** (admin/admin) – beim ersten Login erzwungen
• **Passwortänderungen sind geschützt** – altes Passwort muss validiert werden
• HTTPS verwenden, wenn öffentlich erreichbar
• Portfreigabe nur für Nginx (80/443), nicht für Node direkt
• Regelmäßige Backups der SQLite‑Datenbank
• Sitzungen sind In-Memory; nach Neustart neu anmelden erforderlich

## 🧪 12. PM2 Status prüfen
```bash
pm2 status
pm2 logs desksharing
pm2 info desksharing
```

## 🎯 13. Update des Projekts
```bash
cd /home/<username>/Public/DeskSharing
git pull
pm2 restart desksharing
```

## ✔️ Fertig
DeskSharing läuft nun stabil, automatisch und sicher auf deinem Raspberry Pi.

---

## 🚀 Features

### 🖥️ Grundriss & Tische
- Beliebiges Grundriss‑Bild hochladen
- Tische frei platzieren
- Tische verschieben (ALT + Drag)
- Tische skalieren (SHIFT + Drag)
- Tische löschen (Rechtsklick)
- Ganztags‑ oder Stundenbuchung pro Tisch

### 📅 Buchungssystem
- Tagesansicht
- Wochenkalender (Mo–Fr)
- Buchungen mit Zeitüberschneidungsprüfung
- Ganztagsbuchungen blockieren den gesamten Tag
- Stundenbuchungen blockieren nur Zeitfenster

### 🔐 Admin‑Bereich
- Admin‑Login mit Passwortfeld (••••)
- Passwort ändern (mit Validierung des alten Passworts)
- Benutzer anlegen und verwalten
- Forced password change bei erstem Login für mehr Sicherheit

### 📤 Export
- Export **eines Tages** als ICS pro Tisch
- Export **einer Woche** als **eine einzige ICS‑Datei**
- Kompatibel mit Outlook, Apple Calendar, Google Calendar

### 🗄️ Backend
- Node.js + Express
- SQLite (automatisch erzeugt)
- Keine externe Abhängigkeit außer npm‑Modulen

---

## 🔧 Admin‑Login

Standard‑Zugangsdaten:

- **Benutzername:** `admin`
- **Passwort:** `admin`

Werden beim Server-Start gesetzt.

**Beim ersten Login wird eine Passwortänderung erzwungen:**
- Das alte Standard-Passwort muss eingegeben werden
- Ein neues, sicheres Passwort muss vergeben werden
- Danach kann der Admin-Bereich verwendet werden

Passwortänderungen sind geschützt – nur mit Validierung des alten Passworts möglich.

---

## 📁 Projektstruktur
```markdown
📦 **desksharing/**
│
├── 📂 **public/**
│   ├── 📄 index.html
│   ├── 📄 script.js
│   ├── 🎨 style.css
│   ├── 🖼️ assets
│   └── 🖼️ uploads
│
├── 🗄️ **data.db** — SQLite‑Datenbank (automatisch erzeugt)
├── 🧩 **server.js** — Node.js Backend
├── 📦 **package.json**
└── 📘 **README.md**
```

---

## 🛠️ Roadmap / Ideen

- Monatsansicht
- Benutzer‑Rollen (User / Admin / Teamleiter)
- Farben pro Team
- Mobile UI
- PDF‑Export
- Drag‑&‑Drop Buchungen im Kalender
- Mehrere Standorte / Etagen

---

## 📄 Lizenz

Dieses Projekt ist unter der **MIT‑Lizenz** veröffentlicht.
Siehe Datei `LICENSE`.

# DeskSharing – Arbeitsplatz‑Buchungssystem

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18.x-339933.svg?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-4.x-000000.svg?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3.x-003B57.svg?logo=sqlite&logoColor=white)

---

## 🤝 Beiträge

Pull Requests sind willkommen!
Fehler, Ideen oder Wünsche bitte als Issue einreichen.

---

## ❤️ Autor

**Michael (MacForAll)**
Irgendwo, Deutschland
2026
