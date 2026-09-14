# DSA Tracker — Desktop App

This folder is a **standalone copy** of your DSA Tracker on Desktop.

## Double-click to run

| Launcher | What it does |
|---|---|
| **`Start DSA Tracker.bat`** | (Recommended) Starts Express server + opens `http://localhost:3000` in Chrome App window |
| **`Start DSA Tracker.ps1`** | PowerShell version — same, with colored logs + auto-install |

> First run will `npm install` automatically (~5s). Subsequent launches are instant.

## How to use as "App"

1. Double-click `Start DSA Tracker.bat`
2. Wait 2-3 seconds → browser opens at `http://localhost:3000`
3. Tracker works offline (`localStorage dsa-tracker-v3`) + syncs to server when you Login
4. To stop: close the black console window (server stops) or press any key

## Create Desktop icon (one-time)

- Right-click `Start DSA Tracker.bat` → **Send to → Desktop (create shortcut)**
- Rename shortcut to `DSA Tracker`
- Right-click shortcut → Properties → **Change Icon** → pick any `.ico`

Or run this once in PowerShell (already done for you):
```powershell
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$HOME\Desktop\DSA Tracker.lnk")
$Shortcut.TargetPath = "C:\Users\rahul\Desktop\dsa-tracker\Start DSA Tracker.bat"
$Shortcut.WorkingDirectory = "C:\Users\rahul\Desktop\dsa-tracker"
$Shortcut.IconLocation = "shell32.dll,14"
$Shortcut.Save()
```

## Offline / Without Node

If you just want to view without server (no Login/sync):
- Open `index.html` directly — but `fetch('data/dsa.json')` may block via `file://` CORS.
- Better: `python -m http.server 8080` in this folder, then open `http://localhost:8080`

## Data

- Progress stored in browser: `localStorage dsa-tracker-v3` (+ server copy at `server/data/progress/*.json`)
- PDFs: `pdfs/` (56 files)
- Export: use download button in app header → saves JSON with notes

## Ports

Default `3000`. Change via `.env` → `PORT=4000` or `set PORT=4000 && node server.js`

## Troubleshooting

- **Port in use**: close other server or change PORT
- **Chrome not found**: falls back to default browser
- **Node not found**: install from https://nodejs.org (LTS 22)
