// The guided tour: right after the first-time questions (and again from "how does it work?").
// It runs on the sample planner, so every screen has real things to show, and points at one real part
// of the screen at a time with what it does and how to use it. Nothing of the sample is saved.
import {esc} from './util.mjs';

// area: shown only when the person picked that area (or picked nothing). target: the first visible match.
export const TOUR = [
  {route: 'today', target: '.tell', title: 'ספר לי מה יש לך',
    text: 'כותבים במילים שלך מה צריך לעשות, למשל "מחר ללמוד שעתיים בבוקר, ובערב משמרת מ־17 עד 22". לוחצים "לסדר לי", ואני מכניס כל דבר לזמן פנוי, בלי לדרוס שיעורים או משמרות.'},
  {route: 'today', target: '.tell-mic', title: 'או פשוט להגיד',
    text: 'לוחצים על המיקרופון ומדברים, גם עם הפסקות. לוחצים שוב בסוף, והטקסט כבר כתוב.'},
  {route: 'today', target: '.day-picker', title: 'השבוע במבט אחד',
    text: 'לחיצה על יום מראה מה יש בו. נקודה קטנה מסמנת שיש באותו יום משהו שהוספת.'},
  {route: 'today', target: 'section.day', title: 'הלו״ז של היום',
    text: 'השיעורים, המשמרות ומה שהוספת, לפי השעות, עם הזמן הפנוי ביניהם. לחיצה על משהו מאפשרת לסמן שעשית אותו או להזיז אותו.'},
  {area: 'studies', route: 'studies', target: '.timetable', title: 'מערכת השעות',
    text: 'מכניסים אותה פעם אחת: "מקובץ יומן" טוען את מערכת השעות מהאוניברסיטה, או "+ שיעור" ידנית. מכאן היא מופיעה ביומן בכל שבוע.'},
  {area: 'studies', route: 'studies', target: 'main .card-grid > :first-child', title: 'דף לכל קורס',
    text: 'בכל קורס: הנושאים מהסילבוס (טוענים את קובץ הסילבוס והם נכנסים לבד), המבחנים וההגשות, וכמה כבר למדת. "מצא לי זמן" מוצא זמן פנוי ללמוד.'},
  {area: 'work', route: 'work', target: '.jar-card', title: 'כמה הרווחת',
    text: 'הצנצנת מתמלאת בכל פעם שמשמרת נגמרת. רואים כמה נכנס עד היום וכמה צפוי בסוף החודש.'},
  {area: 'work', route: 'work', target: 'main [data-action="week-shifts"]', title: 'משמרות לשבוע',
    text: 'מסמנים באילו ימים עובדים ומאיזו שעה, וכל השבוע נכנס ליומן בבת אחת. אפשר גם לשבוע הבא.'},
  {area: 'work', route: 'work', target: '.shift-row', title: 'כמה יצא?',
    text: 'לחיצה על משמרת מראה את החישוב: שעות, שעות נוספות, הפסקה וטיפים. שם גם עורכים או מוחקים.'},
  {area: 'goals', route: 'goals', target: '.goal-note', title: 'מטרות אישיות',
    text: 'יעד פשוט, כמו 3 אימונים בשבוע. בדף המטרה: "עשיתי" רושם פעם אחת, ו"לשבץ את מה שנשאר" מוצא זמן פנוי לשאר השבוע.'},
  {route: 'calendar', target: '.cal-list, .cal-grid', title: 'היומן',
    text: 'כל השבוע במקום אחד: שיעורים, משמרות, לימודים ומטרות, כל סוג בצבע שלו. לחיצה על משהו מאפשרת להזיז אותו.'},
  {route: 'today', target: '.account-button, .sidebar-account', title: 'החשבון שלך',
    text: 'הכול נשמר בחשבון, ובכל טלפון או מחשב שמתחברים הכול שם. כאן גם מתנתקים, מורידים את המידע או מוחקים את החשבון.'},
  {route: 'today', target: '.topbar [data-action="help"], .sidebar-help', title: 'צריך תזכורת?',
    text: '"איך זה עובד?" מפעיל את ההדרכה הזאת שוב, מתי שרוצים. עכשיו תורך: מתחילים מ"ספר לי".'},
];

export const tourSteps = areas => TOUR.filter(s => !s.area || !areas.length || areas.includes(s.area));

export function tourBubble(step, n, total) {
  const last = n === total - 1;
  return `<div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <div class="tour-count">${n + 1} מתוך ${total}</div>
    <h2 id="tour-title">${esc(step.title)}</h2>
    <p>${esc(step.text)}</p>
    <div class="tour-buttons">
      ${n ? '<button class="text-button" data-action="tour-prev">הקודם</button>' : ''}
      <button class="primary" data-action="tour-next" autofocus>${last ? 'סיום, בוא נתחיל' : 'הבא'}</button>
    </div>
    ${last ? '' : '<button class="text-button tour-skip" data-action="tour-end">לדלג על ההדרכה</button>'}
  </div>`;
}
