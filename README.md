# StudyFlow

A Hebrew day planner for students. Enter the class timetable once; after that, tell the app what you need to do ("מחר ללמוד שעתיים סטטיסטיקה ולהתאמן") and it fits each thing into free time around your classes – never on top of something else.

**No AI and no server.** All data is saved in the browser (localStorage) on the person's device. Speech input, if used, is the browser's own speech recognition.

## Screens

| Screen | What it does |
|---|---|
| היום (Today) | "Tell me" box → a review card (what was understood, where it goes, conflicts and alternatives) → nothing is saved until confirmed. The day's timeline, free gaps and progress. |
| לימודים (Studies) | Weekly timetable (import a `.ics` calendar file or add by hand) and courses. Each course page: syllabus/topics, exams and submissions, progress, "find me time". |
| עבודה (Work) | Workplaces with an hourly wage, and shifts (including overnight and weekly repeats). Shifts block time in the schedule; each month shows hours and an estimated gross pay per workplace (overtime 125% after 8 h, 150% after 10 h, plus tips), split into earned so far and still ahead. |
| מטרות אישיות (Personal goals) | Sport and hobbies with a simple target (times/pages/minutes/km, per week or in total). Each goal page: progress, log, "find me time". |
| יומן (Calendar) | The week at a glance. |

## Run locally

```bash
npm run dev     # http://127.0.0.1:4174
npm test        # unit tests (Node 20+, no dependencies)
npm run build   # static site in dist/
```

Windows users without a terminal can double-click `Open StudyFlow Handmade.bat` (needs Node.js). See `HOW TO USE.html` for a non-technical guide.

## Code map (`src/studyflow/`)

| File | Role |
|---|---|
| `tell.mjs` | Rule-based Hebrew parsing of free text into items (day, time or length, course/goal link). |
| `schedule.mjs` | Free time, placement, conflicts, alternatives, "find me time". Classes and planned items are obstacles; a break is kept around them. |
| `propose.mjs` | Builds the review card from parsed items and turns confirmed proposals into saved items. |
| `ics.mjs`, `syllabus.mjs` | Calendar-file import; syllabus text and `.docx` reading (unzipped in the browser). |
| `progress.mjs` | One number per course (topics done) and per goal. |
| `work.mjs` | Shift length and day segments (across midnight), pay estimate, monthly summary. |
| `store.mjs` | Saved state: validation, migration from version 1 (kept as a backup), unreadable data kept aside, demo data. |
| `screens.mjs`, `dialogs.mjs`, `app.mjs` | Screens, small forms, and the controller (routing by `#hash`, changes with undo). |

## Deploying

GitHub Pages deploys on every push to `main` (`.github/workflows/main.yml`), after the tests pass. `vercel.json` and `netlify.toml` build the same `dist/` folder. Each address has its own browser storage, so pick one public address and share only that.
