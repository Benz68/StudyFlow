// Understands a spoken Hebrew sentence well enough to fill the add form, with simple rules (no AI).
// "שיעור סטטיסטיקה ביום שני מעשר עד שתים עשרה כל שבוע" → title, date, start, end, weekly.
// "לתרגל למבחן שעתיים עד יום חמישי" → title, minutes, deadline.

const DAYS = {'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6};
const MONTHS = {'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12};
const NUMBERS = {
 'שתים עשרה': 12, 'שתיים עשרה': 12, 'שנים עשר': 12, 'שניים עשר': 12, 'אחת עשרה': 11, 'אחד עשר': 11,
 'שלושה': 3, 'ארבעה': 4, 'חמישה': 5, 'שישה': 6, 'שבעה': 7, 'תשעה': 9, 'עשרה': 10,
 'אחת': 1, 'אחד': 1, 'שתיים': 2, 'שתים': 2, 'שלוש': 3, 'ארבע': 4, 'חמש': 5, 'שש': 6, 'שבע': 7, 'שמונה': 8, 'תשע': 9, 'עשר': 10
};
const END = '(?=$|[\\s,.?!])';
const START = '(?:^|(?<=[\\s,.]))';

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const nextWeekday = (today, day) => addDays(today, (day - today.getDay() + 7) % 7);

function digitsForWords(text) {
 const words = Object.keys(NUMBERS).sort((a, b) => b.length - a.length).join('|');
 return text.replace(new RegExp(`${START}([ומבלה]{0,3})(${words})${END}`, 'g'), (_, prefix, word) => prefix + NUMBERS[word]);
}

// Hours said without "בבוקר"/"בערב": 1–7 almost always mean the afternoon for a student's day.
function toTime(hour, minutes, extra, part) {
 let h = Number(hour), m = Number(minutes || 0);
 if (extra?.includes('חצי')) m = 30; else if (extra?.includes('רבע')) m = 15;
 if (h > 23 || m > 59) return null;
 if (h < 12 && (part === 'pm' || (!part && h >= 1 && h <= 7))) h += 12;
 if (part === 'am' && h === 12) h = 0;
 return h * 60 + m;
}
const asClock = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export function parseSpeech(sentence, now = new Date()) {
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
 let text = ` ${digitsForWords(String(sentence || '').replace(/[־–—]/g, '-').replace(/\s+/g, ' ').trim())} `;
 const out = {title: '', date: '', start: '', end: '', weekly: false, minutes: 0, deadline: ''};
 const take = (regex, handle) => { text = text.replace(regex, (...match) => { handle(match); return ' '; }); };

 // Part of day, used to place hours.
 let part = '';
 take(/(?:^|\s)(?:ב?בוקר|לפני הצהריים)(?=\s|$|[,.])/g, () => { part = 'am'; });
 take(/(?:^|\s)(?:אחר הצהריים|אחה"צ|אחהצ|בצהריים|ב?ערב|ב?לילה)(?=\s|$|[,.])/g, () => { part = 'pm'; });

 // Repeats every week ("כל שבוע", "כל יום שני").
 take(/(?:^|\s)ו?ב?כל (?:יום )?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=\s|$|[,.])/g, m => { out.weekly = true; out.date = iso(nextWeekday(today, DAYS[m[1]])); });
 take(/(?:^|\s)(?:ו?ב?כל שבוע|פעם בשבוע|שבועי(?:ת)?)(?=\s|$|[,.])/g, () => { out.weekly = true; });
 take(/(?:^|\s)(?:ב?שבוע הבא)(?=\s|$|[,.])/g, () => {});

 // Dates: "15.10", "15/10", "15 באוקטובר", "היום", "מחר", "ביום שני", with "עד" meaning a deadline.
 const setDate = (value, until) => { if (until) out.deadline = value; else if (!out.date) out.date = value; };
 take(/(?:^|\s)(עד\s+)?(?:ה?ב?)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$|[,.])/g, m => {
  const year = m[4] ? (m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4])) : today.getFullYear();
  let d = new Date(year, Number(m[3]) - 1, Number(m[2]), 12);
  if (!m[4] && d < today) d = new Date(year + 1, Number(m[3]) - 1, Number(m[2]), 12);
  if (d.getDate() === Number(m[2])) setDate(iso(d), m[1]);
 });
 take(new RegExp(`(?:^|\\s)(עד\\s+)?(?:ה?ב?-?)?(\\d{1,2})\\s*(?:ב|ל)?-?(${Object.keys(MONTHS).join('|')})${END}`, 'g'), m => {
  let d = new Date(today.getFullYear(), MONTHS[m[3]] - 1, Number(m[2]), 12);
  if (d < today) d = new Date(today.getFullYear() + 1, MONTHS[m[3]] - 1, Number(m[2]), 12);
  setDate(iso(d), m[1]);
 });
 take(/(?:^|\s)(עד\s+)?(?:ל?)(מחרתיים|מחר|היום)(?=\s|$|[,.])/g, m => setDate(iso(addDays(today, {'היום': 0, 'מחר': 1, 'מחרתיים': 2}[m[2]])), m[1]));
 take(/(?:^|\s)(עד\s+)?(?:ב?יום\s+|ב)(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(\s+(?:הבא|הקרוב|הזה))?(?=\s|$|[,.])/g, m => {
  // "יום שני הבא" said on a Monday means next week's Monday.
  let day = nextWeekday(today, DAYS[m[2]]);
  if (m[3]?.includes('הבא') && iso(day) === iso(today)) day = addDays(day, 7);
  setDate(iso(day), m[1]);
 });

 // How long it takes ("שעתיים", "שעה וחצי", "45 דקות").
 take(/(?:^|\s)(?:במשך\s+)?(?:(\d+)\s+שעות(\s+וחצי)?|שעתיים(\s+וחצי)?|שעה(\s+וחצי)|(?<!ב)שעה(?!\s*-?\d)|חצי שעה|רבע שעה|(\d+)\s+דקות)(?=\s|$|[,.])/g, m => {
  const said = m[0].trim();
  if (m[1]) out.minutes = Number(m[1]) * 60 + (m[2] ? 30 : 0);
  else if (said.includes('שעתיים')) out.minutes = 120 + (m[3] ? 30 : 0);
  else if (said.includes('חצי שעה')) out.minutes = 30;
  else if (said.includes('רבע שעה')) out.minutes = 15;
  else if (m[5]) out.minutes = Number(m[5]);
  else out.minutes = 60 + (m[4] ? 30 : 0);
 });

 // Hours: a range ("מ10 עד 12", "בין 2 ל4", "10:00 עד 12:00") or one time ("בשעה 5", "ב17:30").
 const T = '(\\d{1,2})(?::(\\d{2}))?(\\s+ו?(?:חצי|רבע))?';
 take(new RegExp(`(?:^|\\s)(?:בין|מהשעה|משעה|בשעה|מ|ב)?\\s*-?\\s*${T}\\s*(?:-|עד|ועד|ל)\\s*(?:השעה\\s*|שעה\\s*)?-?\\s*${T}${END}`, 'g'), m => {
  const start = toTime(m[1], m[2], m[3], part);
  let end = toTime(m[4], m[5], m[6], part);
  if (start === null || end === null) return;
  if (end <= start && end + 720 < 1440 && end + 720 > start) end += 720;
  out.start = asClock(start); out.end = asClock(end);
 });
 if (!out.start) take(new RegExp(`(?:^|\\s)(?:בשעה|בסביבות|מהשעה|משעה|ב|מ)\\s*-?\\s*${T}${END}`, 'g'), m => {
  const start = toTime(m[1], m[2], m[3], part);
  if (start !== null && !out.start) out.start = asClock(start);
 });
 // An end time said separately: "בשעה 2 מתמטיקה עד 4".
 if (out.start && !out.end) take(new RegExp(`(?:^|\\s)(?:עד|ועד)\\s*(?:השעה\\s*|שעה\\s*)?-?\\s*${T}${END}`, 'g'), m => {
  let end = toTime(m[1], m[2], m[3], part);
  const start = toMinutes(out.start);
  if (end === null || out.end) return;
  if (end <= start && end + 720 < 1440 && end + 720 > start) end += 720;
  if (end > start) out.end = asClock(end);
 });
 if (out.start && !out.end) out.end = asClock(Math.min(toMinutes(out.start) + (out.minutes || 60), 23 * 60 + 59));
 if (out.start && out.end && !out.minutes) out.minutes = Math.max(5, toMinutes(out.end) - toMinutes(out.start));

 // What's left is the name, minus filler like "יש לי" or "אני צריך".
 out.title = text
  .replace(/^\s*(?:אז\s+)?(?:יש לי|אני צריך|אני צריכה|צריך|צריכה|תוסיף|תוסיפי|להוסיף|תרשום|תרשמי|לרשום)\s+/, ' ')
  .replace(/\s+/g, ' ').trim()
  .replace(/^(?:ו|ב|ביום|עד|מ|של|גם|ש)\s+|\s+(?:ו|ב|ביום|עד|מ|של|גם|ו?ב?שעה|ו?גם)$/g, '')
  .replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
 return out;
}
const toMinutes = clock => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
