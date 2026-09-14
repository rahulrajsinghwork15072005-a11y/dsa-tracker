# DSA Tracker QA (headless browser)

Real Chrome drives the running app and clicks everything: checkboxes, selects,
company picker, board drag, palette, knowledge search, LC paste, SRS grading,
dark mode, offline, sprint sessions.

## Prereqs
- Server running at http://localhost:3000 (`npm start` in `../server`, or the launcher)
- Chrome installed (default `C:\Program Files\Google\Chrome\Application\chrome.exe`,
  override with `CHROME_PATH` env)

## Run
```bash
npm install --no-audit --no-fund
npm test            # all four suites (54 checks)
npm run test:core   # picking, companies, board, palette, knowledge, Phase-1 features
npm run test:srs    # SRS grading, due list, Anki export, target checklist
npm run test:craft  # board curves/minimap/import, dark mode, offline PWA
npm run test:sprint # sprint setup, session, keyboard, timeout, auto-ink
```

Suites exit non-zero on any failure. Screenshots land in `shots/`.
