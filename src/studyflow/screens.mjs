import {timetableNotice} from './timetable.mjs';
// Screen templates. Every piece of text the person typed goes through esc().
import {esc, icon, duration, localDate, addDays, weekStart, dateLabel, dayLabel, fullDayLabel, greeting, DAY_NAMES, DAY_SHORT, toMin, toClock, timeSelect, soft, PALETTE} from './util.mjs';
import {dayAgenda, plannedMinutes} from './schedule.mjs';
import {courseProgress, goalProgress, goalSummary, unitLabel, goalStats} from './progress.mjs';
import {monthSummary, shiftPay, money, hoursLabel, shiftLabel, overnight} from './work.mjs';

const KIND = {study: 'לימודים', task: 'משימה', goal: 'מטרה אישית', event: 'אירוע', other: 'כללי', shift: 'משמרת'};
const STATUS = {new: 'עוד לא התחלתי', learning: 'בלמידה', done: 'סיימתי'};
const NAV = [['today', 'sun', 'היום', 'היום'], ['studies', 'book', 'לימודים', 'לימודים'], ['work', 'work', 'עבודה', 'עבודה'], ['goals', 'target', 'מטרות אישיות', 'מטרות'], ['calendar', 'week', 'יומן', 'יומן']];

export function shell() {
  const nav = NAV.map(([route, img, label, short]) => `<button data-route="${route}">${icon(img)}<span class="label-long">${label}</span><span class="label-short">${short}</span></button>`).join('');
  return `
  <aside class="sidebar">
    <a href="#today" class="brand" aria-label="StudyFlow, היום"><img class="brand-mark" src="src/studyflow/brand/mark.svg" alt="" width="36" height="36"><span>StudyFlow<small class="brand-tagline">כל היום, במקום אחד.</small></span></a>
    <button class="primary sidebar-add" data-action="focus-tell">${icon('mic')} ספר לי מה לעשות</button>
    <nav class="desktop-nav" aria-label="ניווט ראשי">${nav}</nav>
    <button class="sidebar-settings sidebar-account" data-action="account">${icon('user')}<span>החשבון שלי</span></button>
    <button class="sidebar-settings sidebar-help" data-action="help">${icon('help')}<span>איך זה עובד?</span></button>
    <button class="sidebar-settings" data-action="settings">${icon('settings')}<span>העדפות</span></button>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <a href="#today" class="mobile-brand brand"><img class="brand-mark" src="src/studyflow/brand/mark.svg" alt="" width="32" height="32"><b>StudyFlow</b></a>
      <div class="topbar-actions">
        <button class="icon-button account-button" data-action="account" aria-label="החשבון שלי">${icon('user')}</button>
        <button class="icon-button" data-action="help" aria-label="איך זה עובד?">${icon('help')}</button>
        <button class="icon-button" data-action="settings" aria-label="העדפות">${icon('settings')}</button>
      </div>
    </header>
    <main id="main" tabindex="-1"></main>
  </div>
  <nav class="bottom-nav" aria-label="ניווט בנייד">${nav}<button class="mobile-add" data-action="focus-tell" aria-label="ספר לי מה לעשות">${icon('mic')}</button></nav>
  <dialog id="sheet" aria-labelledby="dialog-title"></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
}

export const sheetTop = (title, eyebrow = '') => `<div class="sheet-top"><div>${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<h2 id="dialog-title">${title}</h2></div><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;
const heading = (title, eyebrow = '') => `<section class="page-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></section>`;
const section = (title, sub = '', actions = '') => `<div class="section-heading"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="section-actions">${actions}</div>` : ''}</div>`;
const bar = (percent, label) => `<div class="bar" role="img" aria-label="${esc(label)}"><i style="width:${Math.max(0, Math.min(100, percent))}%"></i></div>`;
const back = (route, label) => `<a class="back-link" href="#${route}">${icon('back')} ${label}</a>`;
const countdown = days => days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;

// ── Today ──
export function today(state, ui, now = new Date()) {
  const date = localDate(now);
  const fresh = !state.classes.length && !state.courses.length && !state.goals.length && !state.items.length && !state.jobs.length;
  return `
  ${ui.demo ? `<div class="demo-banner">זו דוגמה. שום דבר לא נשמר.<button data-action="exit-demo">חזרה אליי ${icon('arrow')}</button></div>` : ''}
  ${heading('היום', `${greeting(now.getHours())}${state.profile?.name ? `, ${esc(state.profile.name)}` : ''} · יום ${DAY_NAMES[now.getDay()]}, ${dateLabel(date)}`)}
  ${ui.proposals ? reviewCard(ui.proposals, date, state) : tellBox(ui)}
  ${fresh ? welcome() : `${alerts(state, date)}${dayStrip(state, ui.day || date, date)}${dayTimeline(state, ui.day || date, now)}${progressStrip(state, date)}`}`;
}

function dayStrip(state, selected, todayDate) {
  const days = Array.from({length: 7}, (_, i) => addDays(todayDate, i));
  return `<div class="week-strip day-picker" role="group" aria-label="בחירת יום">${days.map(d => {
    const busy = state.items.some(i => i.date === d);
    return `<button class="day-chip ${d === selected ? 'selected' : ''}" data-action="pick-day" data-date="${d}" aria-pressed="${d === selected}"><span>${d === todayDate ? 'היום' : d === addDays(todayDate, 1) ? 'מחר' : DAY_NAMES[new Date(`${d}T12:00:00`).getDay()]}</span><b>${new Date(`${d}T12:00:00`).getDate()}</b><i class="${busy ? 'has-items' : ''}"></i></button>`;
  }).join('')}</div>`;
}

function tellBox(ui) {
  return `
  <section class="tell" aria-labelledby="tell-label">
    <label id="tell-label" for="tell-text">ספר לי מה אתה צריך לעשות</label>
    <div class="tell-input">
      <textarea id="tell-text" rows="3" maxlength="600" placeholder="למשל: מחר ללמוד שעתיים סטטיסטיקה, להתאמן בחדר כושר, ובערב ארוחה ב־20:00">${esc(ui.tellText || '')}</textarea>
      ${ui.micAvailable ? `<button type="button" class="tell-mic${ui.listening ? ' listening' : ''}" data-action="mic" aria-pressed="${!!ui.listening}" aria-label="${ui.listening ? 'לעצור את ההקלטה' : 'להגיד בקול'}">${icon('mic')}</button>` : ''}
    </div>
    <div class="tell-foot">
      <button class="primary" data-action="tell">${icon('check')} לסדר לי</button>
      ${ui.micAvailable ? '<small class="field-help">הזיהוי הקולי נעשה על ידי הדפדפן (גוגל או אפל). האפליקציה עצמה לא שולחת דבר.</small>' : ''}
    </div>
    ${ui.tellError ? `<p class="form-error" role="alert">${esc(ui.tellError)}</p>` : ''}
  </section>`;
}

const ASKS = ['day', 'when', 'time'];
export const openQuestions = p => (p.needs || []).filter(n => ASKS.includes(n));
function askBox(p, i, todayDate) {
  const asks = openQuestions(p); if (!asks.length) return '';
  const chip = (need, value, label) => `<button class="ask-chip" data-action="answer" data-p="${i}" data-need="${need}" data-value="${value}">${label}</button>`;
  const rows = asks.map(n => n === 'day'
    ? `<div class="ask-row"><b>באיזה יום?</b><span>לא נאמר יום.</span><div class="ask-chips">${chip('day', todayDate, 'היום')}${chip('day', addDays(todayDate, 1), 'מחר')}${chip('day', addDays(todayDate, 2), 'מחרתיים')}<small>או יום אחר ברשימה למעלה</small></div></div>`
    : n === 'when'
    ? `<div class="ask-row"><b>מתי לעשות את זה?</b><span>לא נאמרה שעה.</span><div class="ask-chips">${chip('when', 'flex', 'תמצא לי זמן')}${chip('when', 'morning', 'בבוקר')}${chip('when', 'noon', 'בצהריים')}${chip('when', 'evening', 'בערב')}${chip('when', 'fixed', 'בשעה מסוימת')}</div></div>`
    : `<div class="ask-row"><b>השעה <bdi dir="ltr">${p.start}–${p.end}</bdi> נכונה?</b><span>השעה לא נאמרה, אז ניחשתי.</span><div class="ask-chips">${chip('time', 'ok', 'כן, נכון')}<small>או לשנות את השעות למעלה</small></div></div>`).join('');
  return `<div class="proposal-ask">${rows}</div>`;
}
function reviewCard(proposals, todayDate, state) {
  const dates = Array.from({length: 14}, (_, i) => addDays(todayDate, i));
  const rows = proposals.map((p, i) => {
    const mode = p.allDay ? 'allDay' : p.fixed ? 'fixed' : 'flex';
    const dateOptions = [...new Set([p.date, ...dates])].sort().map(d => `<option value="${d}" ${d === p.date ? 'selected' : ''}>${esc(fullDayLabel(d, todayDate))}</option>`).join('');
    const minutes = [15, 30, 45, 60, 90, 120, 150, 180, 240];
    const minuteOptions = [...new Set([...minutes, p.minutes])].sort((a, b) => a - b).map(m => `<option value="${m}" ${m === p.minutes ? 'selected' : ''}>${duration(m)}</option>`).join('');
    return `
    <article class="proposal is-${p.status}${openQuestions(p).length ? ' has-questions' : ''}">
      <div class="proposal-top">
        <input class="proposal-title" data-p="${i}" data-field="title" value="${esc(p.title)}" maxlength="120" aria-label="שם הפריט">
        <span class="proposal-kind">${KIND[p.kind] || ''}</span>
        <button class="icon-button" data-action="drop-proposal" data-p="${i}" aria-label="להסיר את ${esc(p.title)}">${icon('trash')}</button>
      </div>
      <div class="proposal-fields">
        <select data-p="${i}" data-field="date" aria-label="יום">${dateOptions}</select>
        ${p.kind === 'shift' ? `<select data-p="${i}" data-field="jobId" aria-label="מקום עבודה">${state.jobs.map(j => `<option value="${esc(j.id)}" ${j.id === p.jobId ? 'selected' : ''}>${esc(j.name)}</option>`).join('')}</select>`
        : `<select data-p="${i}" data-field="mode" aria-label="איך לשבץ">
          <option value="flex" ${mode === 'flex' ? 'selected' : ''}>תמצא לי זמן</option>
          <option value="fixed" ${mode === 'fixed' ? 'selected' : ''}>בשעה קבועה</option>
          <option value="allDay" ${mode === 'allDay' ? 'selected' : ''}>כל היום</option>
        </select>`}
        ${mode === 'fixed' ? `<span class="time-pair">${timeSelect(`data-p="${i}" data-field="start" aria-label="משעה"`, p.start || '10:00')}<span>עד</span>${timeSelect(`data-p="${i}" data-field="end" aria-label="עד שעה"`, p.end || '11:00')}</span>` : ''}
        ${mode === 'flex' ? `<select data-p="${i}" data-field="minutes" aria-label="כמה זמן">${minuteOptions}</select>` : ''}
      </div>
      ${proposalStatus(p, i, todayDate)}
      ${askBox(p, i, todayDate)}
    </article>`;
  }).join('');
  const blocked = proposals.some(p => p.status !== 'ok' || openQuestions(p).length);
  return `
  <section class="review-card" aria-labelledby="review-title">
    <div class="review-head"><h2 id="review-title">זה מה שהבנתי</h2><p>אפשר לתקן כל דבר. שום דבר לא נכנס ללו״ז לפני האישור.</p></div>
    ${rows || '<p class="field-help">לא נשאר כלום ברשימה.</p>'}
    <div class="review-foot">
      <button class="primary" data-action="commit" ${blocked || !proposals.length ? 'disabled' : ''}>${icon('check')} להכניס ללו״ז</button>
      <button class="text-button" data-action="edit-tell">לשנות את מה שכתבתי</button>
      <button class="text-button muted" data-action="cancel-tell">ביטול</button>
    </div>
    ${blocked && proposals.length ? `<p class="field-help review-blocked">${proposals.some(p => openQuestions(p).length) ? 'כדי להמשיך, עונים על השאלות המסומנות: באיזה יום ומתי.' : 'כדי להמשיך, בוחרים שעה חלופית לכל פריט שמסומן.'}</p>` : ''}
  </section>`;
}

function proposalStatus(p, i, todayDate) {
  const options = (p.options || []).map((o, n) => `<button class="slot" data-action="pick-option" data-p="${i}" data-o="${n}">${o.date !== p.date ? esc(dayLabel(o.date, todayDate)) + ' · ' : ''}<bdi dir="ltr">${o.start}–${o.end}</bdi></button>`).join('');
  if (p.status === 'past') return `<p class="proposal-status warn">${icon('alert')} התאריך הזה כבר עבר. בוחרים יום אחר.</p>`;
  if (p.status === 'invalid') return `<p class="proposal-status warn">${icon('alert')} שעת הסיום צריכה להיות אחרי שעת ההתחלה.</p>`;
  if (p.status === 'conflict') return `<div class="proposal-status warn">${icon('alert')} <span>מתנגש עם <b>${p.conflicts.map(esc).join(', ')}</b>.${options ? ' שעות פנויות באותו יום:' : ' אין שעה פנויה מתאימה ביום הזה.'}</span><div class="slots">${options}</div></div>`;
  if (p.status === 'noroom') return `<div class="proposal-status warn">${icon('alert')} <span>אין זמן פנוי מתאים ${p.deadline ? 'עד המועד' : 'ביום הזה'}.${options ? ' אפשר:' : ''}</span><div class="slots">${options}</div></div>`;
  if (p.allDay) return `<p class="proposal-status ok">${icon('check')} כל היום, ${esc(fullDayLabel(p.date, todayDate))}${p.hides?.length ? `. השיעורים ביום הזה (${p.hides.map(esc).join(', ')}) יוסתרו` : ''}${p.overlaps?.length ? `. כבר מתוכנן באותו יום: ${p.overlaps.map(esc).join(', ')}` : ''}</p>`;
  const notes = [p.outsidePart ? 'לא היה מקום בחלק היום שביקשת' : '', p.kind === 'shift' && toMin(p.end) <= toMin(p.start) ? 'נגמרת למחרת' : '',
    p.needs?.includes('job') ? 'בדוק שזה מקום העבודה הנכון' : '', p.needs?.includes('minutes') ? 'לא נאמר כמה זמן, שמתי ' + duration(p.minutes) : ''].filter(Boolean);
  return `<p class="proposal-status ok">${icon('check')} ${esc(fullDayLabel(p.date, todayDate))} · <bdi dir="ltr">${p.start}–${p.end}</bdi>${notes.length ? `<small> · ${notes.join(' · ')}</small>` : ''}</p>`;
}

function welcome() {
  return `
  <section class="welcome">
    <div class="welcome-icon">${icon('sun')}</div>
    <h2>בוא נכיר</h2>
    <p>כדי שאוכל לסדר לך את היום סביב הלימודים, כדאי להתחיל ממערכת השעות. אחר כך פשוט מספרים לי מה צריך לעשות.</p>
    <ol class="welcome-steps">
      <li><a href="#studies">${icon('book')} להכניס את מערכת השעות והקורסים</a></li>
      <li><a href="#work">${icon('work')} להוסיף עבודה ומשמרות</a></li>
      <li><a href="#goals">${icon('target')} להגדיר ספורט ותחביבים</a></li>
      <li><button data-action="focus-tell">${icon('mic')} לספר לי מה יש היום</button></li>
    </ol>
    <button class="demo-button" data-action="demo">לראות דוגמה</button>
  </section>`;
}

function alerts(state, date) {
  const list = [];
  for (const c of state.courses) {
    const p = courseProgress(c, date);
    if (p.exam !== null && p.exam <= 7) list.push(`<a href="#course/${esc(c.id)}">מבחן ב${esc(c.name)} ${countdown(p.exam)}</a>`);
    for (const d of c.deadlines) if (!d.done && d.date >= date && d.date <= addDays(date, 3)) list.push(`<a href="#course/${esc(c.id)}">${esc(d.title)} (${esc(c.name)}) ${countdown((new Date(`${d.date}T12:00:00`) - new Date(`${date}T12:00:00`)) / 864e5)}</a>`);
  }
  if (plannedMinutes(state, date) > 10 * 60) list.push('<span>היום עמוס מאוד. אולי כדאי להזיז משהו למחר?</span>');
  return list.length ? `<section class="alerts" aria-label="תזכורות">${list.map(a => `<p>${icon('alert')} ${a}</p>`).join('')}</section>` : '';
}

export function entryRow(e, state, now = new Date()) {
  if (e.type === 'free') return `<div class="free-row"><span><bdi dir="ltr">${e.start}–${e.end}</bdi></span> פנוי · ${duration(e.minutes)}</div>`;
  const time = e.allDay ? '<b>כל היום</b>' : `<b>${e.start}</b><span>${e.end}</span>`;
  if (e.type === 'shift') {
    const shift = state.shifts.find(s => s.id === e.id), job = state.jobs.find(j => j.id === e.jobId);
    const {hours, pay} = shiftPay(shift, job);
    return `<article class="entry is-shift"><div class="time"><b>${e.continued ? '00:00' : shift.start}</b><span>${e.overnight ? '24:00' : shift.end}</span></div><div class="entry-card" style="${tint(job?.color)}">
      <span class="entry-kind">משמרת${e.continued ? ' · המשך מאתמול' : e.overnight ? ' · נגמרת למחרת ב־' + shift.end : ''} · ${hoursLabel(hours)} · כ־${money(pay)}</span>
      <h3><a href="#job/${esc(e.jobId)}">${esc(e.title)}</a></h3>
      <div class="entry-actions"><button class="text-button" data-action="edit-shift" data-id="${esc(e.id)}">עריכה</button><button class="text-button muted" data-action="delete-shift" data-id="${esc(e.id)}">למחוק</button></div></div></article>`;
  }
  if (e.type === 'class') {
    const course = state.courses.find(c => c.id === e.courseId);
    return `<article class="entry is-class"><div class="time">${time}</div><div class="entry-card">
      <span class="entry-kind">שיעור${e.location ? ` · ${esc(e.location)}` : ''}</span><h3>${course ? `<a href="#course/${esc(course.id)}">${esc(e.title)}</a>` : esc(e.title)}</h3></div></article>`;
  }
  const link = e.courseId ? state.courses.find(c => c.id === e.courseId) : null, goal = e.goalId ? state.goals.find(g => g.id === e.goalId) : null;
  const past = e.date < localDate(now) || (e.date === localDate(now) && !e.allDay && toMin(e.end) < now.getHours() * 60 + now.getMinutes());
  return `<article class="entry is-${e.kind}${e.done ? ' is-done' : ''}"><div class="time">${time}</div><div class="entry-card">
    <span class="entry-kind">${KIND[e.kind]}${link ? ` · <a href="#course/${esc(link.id)}">${esc(link.name)}</a>` : ''}${goal ? ` · <a href="#goal/${esc(goal.id)}">${esc(goal.title)}</a>` : ''}${!e.allDay ? ` · ${duration(toMin(e.end) - toMin(e.start))}` : ''}</span>
    <h3>${esc(e.title)}</h3>
    <div class="entry-actions">
      ${e.kind === 'event' || e.allDay ? '' : `<button class="complete-button" data-action="toggle-done" data-id="${esc(e.id)}" aria-pressed="${e.done}">${icon('check')} ${e.done ? 'בוצע' : 'סיימתי'}</button>`}
      ${e.allDay ? '' : `<button class="text-button" data-action="move-item" data-id="${esc(e.id)}">${past && !e.done ? 'לא הספקתי, להזיז' : 'להזיז'}</button>`}
      <button class="text-button muted" data-action="delete-item" data-id="${esc(e.id)}">למחוק</button>
    </div></div></article>`;
}

function dayTimeline(state, date, now) {
  const {entries, gaps} = dayAgenda(state, date, {now});
  const rows = [...entries, ...gaps].sort((a, b) => (a.allDay ? -1 : b.allDay ? 1 : a.start.localeCompare(b.start)));
  const items = entries.filter(e => e.type === 'item' && !e.allDay);
  const title = date === localDate(now) ? 'הלו״ז של היום' : date === addDays(localDate(now), 1) ? 'הלו״ז של מחר' : `הלו״ז ל${fullDayLabel(date, localDate(now))}`;
  const count = (n, one, many) => n ? [n === 1 ? one : `${n} ${many}`] : [];
  const summary = [...count(entries.filter(e => e.type === 'class').length, 'שיעור אחד', 'שיעורים'), ...count(entries.filter(e => e.type === 'shift').length, 'משמרת', 'משמרות'),
    ...count(items.length, 'פריט אחד', 'פריטים'), ...(items.some(i => i.done) ? [`${items.filter(i => i.done).length} בוצעו`] : [])].join(' · ');
  return `<section class="day">${section(title, entries.length ? summary : 'עוד אין כלום ביום הזה.')}
    ${rows.length ? `<div class="entries">${rows.map(e => entryRow(e, state, now)).join('')}</div>` : '<div class="day-empty"><h3>יום פנוי</h3><p>מספרים לי למעלה מה צריך לעשות, ואני מוצא לזה זמן.</p></div>'}</section>`;
}

function progressStrip(state, date) {
  if (!state.courses.length && !state.goals.length && !state.jobs.length) return '';
  const pay = state.jobs.length ? monthSummary(state, date.slice(0, 7)) : null;
  const workCard = pay ? `<a class="mini-card is-job" href="#work"><b>עבודה החודש</b><small>${hoursLabel(pay.hours)} · כ־${money(pay.pay)} · עד היום ${money(pay.earned)}</small></a>` : '';
  const courses = state.courses.map(c => { const p = courseProgress(c, date); return `<a class="mini-card" href="#course/${esc(c.id)}"><b>${esc(c.name)}</b>${bar(p.percent, `${p.percent}%`)}<small>${p.total ? `${p.percent}%${p.next ? ` · הבא: ${esc(p.next.title)}` : ''}` : 'עוד אין נושאים'}</small></a>`; }).join('');
  const goals = state.goals.map(g => { const p = goalProgress(g, date); return `<a class="mini-card is-goal" href="#goal/${esc(g.id)}"><b>${esc(g.title)}</b>${bar(p.percent, goalSummary(g, date))}<small>${esc(goalSummary(g, date))}</small></a>`; }).join('');
  return `<section class="progress">${section('ההתקדמות שלי')}<div class="mini-grid">${courses}${goals}${workCard}</div></section>`;
}

// ── Studies ──
export function studies(state) {
  const days = [0, 1, 2, 3, 4, 5, 6].filter(d => d < 6 || state.classes.some(c => c.days.includes(6)));
  const table = days.map(d => {
    const list = state.classes.filter(c => c.days.includes(d)).sort((a, b) => a.start.localeCompare(b.start));
    return `<div class="tt-day"><h3>${DAY_NAMES[d]}</h3>${list.map(c => `<button class="tt-class" data-action="edit-class" data-id="${esc(c.id)}"><bdi dir="ltr">${c.start}–${c.end}</bdi><b>${esc(c.title)}</b>${c.location ? `<small>${esc(c.location)}</small>` : ''}</button>`).join('') || '<p class="tt-free">פנוי</p>'}</div>`;
  }).join('');
  const cards = state.courses.map((c, i) => courseCard(c, i)).join('');
  const importButton = `<label class="text-button import-label">${icon('file')} מקובץ יומן<input type="file" data-ics accept=".ics,text/calendar"></label>`;
  return `
  ${heading('לימודים')}
  <section>
    ${section('מערכת השעות', '', state.classes.length ? `<button class="text-button" data-action="semester-dates">תקופת הלימודים</button>${importButton}<button class="primary small" data-action="new-class">${icon('plus')} שיעור</button>` : '')}
    ${state.classes.length ? `<div class="timetable">${table}</div>`
      : `<div class="empty-actions"><button class="primary" data-action="new-class">${icon('plus')} להוסיף שיעור</button>${importButton}</div>`}
  </section>
  <section>
    ${section('הקורסים', '', `<button class="text-button" data-action="new-course">${icon('plus')} קורס</button>`)}
    ${cards ? `<div class="card-grid">${cards}</div>` : '<p class="field-help">קורס נוצר לבד כשמוסיפים שיעור.</p>'}
  </section>`;
}

function courseCard(c, index, date = localDate()) {
  const p = courseProgress(c, date);
  return `<article class="big-card note" style="${tint(PALETTE[(index + 2) % PALETTE.length])}">
    <span class="tape" aria-hidden="true"></span>
    <div class="big-card-top"><h3><a href="#course/${esc(c.id)}">${esc(c.name)}</a></h3><b class="big-number">${p.total ? `${p.percent}%` : '—'}</b></div>
    ${bar(p.percent, `${p.percent}% התקדמות`)}
    <p>${p.total ? `${p.done} מתוך ${p.total} נושאים הושלמו` : 'עוד אין נושאים'}${p.next ? ` · הבא בתור: ${esc(p.next.title)}` : ''}</p>
    <div class="chips">${p.exam !== null ? `<span class="chip ${p.exam <= 14 ? 'urgent' : ''}">מבחן ${countdown(p.exam)}</span>` : ''}${p.nextDeadline ? `<span class="chip">${esc(p.nextDeadline.title)} · ${esc(dateLabel(p.nextDeadline.date))}</span>` : ''}</div>
    <div class="section-actions"><a class="text-button" href="#course/${esc(c.id)}">נושאים והתקדמות</a><button class="text-button muted" data-action="delete-course" data-id="${esc(c.id)}" aria-label="הסרת ${esc(c.name)} מרשימת ההתקדמות">${icon('trash')} להסיר מההתקדמות</button></div>
  </article>`;
}

export function coursePage(state, id, ui) {
  const c = state.courses.find(x => x.id === id);
  if (!c) return `${back('studies', 'לימודים')}<div class="day-empty"><h3>הקורס לא נמצא</h3></div>`;
  const date = localDate(), p = courseProgress(c, date);
  const classes = state.classes.filter(x => x.courseId === c.id);
  const topics = c.topics.map(t => `<div class="topic is-${t.status}">
      <button class="status-chip" data-action="cycle-topic" data-course="${esc(c.id)}" data-id="${esc(t.id)}" aria-label="${esc(t.title)}: ${STATUS[t.status]}. לחיצה משנה">${t.status === 'done' ? icon('check') : ''}${STATUS[t.status]}</button>
      <span>${esc(t.title)}</span>
      <button class="icon-button" data-action="delete-topic" data-course="${esc(c.id)}" data-id="${esc(t.id)}" aria-label="למחוק את ${esc(t.title)}">${icon('trash')}</button></div>`).join('');
  const deadlines = [...c.deadlines].sort((a, b) => a.date.localeCompare(b.date)).map(d => `<div class="deadline${d.done ? ' is-done' : ''}">
      <button class="task-check ${d.done ? 'checked' : ''}" data-action="toggle-deadline" data-course="${esc(c.id)}" data-id="${esc(d.id)}" aria-label="${d.done ? 'לבטל סימון' : 'סימון כבוצע'}: ${esc(d.title)}">${d.done ? icon('check') : ''}</button>
      <span><b>${esc(d.title)}</b> · ${esc(dateLabel(d.date))}${!d.done && d.date >= date ? ` · ${countdown(Math.round((new Date(`${d.date}T12:00:00`) - new Date(`${date}T12:00:00`)) / 864e5))}` : ''}</span>
      <button class="icon-button" data-action="delete-deadline" data-course="${esc(c.id)}" data-id="${esc(d.id)}" aria-label="למחוק את ${esc(d.title)}">${icon('trash')}</button></div>`).join('');
  return `
  ${back('studies', 'לימודים')}
  ${heading(esc(c.name), p.exam !== null ? `מבחן ${countdown(p.exam)} · ${esc(dateLabel(c.examDate))}` : 'קורס')}
  <section class="hero">
    <div class="hero-number"><b>${p.total ? `${p.percent}%` : '—'}</b><span>התקדמות</span></div>
    <div class="hero-body">
      ${bar(p.percent, `${p.percent}%`)}
      <p>${p.total ? `${p.done} מתוך ${p.total} נושאים הושלמו` : 'מוסיפים נושאים מהסילבוס, ומסמנים אותם כשמסיימים.'}</p>
      ${p.next ? `<p><b>הבא בתור:</b> ${esc(p.next.title)}</p>` : ''}
      <p class="muted">השבוע למדת ${duration(p.studiedThisWeek)}.</p>
    </div>
    <div class="hero-actions">
      <button class="primary" data-action="find-time" data-type="course" data-id="${esc(c.id)}">${icon('clock')} מצא לי זמן ללמוד</button>
      <button class="text-button" data-action="edit-course" data-id="${esc(c.id)}">${icon('edit')} עריכת הקורס</button>
    </div>
  </section>
  ${findPanel(ui, 'course', c.id)}
  <section>
    ${section('נושאים', 'לחיצה על הסטטוס משנה אותו: עוד לא התחלתי ← בלמידה ← סיימתי.', `<button class="text-button" data-action="add-topics" data-id="${esc(c.id)}">${icon('file')} סילבוס / נושאים</button>`)}
    ${topics ? `<div class="topics">${topics}</div>` : `<div class="day-empty"><p>אפשר להדביק את רשימת הנושאים או לטעון את קובץ הסילבוס (Word או טקסט).</p><button class="primary" data-action="add-topics" data-id="${esc(c.id)}">${icon('file')} להוסיף סילבוס</button></div>`}
  </section>
  <section>
    ${section('מבחנים והגשות')}
    ${deadlines ? `<div class="deadlines">${deadlines}</div>` : ''}
    <form class="inline-form" data-form="deadline" data-course="${esc(c.id)}">
      <input name="title" maxlength="120" placeholder="למשל: תרגיל בית 3" aria-label="שם ההגשה" required>
      <input name="date" type="date" aria-label="תאריך" required>
      <button class="text-button" type="submit">${icon('plus')} להוסיף</button>
    </form>
  </section>
  <section>
    ${section('במערכת השעות', '', `<button class="text-button" data-action="new-class" data-course="${esc(c.id)}">${icon('plus')} שיעור לקורס</button>`)}
    ${classes.length ? `<div class="mini-list">${classes.map(x => `<button class="tt-class" data-action="edit-class" data-id="${esc(x.id)}"><b>${x.days.map(d => DAY_NAMES[d]).join(', ')}</b><bdi dir="ltr">${x.start}–${x.end}</bdi>${x.location ? `<small>${esc(x.location)}</small>` : ''}</button>`).join('')}</div>` : '<p class="field-help">עוד אין שיעורים של הקורס הזה במערכת.</p>'}
  </section>`;
}

// "Find me time": the person picks a length, then taps one of the free slots.
function findPanel(ui, type, id) {
  const f = ui.find;
  if (!f || f.type !== type || f.id !== id) return '';
  const slots = f.slots.map((s, n) => `<button class="slot" data-action="take-slot" data-n="${n}">${esc(dayLabel(s.date))} · <bdi dir="ltr">${s.start}–${s.end}</bdi></button>`).join('');
  if (f.rest !== undefined) {
    const planned = f.planned ? `<p class="field-help">${f.planned === 1 ? 'פעם אחת כבר בלו״ז' : `${f.planned} פעמים כבר בלו״ז`}.</p>` : '';
    return `<section class="find-panel" aria-label="שיבוץ מה שנשאר">
    ${planned}
    ${!f.rest ? '<p class="field-help">כל מה שנשאר השבוע כבר בלו״ז.</p>'
      : slots ? `<p class="field-help">${f.slots.length < f.rest ? `נמצא זמן ל־${f.slots.length} מתוך ${f.rest}` : 'מפוזר על השבוע. לחיצה על זמן מכניסה רק אותו'}:</p><div class="slots">${slots}</div>
      <button class="primary" data-action="take-all">${icon('check')} להכניס ${f.slots.length === 1 ? 'אותו' : `את כל ה־${f.slots.length}`}</button>`
      : '<p class="field-help">אין זמן פנוי השבוע באורך של פעם אחת.</p>'}
    <button class="text-button muted" data-action="close-find">סגירה</button>
  </section>`;
  }
  return `<section class="find-panel" aria-label="מציאת זמן">
    <div class="find-head"><b>כמה זמן?</b><div class="duration-options">${[30, 45, 60, 90, 120].map(m => `<button data-action="find-length" data-minutes="${m}" class="${m === f.minutes ? 'active' : ''}">${duration(m)}</button>`).join('')}</div></div>
    ${slots ? `<p class="field-help">זמנים פנויים בשבוע הקרוב. לחיצה מכניסה ללו״ז:</p><div class="slots">${slots}</div>` : '<p class="field-help">אין זמן פנוי באורך הזה בשבוע הקרוב. אפשר לבחור זמן קצר יותר.</p>'}
    <button class="text-button muted" data-action="close-find">סגירה</button>
  </section>`;
}

// ── Personal goals ──
export function goals(state) {
  const date = localDate();
  const cards = state.goals.map((g, i) => { const p = goalProgress(g, date), s = goalStats(g, date); return `<a class="big-card note goal-note${p.reached ? ' is-reached' : ''}" href="#goal/${esc(g.id)}" style="${tint(goalColor(i))}">
      <span class="tape" aria-hidden="true"></span>
      <div class="goal-note-body">${ring(p.percent, g.unit === 'minutes' ? Math.round(p.done / 6) / 10 : Math.round(p.done * 10) / 10, 'small')}
        <div><h3>${esc(g.title)}</h3><p>${esc(goalSummary(g, date))}</p>
        ${g.period === 'week' ? `<p class="goal-streak">${s.streak ? `${s.streak} ${s.streak === 1 ? 'שבוע' : 'שבועות'} ברצף ביעד` : g.type === 'sport' ? 'ספורט' : 'תחביב'}</p>` : ''}</div></div></a>`; }).join('');
  return `
  ${heading('מטרות אישיות', 'ספורט ותחביבים')}
  ${section('המטרות שלי', '', `<button class="primary small" data-action="new-goal">${icon('target')} מטרה חדשה</button>`)}
  ${cards ? `<div class="card-grid">${cards}</div>` : `<div class="welcome"><div class="welcome-icon">${icon('target')}</div><h2>מה חשוב לך?</h2><p>למשל 3 אימונים בשבוע, 2 ריצות, 3 תרגולי גיטרה או 300 עמודים בספר.</p><button class="primary" data-action="new-goal">מטרה ראשונה</button></div>`}`;
}

export function goalPage(state, id, ui) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return `${back('goals', 'מטרות אישיות')}<div class="day-empty"><h3>המטרה לא נמצאה</h3></div>`;
  const index = state.goals.indexOf(g), date = localDate(), p = goalProgress(g, date), unit = unitLabel(g), s = goalStats(g, date);
  const amount = n => g.unit === 'minutes' ? duration(n) : `${Math.round(n * 10) / 10} ${unit}`;
  const left = Math.max(0, g.target - p.done), weekly = g.period === 'week';
  const log = p.entries.map(l => `<div class="log-row"><span>${esc(fullDayLabel(l.date, date))}</span><b>${esc(amount(l.amount))}</b><button class="icon-button" data-action="delete-log" data-goal="${esc(g.id)}" data-id="${esc(l.id)}" aria-label="למחוק את הרישום">${icon('trash')}</button></div>`).join('');
  const top = Math.max(g.target, ...s.history.map(h => h.done), 1);
  const short = d => { const x = new Date(`${d}T12:00:00`); return `${x.getDate()}.${x.getMonth() + 1}`; };
  const chart = weekly ? `<div class="goal-chart" style="${tint(goalColor(index))}" role="img" aria-label="8 השבועות האחרונים">
    <div class="goal-bars">${s.history.map((h, i) => `<i class="${h.done >= g.target ? 'is-hit' : ''}${i === 7 ? ' is-now' : ''}" style="height:${Math.round(h.done / top * 100)}%" title="${esc(amount(h.done))}"></i>`).join('')}
      <span class="goal-target" style="bottom:${Math.round(g.target / top * 100)}%">יעד</span></div>
    <div class="goal-labels">${s.history.map((h, i) => `<small>${i === 7 ? 'השבוע' : short(h.week)}</small>`).join('')}</div></div>` : '';
  return `
  ${back('goals', 'מטרות אישיות')}
  ${heading(esc(g.title), `${g.type === 'sport' ? 'ספורט' : 'תחביב'} · יעד ${weekly ? 'שבועי' : 'כולל'}`)}
  <section class="goal-hero" style="${tint(goalColor(index))}">
    ${ring(p.percent, g.unit === 'minutes' ? Math.round(p.done / 6) / 10 : Math.round(p.done * 10) / 10, 'big', `מתוך ${g.unit === 'minutes' ? `${Math.round(g.target / 6) / 10} שעות` : `${g.target} ${esc(unit)}`}`)}
    <div class="goal-hero-side">
      <p class="goal-headline">${p.reached ? 'הגעת ליעד. כל הכבוד!' : `עוד ${esc(amount(left))}${weekly ? ' השבוע' : ''}`}</p>
      ${weekly ? `<div class="week-dots" aria-label="הימים השבוע">${s.days.map((d, i) => `<span class="${d.done ? 'is-done' : ''}${d.date === date ? ' is-today' : ''}" title="${esc(fullDayLabel(d.date, date))}">${d.done ? icon('check') : DAY_SHORT[i]}</span>`).join('')}</div>` : bar(p.percent, goalSummary(g, date))}
      <div class="goal-actions">
        <button class="primary" data-action="log-goal" data-id="${esc(g.id)}">${icon('check')} ${g.unit === 'times' ? 'עשיתי' : 'לרשום'}</button>
        ${weekly && g.unit === 'times' && left > 0 ? `<button class="text-button" data-action="plan-rest" data-id="${esc(g.id)}">${icon('week')} לשבץ את מה שנשאר</button>` : `<button class="text-button" data-action="find-time" data-type="goal" data-id="${esc(g.id)}">${icon('clock')} מצא לי זמן</button>`}
        <button class="text-button" data-action="edit-goal" data-id="${esc(g.id)}">${icon('edit')} עריכה</button>
      </div>
    </div>
  </section>
  ${findPanel(ui, 'goal', g.id)}
  <div class="goal-stats" style="${tint(goalColor(index))}">
    ${weekly ? `<div><b>${s.streak}</b><span>${s.streak === 1 ? 'שבוע ברצף ביעד' : 'שבועות ברצף ביעד'}</span></div><div><b>${esc(amount(s.best))}</b><span>השבוע הכי טוב</span></div>` : ''}
    <div><b>${esc(amount(s.total))}</b><span>מאז ההתחלה</span></div>
  </div>
  ${chart ? `<section>${section('8 השבועות האחרונים')}${chart}</section>` : ''}
  <section>${section(weekly ? 'הרישומים השבוע' : 'כל הרישומים')}${log ? `<div class="log">${log}</div>` : '<p class="field-help">כשמסמנים "סיימתי" על פעילות של המטרה בלו״ז, היא נרשמת כאן לבד.</p>'}</section>`;
}

const goalColor = i => PALETTE[(i + 4) % PALETTE.length];
// A progress ring drawn like a pen circle around the number.
function ring(percent, value, size, caption = '') {
  const r = 42, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, percent));
  return `<div class="ring ring-${size}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="ring-track"/><circle cx="50" cy="50" r="${r}" class="ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}"/></svg><span><b>${value}</b>${caption ? `<small>${caption}</small>` : ''}</span></div>`;
}

// ── Work ──
const monthLabel = month => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('he-IL', {month: 'long', year: 'numeric'});
const monthNav = month => `<div class="month-nav"><button class="icon-button" data-action="month" data-step="-1" aria-label="חודש קודם">${icon('back')}</button><b>${esc(monthLabel(month))}</b><button class="icon-button" data-action="month" data-step="1" aria-label="חודש הבא">${icon('arrow')}</button></div>`;

// A glass jar that fills with coins as shifts end. The level is what came in, out of what the month holds.
function jar(earned, expected, ongoing) {
  const level = expected > 0 ? Math.min(1, earned / expected) : 0, top = 222 - level * 170;
  const coins = Array.from({length: Math.round(level * 26)}, (_, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    return `<ellipse cx="${58 + col * 21 + (row % 2) * 10}" cy="${214 - row * 13}" rx="13" ry="5.5" class="coin" style="--i:${i}"/>`;
  }).join('');
  return `<div class="jar" data-earned="${Math.round(earned)}">
    <svg viewBox="0 0 200 240" role="img" aria-label="נכנס עד היום ${money(earned)}">
      <defs><clipPath id="jar-inside"><path d="M48 52h104c8 0 14 6 14 14v146c0 12-10 20-22 20H56c-12 0-22-8-22-20V66c0-8 6-14 14-14Z"/></clipPath>
        <linearGradient id="jar-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6cf5c"/><stop offset="1" stop-color="#d9a12a"/></linearGradient></defs>
      <g clip-path="url(#jar-inside)">
        <rect class="jar-fill" x="30" y="${top}" width="140" height="${240 - top}" fill="url(#jar-gold)" opacity=".28"/>
        <g class="jar-coins">${coins}</g>
      </g>
      <path class="jar-glass" d="M48 52h104c8 0 14 6 14 14v146c0 12-10 20-22 20H56c-12 0-22-8-22-20V66c0-8 6-14 14-14Z"/>
      <path class="jar-shine" d="M52 78v110"/>
      <rect class="jar-lid" x="54" y="26" width="92" height="22" rx="6"/>
      <g class="jar-drop" aria-hidden="true"><ellipse cx="100" cy="10" rx="13" ry="5.5" class="coin"/></g>
    </svg>
    <div class="jar-amount"><b data-count="${Math.round(earned)}">${money(earned)}</b><span>נכנס עד היום</span></div>
    ${ongoing ? `<p class="jar-live"><i></i> עכשיו במשמרת ב${esc(ongoing.job?.name || '')}: +${money(ongoing.sofar)} עד עכשיו</p>` : ''}
  </div>`;
}

function shiftRows(list, state, today, showJob = true) {
  return list.map(s => `<button class="shift-row${s.past ? ' is-past' : ''}" data-action="edit-shift" data-id="${esc(s.id)}" aria-label="עריכת המשמרת" style="${tint(jobColor(state, s.jobId))}">
    <span class="shift-when"><b>${esc(fullDayLabel(s.date, today))}</b><bdi dir="ltr">${shiftLabel(s)}</bdi></span>
    ${showJob ? `<span class="shift-what">${esc(state.jobs.find(j => j.id === s.jobId)?.name || '')}</span>` : '<span></span>'}
    <b class="shift-pay">${money(s.pay)}</b>
    <span class="shift-state">${s.past ? icon('check') : ''}</span></button>`).join('');
}

export function work(state, ui, now = new Date()) {
  const today = localDate(now), month = ui.month || today.slice(0, 7);
  if (!state.jobs.length) return `${heading('עבודה')}
    <div class="welcome"><div class="welcome-icon">${icon('work')}</div><h2>איפה אתה עובד?</h2>
    <p>מוסיפים את העסק ואת השכר לשעה, ואז את המשמרות של השבוע. הכסף נאסף לצנצנת אחרי כל משמרת.</p>
    <button class="primary" data-action="new-job">${icon('plus')} להוסיף עסק</button></div>`;
  const sum = monthSummary(state, month, now), thisMonth = month === today.slice(0, 7);
  const upcoming = sum.shifts.filter(s => !s.past);
  return `
  ${heading('עבודה')}
  ${monthNav(month)}
  <section class="jar-card">
    ${jar(thisMonth ? sum.earned : sum.pay, sum.pay, thisMonth ? sum.ongoing : null)}
    <div class="jar-side">
      <p class="jar-stat"><b>${money(sum.pay)}</b><span>${thisMonth ? 'צפוי החודש' : 'בחודש הזה'}</span></p>
      <p class="jar-stat"><b>${hoursLabel(sum.hours)}</b><span>${sum.shifts.length} משמרות</span></p>
      ${thisMonth && upcoming.length ? `<p class="jar-stat"><b>${money(sum.pay - sum.earned)}</b><span>עוד בדרך</span></p>` : ''}
      <button class="primary" data-action="week-shifts">${icon('week')} משמרות לשבוע הקרוב</button>
    </div>
  </section>
  <section>${section('העסקים שלי', '', `<button class="text-button" data-action="new-job">${icon('plus')} עסק</button>`)}
    <div class="card-grid">${sum.jobs.map(j => `<a class="big-card note" href="#job/${esc(j.job.id)}" style="${tint(j.job.color)}">
      <span class="tape" aria-hidden="true"></span>
      <h3>${esc(j.job.name)}</h3>
      <b class="note-amount">${money(j.pay)}</b>
      <p>${money(j.job.wage)} לשעה · ${j.shifts.length} משמרות</p></a>`).join('')}</div>
  </section>
  <section>${section('המשמרות', '', `<button class="text-button" data-action="new-shift">${icon('plus')} משמרת אחת</button>`)}
    ${sum.shifts.length ? `<div class="shifts">${shiftRows(sum.shifts, state, today)}</div>` : '<div class="day-empty"><p>אין משמרות בחודש הזה.</p></div>'}
  </section>`;
}

export function jobPage(state, id, ui, now = new Date()) {
  const job = state.jobs.find(j => j.id === id);
  if (!job) return `${back('work', 'עבודה')}<div class="day-empty"><h3>העסק לא נמצא</h3></div>`;
  const today = localDate(now), month = ui.month || today.slice(0, 7), thisMonth = month === today.slice(0, 7);
  const sum = monthSummary(state, month, now), mine = sum.jobs.find(j => j.job.id === id);
  const ongoing = sum.ongoing?.shift.jobId === id ? sum.ongoing : null;
  return `
  ${back('work', 'עבודה')}
  ${heading(esc(job.name), `${money(job.wage)} לשעה`)}
  ${monthNav(month)}
  <section class="jar-card">
    ${jar(thisMonth ? mine.earned : mine.pay, mine.pay, thisMonth ? ongoing : null)}
    <div class="jar-side">
      <p class="jar-stat"><b>${money(mine.pay)}</b><span>${thisMonth ? 'צפוי החודש' : 'בחודש הזה'}</span></p>
      <p class="jar-stat"><b>${hoursLabel(mine.hours)}</b><span>${mine.shifts.length} משמרות</span></p>
      <button class="primary" data-action="week-shifts" data-job="${esc(job.id)}">${icon('week')} משמרות לשבוע הקרוב</button>
      <button class="text-button" data-action="edit-job" data-id="${esc(job.id)}">${icon('edit')} עריכת העסק</button>
    </div>
  </section>
  <section>${section('המשמרות', '', `<button class="text-button" data-action="new-shift" data-job="${esc(job.id)}">${icon('plus')} משמרת אחת</button>`)}${mine.shifts.length ? `<div class="shifts">${shiftRows(mine.shifts, state, today, false)}</div>` : '<div class="day-empty"><p>אין משמרות בחודש הזה.</p></div>'}</section>`;
}

// ── Calendar ──
// One look per kind of thing, the same in the grid, the list and the legend.
const TYPES = {class: ['שיעור', 'book'], shift: ['משמרת', 'work'], study: ['לימודים', 'book'], goal: ['מטרה', 'target'],
  event: ['אירוע', 'week'], task: ['משימה', 'check'], other: ['אחר', 'sun']};
const typeOf = e => e.type === 'item' ? e.kind : e.type;
// A shift wears its workplace's color.
const jobColor = (state, jobId) => state.jobs.find(j => j.id === jobId)?.color;
const tint = color => color ? `--c:${color};--soft:${soft(color)};` : '';
const tintOf = (state, e) => e.type === 'shift' ? tint(jobColor(state, e.jobId)) : '';
const entryAction = e => e.type === 'shift' ? `data-action="edit-shift" data-id="${esc(e.id)}"`
  : e.type === 'item' && !e.allDay ? `data-action="move-item" data-id="${esc(e.id)}"` : '';
const entryLink = (e, inner, cls, style = '') => e.type === 'class' && e.courseId
  ? `<a class="${cls}" href="#course/${esc(e.courseId)}"${style}>${inner}</a>`
  : `<button type="button" class="${cls}" ${entryAction(e)}${style}${entryAction(e) ? '' : ' disabled'}>${inner}</button>`;

export function calendar(state, ui, now = new Date()) {
  // On Saturday the week is over, so the calendar opens on the coming one.
  const today = localDate(now), start = ui.week || addDays(weekStart(today), now.getDay() === 6 ? 7 : 0);
  const days = Array.from({length: 7}, (_, i) => addDays(start, i)).map(date => ({date, entries: dayAgenda(state, date, {now}).entries}));
  const used = [...new Set(days.flatMap(d => d.entries.map(typeOf)))].filter(t => t !== 'shift');
  const jobsUsed = state.jobs.filter(j => days.some(d => d.entries.some(e => e.type === 'shift' && e.jobId === j.id)));
  const legend = used.length || jobsUsed.length ? `<div class="cal-legend">${used.map(t => `<span class="t-${t}"><i></i>${TYPES[t][0]}</span>`).join('')}${jobsUsed.map(j => `<span style="${tint(j.color)}"><i></i>${esc(j.name)}</span>`).join('')}</div>` : '';
  return `
  ${heading('יומן', `${esc(dateLabel(start))} – ${esc(dateLabel(addDays(start, 6)))}`)}
  <div class="cal-nav"><button class="text-button" data-action="week" data-step="-7">${icon('back')} שבוע קודם</button><button class="text-button" data-action="week" data-step="0">השבוע</button><button class="text-button" data-action="week" data-step="7">שבוע הבא ${icon('arrow')}</button></div>
  ${legend}
  <p class="field-help">השיעורים ממערכת השעות מופיעים כאן אוטומטית, לפי ימי הלימוד ותאריכי הסמסטר. <a href="#studies">עריכת מערכת השעות</a></p>
  ${timetableNotice(state.classes, start)}
  ${calendarGrid(state, days, today)}
  ${calendarList(state, days, today)}`;
}

// Computers: the week as seven columns of cards in time order. Nothing is squeezed or cut;
// free time shows between the cards, and things that overlap say so.
function calendarGrid(state, days, today) {
  const endOf = e => e.end === '24:00' ? 1440 : toMin(e.end);
  const columns = days.map(({date, entries}) => {
    const name = date === today ? 'היום' : DAY_NAMES[new Date(`${date}T12:00:00`).getDay()];
    let last = null;
    const cards = entries.map(e => {
      const type = typeOf(e), a = e.allDay ? null : toMin(e.start), b = e.allDay ? null : endOf(e);
      const gap = last !== null && a !== null && a - last >= 90 ? `<div class="board-free">פנוי ${duration(a - last)}</div>` : '';
      const clash = last !== null && a !== null && a < last;
      if (b !== null) last = Math.max(last ?? 0, b);
      return gap + entryLink(e, `<span class="board-time">${e.allDay ? 'כל היום' : `<bdi>${e.start}</bdi> <small>עד <bdi>${e.end}</bdi></small>`}</span>
        <b>${esc(e.title)}</b>
        <span class="board-kind" title="${TYPES[type][0]}">${icon(TYPES[type][1])}${a !== null ? duration(b - a) : TYPES[type][0]}${clash ? `<em>${icon('alert')} חופף</em>` : ''}</span>`,
        `board-card t-${type}${e.done ? ' is-done' : ''}`, tintOf(state, e) ? ` style="${tintOf(state, e)}"` : '');
    }).join('');
    return `<section class="board-day${date === today ? ' is-today' : ''}${entries.length ? '' : ' is-free'}">
      <h3><span>${esc(name)}</span><b>${new Date(`${date}T12:00:00`).getDate()}</b></h3>
      ${cards || '<p class="board-empty">יום פנוי</p>'}</section>`;
  }).join('');
  // Free days take less room, so busy days get space for their words.
  const widths = days.map(d => d.entries.length ? 'minmax(0,1.6fr)' : 'minmax(0,.7fr)').join(' ');
  return `<div class="cal-grid board" style="grid-template-columns:${widths}">${columns}</div>`;
}
// Phones: day by day, the hour large on the side and the kind of thing in color; free days fold into a short line.
function calendarList(state, days, today) {
  return `<div class="cal-list">${days.map(({date, entries}) => `
    <section class="cal-day${date === today ? ' is-today' : ''}${entries.length ? '' : ' is-free'}">
      <h3>${esc(dayLabel(date, today))} <small>${esc(dateLabel(date))}</small>${entries.length ? '' : '<em>פנוי</em>'}</h3>
      ${entries.map(e => entryLink(e, `<span class="cal-time" dir="ltr">${e.allDay ? 'כל היום' : `<b>${e.start}</b><small>${e.end}</small>`}</span>
        <span class="cal-what"><span class="cal-kind">${icon(TYPES[typeOf(e)][1])}${TYPES[typeOf(e)][0]}</span><b>${esc(e.title)}</b></span>`,
        `cal-row t-${typeOf(e)}${e.done ? ' is-done' : ''}`, tintOf(state, e) ? ` style="${tintOf(state, e)}"` : '')).join('')}
    </section>`).join('')}</div>`;
}
