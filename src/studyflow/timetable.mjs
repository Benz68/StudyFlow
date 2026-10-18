import {addDays, weekday, validDate, esc, dateLabel} from './util.mjs';

export function timetableStatus(classes, start) {
  const days = Array.from({length: 7}, (_, i) => addDays(start, i));
  let active = 0, expired = 0, upcoming = 0, cancelled = 0;
  for (const c of classes) {
    const dates = days.filter(d => c.days.includes(weekday(d)));
    const inTerm = dates.filter(d => (!c.from || d >= c.from) && (!c.until || d <= c.until));
    if (inTerm.some(d => !c.skipDates.includes(d))) active++;
    else if (c.until && c.until < start) expired++;
    else if (c.from && c.from > days[6]) upcoming++;
    else if (inTerm.length) cancelled++;
  }
  return {active, expired, upcoming, cancelled};
}

export function timetableNotice(classes, start) {
  if (!classes.length) return '<p class="field-help">עוד אין מערכת שעות. <a href="#studies">להוסיף שיעורים</a></p>';
  const status = timetableStatus(classes, start);
  const reasons = [];
  if (status.expired) reasons.push(`${status.expired} שיעורים שייכים לתקופת לימודים שכבר הסתיימה.`);
  if (status.upcoming) reasons.push(`${status.upcoming} שיעורים מתחילים אחרי השבוע המוצג.`);
  if (status.cancelled) reasons.push(`${status.cancelled} שיעורים בוטלו בשבוע הזה.`);
  if (!reasons.length) return '';
  return `<div class="alerts" role="status"><p>${status.active ? 'חלק ממערכת השעות לא מופיע השבוע.' : 'מערכת השעות שמורה, אבל אין שיעורים פעילים בשבוע הזה.'} ${reasons.join(' ')}</p>
    ${status.expired || status.upcoming ? '<button class="text-button" data-action="semester-dates">לעדכן את תקופת הלימודים לכל השיעורים</button>' : ''}
    <a class="text-button" href="#studies">לעריכת שיעור בודד</a></div>`;
}

export function semesterFields(classes, start) {
  const ends = [...new Set(classes.map(c => c.until || ''))];
  const until = ends.length === 1 && ends[0] >= start ? ends[0] : '';
  return `<form data-form="semester"><p>עדכון של ${classes.length} שיעורים יחד. הימים, השעות והביטולים שכבר סימנת יישמרו.</p>
    <label for="semester-from">מתי מתחילה תקופת הלימודים?</label><input id="semester-from" name="from" type="date" required value="${esc(start)}">
    <label for="semester-until">מתי היא מסתיימת? (לא חובה)</label><input id="semester-until" name="until" type="date" value="${esc(until)}">
    <p class="field-help">ברירת המחדל היא השבוע המוצג, ${esc(dateLabel(start))}. בלי תאריך סיום, השיעורים יחזרו בכל שבוע.</p>
    <p class="form-error" role="alert" data-error></p><button class="primary submit-button" type="submit">לעדכן ולהציג ביומן</button></form>`;
}

export function updateSemester(classes, from, until) {
  if (!validDate(from) || (until && !validDate(until))) throw Error('צריך להזין תאריך לימודים תקין.');
  if (until && until < from) throw Error('תאריך הסיום לא יכול להיות לפני תאריך ההתחלה.');
  return classes.map(c => {
    const updated = {...c, from};
    if (until) updated.until = until;
    else delete updated.until;
    return updated;
  });
}
