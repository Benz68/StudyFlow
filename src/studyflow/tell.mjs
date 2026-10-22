// "Tell me what you need to do": turns a free Hebrew sentence into separate items, with plain rules (no AI).
// "מחר ללמוד שעתיים סטטיסטיקה, לסיים עבודה של שעה וחצי, להתאמן ויש לי בערב ארוחה"
// → four items: two with a length (placed in free time), a gym session, and a dinner at a fixed evening time.
// Anything the rules could not know is flagged in `needs`, so the review card asks instead of guessing silently.
import {localDate, addDays, weekday, toClock, toMin} from './util.mjs';

const DAYS = {'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6};
const DAY_RE = 'ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת';
const MONTHS = {'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12};
const NUMBERS = {'שתים עשרה': 12, 'שתיים עשרה': 12, 'אחת עשרה': 11, 'שלוש': 3, 'ארבע': 4, 'חמש': 5, 'שש': 6, 'שבע': 7, 'שמונה': 8, 'תשע': 9, 'עשר': 10,
  'שלושה': 3, 'ארבעה': 4, 'חמישה': 5, 'שישה': 6, 'שבעה': 7, 'תשעה': 9, 'עשרה': 10, 'אחת': 1, 'שתיים': 2, 'שתים': 2};
// Things that happen at a time of their own rather than being fitted into free time.
const EVENT_WORDS = /(ארוחה|ארוחת|פגישה|פגישת|משמרת|רופא|רופאה|תור |תור$|אירוע|מסיבה|יום הולדת|חתונה|הופעה|הרצאה|שיעור|ראיון|טיסה|נסיעה|משחק|מילואים|עבודה במשמרת)/;
const TASK_WORDS = /(להגיש|הגשה|עבודה|תרגיל|מטלה|לסיים|לכתוב|לסדר|לקנות|לשלם|להתקשר|לשלוח)/;
const STUDY_WORDS = /(ללמוד|לתרגל|לחזור על|לסכם|לקרוא|לפתור|ללמידה|למבחן|לבוחן)/;
const END = '(?=$|[\\s,.?!])';

const normalize = s => ` ${String(s || '').replace(/[־–—]/g, '-').replace(/["״]/g, '"').replace(/\s+/g, ' ').trim()} `;
// Number words become digits only next to hours or lengths, so "פעם אחת" or "מעשר מילים" stay as they are.
function digits(text) {
  const words = Object.keys(NUMBERS).sort((a, b) => b.length - a.length).join('|');
  return text
    .replace(new RegExp(`(\\s(?:ב|מ|עד|ל|בשעה |משעה |עד השעה |בין )?)(${words})(?=\\s(?:שעות|דקות|וחצי|ורבע|בבוקר|בערב|בצהריים|בלילה|עד|ל|ו?עד)|${END})`, 'g'),
      (_, before, w) => before + NUMBERS[w]);
}

// Words that start a new thing to do. People often list them with no comma:
// "ללמוד סטטיסטיקה 3 שעות ללכת לחדר כושר" is two items.
const STARTERS = new Set(['ללמוד', 'לתרגל', 'לחזור', 'לסכם', 'לקרוא', 'לכתוב', 'לסיים', 'להגיש', 'לפתור', 'להכין', 'להתכונן',
  'להתאמן', 'ללכת', 'לרוץ', 'לשחות', 'לרכוב', 'לנגן', 'לצייר', 'לבשל', 'לאפות', 'לקנות', 'לשלם', 'להתקשר', 'לשלוח', 'לסדר',
  'לנקות', 'לכבס', 'לעבוד', 'לפגוש', 'לצאת', 'לטייל', 'לשחק', 'לצפות', 'לראות', 'לבקר', 'לנוח', 'לאסוף', 'להביא', 'לעשות',
  'לתקן', 'לקבוע', 'להזמין', 'לטפל', 'להירשם', 'לארגן', 'לעדכן', 'לבדוק', 'לחפש', 'לנסוע', 'לטוס',
  'פגישה', 'פגישת', 'משמרת', 'אימון', 'ריצה', 'ארוחה', 'ארוחת', 'תור', 'מבחן', 'בוחן', 'הרצאה', 'שיעור', 'מילואים', 'יום הולדת']);
const startsSomething = word => STARTERS.has(word.replace(/^ו(?=\S{3})/, ''));

function splitByStarters(part) {
  const words = part.split(' '), parts = [];
  // A new item starts only after the previous one said something of its own,
  // so "אימון ריצה" or "לצאת לרוץ" stay one item.
  let current = [], hasStarter = false, content = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i], pair = `${word} ${words[i + 1] || ''}`;
    const starts = startsSomething(word) || STARTERS.has(pair);
    if (starts && hasStarter && content > 0) { parts.push(current.join(' ')); current = []; content = 0; }
    if (starts) hasStarter = true; else if (hasStarter) content++;
    current.push(word);
  }
  if (current.length) parts.push(current.join(' '));
  return parts;
}

// Splits "X, Y ויש לי Z" into parts, without breaking "שעה וחצי" or "מ10 ועד 12".
export function splitParts(sentence) {
  return normalize(sentence)
    .replace(/\s+(?:ואז|אחר כך|אחרי זה|וגם)\s+/g, ' | ')
    .replace(/\s+ו(?=(?:ל|יש|אחר|גם|אני|צריך|רוצה|בערב|בבוקר|בצהריים|מחר)\S*)/g, ' | ')
    .split(/[|,;\n.]+/).map(p => p.trim()).filter(p => p.length > 1)
    .flatMap(splitByStarters);
}

function toTime(hour, minutes, extra, part) {
  let h = Number(hour), m = Number(minutes || 0);
  if (/חצי/.test(extra || '')) m = 30; else if (/רבע/.test(extra || '')) m = 15;
  if (h > 23 || m > 59) return null;
  if (h < 12 && (part === 'evening' || part === 'noon' || part === 'night' || (!part && h >= 1 && h <= 7))) h += 12;
  if (part === 'morning' && h === 12) h = 0;
  return h * 60 + m;
}

const DEFAULT_START = {morning: 9 * 60, noon: 14 * 60, evening: 19 * 60, night: 21 * 60};

export function parsePart(raw, context, now) {
  const today = localDate(now);
  let text = digits(` ${raw} `);
  const out = {needs: []};
  const take = (re, fn) => { text = text.replace(re, (...m) => { fn(m); return ' '; }); };

  // "ארוחת ערב" is the name of the thing, but it also tells the part of the day.
  const meal = /\sארוחת\s+(בוקר|צהריים|ערב)(?=\s)/.exec(text);
  if (meal) out.part = {'בוקר': 'morning', 'צהריים': 'noon', 'ערב': 'evening'}[meal[1]];
  take(/(?<!ארוחת)\s(?:ב?בוקר|לפני הצהריים)(?=\s)/g, () => { out.part = 'morning'; });
  take(/(?<!ארוחת)\s(?:בצהריים|צהריים|אחר הצהריים|אחה"צ|אחהצ)(?=\s)/g, () => { out.part = 'noon'; });
  take(/(?<!ארוחת)\s(?:ב?ערב)(?=\s)/g, () => { out.part = 'evening'; });
  take(/\s(?:ב?לילה)(?=\s)/g, () => { out.part = 'night'; });

  // A range of days: "מראשון עד רביעי", "מיום ראשון ועד יום רביעי".
  take(new RegExp(`\\sמ(?:יום\\s+)?(${DAY_RE})\\s+ו?עד\\s+(?:יום\\s+)?(${DAY_RE})(\\s+(?:בשבוע\\s+)?הבא)?(?=\\s)`, 'g'), m => {
    const nextWeek = !!m[3];
    let start = nextDay(today, DAYS[m[1]], nextWeek);
    let end = nextDay(start, DAYS[m[2]], false);
    out.dates = []; for (let d = start; d <= end && out.dates.length < 14; d = addDays(d, 1)) out.dates.push(d);
    out.allDay = true;
  });
  // "עד יום חמישי" / "עד מחר" is a deadline: we look for time from today until then.
  take(new RegExp(`\\sעד\\s+(?:ל|ה)?(?:(?:יום\\s+)?(${DAY_RE})|(מחרתיים|מחר))(?=\\s)`, 'g'), m => {
    out.deadline = m[1] ? nextDay(today, DAYS[m[1]], false) : addDays(today, m[2] === 'מחר' ? 1 : 2);
  });
  const nextWeek = /\s(?:ב?שבוע הבא)(?=\s)/.test(text);
  take(/\s(?:ב?שבוע הבא)(?=\s)/g, () => {});
  take(/\s(?:ל|ב)?(מחרתיים|מחר|היום)(?=\s)/g, m => { out.date = addDays(today, {'היום': 0, 'מחר': 1, 'מחרתיים': 2}[m[1]]); });
  take(new RegExp(`\\s(?:ב?יום\\s+|ב)(${DAY_RE})(\\s+(?:הבא|הקרוב|הזה))?(?=\\s)`, 'g'), m => { out.date = nextDay(today, DAYS[m[1]], nextWeek || /הבא/.test(m[2] || '')); });
  take(/\s(?:ב-?|ה-?)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/g, m => { out.date = dayMonth(today, Number(m[1]), Number(m[2]), m[3]); });
  take(new RegExp(`\\s(?:ב-?|ה-?)?(\\d{1,2})\\s*(?:ב|ל)-?(${Object.keys(MONTHS).join('|')})(?=\\s)`, 'g'), m => { out.date = dayMonth(today, Number(m[1]), MONTHS[m[2]]); });
  if (!out.date && nextWeek && !out.dates) out.date = addDays(today, 7 - weekday(today));
  if (/\sכל היום(?=\s)/.test(text)) { out.allDay = true; take(/\sכל היום(?=\s)/g, () => {}); }

  // Length: "שעתיים", "שעה וחצי", "3 שעות", "45 דקות", "חצי שעה".
  take(/\s(?:במשך\s+|של\s+|ל)?(?:(\d+(?:\.\d)?)\s+שעות(\s+וחצי)?|שעתיים(\s+וחצי)?|שעה(\s+וחצי|\s+ורבע)?(?!\s*-?\d)|חצי שעה|רבע שעה|(\d+)\s+דק(?:ות|')?)(?=\s)/g, m => {
    const said = m[0];
    if (m[1]) out.minutes = Math.round(Number(m[1]) * 60) + (m[2] ? 30 : 0);
    else if (said.includes('שעתיים')) out.minutes = 120 + (m[3] ? 30 : 0);
    else if (said.includes('חצי שעה')) out.minutes = 30;
    else if (said.includes('רבע שעה')) out.minutes = 15;
    else if (m[5]) out.minutes = Number(m[5]);
    else out.minutes = 60 + (/וחצי/.test(m[4] || '') ? 30 : /ורבע/.test(m[4] || '') ? 15 : 0);
  });

  // Hours. Only with a time word or a clock, so "פרקים 3 עד 5" is not read as 15:00–17:00.
  const T = '(\\d{1,2})(?::(\\d{2}))?(\\s+ו?(?:חצי|רבע))?';
  take(new RegExp(`\\s(?:בין\\s+|מהשעה\\s+|משעה\\s+|בשעה\\s+|מ-?|ב-?)${T}\\s*(?:-|עד|ועד|ל)\\s*(?:השעה\\s*)?-?${T}(?=\\s)`, 'g'), m => {
    const s = toTime(m[1], m[2], m[3], out.part); let e = toTime(m[4], m[5], m[6], out.part);
    if (s === null || e === null) return;
    if (e <= s && e + 720 < 1440 && e + 720 > s) e += 720;
    // Still earlier than the start ("מ22 עד 6"): it ends the next morning, at the hour as said.
    if (e <= s) e = toTime(m[4], m[5], m[6], 'morning');
    if (e !== null && e !== s) { out.start = s; out.end = e; }
  });
  take(new RegExp(`\\s(\\d{1,2}):(\\d{2})\\s*-\\s*(\\d{1,2}):(\\d{2})(?=\\s)`, 'g'), m => { out.start = Number(m[1]) * 60 + Number(m[2]); out.end = Number(m[3]) * 60 + Number(m[4]); });
  if (out.start === undefined) take(new RegExp(`\\s(?:בשעה\\s+|בסביבות\\s+|ב-?)${T}(?=\\s)|\\s(\\d{1,2}):(\\d{2})(?=\\s)`, 'g'), m => {
    const s = m[4] ? Number(m[4]) * 60 + Number(m[5]) : toTime(m[1], m[2], m[3], out.part);
    if (Number.isFinite(s) && s < 1440) out.start = s;
  });

  // The words that are left are the name, without filler.
  let title = text.replace(/\s(?:אני|צריך|צריכה|רוצה|חייב|חייבת|יש לי|יש|לי|גם|אז|בבקשה|תוסיף|תכניס|לשים)(?=\s)/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(?:ו|ש|של|עם|ב|ל|עד|מ)\s+|\s+(?:של|עם|ב|ל|עד|מ|ו|ה)$/g, '').trim()
    .replace(/^[-,.\s]+|[-,.\s]+$/g, '');

  // Link to a course or a personal goal by its name ("לסטטיסטיקה" matches "סטטיסטיקה").
  const plain = ` ${title} `;
  const jobs = context.jobs || [];
  const job = jobs.find(j => nameIn(plain, j.name));
  const course = !job && context.courses.find(c => nameIn(plain, c.name));
  const goal = !job && !course && context.goals.find(g => nameIn(plain, g.title));
  // A shift: the workplace was named, or "משמרת" was said and there is a workplace to put it under.
  if (job || (/משמרת|משמרות/.test(plain) && jobs.length)) {
    out.kind = 'shift'; out.jobId = (job || jobs[0]).id;
    if (!job && jobs.length > 1) out.needs.push('job');
    title = `משמרת ב${(job || jobs[0]).name}`;
  } else if (course) {
    out.courseId = course.id; out.kind = 'study';
    title = STUDY_WORDS.test(plain) ? `${plain.match(STUDY_WORDS)[1]} ${course.name}` : title;
  } else if (goal) { out.goalId = goal.id; out.kind = 'goal'; }
  out.title = title || raw.trim();
  out.kind ||= EVENT_WORDS.test(plain) ? 'event' : STUDY_WORDS.test(plain) ? 'study' : TASK_WORDS.test(plain) ? 'task' : 'other';
  // "מ22 עד 6": only a shift may run past midnight; anything else stops at the end of the day.
  if (out.start !== undefined && out.end !== undefined && out.end <= out.start) {
    if (out.kind === 'shift') out.overnight = true;
    else { out.end = Math.min(out.start + 60, 1439); out.needs.push('time'); }
  }

  // Fixed (has its own time) or flexible (we find time for it).
  if (out.allDay && out.kind !== 'shift') { out.fixed = true; delete out.start; delete out.end; }
  else if (out.start !== undefined) {
    out.fixed = true;
    out.end ??= out.start + (out.minutes || 60);
    if (out.end >= 1440) { if (out.kind === 'shift') { out.end -= 1440; out.overnight = true; } else out.end = 1439; }
    out.minutes = out.overnight ? out.end + 1440 - out.start : out.end - out.start;
  } else if (out.kind === 'shift' || (out.kind === 'event' && out.part)) {
    // A shift or an event without hours gets a likely time, flagged so the person checks it.
    out.fixed = true; out.allDay = false;
    out.start = DEFAULT_START[out.part] ?? (out.kind === 'shift' ? 16 * 60 : 19 * 60);
    out.minutes ??= out.kind === 'shift' ? 360 : 90;
    out.end = Math.min(out.start + out.minutes, 1439);
    out.needs.push('time');
  } else {
    out.fixed = false;
    if (out.minutes === undefined) { out.minutes = goal?.sessionMinutes || 60; if (!goal) out.needs.push('minutes'); }
    if (out.kind === 'event') out.needs.push('time');
  }
  return out;
}

// Matches the full name, or a distinctive word of it: "מיקרו" finds "מבוא למיקרו".
const COMMON = new Set(['מבוא', 'יסודות', 'קורס', 'שיעור', 'סדנה', 'סמינר', 'תרגול', 'הרצאה', 'מתקדם', 'מתקדמת', 'כללי', 'כללית']);
function nameIn(text, name) {
  const escape = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = pattern => new RegExp(`(?:^|\\s)(?:ו?[לבהמש]?)?${pattern}(?=\\s|$)`).test(text);
  const words = name.trim().split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return false;
  if (found(words.map(escape).join('\\s+'))) return true;
  return words.map(w => w.replace(/^[לבהו](?=\S{3})/, '')).filter(w => w.length >= 3 && !COMMON.has(w) && !/^[א-ת]׳?$/.test(w)).some(w => found(escape(w)));
}
function nextDay(from, day, forceNextWeek) {
  let d = addDays(from, (day - weekday(from) + 7) % 7);
  if (forceNextWeek && d < addDays(from, 7 - weekday(from))) d = addDays(d, 7);
  return d;
}
function dayMonth(today, day, month, year) {
  const y = year ? (String(year).length === 2 ? 2000 + Number(year) : Number(year)) : Number(today.slice(0, 4));
  const pad = n => String(n).padStart(2, '0');
  let d = `${y}-${pad(month)}-${pad(day)}`;
  if (!year && d < today) d = `${y + 1}-${pad(month)}-${pad(day)}`;
  return d;
}

// Main entry: a day said once ("מחר ...") carries to the following parts until another day is said.
export function parseTell(sentence, context = {courses: [], goals: []}, now = new Date()) {
  const today = localDate(now);
  let carried = today, daySaid = false;
  const items = [];
  for (const raw of splitParts(sentence)) {
    const p = parsePart(raw, context, now);
    if (p.date) { carried = p.date; daySaid = true; }
    // Nothing is assumed silently: no day said (here or earlier in the sentence) → ask which day;
    // nothing said about when → ask whether to find a time, a part of the day, or a set hour.
    const needs = [...p.needs];
    if (!daySaid && !p.dates && !p.deadline) needs.push('day');
    if (!p.fixed && !p.allDay && !p.part && !p.deadline && !needs.includes('time')) needs.push('when');
    const base = {title: p.title.slice(0, 120), kind: p.kind, fixed: p.fixed, needs,
      ...(p.courseId ? {courseId: p.courseId} : {}), ...(p.goalId ? {goalId: p.goalId} : {}), ...(p.jobId ? {jobId: p.jobId} : {}), ...(p.part ? {part: p.part} : {})};
    if (p.allDay) for (const date of p.dates || [p.date || carried]) items.push({...base, date, allDay: true});
    else items.push({...base, date: p.date || (p.deadline && !p.fixed ? today : carried), minutes: p.minutes,
      ...(p.deadline && !p.fixed ? {deadline: p.deadline} : {}),
      ...(p.fixed ? {start: toClock(p.start), end: toClock(p.end), ...(p.overnight ? {overnight: true} : {})} : {})});
  }
  return items.filter(i => i.title && (i.allDay || toMin(i.start ?? '00:00') !== null));
}
