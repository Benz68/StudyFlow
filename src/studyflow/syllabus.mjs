// Turns a syllabus into a list of topics and dated assignments, with plain rules (no AI).
// Word files (.docx) are read right in the browser: a .docx is a zip with the text in word/document.xml.
import {localDate, validDate} from './util.mjs';

export async function fileText(file) {
  if (/\.docx$/i.test(file.name)) return docxText(await file.arrayBuffer());
  if (/\.(txt|md|csv)$/i.test(file.name) || file.type.startsWith('text/')) return file.text();
  throw new Error('אפשר לטעון קובץ Word (.docx) או טקסט (.txt). מ־PDF אפשר להעתיק את הטקסט ולהדביק אותו כאן.');
}

export async function docxText(buffer) {
  const xml = await unzipEntry(new Uint8Array(buffer), 'word/document.xml');
  return documentXmlText(xml);
}

// One line per paragraph; table cells are separated so each row stays readable.
export function documentXmlText(xml) {
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<\/w:tc>/g, ' · ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map(l => l.replace(/(?:\s*·\s*)+$/, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

async function unzipEntry(bytes, wanted) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is within the last 64KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('הקובץ לא נראה כמו קובץ Word תקין.');
  let p = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true), decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true), extraLength = view.getUint16(p + 30, true), commentLength = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true), name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return decoder.decode(data);
      if (method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('הדפדפן לא יכול לפתוח את הקובץ. אפשר להעתיק את הטקסט ולהדביק.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('לא נמצא טקסט בקובץ.');
}

const DATE = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/;
const ASSIGNMENT = /(מבחן|בוחן|מועד|הגשה|להגיש|עבודה|תרגיל|מטלה|פרויקט|exam|quiz|due|assignment|homework)/i;
const NOISE = /^(?:שבוע|week|שיעור|lesson|נושא|topic|תאריך|date|#|\d+)\s*[:.)-]?\s*$/i;
// Course details and headings that every syllabus has, but that are not topics to learn.
const DETAILS = /^(?:סילבוס|syllabus|שם הקורס|מספר הקורס|מס['׳]? קורס|קוד קורס|מרצה|מרצים|מתרגל|מתרגלת|מתרגלים|שעות קבלה|דוא["״]?ל|אימייל|e-?mail|טלפון|מיקום|חדר|שנה["״]?ל|שנת הלימודים|סמסטר|נקודות זכות|נ["״]?ז|היקף|מטרות|מטרת|תיאור הקורס|דרישות|חובות|הרכב הציון|ציון|נוכחות|ביבליוגרפיה|קריאה|ספרות|רשימת קריאה|נושאי הקורס|תוכנית הקורס|לוח זמנים|מבנה הקורס|מועדי הגשה|מטלות הקורס|הערות|instructor|office hours|grading|reading|prerequisites)(?=$|[\s:.,()\-–])/i;

// Splits pasted or loaded text into topics and assignments with a date (exam, submission).
export function readSyllabus(text, {today = localDate()} = {}) {
  const topics = [], deadlines = [], seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•▪◦]|\(?\d{1,2}[.)]|שבוע\s*\d+\s*[:.-]?|week\s*\d+\s*[:.-]?|שיעור\s*\d+\s*[:.-]?)\s*/i, '').replace(/\s*·\s*/g, ' · ').trim();
    // Long paragraphs are descriptions (goals of the course, grading), not topics.
    if (!line || line.length < 2 || line.length > 140 || NOISE.test(line) || /^[\d\s./:-]+$/.test(raw.trim())) continue;
    const date = DATE.exec(line);
    if (date && ASSIGNMENT.test(line)) {
      const year = date[3] ? (date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3])) : Number(today.slice(0, 4));
      let iso = `${year}-${String(date[2]).padStart(2, '0')}-${String(date[1]).padStart(2, '0')}`;
      if (!date[3] && iso < today) iso = `${year + 1}${iso.slice(4)}`;
      const title = line.replace(DATE, '').replace(/\s*·\s*/g, ' ').replace(/[-–:,]+\s*$/, '').replace(/^\s*[-–:,]+/, '').trim();
      // A date that does not exist (31.11) is not turned into another day; the line stays a topic to fix by hand.
      if (validDate(iso)) { deadlines.push({title: title.slice(0, 120) || 'מועד', date: iso}); continue; }
    }
    // Headings and details, grade weights ("מבחן 50%"), and book references ("לוי, נ. (2024).") are not topics.
    if (DETAILS.test(line) || /^(?:מטלות|מועדים|הגשות|מבחנים)(?=$|[\s:])/.test(line) || /\d\s*%/.test(line) || /\((?:19|20)\d{2}\)/.test(line)) continue;
    const title = line.replace(/\s*·\s*$/, '').replace(DATE, '').replace(/\s*·\s*/g, ' – ').replace(/^[-–:\s]+|[-–:\s]+$/g, '').slice(0, 160);
    if (title.length >= 2 && !seen.has(title)) { seen.add(title); topics.push(title); }
  }
  return {topics: topics.slice(0, 200), deadlines: deadlines.slice(0, 50)};
}
