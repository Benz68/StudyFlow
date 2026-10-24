import {semesterFields, updateSemester} from './timetable.mjs';
// The app: one state object saved in this browser, screens chosen by the address (#today, #course/ID…),
// and every change made through mutate() so it is validated, saved and can be undone.
import {esc, uid, localDate, addDays, toMin, toClock, weekStart, validDate, dayLabel, dateLabel, PALETTE, icon} from './util.mjs';
import {loadState, saveState, validateState, migrateV1, demoState, createState} from './store.mjs';
import {signInScreen, waitScreen, onboardingScreen, TERMS_VERSION} from './onboarding.mjs';
import {tourSteps, tourBubble} from './tour.mjs';
import {shell, sheetTop, today, studies, coursePage, goals, goalPage, calendar, work, jobPage, openQuestions} from './screens.mjs';
import {classForm, icsPreview, courseForm, topicsForm, goalForm, logForm, moveForm, settingsForm, helpContent, jobForm, shiftForm, weekShiftsForm, payCard, accountSheet, deleteAccountSheet, chooseCopySheet} from './dialogs.mjs';
import {createCloud, decide, isEmpty} from './cloud.mjs';
import {parseTell} from './tell.mjs';
import {propose, toItems, toShifts} from './propose.mjs';
import {findTime, planRest, shiftClashes, conflictsFor, classesOn, placeFlexible, alternatives} from './schedule.mjs';
import {repeatDates} from './work.mjs';
import {parseICS, courseNameOf} from './ics.mjs';
import {fileText, readSyllabus} from './syllabus.mjs';
import {amountForSession} from './progress.mjs';

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
let {state, notice} = loadState();
const cloud = createCloud();
let saved = null, undoState = null, toastTimer = null, recognition = null, returnFocus = null;
const ui = {tellText: '', drafts: null, proposals: null, find: null, week: '', demo: false, micAvailable: !!Recognition, listening: false, pending: null};

document.querySelector('#app').innerHTML = shell();
// The way in (sign-in, then the first-time questions) covers the app until it is done.
document.body.insertAdjacentHTML('beforeend', '<div id="gate" hidden></div>');
const gate = document.querySelector('#gate'), appRoot = document.querySelector('#app');
const main = document.querySelector('#main'), sheet = document.querySelector('#sheet');
// Forms open above everything, the way in included (adding a class during the first-time questions).
document.body.append(sheet, document.querySelector('#toast'));
const clone = value => JSON.parse(JSON.stringify(value));
navigator.storage?.persist?.().catch(() => {});

// ── Rendering ──
const route = () => { const [name, id] = location.hash.slice(1).split('/'); return {name: name || 'today', id: decodeURIComponent(id || '')}; };

// What covers the app right now: signing in, loading the account on a new device, or the first-time questions.
function gateScreen() {
  if (ui.signingIn) return waitScreen('מתחבר…');
  if (!cloud.user) return signInScreen({...ui.gate, agreed: agreedHere()});
  if (!ui.firstSync && isEmpty(state) && !cloud.syncInfo().syncedAt) {
    return ui.loadError ? waitScreen('אין חיבור לאינטרנט. בפעם הראשונה צריך חיבור כדי לטעון את המידע שלך.', {retry: true}) : waitScreen('טוען את המידע שלך…');
  }
  if (!ui.demo && !state.profile.onboarded) return onboardingScreen(ui.obStep || 'name', state);
  return '';
}

// Agreeing to the terms on the way in is kept on the device until there is an account to keep it in.
const agreedHere = () => { try { return localStorage.getItem('studyflow.terms') === TERMS_VERSION; } catch { return false; } };
function mustAgree() {
  const box = gate.querySelector('#gate-agree');
  if (box?.checked) { try { localStorage.setItem('studyflow.terms', TERMS_VERSION); } catch { /* asked again next time */ } return false; }
  ui.gate = {...ui.gate, error: 'כדי להמשיך צריך לאשר את תנאי השימוש ואת מדיניות הפרטיות.'}; render();
  gate.querySelector('.gate-consent')?.classList.add('is-missing');
  return true;
}

function render() {
  if (cloud.user && !ui.demo && state.profile.terms !== TERMS_VERSION && agreedHere()) { state.profile.terms = TERMS_VERSION; saveState(state); changedHere(); }
  const cover = gateScreen();
  if (cover) {
    const focused = document.activeElement?.closest?.('#gate') ? document.activeElement.id : '';
    gate.innerHTML = cover; gate.hidden = false; appRoot.inert = true; document.body.classList.add('gated');
    (focused && gate.querySelector(`#${CSS.escape(focused)}`) || gate.querySelector('[autofocus]'))?.focus?.({preventScroll: true});
    return;
  }
  if (!gate.hidden) { gate.hidden = true; gate.innerHTML = ''; appRoot.inert = false; document.body.classList.remove('gated'); }
  const {name, id} = route();
  const active = document.activeElement, focusKey = active?.dataset?.p !== undefined ? `[data-p="${active.dataset.p}"][data-field="${active.dataset.field}"]` : '';
  const screens = {today: () => today(state, ui), studies: () => studies(state), course: () => coursePage(state, id, ui),
    goals: () => goals(state), goal: () => goalPage(state, id, ui), calendar: () => calendar(state, ui),
    work: () => work(state, ui), job: () => jobPage(state, id, ui)};
  main.innerHTML = noticeBanner() + (screens[name] || screens.today)();
  placeTour();

  const tab = {course: 'studies', goal: 'goals', job: 'work'}[name] || name;
  document.querySelectorAll('[data-route]').forEach(b => { const on = b.dataset.route === tab; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  if (focusKey) main.querySelector(focusKey)?.focus({preventScroll: true});
  if (name === 'work' || name === 'job') fillJar(`${name}:${id}:${ui.month || ''}`);
}

// When money arrives (a shift ended since the last look), a coin drops into the jar and the number counts up.
// What was last seen is a per-device convenience only, so storage problems just skip the animation.
function fillJar(key) {
  const el = main.querySelector('.jar'); if (!el || ui.demo) return;
  const earned = Number(el.dataset.earned);
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('studyflow.jar.seen') || '{}'); } catch { return; }
  const before = seen[key];
  try { localStorage.setItem('studyflow.jar.seen', JSON.stringify({...seen, [key]: earned})); } catch { /* fine */ }
  if (before === undefined || earned <= before || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.add('is-dropping');
  const number = el.querySelector('[data-count]'), started = performance.now();
  const step = time => {
    const p = Math.min(1, (time - started) / 1200), value = Math.round(before + (earned - before) * (1 - (1 - p) ** 3));
    number.textContent = `${value.toLocaleString('he-IL')} ₪`;
    if (p < 1) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), 600);
}
// While on the work screens, refresh every minute: a running shift's money grows, and an ended one drops in.
setInterval(() => { if (['work', 'job'].includes(route().name) && !sheet.open && !document.hidden) render(); }, 60000);

// A new workplace gets a color no other workplace uses yet.
const nextJobColor = () => PALETTE.find(c => !state.jobs.some(j => j.color === c)) || PALETTE[state.jobs.length % PALETTE.length];
// The work week is Sunday to Friday. On Saturday, the week to plan is the coming one.
const thisWorkWeek = () => weekStart(localDate());
const workWeek = () => new Date().getDay() === 6 ? addDays(thisWorkWeek(), 7) : thisWorkWeek();
const lastTimes = jobId => {
  const last = [...state.shifts].filter(s => s.jobId === jobId).sort((a, b) => b.date.localeCompare(a.date))[0];
  return last ? {start: last.start, end: last.end} : {start: '16:00', end: '22:00'};
};

function noticeBanner() {
  const text = {
    migrated: 'עברנו לגרסה החדשה. הקורסים, מערכת השעות והמטרות עברו. התוכנית הישנה נשמרה בגיבוי במכשיר.',
    unreadable: 'השמירה הקודמת לא הייתה קריאה, אז התחלנו מחדש. העותק הישן נשמר בצד ולא נמחק.',
    storage: 'הדפדפן לא מאפשר לשמור. אפשר להשתמש, אבל השינויים לא יישמרו אחרי סגירה.',
    unsaved: 'השינוי מוצג, אבל לא נשמר במכשיר. כדאי להוריד גיבוי דרך ההעדפות.',
  }[notice];
  return text ? `<p class="storage-warning" role="status">${text} <button class="text-button" data-action="dismiss-notice">הבנתי</button></p>` : '';
}

function toast(message, withUndo = false) {
  clearTimeout(toastTimer);
  const el = document.querySelector('#toast');
  el.replaceChildren(Object.assign(document.createElement('span'), {textContent: message}));
  if (withUndo) el.append(Object.assign(document.createElement('button'), {textContent: 'לבטל את השינוי', className: 'toast-undo'}));
  el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 6000);
}

function mutate(change, message) {
  undoState = clone(state);
  change();
  state = validateState(state);
  if (!ui.demo) { const ok = saveState(state); notice = ok ? (notice === 'unsaved' ? '' : notice) : 'unsaved'; changedHere(); }
  render();
  if (message) toast(message, true);
}

// ── Account and cloud copy ──
// The device copy is the one the app works on. With an account it is also kept in the cloud: sent a moment
// after each change, and checked whenever the app comes back to the front or the connection returns.
ui.sync = {status: '', at: cloud.syncInfo().syncedAt || 0};
let syncTimer = null, syncing = false;
const CLOUD_ERRORS = {offline: 'אין חיבור לאינטרנט.', 'too-many': 'כבר שלחנו קוד לפני רגע. הקוד מהמייל האחרון עובד, ואפשר לבקש חדש בעוד דקה.',
  'bad-code': 'הקוד לא נכון או שפג תוקפו. אפשר לבקש קוד חדש.', 'provider-off': 'הכניסה עם Google עוד לא מופעלת.', failed: 'משהו השתבש. אפשר לנסות שוב.'};
const cloudError = e => CLOUD_ERRORS[e?.code] || CLOUD_ERRORS.failed;
function changedHere() { cloud.setSyncInfo({editedAt: Date.now()}); if (cloud.user) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 2000); } }
function setSync(status, at = ui.sync.at) {
  ui.sync = {status, at};
  if (sheet.open && sheet.querySelector('.sync-line')) sheet.querySelector('.sheet-page').innerHTML = accountSheet(cloud.user, {sync: ui.sync});
}
// ── The guided tour ──
// Right after the first-time questions it runs on the sample planner, so each screen has something to show;
// one real part of the screen at a time is lit, the rest dimmed. Ending it returns to the person's own planner.
const tourLayer = Object.assign(document.createElement('div'), {id: 'tour', hidden: true});
document.body.append(tourLayer);
function finishOnboarding() {
  ui.obStep = '';
  mutate(() => { state.profile.onboarded = true; });
  startTour();
}
function startTour() {
  const areas = (ui.demo ? saved : state)?.profile?.areas || [];
  if (!ui.demo) { saved = clone(state); state = demoState(); ui.demo = true; ui.tourDemo = true; }
  ui.tour = {i: 0, steps: tourSteps(areas)};
  showTourStep();
}
function showTourStep() {
  const step = ui.tour.steps[ui.tour.i];
  if (route().name !== step.route) location.hash = step.route; else render();
}
function endTour() {
  ui.tour = null; tourLayer.hidden = true; tourLayer.innerHTML = '';
  if (ui.tourDemo) { state = saved || state; saved = null; ui.demo = false; ui.tourDemo = false; undoState = null; }
  if (route().name !== 'today') location.hash = 'today'; else render();
  window.scrollTo(0, 0);
  toast('זהו! עכשיו תורך. מתחילים מ"ספר לי" או מהגדרת מערכת השעות.');
  // While the sample was on show nothing was sent; what changed before it (the first-time answers) goes up now.
  syncNow();
}
// Light the step's part of the screen and put the explanation beside it: the explanation sits at the bottom
// (or the top, for something fixed low on the screen), and the lit part is scrolled into the space left above it.
function placeTour() {
  if (!ui.tour) { if (!tourLayer.hidden) { tourLayer.hidden = true; tourLayer.innerHTML = ''; } return; }
  const step = ui.tour.steps[ui.tour.i], n = ui.tour.i, gap = 14, pad = 8;
  requestAnimationFrame(() => {
    if (!ui.tour || ui.tour.i !== n) return;
    tourLayer.innerHTML = `<div class="tour-hole" style="top:50%;left:50%;width:0;height:0"></div>${tourBubble(step, n, ui.tour.steps.length)}`;
    tourLayer.hidden = false;
    const bubble = tourLayer.querySelector('.tour-bubble'), hole = tourLayer.querySelector('.tour-hole'), h = bubble.offsetHeight;
    const room = innerHeight - h - gap * 3;
    const target = [...document.querySelectorAll(step.target)].find(el => el.getClientRects().length);
    if (target) {
      const r0 = target.getBoundingClientRect(), tall = r0.height + 2 * pad > room;
      window.scrollBy(0, r0.top - (tall ? gap + pad : gap + pad + (room - r0.height - 2 * pad) / 2));
    }
    const r = target?.getBoundingClientRect();
    const below = !r || r.top + r.height / 2 < innerHeight / 2;
    const top = below ? innerHeight - h - gap : gap;
    bubble.style.top = `${Math.max(8, top)}px`;
    if (r) {
      const t = below ? Math.max(4, r.top - pad) : Math.max(top + h + gap, r.top - pad);
      const b = below ? Math.min(r.bottom + pad, top - gap) : Math.min(innerHeight - 4, r.bottom + pad);
      Object.assign(hole.style, {top: `${t}px`, left: `${r.left - pad}px`, width: `${r.width + 2 * pad}px`, height: `${Math.max(0, b - t)}px`});
    }
    bubble.querySelector('[autofocus]')?.focus({preventScroll: true});
  });
}window.addEventListener('resize', () => placeTour());
document.addEventListener('keydown', e => {
  if (!ui.tour) return;
  if (e.key === 'Escape') endTour();
  if (e.key === 'ArrowLeft') tourLayer.querySelector('[data-action="tour-next"]')?.click();
  if (e.key === 'ArrowRight') tourLayer.querySelector('[data-action="tour-prev"]')?.click();
});

function wipeDevice() {
  state = createState(); saveState(state); undoState = null; ui.firstSync = false; ui.obStep = '';
  try { localStorage.removeItem('studyflow.cloud.backup'); } catch { /* nothing kept */ }
}
async function signOutNow() {
  await cloud.signOut(); wipeDevice(); ui.sync = {status: '', at: 0}; ui.gate = {};
  close(); location.hash = 'today'; render();
}
const keepBackup = copy => { try { localStorage.setItem('studyflow.cloud.backup', JSON.stringify({at: Date.now(), state: copy})); } catch { /* best effort */ } };
function useRemote(remote) {
  const at = Date.parse(remote.edited_at);
  try { state = validateState(remote.state); } catch { return false; }
  saveState(state); undoState = null; cloud.setSyncInfo({editedAt: at, syncedAt: at}); render();
  return true;
}
async function syncNow() {
  if (!cloud.user || ui.demo || syncing) return;
  syncing = true; setSync('syncing');
  try {
    if (cloud.syncInfo().userId && cloud.syncInfo().userId !== cloud.user.id) wipeDevice();
    cloud.setSyncInfo({userId: cloud.user.id});
    const info = cloud.syncInfo(), remote = await cloud.pull(), editedAt = info.editedAt || 0;
    const step = decide({editedAt, syncedAt: info.syncedAt || 0, empty: isEmpty(state)}, remote);
    if (step === 'ask') { setSync(''); ui.firstSync = true; render(); ui.pending = {remote}; open(chooseCopySheet(new Date(remote.edited_at).toLocaleDateString('he-IL'))); return; }
    if (step.startsWith('pull')) { if (step === 'pull-keep-other') keepBackup(state); useRemote(remote); }
    if (step.startsWith('push')) {
      if (step === 'push-keep-other') keepBackup(remote.state);
      const at = editedAt || Date.now();
      await cloud.push(state, at);
      cloud.setSyncInfo({editedAt: at, syncedAt: at});
    }
    if (step === 'same') cloud.setSyncInfo({syncedAt: Date.parse(remote.edited_at)});
    setSync('', cloud.syncInfo().syncedAt || Date.now());
    if (!ui.firstSync) { ui.firstSync = true; ui.loadError = false; render(); }
    if (step.endsWith('keep-other')) toast('היו שינויים גם כאן וגם במכשיר אחר. נשמר החדש, והשני נשמר כגיבוי במכשיר.');
  } catch (e) {
    setSync({offline: 'offline', 'no-table': 'setup', 'signed-out': ''}[e.code] ?? 'error');
    if (!ui.firstSync) { ui.loadError = true; render(); }
    if (e.code === 'signed-out') render();
  } finally { syncing = false; }
}
// Coming back from the sign-in email's link (or Google), the address carries the sign-in; it is taken and the address cleaned.
const redirect = cloud.takeRedirect(location.hash);
if (redirect) {
  history.replaceState(null, '', `${location.pathname}#today`);
  if (redirect === 'expired') setTimeout(() => toast('קישור הכניסה כבר לא בתוקף. אפשר לבקש חדש ב"החשבון שלי".'), 300);
  else { ui.signingIn = true; cloud.loadUser().then(() => syncNow(), () => {}).finally(() => { ui.signingIn = false; render(); }); }
}
window.addEventListener('online', () => syncNow());

// ── Dialogs ──
// Every form opens as a full page of its own, never a box over part of the screen.
function open(html) {
  // On a phone the back button should close the form, not leave the screen: the form gets its own history step.
  if (!sheet.open) { returnFocus = document.activeElement; if (!history.state?.sheet) history.pushState({sheet: true}, ''); }
  sheet.innerHTML = `<div class="sheet-page">${html}</div>`;
  sheet.scrollTop = 0;
  if (!sheet.open) sheet.showModal();
  document.body.classList.add('dialog-open');
  (sheet.querySelector('[autofocus]') || sheet.querySelector('#dialog-title'))?.focus?.();
}
function close() { if (sheet.open) { sheet.close(); dropSheetStep(); } }
// Closed by a button or Escape: drop the form's history step, once, unless the action already moved to another screen.
let stepping = false;
function dropSheetStep() { setTimeout(() => { if (!sheet.open && !stepping && history.state?.sheet) { stepping = true; history.back(); } }, 0); }
sheet.addEventListener('close', () => {
  document.body.classList.remove('dialog-open'); ui.pending = null;
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
  dropSheetStep();
});
window.addEventListener('popstate', () => { stepping = false; if (sheet.open) sheet.close(); });
const formError = (form, message) => { const el = form.querySelector('[data-error]'); if (el) el.textContent = message; };

// ── "Tell me" ──
function runTell() {
  const text = (main.querySelector('#tell-text')?.value || ui.tellText).trim();
  ui.tellText = text; ui.tellError = '';
  if (!text) { ui.tellError = 'קודם כותבים או אומרים מה צריך לעשות.'; return render(); }
  const drafts = parseTell(text, state);
  if (!drafts.length) { ui.tellError = 'לא הצלחתי להבין. אפשר לנסות לכתוב כל דבר בנפרד, עם פסיקים.'; return render(); }
  ui.drafts = drafts; refreshProposals();
}
// Answers to the review card's questions (which day, when, is the guessed hour right).
function answer(i, need, value) {
  const d = ui.drafts[i]; if (!d) return;
  if (need === 'day') return editDraft(i, 'date', value);
  if (need === 'when' && value === 'fixed') return editDraft(i, 'mode', 'fixed');
  if (need === 'when' && value !== 'flex') return editDraft(i, 'part', value);
  d.needs = (d.needs || []).filter(n => n !== need);
  refreshProposals();
}
function refreshProposals() { ui.proposals = propose(state, ui.drafts); render(); }
function editDraft(i, field, value) {
  const d = ui.drafts[i]; if (!d) return;
  if (field === 'title') { d.title = value.slice(0, 120); return; }
  if (field === 'date' && validDate(value)) { d.date = value; delete d.deadline; }
  if (field === 'minutes') { d.minutes = Number(value); if (d.fixed && d.start) d.end = toClock(Math.min(toMin(d.start) + d.minutes, 1439)); }
  if (field === 'mode') {
    const placed = ui.proposals[i];
    d.allDay = value === 'allDay'; d.fixed = value !== 'flex';
    if (value === 'fixed') { d.start = placed.start || '10:00'; d.end = placed.end || toClock(toMin(d.start) + (d.minutes || 60)); }
    if (value === 'flex') { delete d.start; delete d.end; d.minutes ||= 60; }
  }
  if (field === 'start' && toMin(value) !== null) {
    // Moving the start keeps the length; a shift may then end after midnight.
    let len = (toMin(d.end) ?? toMin(value) + 60) - (toMin(d.start) ?? toMin(value));
    if (len <= 0) len += 1440;
    const end = toMin(value) + Math.max(15, len);
    d.start = value; d.end = toClock(d.kind === 'shift' ? end % 1440 : Math.min(end, 1439));
  }
  // Only a shift may end after midnight; anything else needs an end after its start.
  if (field === 'end' && toMin(value) !== null && (d.kind === 'shift' ? value !== d.start : toMin(value) > toMin(d.start))) d.end = value;
  if (field === 'part') { d.part = value; d.fixed = false; d.allDay = false; delete d.start; delete d.end; d.minutes ||= 60; }
  if (field === 'jobId') { d.jobId = value; d.title = `משמרת ב${state.jobs.find(j => j.id === value)?.name || ''}`; }
  d.needs = (d.needs || []).filter(n => !(n === 'time' && (field === 'start' || field === 'mode')) && !(n === 'minutes' && field === 'minutes')
    && !(n === 'day' && field === 'date') && !(n === 'when' && ['mode', 'start', 'part'].includes(field)));
  refreshProposals();
}
function commitTell() {
  const items = toItems(ui.proposals, uid), shifts = toShifts(ui.proposals, uid);
  if ((!items.length && !shifts.length) || ui.proposals.some(p => p.status !== 'ok' || openQuestions(p).length)) return;
  const all = [...items, ...shifts];
  mutate(() => {
    state.items.push(...items);
    state.shifts.push(...shifts);
    // A whole day away (reserve duty, a trip) hides that day's classes, as shown on the review card.
    for (const item of items.filter(i => i.allDay)) for (const c of classesOn(state, item.date)) c.skipDates.push(item.date);
  }, `${all.length === 1 ? 'נכנס' : `${all.length} פריטים נכנסו`} ללו״ז${all.every(i => i.date === all[0].date) ? ` של ${dayLabel(all[0].date)}` : ''}.`);
  // Show the day the items went to.
  ui.day = all.map(i => i.date).sort()[0];
  ui.tellText = ''; ui.drafts = null; ui.proposals = null; render();
}

// ── Microphone (the browser's speech recognition; the app itself sends nothing) ──
// Phones differ from computers: Android stops at every short pause and may resend a growing sentence,
// and on an iPhone it works only inside Safari, not from the home screen. So each pause starts a new
// listening run until the person taps stop (or a minute passes), and repeated text is kept once.
const isAndroid = /Android/i.test(navigator.userAgent), isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const MIC_ERRORS = {
  'not-allowed': 'צריך לאשר גישה למיקרופון. אפשר גם ללחוץ על המיקרופון שבמקלדת ולהכתיב.',
  'service-not-allowed': isIOS ? 'באייפון הזיהוי הקולי עובד רק ב-Safari. אפשר ללחוץ על המיקרופון שבמקלדת ולהכתיב.' : 'צריך לאשר גישה למיקרופון. אפשר גם ללחוץ על המיקרופון שבמקלדת ולהכתיב.',
  'audio-capture': 'לא מצאתי מיקרופון במכשיר.',
  'no-speech': 'לא שמעתי כלום. אפשר לנסות שוב, קרוב יותר לטלפון.',
  network: 'הזיהוי הקולי צריך חיבור לאינטרנט.',
};
let micWanted = false;
function toggleMic() {
  if (recognition) { micWanted = false; recognition.stop(); return; }
  let kept = main.querySelector('#tell-text')?.value.trim() || '', finals = [], heard = false;
  const startedAt = Date.now(), join = (...parts) => parts.map(p => p.trim()).filter(Boolean).join(' ');
  const show = interim => { ui.tellText = join(kept, ...finals, interim); const f = main.querySelector('#tell-text'); if (f) f.value = ui.tellText; };
  const run = () => {
    const r = new Recognition();
    r.lang = 'he-IL'; r.continuous = !isAndroid; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim(), last = finals.at(-1);
        if (!event.results[i].isFinal) interim = text;
        else if (last && text.startsWith(last)) finals[finals.length - 1] = text;
        else if (text && text !== last) finals.push(text);
      }
      if (interim || finals.length) heard = true;
      show(interim);
    };
    r.onerror = event => {
      if (event.error === 'aborted') return;
      // Silence after speaking just ends the listening; silence from the start, or any real error, says why.
      if (event.error !== 'no-speech' || !heard) ui.tellError = MIC_ERRORS[event.error] || '';
      micWanted = false;

    };
    r.onend = () => {
      kept = join(kept, ...finals); finals = []; show('');
      if (micWanted && Date.now() - startedAt < 60_000) { try { recognition = run(); return; } catch { /* stop below */ } }
      recognition = null; micWanted = false; ui.listening = false; render();
    };
    r.start();
    return r;
  };
  ui.tellError = ''; micWanted = true;
  try { recognition = run(); } catch { recognition = null; micWanted = false; ui.tellError = 'לא הצלחתי להפעיל את המיקרופון. אפשר ללחוץ על המיקרופון שבמקלדת ולהכתיב.'; return render(); }
  ui.listening = true; render();
}

// ── Items in the schedule ──
function toggleDone(id) {
  const item = state.items.find(i => i.id === id); if (!item) return;
  const minutes = item.allDay ? 0 : toMin(item.end) - toMin(item.start);
  const goal = state.goals.find(g => g.id === item.goalId);
  if (!item.done && goal && amountForSession(goal, minutes) === null) { ui.pending = {doneItem: id}; return open(logForm(goal, id)); }
  mutate(() => {
    const it = state.items.find(i => i.id === id); it.done = !it.done;
    const course = state.courses.find(c => c.id === it.courseId), g = state.goals.find(x => x.id === it.goalId);
    if (it.done) {
      if (course && minutes) course.studyLog.push({date: it.date, minutes});
      if (g) g.log.push({id: uid(), date: it.date, amount: amountForSession(g, minutes), itemId: it.id});
    } else {
      if (course) { const n = course.studyLog.findIndex(l => l.date === it.date && l.minutes === minutes); if (n >= 0) course.studyLog.splice(n, 1); }
      if (g) g.log = g.log.filter(l => l.itemId !== it.id);
    }
  }, item.done ? 'סומן כלא בוצע.' : 'כל הכבוד!');
}

function moveOptions(item) {
  const minutes = toMin(item.end) - toMin(item.start), from = item.date < localDate() ? localDate() : item.date;
  const without = {...state, items: state.items.filter(i => i.id !== item.id)};
  const same = alternatives(without, from, minutes, item.start, {limit: 3}).filter(o => !(o.date === item.date && o.start === item.start));
  const later = [1, 2, 3].map(n => placeFlexible(without, addDays(from, n), minutes)).filter(Boolean);
  return [...same, ...later].slice(0, 6);
}

function addFoundSlot(slot) {
  const f = ui.find, course = f.type === 'course' && state.courses.find(c => c.id === f.id), goal = f.type === 'goal' && state.goals.find(g => g.id === f.id);
  mutate(() => state.items.push({id: uid(), date: slot.date, start: slot.start, end: slot.end, done: false, fixed: false,
    ...(course ? {title: `ללמוד ${course.name}`, kind: 'study', courseId: course.id} : {title: goal.title, kind: 'goal', goalId: goal.id})}), `נכנס ללו״ז: ${dayLabel(slot.date)}, ${slot.start}.`);
  ui.find = f.rest ? restFind(goal) : {...f, slots: findTime(state, f.minutes)}; render();
}
const restFind = goal => ({type: 'goal', id: goal.id, minutes: goal.sessionMinutes, ...planRest(state, goal)});



// ── Clicks ──
document.addEventListener('click', event => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton) { location.hash = routeButton.dataset.route; return; }
  if (event.target.closest('.toast-undo')) {
    if (undoState) { state = undoState; undoState = null; if (!ui.demo) { saveState(state); changedHere(); } render(); toast('השינוי בוטל.'); }
    return;
  }
  const t = event.target.closest('[data-action]'); if (!t) return;
  const id = t.dataset.id, action = t.dataset.action;
  const actions = {
    'close': close,
    'dismiss-notice': () => { notice = ''; render(); },
    'focus-tell': () => { if (route().name !== 'today') location.hash = 'today'; ui.proposals = null; render(); setTimeout(() => main.querySelector('#tell-text')?.focus(), 30); },
    'tell': runTell,
    'answer': () => answer(Number(t.dataset.p), t.dataset.need, t.dataset.value),
    'mic': toggleMic,
    'edit-tell': () => { ui.proposals = null; render(); main.querySelector('#tell-text')?.focus(); },
    'cancel-tell': () => { ui.tellText = ''; ui.drafts = null; ui.proposals = null; render(); },
    'drop-proposal': () => { ui.drafts.splice(Number(t.dataset.p), 1); if (!ui.drafts.length) { ui.drafts = null; ui.proposals = null; render(); } else refreshProposals(); },
    'pick-option': () => { const p = ui.proposals[Number(t.dataset.p)], o = p.options[Number(t.dataset.o)]; Object.assign(ui.drafts[Number(t.dataset.p)], {fixed: true, allDay: false, date: o.date, start: o.start, end: o.end, needs: []}); refreshProposals(); },
    'commit': commitTell,
    'pick-day': () => { ui.day = t.dataset.date === localDate() ? '' : t.dataset.date; render(); },
    'toggle-done': () => toggleDone(id),
    'delete-item': () => mutate(() => { state.items = state.items.filter(i => i.id !== id); for (const g of state.goals) g.log = g.log.filter(l => l.itemId !== id); }, 'נמחק.'),
    'move-item': () => { const item = state.items.find(i => i.id === id); if (!item) return; ui.pending = {move: item.id, options: moveOptions(item)}; open(moveForm(item, ui.pending.options)); },
    'move-to': () => { const o = ui.pending.options[Number(t.dataset.n)], itemId = ui.pending.move; close(); mutate(() => Object.assign(state.items.find(i => i.id === itemId), {date: o.date, start: o.start, end: o.end, done: false}), `הוזז ל־${o.start}.`); },
    'demo': () => { saved = clone(state); state = demoState(); ui.demo = true; render(); },
    'exit-demo': () => { state = saved || state; saved = null; ui.demo = false; undoState = null; render(); syncNow(); },
    // Account
    'account': () => open(accountSheet(cloud.user, {codeFor: cloud.user ? '' : ui.loginEmail || '', sync: ui.sync})),
    'account-other': () => { ui.loginEmail = ''; open(accountSheet(null)); },
    'resend-code': () => cloud.sendCode(ui.loginEmail).then(() => toast('שלחנו מייל חדש.'), e => toast(cloudError(e))),
    'google': () => { if (mustAgree()) return; location.href = cloud.googleUrl(`${location.origin}${location.pathname}`); },
    'sync-now': () => syncNow(),
    'sign-out': async () => {
      await syncNow();
      const info = cloud.syncInfo();
      if ((info.editedAt || 0) > (info.syncedAt || 0)) return open(`${sheetTop('יש שינויים שעוד לא נשמרו בענן')}<p>אין כרגע חיבור, ולכן השינויים האחרונים עוד לא עלו לחשבון. אם תתנתק עכשיו, הם יימחקו מהמכשיר.</p><button class="primary submit-button" data-action="close">להישאר מחובר</button><button class="text-button muted" data-action="sign-out-anyway">להתנתק בכל זאת</button>`);
      signOutNow();
    },
    'sign-out-anyway': () => signOutNow(),
    'delete-account': () => open(deleteAccountSheet()),
    'confirm-delete-account': () => { t.disabled = true; cloud.deleteAccount().then(() => { wipeDevice(); ui.sync = {status: '', at: 0}; ui.gate = {}; close(); location.hash = 'today'; render(); },  e => { t.disabled = false; toast(cloudError(e)); }); },
    'use-cloud': () => { const remote = ui.pending?.remote; close(); if (remote) { keepBackup(state); useRemote(remote); setSync('', Date.parse(remote.edited_at)); toast('עברת למה שבחשבון. מה שהיה במכשיר נשמר כגיבוי.'); } },
    'use-device': () => { const remote = ui.pending?.remote; close(); if (remote) { keepBackup(remote.state); cloud.setSyncInfo({editedAt: Date.now(), syncedAt: Date.parse(remote.edited_at)}); syncNow(); } },
    // The way in
    'gate-other': () => { ui.gate = {}; render(); },
    'gate-resend': () => cloud.sendCode(ui.gate.email).then(() => toast('שלחנו מייל חדש.'), e => { ui.gate = {...ui.gate, error: cloudError(e)}; render(); }),
    'gate-retry': () => { ui.loadError = false; render(); syncNow(); },
    'ob-next': () => { if (t.dataset.step === 'day') return finishOnboarding(); ui.obStep = {name: 'areas', areas: 'day'}[t.dataset.step]; render(); },
    // The guided tour
    'tour-start': () => { close(); startTour(); },
    'tour-next': () => { if (ui.tour.i >= ui.tour.steps.length - 1) return endTour(); ui.tour.i++; showTourStep(); },
    'tour-prev': () => { ui.tour.i = Math.max(0, ui.tour.i - 1); showTourStep(); },
    'tour-end': () => endTour(),
    'help': () => open(helpContent()),
    'settings': () => open(settingsForm(state.prefs)),
    'export': () => {
      const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'})), download: `StudyFlow-${localDate()}.json`});
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('הגיבוי מוכן.');
    },
    'confirm-import': () => { const next = ui.pending?.import; close(); if (next) mutate(() => { state = next; }, 'הגיבוי נטען.'); },
    'week': () => { const step = Number(t.dataset.step); ui.week = step ? addDays(ui.week || addDays(weekStart(localDate()), new Date().getDay() === 6 ? 7 : 0), step) : ''; render(); },
    // Studies
    'semester-dates': () => open(sheetTop('תקופת הלימודים') + semesterFields(state.classes, ui.week || weekStart(localDate()))),
    'new-class': () => open(classForm(state, {}, t.dataset.course || '')),
    'edit-class': () => open(classForm(state, state.classes.find(c => c.id === id) || {})),
    'delete-class': () => { close(); mutate(() => { state.classes = state.classes.filter(c => c.id !== id); }, 'השיעור נמחק.'); },
    'new-course': () => open(courseForm()),
    'edit-course': () => open(courseForm(state.courses.find(c => c.id === id))),
    'delete-course': () => { const c = state.courses.find(c => c.id === id); if (!c) return; open(`${sheetTop('להסיר את הקורס מההתקדמות?')}<p>הנושאים, המועדים ודיווחי הלמידה של הקורס יוסרו. השיעורים במערכת השעות והפריטים ביומן יישארו. אפשר לבטל מיד אחרי ההסרה.</p><button class="primary submit-button" data-action="confirm-delete-course" data-id="${esc(id)}">להסיר מההתקדמות</button><button class="text-button" data-action="close">ביטול</button>`); },
    'confirm-delete-course': () => { close(); mutate(() => { state.courses = state.courses.filter(c => c.id !== id); }, 'הקורס הוסר מההתקדמות. השיעורים נשמרו ביומן.'); location.hash = 'studies'; },
    'add-topics': () => open(topicsForm(state.courses.find(c => c.id === id))),
    'cycle-topic': () => mutate(() => { const topic = state.courses.find(c => c.id === t.dataset.course)?.topics.find(x => x.id === id); if (topic) topic.status = {new: 'learning', learning: 'done', done: 'new'}[topic.status]; }),
    'delete-topic': () => mutate(() => { const c = state.courses.find(x => x.id === t.dataset.course); c.topics = c.topics.filter(x => x.id !== id); }, 'הנושא נמחק.'),
    'toggle-deadline': () => mutate(() => { const d = state.courses.find(c => c.id === t.dataset.course)?.deadlines.find(x => x.id === id); if (d) d.done = !d.done; }),
    'delete-deadline': () => mutate(() => { const c = state.courses.find(x => x.id === t.dataset.course); c.deadlines = c.deadlines.filter(x => x.id !== id); }, 'נמחק.'),
    // Find time (course or goal page)
    'find-time': () => {
      const goal = t.dataset.type === 'goal' && state.goals.find(g => g.id === id);
      const minutes = goal ? goal.sessionMinutes : 60;
      ui.find = {type: t.dataset.type, id, minutes, slots: findTime(state, minutes)}; render();
      main.querySelector('.find-panel')?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    },
    'find-length': () => { ui.find.minutes = Number(t.dataset.minutes); ui.find.slots = findTime(state, ui.find.minutes); render(); },
    'plan-rest': () => { ui.find = restFind(state.goals.find(g => g.id === id)); render(); main.querySelector('.find-panel')?.scrollIntoView({block: 'nearest', behavior: 'smooth'}); },
    'take-all': () => {
      const f = ui.find, goal = state.goals.find(g => g.id === f.id), slots = f.slots;
      mutate(() => { for (const s of slots) state.items.push({id: uid(), title: goal.title, kind: 'goal', goalId: goal.id, date: s.date, start: s.start, end: s.end, done: false, fixed: false}); },
        `${slots.length === 1 ? 'פעם אחת נכנסה' : `${slots.length} פעמים נכנסו`} ללו״ז.`);
      ui.find = null; render();
    },
    'take-slot': () => addFoundSlot(ui.find.slots[Number(t.dataset.n)]),
    'close-find': () => { ui.find = null; render(); },
    // Work
    'new-job': () => open(jobForm({}, nextJobColor())),
    'edit-job': () => open(jobForm(state.jobs.find(j => j.id === id))),
    'delete-job': () => { close(); mutate(() => { state.jobs = state.jobs.filter(j => j.id !== id); state.shifts = state.shifts.filter(s => s.jobId !== id); }, 'מקום העבודה נמחק.'); location.hash = 'work'; },
    'new-shift': () => state.jobs.length ? open(shiftForm(state, {}, t.dataset.job || '')) : (open(jobForm()), toast('קודם מוסיפים את העסק ואת השכר לשעה.')),
    'week-shifts': () => {
      if (!state.jobs.length) return open(jobForm());
      const jobId = sheet.querySelector('[name=jobId]')?.value || t.dataset.job || state.jobs[0].id;
      ui.weekTimes = null; open(weekShiftsForm(state, jobId, t.dataset.week || workWeek(), lastTimes(jobId), thisWorkWeek()));
    },
    'edit-shift': () => { const s = state.shifts.find(x => x.id === id); if (s) open(shiftForm(state, s)); },
    'delete-shift': () => { close(); mutate(() => { state.shifts = state.shifts.filter(s => s.id !== id); }, 'המשמרת נמחקה.'); },
    'month': () => {
      const [y, m] = (ui.month || localDate().slice(0, 7)).split('-').map(Number), d = new Date(y, m - 1 + Number(t.dataset.step), 1);
      ui.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; render();
    },
    // Goals
    'new-goal': () => open(goalForm()),
    'edit-goal': () => open(goalForm(state.goals.find(g => g.id === id))),
    'delete-goal': () => { close(); mutate(() => { state.goals = state.goals.filter(g => g.id !== id); }, 'המטרה נמחקה.'); location.hash = 'goals'; },
    'log-goal': () => { const g = state.goals.find(x => x.id === id); if (!g) return; if (g.unit === 'times') mutate(() => g.log.push({id: uid(), date: localDate(), amount: 1}), 'נרשם. כל הכבוד!'); else open(logForm(g)); },
    'delete-log': () => mutate(() => { const g = state.goals.find(x => x.id === t.dataset.goal); g.log = g.log.filter(l => l.id !== id); }, 'הרישום נמחק.'),
  };
  actions[action]?.();
});

// ── Typing in the review card ──
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'tell-text') ui.tellText = el.value;
  if (el.dataset.p !== undefined && el.dataset.field === 'title') editDraft(Number(el.dataset.p), 'title', el.value);
  if (el.form?.dataset.form === 'topics' && el.name === 'text') previewSyllabus(el.form);
  if (el.form?.dataset.form === 'shift') refreshPay(el.form);
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.dataset.p !== undefined && el.dataset.field !== 'title') return editDraft(Number(el.dataset.p), el.dataset.field, el.value);
  if (el.matches('[data-syllabus]')) {
    const form = el.closest('form'), file = el.files[0]; if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('הקובץ גדול מדי.');
      const text = await fileText(file);
      form.elements.text.value = [form.elements.text.value.trim(), text.trim()].filter(Boolean).join('\n');
      previewSyllabus(form); formError(form, '');
    } catch (e) { formError(form, e.message); }
    el.value = '';
  }
  if (el.matches('[data-ics]')) {
    const file = el.files[0]; el.value = ''; if (!file) return;
    if (file.size > 3_000_000) return toast('הקובץ גדול מדי.');
    const parsed = parseICS(await file.text());
    if (!parsed.classes.length && !parsed.once.length) return toast('לא מצאתי אירועים בקובץ. צריך קובץ יומן (‎.ics).');
    ui.pending = {ics: parsed}; open(icsPreview(parsed));
  }
  if (el.matches('[data-import]')) {
    const file = el.files[0]; if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('size');
      const raw = JSON.parse(await file.text());
      const next = raw.version === 2 ? validateState(raw) : migrateV1(raw);
      ui.pending = {import: next};
      open(`<div class="sheet-top"><h2 id="dialog-title">לטעון את הגיבוי?</h2></div><p>בגיבוי יש ${next.courses.length} קורסים, ${next.classes.length} שיעורים, ${next.goals.length} מטרות ו־${next.items.length} פריטים בלו״ז. הוא יחליף את מה שיש עכשיו במכשיר. אפשר לבטל מיד אחרי.</p><button class="primary submit-button" data-action="confirm-import">לטעון</button><button class="text-button" data-action="close">ביטול</button>`);
    } catch { toast('לא הצלחתי לקרוא את הקובץ. צריך קובץ גיבוי של StudyFlow.'); }
  }
  // Week of shifts: a ticked day lights up and takes the hours chosen last.
  if (el.form?.dataset.form === 'week-shifts') {
    const row = el.closest('[data-week-row]');
    if (el.name === 'day') {
      row.classList.toggle('is-on', el.checked);
      if (el.checked && ui.weekTimes) { row.querySelector('[name^=start-]').value = ui.weekTimes.start; row.querySelector('[name^=end-]').value = ui.weekTimes.end; }
    } else if (row) {
      ui.weekTimes = {start: row.querySelector('[name^=start-]').value, end: row.querySelector('[name^=end-]').value};
      const box = row.querySelector('[name=day]'); if (!box.checked) { box.checked = true; row.classList.add('is-on'); }
    }
  }
  if (el.form?.dataset.form === 'shift') refreshPay(el.form);
  if (el.form?.dataset.form === 'goal' && el.name === 'unit') el.form.querySelector('[data-unit-help]').textContent = el.value === 'minutes' ? 'בשעות' : '';
});
// The pay card at the top of the shift form follows every change to hours, break and tips.
function refreshPay(form) {
  const f = form.elements;
  form.querySelector('[data-pay]').innerHTML = payCard(state, {id: form.dataset.id || '', jobId: f.jobId.value, date: f.date.value,
    start: f.start.value, end: f.end.value, breakMinutes: Number(f.breakMinutes.value) || 0, tips: Number(f.tips.value) || 0});
}
function previewSyllabus(form) {
  const {topics, deadlines} = readSyllabus(form.elements.text.value, {today: localDate()});
  form.querySelector('[data-syllabus-preview]').textContent = topics.length || deadlines.length ? `זיהיתי ${topics.length} נושאים${deadlines.length ? ` ו־${deadlines.length} מבחנים או הגשות` : ''}.` : '';
}

// ── Forms ──
const findCourse = name => state.courses.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
document.addEventListener('submit', event => {
  const form = event.target, kind = form.dataset.form; if (!kind) return;
  event.preventDefault();
  const fd = new FormData(form), get = k => String(fd.get(k) ?? '').trim();
  try {
    if (kind === 'semester') {
      const classes = updateSemester(state.classes, get('from'), get('until'));
      close(); ui.week = weekStart(get('from'));
      mutate(() => { state.classes = classes; }, 'תקופת הלימודים עודכנה. אפשר לבטל את השינוי.');
      location.hash = 'calendar';
    }
    if (kind === 'class') {
      const title = get('title'), days = fd.getAll('days').map(Number), start = get('start'), end = get('end');
      if (!title) throw Error('צריך שם לקורס.');
      if (!days.length) throw Error('בוחרים לפחות יום אחד.');
      if (get('from') && !validDate(get('from')) || get('until') && !validDate(get('until'))) throw Error('צריך תאריכי לימודים תקינים.');
      if (get('from') && get('until') && get('from') > get('until')) throw Error('תאריך הסיום צריך להיות אחרי תאריך ההתחלה.');
      if (toMin(start) === null || toMin(end) === null || toMin(end) <= toMin(start)) throw Error('שעת הסיום צריכה להיות אחרי שעת ההתחלה.');
      close();
      mutate(() => {
        let course = findCourse(title);
        if (!course) { course = {id: uid(), name: title, topics: [], deadlines: [], studyLog: []}; state.courses.push(course); }
        const c = {id: form.dataset.id || uid(), title: course.name, courseId: course.id, days, start, end, location: get('location'), skipDates: state.classes.find(x => x.id === form.dataset.id)?.skipDates || [], ...(validDate(get('from')) ? {from: get('from')} : {}), ...(validDate(get('until')) ? {until: get('until')} : {})};
        state.classes = form.dataset.id ? state.classes.map(x => x.id === c.id ? c : x) : [...state.classes, c];
      }, 'נשמר במערכת השעות.');
    }
    if (kind === 'ics') {
      const picks = new Set(fd.getAll('pick')), makeCourses = fd.has('courses'), parsed = ui.pending.ics;
      close();
      mutate(() => {
        parsed.classes.forEach((c, i) => {
          if (!picks.has(`c${i}`)) return;
          const name = courseNameOf(c.title);
          let course = findCourse(name);
          if (!course && makeCourses) { course = {id: uid(), name, topics: [], deadlines: [], studyLog: []}; state.courses.push(course); }
          state.classes.push({...c, id: uid(), title: course ? course.name : c.title, ...(course ? {courseId: course.id} : {})});
        });
        parsed.once.forEach((o, i) => { if (picks.has(`o${i}`)) state.items.push({id: uid(), ...o, kind: 'event', fixed: true, done: false}); });
      }, 'מערכת השעות נטענה.');
    }
    if (kind === 'course') {
      const name = get('name'); if (!name) throw Error('צריך שם לקורס.');
      const exam = get('examDate'); close();
      mutate(() => {
        const existing = state.courses.find(c => c.id === form.dataset.id);
        if (existing) { existing.name = name; existing.examDate = validDate(exam) ? exam : undefined; for (const c of state.classes) if (c.courseId === existing.id) c.title = name; }
        else state.courses.push({id: uid(), name, ...(validDate(exam) ? {examDate: exam} : {}), topics: [], deadlines: [], studyLog: []});
      }, 'הקורס נשמר.');
    }
    if (kind === 'topics') {
      const {topics, deadlines} = readSyllabus(get('text'), {today: localDate()});
      if (!topics.length && !deadlines.length) throw Error('לא מצאתי נושאים. כל נושא בשורה נפרדת.');
      close();
      mutate(() => {
        const c = state.courses.find(x => x.id === form.dataset.id), titles = new Set(c.topics.map(t => t.title));
        c.topics.push(...topics.filter(t => !titles.has(t)).map(title => ({id: uid(), title, status: 'new'})));
        c.deadlines.push(...deadlines.map(d => ({id: uid(), ...d, done: false})));
      }, `נוספו ${topics.length} נושאים${deadlines.length ? ` ו־${deadlines.length} מועדים` : ''}.`);
    }
    if (kind === 'deadline') {
      const title = get('title'), date = get('date');
      if (!title || !validDate(date)) return;
      mutate(() => state.courses.find(c => c.id === form.dataset.course).deadlines.push({id: uid(), title, date, done: false}), 'נוסף.');
    }
    if (kind === 'goal') {
      const title = get('title'), unit = get('unit') || 'times', target = Number(get('target')) * (unit === 'minutes' ? 60 : 1);
      if (!title) throw Error('צריך שם למטרה.');
      if (!Number.isFinite(target) || target <= 0) throw Error('היעד צריך להיות מספר גדול מאפס.');
      close();
      const g = {title, type: get('type') || 'sport', unit, noun: get('noun'), target, period: get('period') || 'week', sessionMinutes: Number(get('sessionMinutes')) || 60};
      mutate(() => {
        const existing = state.goals.find(x => x.id === form.dataset.id);
        if (existing) Object.assign(existing, g); else state.goals.push({id: uid(), ...g, log: []});
      }, 'המטרה נשמרה.');
    }
    if (kind === 'log') {
      const amount = Number(get('amount')), date = get('date'), itemId = form.dataset.item;
      if (!Number.isFinite(amount) || amount <= 0 || !validDate(date)) throw Error('צריך כמות ותאריך.');
      close();
      mutate(() => {
        state.goals.find(g => g.id === form.dataset.id).log.push({id: uid(), date, amount, ...(itemId ? {itemId} : {})});
        if (itemId) { const it = state.items.find(i => i.id === itemId); if (it) it.done = true; }
      }, 'נרשם. כל הכבוד!');
    }
    if (kind === 'move') {
      const item = state.items.find(i => i.id === form.dataset.id), date = get('date'), start = get('start');
      if (!item || !validDate(date) || toMin(start) === null) throw Error('בוחרים יום ושעה.');
      const end = toClock(Math.min(toMin(start) + toMin(item.end) - toMin(item.start), 1439));
      const hits = conflictsFor(state, {...item, date, start, end});
      if (hits.length) throw Error(`בזמן הזה יש כבר: ${[...new Set(hits.map(h => h.title))].join(', ')}. אפשר לבחור אחד מהזמנים הפנויים למעלה.`);
      close();
      mutate(() => Object.assign(item, {date, start, end, done: false}), `הוזז ל־${start}.`);
    }
    if (kind === 'job') {
      const name = get('name'), wage = Number(get('wage'));
      if (!name) throw Error('צריך שם למקום העבודה.');
      if (!Number.isFinite(wage) || wage < 0) throw Error('השכר לשעה צריך להיות מספר.');
      close();
      const job = {name, wage, overtime: fd.has('overtime'), color: get('color') || nextJobColor()}, existing = state.jobs.find(j => j.id === form.dataset.id), newId = uid();
      mutate(() => { if (existing) Object.assign(state.jobs.find(j => j.id === existing.id), job); else state.jobs.push({id: newId, ...job}); }, existing ? 'נשמר.' : '');
      // A new business goes straight on to this week's shifts.
      if (!existing) { ui.weekTimes = null; open(weekShiftsForm(state, newId, workWeek(), lastTimes(newId), thisWorkWeek())); }
    }
    if (kind === 'week-shifts') {
      const jobId = get('jobId'), days = fd.getAll('day');
      if (!days.length) throw Error('מסמנים לפחות יום אחד.');
      const planned = days.map(date => ({jobId, date, start: get(`start-${date}`), end: get(`end-${date}`), breakMinutes: 0, tips: 0}));
      if (planned.some(s => s.start === s.end)) throw Error('בכל משמרת, שעת הסיום צריכה להיות שונה מההתחלה.');
      const clash = s => shiftClashes(state, s).length > 0;
      const free = planned.filter(s => !clash(s)), busy = planned.filter(clash);
      if (!free.length) throw Error('כל המשמרות שסימנת מתנגשות עם משהו אחר ביומן. אפשר לשנות שעות.');
      close();
      mutate(() => state.shifts.push(...free.map(s => ({id: uid(), ...s}))),
        `${free.length === 1 ? 'משמרת אחת נכנסה' : `${free.length} משמרות נכנסו`} ליומן${busy.length ? `. ${busy.map(s => dateLabel(s.date)).join(', ')} לא נכנסו כי יש שם כבר משהו` : ''}.`);
      ui.week = ''; location.hash = 'calendar';
    }
    if (kind === 'shift') {
      const jobId = get('jobId'), date = get('date'), start = get('start'), end = get('end'), editing = form.dataset.id;
      if (!state.jobs.some(j => j.id === jobId)) throw Error('בוחרים מקום עבודה.');
      if (!validDate(date)) throw Error('בוחרים יום.');
      if (start === end) throw Error('שעת הסיום צריכה להיות שונה משעת ההתחלה.');
      const base = {jobId, start, end, breakMinutes: Number(get('breakMinutes')) || 0, tips: Number(get('tips')) || 0};
      // Never on top of a class or anything else; for a weekly repeat, busy dates are skipped and reported.
      const collide = date => [...new Set(shiftClashes(state, {...base, date}, {ignoreId: editing}).map(b => b.title))];

      const dates = editing ? [date] : repeatDates(date, Number(get('weeks')) || 1);
      const free = dates.filter(d => !collide(d).length), busy = dates.filter(d => collide(d).length);
      if (!free.length) throw Error(`בזמן הזה יש כבר: ${collide(dates[0]).join(', ')}. אפשר לבחור שעות אחרות.`);
      close();
      mutate(() => {
        if (editing) Object.assign(state.shifts.find(s => s.id === editing), base, {date});
        else state.shifts.push(...free.map(d => ({id: uid(), ...base, date: d})));
      }, editing ? 'המשמרת עודכנה.' : `${free.length === 1 ? 'המשמרת נוספה' : `נוספו ${free.length} משמרות`} ללו״ז${busy.length ? `. ${busy.length} לא נוספו כי מתנגשות עם משהו אחר (${busy.map(d => dateLabel(d)).slice(0, 3).join(', ')})` : ''}.`);
    }
    if (kind === 'gate-email' || kind === 'gate-code') {
      if (kind === 'gate-email') { ui.gate = {...ui.gate, email: get('email')}; if (mustAgree()) return; }
      const button = form.querySelector('[type=submit]'); button.disabled = true; formError(form, '');
      const failed = e => { button.disabled = false; formError(form, cloudError(e)); };
      if (kind === 'gate-email') {
        const email = get('email').toLowerCase();
        // A code asked for a moment ago is still valid: go on to typing it instead of stopping at the limit.
        cloud.sendCode(email).then(() => { ui.gate = {email, sent: true}; render(); },
          e => e.code === 'too-many' ? (ui.gate = {email, sent: true, error: cloudError(e)}, render()) : failed(e));
      } else {
        cloud.verifyCode(ui.gate.email, get('code').replace(/\s/g, '')).then(() => { ui.gate = {}; render(); syncNow(); }, failed);
      }
      return;
    }
    if (kind === 'ob-name') { ui.obStep = 'areas'; mutate(() => { state.profile.name = get('name'); }); return; }
    if (kind === 'ob-areas') { ui.obStep = 'day'; mutate(() => { state.profile.areas = fd.getAll('area').map(String); }); return; }
    if (kind === 'ob-day') {
      const dayStart = get('dayStart'), dayEnd = get('dayEnd');
      if (toMin(dayEnd) <= toMin(dayStart)) throw Error('סוף היום צריך להיות אחרי ההתחלה.');
      state.prefs = {...state.prefs, dayStart, dayEnd};
      finishOnboarding(); return;
    }
    if (kind === 'send-code' || kind === 'verify-code') {
      const button = form.querySelector('[type=submit]'); button.disabled = true; formError(form, '');
      const done = () => { button.disabled = false; };
      if (kind === 'send-code') {
        const email = get('email').toLowerCase();
        cloud.sendCode(email).then(() => { ui.loginEmail = email; open(accountSheet(null, {codeFor: email})); }, e => { done(); formError(form, cloudError(e)); });
      } else {
        cloud.verifyCode(ui.loginEmail, get('code').replace(/\s/g, '')).then(user => {
          ui.loginEmail = ''; open(accountSheet(user, {sync: ui.sync})); toast('התחברת. כל השינויים יישמרו גם בענן.'); syncNow();
        }, e => { done(); formError(form, cloudError(e)); });
      }
      return;
    }
    if (kind === 'settings') {
      const dayStart = get('dayStart'), dayEnd = get('dayEnd');
      if (toMin(dayEnd) <= toMin(dayStart)) throw Error('סוף היום צריך להיות אחרי ההתחלה.');
      close();
      mutate(() => { state.prefs = {dayStart, dayEnd, breakMinutes: Number(get('breakMinutes'))}; }, 'ההעדפות נשמרו.');
    }
  } catch (e) { formError(form, e.message); }
});

// Enter in the "tell me" box sends it; Shift+Enter adds a line.
document.addEventListener('keydown', e => { if (e.target.id === 'tell-text' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runTell(); } });
window.addEventListener('hashchange', () => { ui.find = null; render(); window.scrollTo(0, 0); main.focus({preventScroll: true}); });
// Coming back to the app later in the day refreshes "now" (free time, greetings).
document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (!sheet.open) render(); syncNow(); });
render();
syncNow();
