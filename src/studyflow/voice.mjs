import {icon} from './views.mjs';

// Talk instead of typing: every text box in a pop-up gets a small microphone that fills it in.
// Uses the browser's own speech recognition, so it works on the online site and on phones (no AI, no server).
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const FIELDS = 'input:not([type]),input[type=text],input[type=search],textarea';
let active = null;

export function enableVoice(root) {
 if (!Recognition || !root) return;
 const attach = () => root.querySelectorAll(FIELDS).forEach(field => {
  if (field.dataset.voice || field.id === 'helper-text' || field.classList.contains('helper-title') || field.readOnly || field.disabled) return;
  field.dataset.voice = 'on';
  const wrap = document.createElement('span');
  wrap.className = `voice-field${field.tagName === 'TEXTAREA' ? ' is-area' : ''}`;
  field.before(wrap); wrap.append(field);
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'voice-button';
  button.setAttribute('aria-label', 'להגיד במקום לכתוב'); button.title = 'להגיד במקום לכתוב';
  button.innerHTML = icon('mic');
  wrap.append(button);
  button.addEventListener('click', () => toggle(field, button));
 });
 attach();
 new MutationObserver(attach).observe(root, {childList: true, subtree: true});
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
