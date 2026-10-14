import {icon,escapeHTML,duration} from './views.mjs';
import {parseSpeech} from './speech-parse.mjs';

// Talk instead of typing: every text box in a pop-up gets a small microphone that fills it in.
// Uses the browser's own speech recognition, so it works on the online site and on phones (no AI, no server).
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const FIELDS = 'input:not([type]),input[type=text],input[type=search],textarea';
let active = null;

export function enableVoice(root) {
 if (!Recognition || !root) return;
 const attach = () => root.querySelectorAll(FIELDS).forEach(field => {
  if (field.dataset.voice || field.id === 'helper-text' || field.classList.contains('voice-text') || field.classList.contains('helper-title') || field.readOnly || field.disabled) return;
  field.dataset.voice = 'on';
  const wrap = document.createElement('span');
  wrap.className = `voice-field${field.tagName === 'TEXTAREA' ? ' is-area' : ''}`;
  field.before(wrap); wrap.append(field);
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'voice-button';
  button.setAttribute('aria-label', 'להגיד במקום לכתוב'); button.title = 'להגיד במקום לכתוב';
  button.innerHTML = icon('mic');
  wrap.append(button);
  // In the add form, the microphone opens a screen where the whole thing is said at once.
  const form = field.id === 'title' ? field.closest('#add-form') : null;
  button.addEventListener('click', () => form ? openVoiceScreen(root, form) : toggle(field, button));
 });
 const tidy = () => { if (root.classList.contains('voice-mode') && !root.querySelector(':scope > .voice-screen')) root.classList.remove('voice-mode'); };
 attach();
 new MutationObserver(() => { attach(); tidy(); }).observe(root, {childList: true, subtree: true});
 // Stop listening when the pop-up closes.
 if (root.tagName === 'DIALOG') root.addEventListener('close', () => active?.recognition.abort());
}

function toggle(field, button) {
 if (active) { const same = active.field === field; active.recognition.stop(); if (same) return; }
 const recognition = new Recognition();
 recognition.lang = 'he-IL'; recognition.continuous = true; recognition.interimResults = true;
 const before = field.value.trim();
 recognition.onresult = event => {
  let heard = '';
  for (const result of event.results) heard += result[0].transcript;
  field.value = [before, heard.trim()].filter(Boolean).join(' ').slice(0, Number(field.maxLength) > 0 ? field.maxLength : undefined);
  field.dispatchEvent(new Event('input', {bubbles: true}));
 };
 recognition.onerror = event => {
  const message = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'צריך לאשר גישה למיקרופון בדפדפן.'
   : event.error === 'no-speech' ? 'לא שמענו כלום. אפשר לנסות שוב.'
   : event.error === 'network' ? 'ההקלטה צריכה חיבור לאינטרנט.' : '';
  if (message) showMessage(field, message);
 };
 recognition.onend = () => {
  button.classList.remove('listening'); button.setAttribute('aria-label', 'להגיד במקום לכתוב');
  if (active?.recognition === recognition) active = null;
 };
 recognition.start();
 active = {recognition, field};
 button.classList.add('listening'); button.setAttribute('aria-label', 'עצירת ההקלטה');
 field.focus({preventScroll: true});
}

function showMessage(field, text) {
 const wrap = field.closest('.voice-field');
 let note = wrap.nextElementSibling?.classList.contains('voice-note') ? wrap.nextElementSibling : null;
 if (!note) { note = document.createElement('small'); note.className = 'voice-note'; note.setAttribute('role', 'status'); wrap.after(note); }
 note.textContent = text;
 setTimeout(() => note.remove(), 5000);
}

// ── The "say it all at once" screen for the add form ──
const dayName = date => new Date(`${date}T12:00:00`).toLocaleDateString('he-IL', {weekday: 'long', day: 'numeric', month: 'long'});
const EXAMPLES = {
 event: 'שיעור סטטיסטיקה ביום שני מעשר עד שתים עשרה, כל שבוע',
 task: 'לתרגל למבחן בסטטיסטיקה שעתיים עד יום חמישי'
};
const PROBLEMS = ['צריך', 'לא שמענו', 'ההקלטה', 'קודם'];

function openVoiceScreen(dialog, form) {
 active?.recognition.stop();
 const kind = form.dataset.kind === 'event' ? 'event' : 'task';
 const screen = document.createElement('section');
 screen.className = 'voice-screen';
 screen.innerHTML = `<div class="sheet-top"><div><span class="eyebrow">אומרים הכול בבת אחת</span><h2>מדברים, ואנחנו ממלאים</h2></div><button type="button" class="icon-button voice-cancel" aria-label="חזרה לטופס">${icon('close')}</button></div>
  <p class="voice-example">${kind === 'event' ? 'אומרים מה, באיזה יום ומאיזו שעה עד איזו שעה.' : 'אומרים מה צריך לעשות, כמה זמן זה לוקח ועד מתי.'} לדוגמה: <q>${EXAMPLES[kind]}</q></p>
  <div class="helper-mic-wrap"><button type="button" class="helper-mic voice-big-mic" aria-pressed="false" aria-label="הקלטה">${icon('mic')}</button><span class="helper-mic-label" aria-live="polite">לחיצה כדי לדבר</span></div>
  <label for="voice-text">מה אמרת (אפשר גם לכתוב או לתקן)</label>
  <textarea id="voice-text" class="voice-text" rows="3" maxlength="300"></textarea>
  <div class="voice-understood" aria-live="polite"></div>
  <button type="button" class="primary submit-button voice-fill">למלא את הטופס ${icon('arrow')}</button>
  <button type="button" class="text-button voice-cancel voice-cancel-text">חזרה בלי לשנות</button>`;
 dialog.classList.add('voice-mode');
 dialog.append(screen);
 dialog.scrollTop = 0;
 const text = screen.querySelector('.voice-text'), mic = screen.querySelector('.voice-big-mic'), label = screen.querySelector('.helper-mic-label');
 const understood = screen.querySelector('.voice-understood');
 let recognition = null;

 const row = (name, value) => `<div class="${value ? '' : 'missing'}"><span>${name}</span><b>${value ? escapeHTML(value) : 'לא שמענו'}</b></div>`;
 const preview = () => {
  if (!text.value.trim()) { understood.innerHTML = ''; return; }
  const p = parseSpeech(text.value);
  understood.innerHTML = '<h3>מה הבנו</h3>' + (kind === 'event'
   ? row('מה', p.title) + row('יום', p.date && dayName(p.date)) + row('שעות', p.start && `${p.start}–${p.end}`) + (p.weekly ? row('חוזר', 'כל שבוע') : '')
   : row('מה', p.title) + row('כמה זמן', p.minutes && duration(p.minutes)) + row('עד מתי', (p.deadline || p.date) && dayName(p.deadline || p.date)) + (p.start ? row('שעה נוחה', p.start) : ''));
 };
 const listen = () => {
  if (!Recognition) { label.textContent = 'כאן אפשר לכתוב. ההקלטה עובדת ב־Chrome.'; return; }
  recognition = new Recognition();
  recognition.lang = 'he-IL'; recognition.continuous = true; recognition.interimResults = true;
  const before = text.value.trim();
  recognition.onresult = event => {
   let heard = '';
   for (const result of event.results) heard += result[0].transcript;
   text.value = [before, heard.trim()].filter(Boolean).join(' ');
   preview();
  };
  recognition.onerror = event => {
   const message = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'צריך לאשר גישה למיקרופון בדפדפן.'
    : event.error === 'no-speech' ? 'לא שמענו כלום. אפשר לנסות שוב.' : event.error === 'network' ? 'ההקלטה צריכה חיבור לאינטרנט.' : '';
   if (message) label.textContent = message;
  };
  recognition.onend = () => {
   recognition = null; mic.classList.remove('listening'); mic.setAttribute('aria-pressed', 'false');
   if (!PROBLEMS.some(start => label.textContent.startsWith(start))) label.textContent = text.value.trim() ? 'אפשר להוסיף עוד, או למלא את הטופס' : 'לחיצה כדי לדבר';
  };
  recognition.start();
  mic.classList.add('listening'); mic.setAttribute('aria-pressed', 'true'); label.textContent = 'מקשיבים… לחיצה כדי לסיים';
 };
 const leave = () => { recognition?.abort(); screen.remove(); dialog.classList.remove('voice-mode'); form.querySelector('#title')?.focus({preventScroll: true}); };

 mic.addEventListener('click', () => recognition ? recognition.stop() : listen());
 text.addEventListener('input', preview);
 screen.querySelectorAll('.voice-cancel').forEach(button => button.addEventListener('click', leave));
 screen.querySelector('.voice-fill').addEventListener('click', () => {
  const said = text.value.trim();
  if (!said) { label.textContent = 'קודם אומרים או כותבים משהו.'; return; }
  fillForm(form, kind, parseSpeech(said), said);
  leave();
 });
 dialog.addEventListener('close', () => recognition?.abort(), {once: true});
 listen();
}

// Sets a form field as if the person had changed it, so the form's own logic (repeat summary, buttons) updates.
function setValue(form, name, value, eventName) {
 const field = form.elements[name];
 if (!field || value === '' || value == null) return;
 field.value = value;
 if (eventName) field.dispatchEvent(new Event(eventName, {bubbles: true}));
 field.picker?.sync();
 const shown = field.type === 'hidden' ? field.nextElementSibling : (field.closest('.voice-field') || field);
 shown?.classList.add('just-filled');
}

function fillForm(form, kind, p, said) {
 setValue(form, 'title', p.title || said.slice(0, 120), 'input');
 if (kind === 'event') {
  if (p.weekly) setValue(form, 'repeatMode', 'year', 'change');
  if (p.date) setValue(form, 'date', p.date, 'change');
  if (p.start) setValue(form, 'start', p.start, 'change');
  if (p.end) setValue(form, 'end', p.end, 'change');
 } else {
  if (p.minutes) setValue(form, 'minutes', p.minutes, 'input');
  if (p.deadline || p.date) setValue(form, 'deadline', p.deadline || p.date, 'change');
  if (p.start && form.elements.preferredTime) {
   const minutes = Number(p.start.slice(0, 2)) * 60 + Number(p.start.slice(3));
   setValue(form, 'preferredTime', minutes < 720 ? 'morning' : minutes < 1020 ? 'afternoon' : 'evening', 'change');
  }
 }
 form.querySelectorAll('.just-filled').forEach(el => el.addEventListener('animationend', () => el.classList.remove('just-filled'), {once: true}));
 let note = form.querySelector('.voice-filled-note');
 if (!note) { note = document.createElement('p'); note.className = 'voice-filled-note'; note.setAttribute('role', 'status'); form.prepend(note); }
 note.textContent = 'מילאנו את מה ששמענו. כדאי להציץ שהכול נכון, ואז להוסיף.';
}
