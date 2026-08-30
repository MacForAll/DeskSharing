# Copilot Instructions – DeskSharing

This document provides essential context for AI assistants working on the DeskSharing codebase.

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:3000`. User-facing app: `/` (or `/index.html`). Admin panel: `/main.html`.

**No build step, test suite, or linter currently configured.**

---

## Architecture Overview

### Tech Stack
- **Backend**: Node.js + Express (single `server.js`, ~400 lines)
- **Database**: SQLite via better-sqlite3 (auto-created `data.db`)
- **Frontend**: Vanilla JavaScript (no frameworks, bundlers, or transpilation)
- **Authentication**: express-session + bcryptjs password hashing
- **File uploads**: multer (floorplan images stored as `public/uploads/floorplan.png`)

### High-Level Flow
1. User accesses `/index.html` (login form)
2. Upon login, redirects to `/main.html` (admin booking/desk management interface)
3. Server maintains sessions in `express-session` (in-memory, not persisted)
4. All desk/booking data persists in SQLite; floorplan PNG stored on disk
5. ICS export endpoints generate calendar files for external calendar apps

### Database Schema

```sql
desks:
  - id (INTEGER PRIMARY KEY)
  - name, x, y, w, h (position/size for floorplan rendering)
  - mode (TEXT) – currently unused; tracks booking mode

bookings:
  - id, deskId, date (ISO: YYYY-MM-DD), user
  - startTime, endTime (HH:MM or NULL for all-day)

users:
  - id, username (UNIQUE), passwordHash, initialPasswordHash
  - initialPasswordHash tracking forces password change on first login
```

**Booking Logic**:
- **All-day bookings** (null startTime/endTime): block the entire day, prevent any other bookings
- **Hourly bookings**: check time conflicts using interval logic (`!(endTime <= r.startTime || startTime >= r.endTime)`)

---

## File Organization

```
server.js              – Full backend (Express routes, DB setup, auth, API endpoints)
public/
  ├── index.html       – Login page
  ├── main.html        – Admin panel (desk management, bookings, user admin)
  ├── script.js        – ~860 lines; all frontend logic (event handlers, API calls, UI state)
  ├── style.css        – Styling
  ├── uploads/         – Floorplan image (floorplan.png)
  └── assets/          – Social preview image
data.db               – SQLite database (auto-created)
```

---

## Key Conventions

### Code Style & Comments
- Section headers use `// ==================== SECTION_NAME ====================`
- API routes grouped by feature (LOGIN, DESK API, BOOKING, etc.)
- Minimal inline comments; relies on section headers for navigation

### API Endpoints
All REST endpoints return JSON. Common patterns:
- **Success**: `{ success: true, ... }`
- **Failure**: `{ success: false, reason: "..." }` (German reason messages)

**Main endpoints**:
- `POST /api/login` – User login (returns `mustChange` flag for forced password change)
- `GET /session-check` – Check login status, returns `isAdmin`, `mustChangePassword`
- `GET /api/desks` – Fetch all desks and bookings
- `POST /api/desks` – Create desk (returns `lastInsertRowid` as desk ID)
- `PUT /api/desks/:id` – Update desk position/size (x, y, w, h)
- `DELETE /api/desks/:id` – Delete desk and cascade-delete all its bookings
- `POST /api/book` – Create booking (validates all-day vs. hourly conflicts)
- `GET /api/ical` – Export single day as ICS (params: `deskId`, `date`)
- `GET /api/ical-week` – Export Mon–Fri week as single ICS (param: `start` date)

### Date/Time Formats
- **Dates**: ISO format `YYYY-MM-DD`; normalized with `.slice(0, 10)` to remove time components
- **Times**: `HH:MM` (24-hour); stored as strings in DB
- **ICS export**: dates converted to `YYYYMMDD`, times to `HHMMSS` without colons

### Frontend State (script.js)
```javascript
let desks = [];              // Desk objects from GET /api/desks
let bookings = [];           // Booking objects
let placingMode = false;     // Currently in desk-placement mode?
let currentDesk = null;      // Selected desk for editing
let currentUser = "Unbekannt"; // Name of logged-in user (not session-based yet)
let isAdmin = false;         // Is current user admin?
let calendarStart = new Date(); // Week view start (Monday)
```

### Admin Panel (main.html)
- Hardcoded default admin: username `admin`, password `admin`
- Forced password change flow: `mustChange` flag triggers modal
- Admin can create additional users with initial passwords
- User must change password on first login
- Password stored as bcryptjs hash (10 rounds)

---

## Important Business Rules

1. **Booking Conflicts**:
   - All-day bookings (`startTime === null && endTime === null`) block the entire day
   - If any all-day booking exists for a date, no other booking (all-day or hourly) is allowed
   - Hourly bookings check interval overlap: reject if `!(endTime <= r.startTime || startTime >= r.endTime)`

2. **Floorplan Management**:
   - Single PNG image stored at `public/uploads/floorplan.png`
   - Multer configured to overwrite on each upload (always `floorplan.png`)
   - Frontend tracks desk position (x, y) and size (w, h) as floats for pixel-precise rendering
   - Desks can be moved (ALT+drag) and scaled (SHIFT+drag) on the floorplan

3. **Session & Auth**:
   - express-session stores `loggedIn`, `username`, `mustChangePassword` in-memory
   - Sessions not persisted; lost on server restart
   - Default admin credentials hardcoded; must be changed before production

4. **ICS Export**:
   - Generates iCalendar 2.0 format
   - Start time defaults to 09:00, end time to 17:00 if not specified
   - Events labeled as `USER – DESKNAME`
   - Week export returns all bookings for Mon–Fri (5 days)

---

## Development Notes

- **No build step required**: Vanilla JS frontend, no transpilation or bundling
- **No tests**: Currently no test framework; consider Jest or Mocha if adding tests
- **No linter**: Consider adding ESLint if code style consistency is desired
- **No migrations**: SQLite schema hardcoded in server startup; no migration system
- **CORS enabled**: Configured for all origins (ensure security review if this is production)
- **Session secret**: Hardcoded as `'deskbooker-secret'`; should be environment variable
- **Database queries**: Uses better-sqlite3 sync API throughout; blocking operations
- **Language**: German UI strings predominate; internationalization not implemented

---

## Common Editing Tasks

### Adding a New API Endpoint
1. Add section header to `server.js` following the existing format
2. Use `app.get()`, `app.post()`, `app.put()`, or `app.delete()`
3. Return JSON with `{ success: true/false, ... }`
4. Add corresponding frontend call in `script.js` using `fetch()`

### Modifying Booking Logic
- Edit conflict checks in `POST /api/book` around line 190
- Test both all-day and hourly edge cases (same date, adjacent times, overlaps)
- Remember: all-day bookings block the entire day

### Changing Database Schema
- Edit the `db.exec()` call in `server.js` (lines 22–40)
- Only new columns will be added (existing data not migrated); ensure backward compatibility
- Test with existing `data.db` if schema changes

### Frontend Updates
- Login flow: `index.html` + handlers in `script.js` (lines 1–30)
- Main app: `main.html` + handlers in `script.js` (lines ~60–860)
- All state stored in module-level variables; no state management library
