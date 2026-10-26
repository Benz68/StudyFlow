// Small forms that open over the screen. Bigger areas (a course, a goal) are full pages instead.
import {esc, icon, duration, DAY_SHORT, DAY_NAMES, fullDayLabel, localDate, timeSelect, addDays, dayLabel, dateLabel, PALETTE, soft, validDate} from './util.mjs';
import {payLines, money2, money, monthSummary} from './work.mjs';
import {sheetTop} from './screens.mjs';
import {UNITS} from './progress.mjs';
import {GOOGLE_SIGN_IN} from './config.mjs';

const error = '<p class="form-error" role="alert" data-error></p>';
const submit = label => `${error}<button class="primary submit-button" type="submit">${label}</button>`;
const dayPicker = (selected = []) => `<fieldset class="off-days"><legend>באילו ימים?</legend>${DAY_SHORT.map((d, i) => `<label><input type="checkbox" name="days" value="${i}" ${selected.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</fieldset>`;
const chips = (name, items, value) => `<div class="choice-chips">${items.map(([v, t]) => `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;

export function classForm(state, c = {}, courseId = '') {
  const course = state.courses.find(x => x.id === (c.courseId || courseId));
  return `${sheetTop(c.id ? 'עריכת שיעור' : 'שיעור חדש', 'מערכת השעות')}
  <form data-form="class" data-id="${esc(c.id || '')}">
    <label for="class-title">שם הקורס</label>
    <input id="class-title" name="title" list="course-names" maxlength="120" required autofocus value="${esc(c.title || course?.name || '')}" placeholder="למשל, סטטיסטיקה א׳">
    <datalist id="course-names">${state.courses.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
    <small class="field-help">אם עוד אין קורס בשם הזה, הוא ייווצר לבד.</small>
    ${dayPicker(c.days || [])}
    <div class="form-row"><div><label for="class-start">משעה</label>${timeSelect('id="class-start" name="start"', c.start || '10:00', {from: 360})}</div>
    <div><label for="class-end">עד שעה</label>${timeSelect('id="class-end" name="end"', c.end || '12:00', {from: 360})}</div></div>
    <label for="class-location">איפה? (לא חובה)</label><input id="class-location" name="location" maxlength="80" value="${esc(c.location || '')}" placeholder="בניין, חדר או זום">
    <details class="advanced"${c.until || c.from ? ' open' : ''}><summary>מתי השיעור מופיע ביומן?</summary>
      <label for="class-from">תאריך תחילת הלימודים (לא חובה)</label><input id="class-from" name="from" type="date" value="${c.from || ''}">
      <label for="class-until">השיעור מפסיק אחרי (לא חובה)</label><input id="class-until" name="until" type="date" value="${c.until || ''}"></details>
    <small class="field-help">השיעור יופיע ביומן בכל יום שסימנת, בתוך תקופת הלימודים. בלי תאריכים הוא יחזור בכל שבוע.</small>
    ${submit(c.id ? 'לשמור' : 'להוסיף למערכת')}
  </form>
  ${c.id ? `<button class="text-button muted" data-action="delete-class" data-id="${esc(c.id)}">${icon('trash')} למחוק את השיעור</button>` : ''}`;
}

export function icsPreview(parsed) {
  const rows = parsed.classes.map((c, i) => `<label class="pick-row"><input type="checkbox" name="pick" value="c${i}" checked><span><b>${esc(c.title)}</b> · ${c.days.map(d => DAY_NAMES[d]).join(', ')} · <bdi dir="ltr">${c.start}–${c.end}</bdi>${c.location ? ` · ${esc(c.location)}` : ''}</span></label>`).join('');
  const once = parsed.once.slice(0, 50).map((o, i) => `<label class="pick-row"><input type="checkbox" name="pick" value="o${i}"><span><b>${esc(o.title)}</b> · ${esc(fullDayLabel(o.date))} · <bdi dir="ltr">${o.start}–${o.end}</bdi></span></label>`).join('');
  return `${sheetTop('מה מצאתי בקובץ', 'ייבוא מערכת שעות')}
  <form data-form="ics">
    ${rows ? `<p class="field-help">שיעורים שחוזרים כל שבוע. מורידים סימון ממה שלא שייך:</p><div class="pick-list">${rows}</div>` : '<p>לא מצאתי שיעורים שחוזרים כל שבוע.</p>'}
    ${once ? `<details class="advanced"><summary>אירועים חד־פעמיים (${parsed.once.length})</summary><div class="pick-list">${once}</div></details>` : ''}
    <label class="repeat-option"><input type="checkbox" name="courses" checked> ליצור קורס לכל שם שיעור</label>
    ${submit('להכניס למערכת השעות')}
  </form>`;
}

export function courseForm(c = {}) {
  return `${sheetTop(c.id ? 'עריכת קורס' : 'קורס חדש', 'לימודים')}
  <form data-form="course" data-id="${esc(c.id || '')}">
    <label for="course-name">שם הקורס</label><input id="course-name" name="name" maxlength="120" required autofocus value="${esc(c.name || '')}">
    <label for="course-exam">מתי המבחן? (לא חובה)</label><input id="course-exam" name="examDate" type="date" value="${c.examDate || ''}">
    ${submit(c.id ? 'לשמור' : 'להוסיף קורס')}
  </form>
  ${c.id ? `<button class="text-button muted" data-action="delete-course" data-id="${esc(c.id)}">${icon('trash')} למחוק את הקורס</button>` : ''}`;
}

export function topicsForm(c) {
  return `${sheetTop('סילבוס ונושאים', esc(c.name))}
  <form data-form="topics" data-id="${esc(c.id)}">
    <p class="field-help">טוענים קובץ Word או טקסט, או מדביקים את רשימת הנושאים. כל שורה היא נושא. שורות עם מבחן או הגשה ותאריך יתווספו למבחנים והגשות.</p>
    <label class="text-button import-label">${icon('file')} לטעון קובץ סילבוס<input type="file" data-syllabus accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label>
    <label for="topics-text">הנושאים (אפשר לערוך לפני השמירה)</label>
    <textarea id="topics-text" name="text" rows="10" maxlength="100000" placeholder="מבוא והסתברות&#10;משתנים מקריים&#10;מבחן אמצע 12.11"></textarea>
    <div data-syllabus-preview class="field-help" aria-live="polite"></div>
    ${submit('להוסיף לקורס')}
  </form>`;
}

export function goalForm(g = {}) {
  return `${sheetTop(g.id ? 'עריכת מטרה' : 'מטרה חדשה', 'ספורט ותחביבים')}
  <form data-form="goal" data-id="${esc(g.id || '')}">
    <label for="goal-title">מה?</label><input id="goal-title" name="title" maxlength="120" required autofocus value="${esc(g.title || '')}" placeholder="חדר כושר, ריצה, גיטרה, קריאה">
    <fieldset><legend>סוג</legend>${chips('type', [['sport', 'ספורט'], ['hobby', 'תחביב']], g.type || 'sport')}</fieldset>
    <fieldset><legend>מה סופרים?</legend>${chips('unit', Object.entries(UNITS).map(([k, u]) => [k, k === 'times' ? 'פעמים' : u.label]), g.unit || 'times')}</fieldset>
    <div class="form-row"><div><label for="goal-target">יעד</label><input id="goal-target" name="target" type="number" min="1" max="100000" step="any" required value="${g.unit === 'minutes' ? g.target / 60 : g.target || 3}"><small class="field-help" data-unit-help>${g.unit === 'minutes' ? 'בשעות' : ''}</small></div>
    <div><label for="goal-noun">איך קוראים לזה? (לא חובה)</label><input id="goal-noun" name="noun" maxlength="30" value="${esc(g.noun || '')}" placeholder="אימונים, ריצות, תרגולים"></div></div>
    <fieldset><legend>בכל שבוע או בסך הכול?</legend>${chips('period', [['week', 'בכל שבוע'], ['total', 'בסך הכול']], g.period || 'week')}</fieldset>
    <label for="goal-session">כמה זמן לוקח כל פעם?</label>
    <select id="goal-session" name="sessionMinutes">${[15, 30, 45, 60, 90, 120].map(m => `<option value="${m}" ${m === (g.sessionMinutes || 60) ? 'selected' : ''}>${duration(m)}</option>`).join('')}</select>
    ${submit(g.id ? 'לשמור' : 'להוסיף מטרה')}
  </form>
  ${g.id ? `<button class="text-button muted" data-action="delete-goal" data-id="${esc(g.id)}">${icon('trash')} למחוק את המטרה</button>` : ''}`;
}

export function logForm(g, itemId = '') {
  const unit = g.unit === 'minutes' ? 'דקות' : g.unit === 'pages' ? 'עמודים' : g.unit === 'km' ? 'ק״מ' : g.noun || 'פעמים';
  return `${sheetTop('כמה עשית?', esc(g.title))}
  <form data-form="log" data-id="${esc(g.id)}" data-item="${esc(itemId)}">
    <label for="log-amount">${esc(unit)}</label><input id="log-amount" name="amount" type="number" min="0.1" step="any" required autofocus value="${g.unit === 'pages' ? 10 : g.unit === 'minutes' ? 30 : 1}">
    <label for="log-date">מתי?</label><input id="log-date" name="date" type="date" required value="${localDate()}" max="${localDate()}">
    ${submit('לרשום')}
  </form>`;
}

export function moveForm(item, options) {
  return `${sheetTop('להזיז', esc(item.title))}
  ${options.length ? `<p class="field-help">זמנים פנויים קרובים:</p><div class="slots">${options.map((o, n) => `<button class="slot" data-action="move-to" data-n="${n}">${esc(fullDayLabel(o.date))} · <bdi dir="ltr">${o.start}–${o.end}</bdi></button>`).join('')}</div>` : '<p class="field-help">אין זמן פנוי באורך הזה בימים הקרובים.</p>'}
  <form data-form="move" data-id="${esc(item.id)}">
    <p class="field-help">או בוחרים בעצמך. אם יש התנגשות, אגיד לך.</p>
    <div class="form-row"><div><label for="move-date">יום</label><input id="move-date" name="date" type="date" required value="${item.date}" min="${localDate()}"></div>
    <div><label for="move-start">שעה</label>${timeSelect('id="move-start" name="start"', item.start)}</div></div>
    ${submit('להזיז לכאן')}
  </form>`;
}

export function jobForm(j = {}, color = PALETTE[0]) {
  const chosen = j.color || color;
  return `${sheetTop(j.id ? 'עריכת העסק' : 'איפה אתה עובד?', 'עבודה')}
  <form data-form="job" data-id="${esc(j.id || '')}">
    <label for="job-name">שם העסק</label><input id="job-name" name="name" maxlength="60" required autofocus value="${esc(j.name || '')}" placeholder="למשל, קפה רחביה">
    <label for="job-wage">כמה אתה מקבל לשעה?</label>
    <div class="money-input"><input id="job-wage" name="wage" type="number" inputmode="decimal" min="0" max="2000" step="0.01" required value="${j.wage ?? ''}" placeholder="38"><span>₪</span></div>
    <fieldset><legend>הצבע שלו ביומן</legend><div class="color-picks">${PALETTE.map(c => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === chosen ? 'checked' : ''} aria-label="צבע"><span></span></label>`).join('')}</div></fieldset>
    <details class="advanced"><summary>עוד פרטים</summary>
      <label class="repeat-option"><input type="checkbox" name="overtime" ${j.overtime !== false ? 'checked' : ''}> לחשב שעות נוספות במשמרת ארוכה</label>
    </details>
    ${submit(j.id ? 'לשמור' : 'הבא: המשמרות של השבוע')}
  </form>
  ${j.id ? `<button class="text-button muted" data-action="delete-job" data-id="${esc(j.id)}">${icon('trash')} למחוק את העסק ואת המשמרות שלו</button>` : ''}`;
}

// A work week at once, Sunday to Friday: tick the days you work; the hours of one day carry to the next one you tick.
// Days that already passed can be ticked too, to record shifts already worked.
export function weekShiftsForm(state, jobId, sunday, times = {start: '16:00', end: '22:00'}, thisSunday = sunday) {
  const days = Array.from({length: 6}, (_, i) => addDays(sunday, i)), today = localDate(), next = sunday > thisSunday;
  return `${sheetTop(next ? 'המשמרות בשבוע הבא' : 'המשמרות השבוע', state.jobs.length === 1 ? esc(state.jobs[0].name) : 'עבודה')}
  <div class="form-tabs" role="group" aria-label="איזה שבוע">
    <button type="button" data-action="week-shifts" data-week="${thisSunday}" data-job="${esc(jobId)}" class="${next ? '' : 'active'}" aria-pressed="${!next}">השבוע · ${esc(dateLabel(thisSunday))}</button>
    <button type="button" data-action="week-shifts" data-week="${addDays(thisSunday, 7)}" data-job="${esc(jobId)}" class="${next ? 'active' : ''}" aria-pressed="${next}">השבוע הבא · ${esc(dateLabel(addDays(thisSunday, 7)))}</button>
  </div>
  <form data-form="week-shifts">
    ${state.jobs.length > 1 ? `<select name="jobId" aria-label="עסק">${state.jobs.map(j => `<option value="${esc(j.id)}" ${j.id === jobId ? 'selected' : ''}>${esc(j.name)}</option>`).join('')}</select>` : `<input type="hidden" name="jobId" value="${esc(jobId)}">`}
    <p class="field-help">מסמנים באילו ימים עובדים, מראשון עד שישי.</p>
    <div class="week-rows">${days.map(d => `<div class="week-row${d < today ? ' is-past' : ''}" data-week-row>
      <label class="day-toggle"><input type="checkbox" name="day" value="${d}"><span><b>${esc(d === today ? 'היום' : `יום ${DAY_NAMES[new Date(`${d}T12:00:00`).getDay()]}`)}</b><small>${esc(dateLabel(d))}${d < today ? ' · עבר' : ''}</small></span></label>
      <span class="week-times">${timeSelect(`name="start-${d}" aria-label="משעה"`, times.start)}<span>–</span>${timeSelect(`name="end-${d}" aria-label="עד שעה"`, times.end)}</span>
    </div>`).join('')}</div>
    ${submit('להכניס ליומן')}
  </form>`;
}

// "How much did it come to?": one shift's pay line by line, and what the month comes to with it.
export function payCard(state, shift) {
  const job = state.jobs.find(j => j.id === shift.jobId);
  if (!job || !validDate(shift.date) || !shift.start || shift.start === shift.end) return '';
  const {lines, total} = payLines(shift, job), month = shift.date.slice(0, 7);
  const withIt = {...state, shifts: [...state.shifts.filter(x => x.id !== shift.id), {...shift, id: shift.id || 'preview'}]};
  const mine = monthSummary(withIt, month).jobs.find(j => j.job.id === job.id);
  const when = month === localDate().slice(0, 7) ? 'החודש' : `ב${new Date(`${shift.date}T12:00:00`).toLocaleDateString('he-IL', {month: 'long'})}`;
  return `<section class="pay-card" style="--c:${job.color};--soft:${soft(job.color)}" aria-label="כמה יצא">
    <h3 class="pay-title">כמה יצא?</h3>
    <div class="pay-shift"><b>יום ${DAY_NAMES[new Date(`${shift.date}T12:00:00`).getDay()]} · ${esc(job.name)}</b><bdi dir="ltr">${shift.start}–${shift.end}</bdi></div>
    <div class="pay-lines">${lines.map(l => `<div class="pay-line${l.amount === null ? ' is-note' : ''}"><span>${esc(l.label)}</span><b>${l.amount === null ? '' : money2(l.amount)}</b></div>`).join('')}</div>
    <div class="pay-total"><span>סה״כ למשמרת</span><b>${money2(total)}</b></div>
    <div class="pay-month"><small>צפוי ${when} · ${mine.shifts.length === 1 ? 'משמרת אחת' : `${mine.shifts.length} משמרות`}</small><b>${money(mine.pay)}</b></div>
  </section>`;
}
export function shiftForm(state, s = {}, jobId = '') {
  const job = s.jobId || jobId || state.jobs[0]?.id;
  return `${sheetTop(s.id ? 'עריכת משמרת' : 'משמרת חדשה', 'עבודה')}
  <form data-form="shift" data-id="${esc(s.id || '')}">
    <div data-pay>${payCard(state, {id: s.id, jobId: job, date: s.date || localDate(), start: s.start || '16:00', end: s.end || '22:00', breakMinutes: s.breakMinutes || 0, tips: s.tips || 0})}</div>
    <label for="shift-job">מקום העבודה</label>
    <select id="shift-job" name="jobId">${state.jobs.map(j => `<option value="${esc(j.id)}" ${j.id === job ? 'selected' : ''}>${esc(j.name)} · ₪${j.wage} לשעה</option>`).join('')}</select>
    <label for="shift-date">יום</label><input id="shift-date" name="date" type="date" required value="${s.date || localDate()}">
    <div class="form-row"><div><label for="shift-start">משעה</label>${timeSelect('id="shift-start" name="start"', s.start || '16:00')}</div>
    <div><label for="shift-end">עד שעה</label>${timeSelect('id="shift-end" name="end"', s.end || '22:00')}</div></div>
    <small class="field-help">אם שעת הסיום מוקדמת מההתחלה, המשמרת נגמרת למחרת (משמרת לילה).</small>
    <div class="form-row"><div><label for="shift-break">הפסקה לא בתשלום</label><select id="shift-break" name="breakMinutes">${[0, 15, 30, 45, 60].map(m => `<option value="${m}" ${m === (s.breakMinutes || 0) ? 'selected' : ''}>${m ? `${m} דקות` : 'אין'}</option>`).join('')}</select></div>
    <div><label for="shift-tips">טיפים / בונוס (₪)</label><input id="shift-tips" name="tips" type="number" min="0" step="1" value="${s.tips || ''}" placeholder="לא חובה"></div></div>
    <label for="shift-note">הערה (לא חובה)</label><input id="shift-note" name="note" maxlength="200" value="${esc(s.note || '')}" placeholder="למשל: השיעור בזום, מקשיב מהעבודה">
    ${s.id ? '' : `<label for="shift-repeat">חוזרת?</label><select id="shift-repeat" name="weeks">${[[1, 'פעם אחת'], [4, 'כל שבוע, 4 שבועות'], [8, 'כל שבוע, 8 שבועות'], [12, 'כל שבוע, 12 שבועות'], [16, 'כל שבוע, 16 שבועות']].map(([w, t]) => `<option value="${w}">${t}</option>`).join('')}</select>`}
    ${submit(s.id ? 'לשמור' : 'להוסיף ללו״ז')}
  </form>
  ${s.id ? `<button class="text-button muted" data-action="delete-shift" data-id="${esc(s.id)}">${icon('trash')} למחוק את המשמרת</button>` : ''}`;
}

// A money goal for each month: how much, and what for. The jar and the card on "today" count toward it.
export function moneyGoalForm(profile) {
  return `${sheetTop('יעד לחודש', 'עבודה')}
  <form data-form="money-goal">
    <label for="goal-amount">כמה אני רוצה להרוויח בכל חודש?</label>
    <div class="money-input"><input id="goal-amount" name="amount" type="number" inputmode="numeric" min="0" max="1000000" step="50" value="${profile.moneyGoal || ''}" placeholder="3000" autofocus><span>₪</span></div>
    <label for="goal-for">בשביל מה? (לא חובה)</label><input id="goal-for" name="for" maxlength="40" value="${esc(profile.moneyFor || '')}" placeholder="טיסה, רכב, שכר דירה">
    <small class="field-help">משאירים ריק כדי לבטל את היעד.</small>
    ${submit('לשמור')}
  </form>`;
}

// A class in the calendar: its course page, or marking it cancelled for this date only (or the whole day), or back on.
export function classMenu(c, date, course, {cancelled = false, sameDay = 1} = {}) {
  const ref = `data-id="${esc(c.id)}" data-date="${esc(date)}"`, day = esc(fullDayLabel(date));
  const row = (attrs, img, title, sub) => `<button type="button" class="menu-row" ${attrs}>${icon(img)}<span><b>${title}</b><small>${sub}</small></span></button>`;
  return `${sheetTop(esc(c.title), `${day} · <bdi dir="ltr">${c.start}–${c.end}</bdi>`)}
  <div class="menu-list">
    ${cancelled ? row(`data-action="restore-class" ${ref}`, 'back', 'השיעור כן מתקיים', 'להחזיר אותו ליומן')
      : `${row(`data-action="cancel-class" ${ref}`, 'close', 'השיעור הזה בוטל', `רק ${day}. בשבוע הבא הוא חוזר כרגיל, והזמן שהתפנה מחכה לך בלו״ז`)}
        ${sameDay > 1 ? row(`data-action="cancel-day" data-date="${esc(date)}"`, 'week', 'כל יום הלימודים בוטל', `כל ${sameDay} השיעורים של ${day}`) : ''}`}
    ${course ? row(`data-action="open-course" data-id="${esc(course.id)}"`, 'book', 'לדף הקורס', 'נושאים, מבחנים והתקדמות') : ''}
  </div>`;
}

// "מחר אין לימודים" said in "tell me": which classes, for a yes before anything changes.
export function cancelSheet(date, classes, named) {
  return `${sheetTop(named ? 'לסמן שהשיעור בוטל?' : 'לסמן שאין לימודים?', esc(fullDayLabel(date)))}
  <ul class="cancel-list">${classes.map(c => `<li><bdi dir="ltr">${c.start}–${c.end}</bdi> <b>${esc(c.title)}</b></li>`).join('')}</ul>
  <p class="field-help">השיעורים יישארו ביומן, מסומנים כמבוטלים, והזמן שהתפנה יחכה לך בלו״ז. בשבוע הבא הם חוזרים כרגיל.</p>
  <button class="primary submit-button" data-action="confirm-cancel" data-date="${esc(date)}">${icon('check')} כן, ${classes.length === 1 ? 'השיעור בוטל' : 'השיעורים בוטלו'}</button>
  <button class="text-button" data-action="close">לא, ביטול</button>`;
}

export function settingsForm(prefs) {
  return `${sheetTop('העדפות')}
  <form data-form="settings">
    <div class="form-row"><div><label for="day-start">היום שלי מתחיל ב־</label>${timeSelect('id="day-start" name="dayStart"', prefs.dayStart)}</div>
    <div><label for="day-end">ונגמר ב־</label>${timeSelect('id="day-end" name="dayEnd"', prefs.dayEnd)}</div></div>
    <small class="field-help">מחוץ לשעות האלה לא אמצא זמן לשום דבר.</small>
    <label for="break">הפסקה בין דברים</label>
    <select id="break" name="breakMinutes">${[0, 5, 10, 15, 20, 30].map(m => `<option value="${m}" ${m === prefs.breakMinutes ? 'selected' : ''}>${m ? `${m} דקות` : 'בלי הפסקה'}</option>`).join('')}</select>
    ${submit('לשמור')}
  </form>
  <details class="data-tools"><summary>גיבוי והעברה למכשיר אחר</summary>
    <p>בלי חשבון, הנתונים נשמרים רק במכשיר הזה. עם חשבון (בכפתור "החשבון שלי") הם נשמרים גם בענן. אפשר גם להוריד גיבוי ולטעון אותו במכשיר אחר.</p>
    <button class="text-button" data-action="export">הורדת גיבוי</button>
    <label class="text-button import-label">טעינת גיבוי<input type="file" data-import accept="application/json,.json"></label>
  </details>`;
}

// The account: optional. Signed out it explains what it adds and signs in with a code by email;
// signed in it shows where the copy stands and the way out (sign out, download, delete for good).
export function accountSheet(user, {codeFor = '', sync = {}} = {}) {
  if (user) {
    const when = sync.at ? new Date(sync.at).toLocaleString('he-IL', {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
    const status = {syncing: 'מסנכרן…', offline: 'אין חיבור. השינויים יעלו כשיחזור האינטרנט.', error: 'הסנכרון נכשל. ננסה שוב בקרוב.',
      setup: 'השרת עוד לא מוכן לשמירה (צריך להריץ את קובץ ההגדרה ב-Supabase).'}[sync.status] || (when ? `נשמר בענן · ${when}` : 'עוד לא נשמר בענן.');
    return `${sheetTop('החשבון שלי')}
    <section class="account-card"><span class="account-avatar">${icon('user')}</span><div><b>${esc(user.email || 'מחובר')}</b><small class="sync-line${sync.status === 'error' || sync.status === 'setup' ? ' is-bad' : ''}">${icon('cloud')} ${esc(status)}</small></div></section>
    <button class="primary submit-button" data-action="sync-now">${icon('cloud')} לסנכרן עכשיו</button>
    <div class="account-actions">
      <button class="text-button" data-action="export">${icon('file')} הורדת המידע שלי</button>
      <button class="text-button" data-action="sign-out">להתנתק</button>
      <button class="text-button muted" data-action="delete-account">${icon('trash')} מחיקת החשבון</button>
    </div>
    <p class="field-help">בהתנתקות המידע נשאר בחשבון ונמחק מהמכשיר הזה. מתחברים שוב, והכול חוזר. <a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a></p>`;
  }
  if (codeFor) {
    return `${sheetTop('בדוק את המייל')}
    <p class="account-lead">שלחנו מייל ל־<b dir="ltr">${esc(codeFor)}</b>. לוחצים בו על הקישור, באותו מכשיר, ונכנסים מחוברים. הוא מגיע תוך דקה, וכדאי לבדוק גם בספאם.</p>
    <form data-form="verify-code">
      <label for="login-code">יש במייל קוד? אפשר להקליד אותו כאן</label>
      <input id="login-code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" required autofocus dir="ltr">
      ${submit('כניסה')}
    </form>
    <div class="account-actions"><button class="text-button" data-action="resend-code">לשלוח שוב</button><button class="text-button" data-action="account-other">מייל אחר</button></div>`;
  }
  return `${sheetTop('החשבון שלי')}
  <p class="account-lead">חשבון שומר את הכול בענן: בטלפון חדש או במחשב, מתחברים והכול חוזר. בלי חשבון, הכול נשאר רק במכשיר הזה.</p>
  ${GOOGLE_SIGN_IN ? `<button class="google-button" data-action="google"><b>G</b> המשך עם Google</button><div class="or-line"><span>או</span></div>` : ''}
  <form data-form="send-code">
    <label for="login-email">מייל</label>
    <input id="login-email" name="email" type="email" autocomplete="email" inputmode="email" required dir="ltr" placeholder="name@example.com">
    ${submit('שלחו לי מייל כניסה')}
  </form>
  <p class="field-help">בלי סיסמה: בכל כניסה מקבלים מייל עם קישור כניסה.</p>`;
}

export function deleteAccountSheet() {
  return `${sheetTop('למחוק את החשבון?')}
  <p>החשבון וכל המידע שלך יימחקו לצמיתות, גם מהמכשיר הזה, ואי אפשר לשחזר אותם. אם רוצים לשמור עותק, מורידים אותו קודם.</p>
  <button class="text-button" data-action="export">${icon('file')} הורדת המידע שלי</button>
  <button class="primary submit-button danger" data-action="confirm-delete-account">למחוק לצמיתות</button>
  <button class="text-button" data-action="account">ביטול</button>`;
}

export function chooseCopySheet(remoteWhen) {
  return `${sheetTop('יש מידע גם במכשיר וגם בחשבון')}
  <p>באיזה מהם להשתמש? השני יישמר כגיבוי במכשיר, כך ששום דבר לא נמחק.</p>
  <button class="primary submit-button" data-action="use-cloud">${icon('cloud')} מה שבחשבון${remoteWhen ? ` · ${esc(remoteWhen)}` : ''}</button>
  <button class="text-button" data-action="use-device">מה שבמכשיר הזה (יחליף את מה שבחשבון)</button>`;
}

export function helpContent() {
  return `${sheetTop('איך זה עובד?')}
  <button class="primary submit-button tour-again" data-action="tour-start">${icon('help')} להפעיל את ההדרכה המודרכת</button>
  <div class="help">
    <p><b>ספר לי.</b> במסך "היום" כותבים או אומרים מה צריך לעשות. אני מראה מה הבנתי, מוצא זמן פנוי בלי חפיפות, ושום דבר לא נכנס בלי אישור.</p>
    <p><b>לימודים.</b> מערכת השעות נכנסת פעם אחת, מקובץ יומן או ידנית. לכל קורס דף עם סילבוס, מבחנים והתקדמות, ו"מצא לי זמן" ללמוד.</p>
    <p><b>עבודה.</b> עסק ושכר לשעה, משמרות לשבוע שלם בבת אחת, וחישוב של כמה יצא בכל משמרת ובכל חודש.</p>
    <p><b>מטרות אישיות.</b> יעד פשוט, כמו 3 אימונים בשבוע. "לשבץ את מה שנשאר" מוצא זמן פנוי לשאר השבוע.</p>
    <p><b>החשבון.</b> הכול נשמר בחשבון שלך ומתעדכן בכל המכשירים שמתחברים אליהם. גם בלי אינטרנט הכול עובד, ומתעדכן כשהחיבור חוזר.</p>
    <p class="muted"><a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a> · <a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a></p>
  </div>
  <button class="primary submit-button" data-action="close">הבנתי</button>`;
}