import {icon,escapeHTML} from './views.mjs';

// "העוזר החכם": speak (or type) what needs doing, Claude turns it into planner items,
// and nothing is added until the student reviews the list.
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const ERRORS = {
 'no-key':'העוזר עוד לא מחובר: חסר מפתח AI. במדריך HOW TO USE, בפרק "העוזר החכם", מוסבר איך מוסיפים אותו.',
 'no-library':'חסר רכיב של העוזר. סוגרים את החלון השחור ופותחים שוב את Open StudyFlow Handmade.',
 'bad-key':'מפתח ה־AI לא תקין. כדאי לבדוק את הקובץ ai-key.txt.',
 'busy':'העוזר עמוס כרגע. אפשר לנסות שוב בעוד דקה.',
 'offline':'אין חיבור לאינטרנט, אז העוזר לא יכול לעבוד כרגע.',
 'refused':'העוזר לא יכול לעזור עם הבקשה הזאת. אפשר לנסח אחרת.',
 'server':'אין חיבור ל־StudyFlow. צריך לוודא שהחלון השחור פתוח.',
 'online':'באתר באינטרנט העוזר החכם עוד לא זמין. הוא עובד כשפותחים את StudyFlow במחשב, דרך הקובץ Open StudyFlow Handmade. בינתיים אפשר להוסיף משימות בכפתור "הוספת משימה".'
};

export function helperForm() {
 return `<div class="sheet-top"><div><span class="eyebrow">אומרים, ואנחנו מסדרים</span><h2 id="dialog-title">העוזר החכם</h2></div><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>
 <div class="helper">
  <p class="helper-intro">${Recognition?'לוחצים על המיקרופון ואומרים':'כותבים'} מה צריך לעשות, באיזה יום ובאיזו שעה. למשל: <q>מחר בחמש ללמוד למבחן בסטטיסטיקה שעתיים, וביום שני יש לי שיעור מעשר עד שתים עשרה.</q></p>
  ${Recognition?`<div class="helper-mic-wrap"><button type="button" class="helper-mic" aria-pressed="false" aria-label="התחלת הקלטה">${icon('mic')}</button><span class="helper-mic-label" aria-live="polite">לחיצה כדי לדבר</span></div>`:'<p class="helper-note">ההקלטה עובדת בדפדפן Chrome. כאן אפשר לכתוב.</p>'}
  <label for="helper-text">${Recognition?'מה אמרת (אפשר גם לכתוב או לתקן)':'מה צריך לעשות?'}</label>
  <textarea id="helper-text" rows="3" maxlength="2000" placeholder="מה צריך לעשות השבוע?"></textarea>
  <p class="form-error helper-error" role="alert"></p>
  <button type="button" class="primary submit-button helper-go">${icon('spark')} <span>להבין מה אמרתי</span></button>
  <div class="helper-results" aria-live="polite"></div>
  <p class="helper-privacy">${Recognition?'ההקלטה הופכת לטקסט אצל Google (דרך Chrome), ו':''}הטקסט נשלח ל־Claude של Anthropic כדי להבין אותו. שום דבר לא נוסף לתוכנית לפני שמאשרים.</p>
 </div>`;
}

// describe(item) → {label, problem}; add(items) saves the approved ones.
export function setupHelper(root, {describe, add, today, weekday}) {
 const text = root.querySelector('#helper-text'), go = root.querySelector('.helper-go'), error = root.querySelector('.helper-error');
 const results = root.querySelector('.helper-results'), mic = root.querySelector('.helper-mic'), micLabel = root.querySelector('.helper-mic-label');
 let recognition = null, items = [];

 function stopListening() { recognition?.stop(); }
 if (mic) mic.addEventListener('click', () => {
  if (recognition) return stopListening();
  error.textContent = '';
  recognition = new Recognition();
  recognition.lang = 'he-IL'; recognition.continuous = true; recognition.interimResults = true;
  const before = text.value.trim();
  recognition.onresult = event => {
   let heard = '';
   for (const result of event.results) heard += result[0].transcript;
   text.value = [before, heard.trim()].filter(Boolean).join(' ');
  };
  recognition.onerror = event => {
   error.textContent = event.error === 'not-allowed' || event.error === 'service-not-allowed'
    ? 'צריך לאשר ל־Chrome להשתמש במיקרופון (בחלונית שקופצת למעלה, או בסמל המנעול ליד הכתובת).'
    : event.error === 'no-speech' ? 'לא שמענו כלום. אפשר לנסות שוב, קרוב יותר למיקרופון.'
    : event.error === 'network' ? 'ההקלטה צריכה חיבור לאינטרנט. אפשר גם לכתוב.' : '';
  };
  recognition.onend = () => { recognition = null; mic.classList.remove('listening'); mic.setAttribute('aria-pressed', 'false'); mic.setAttribute('aria-label', 'התחלת הקלטה'); micLabel.textContent = text.value.trim() ? 'אפשר להוסיף עוד, או ללחוץ "להבין"' : 'לחיצה כדי לדבר'; };
  recognition.start();
  mic.classList.add('listening'); mic.setAttribute('aria-pressed', 'true'); mic.setAttribute('aria-label', 'עצירת ההקלטה'); micLabel.textContent = 'מקשיבים… לחיצה כדי לסיים';
 });
 root.closest('dialog')?.addEventListener('close', () => recognition?.abort(), {once: true});

 go.addEventListener('click', async () => {
  stopListening();
  const said = text.value.trim();
  if (!said) { error.textContent = 'קודם אומרים או כותבים מה צריך לעשות.'; text.focus(); return; }
  error.textContent = ''; results.innerHTML = '';
  go.disabled = true; go.classList.add('thinking'); go.querySelector('span').textContent = 'רגע, חושבים';
  try {
   const response = await fetch('api/assistant', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: said, today, weekday})});
   const body = await response.json().catch(() => ({}));
   // A plain web host (e.g. GitHub Pages) has no helper server behind it.
   if (!response.ok) { error.textContent = ERRORS[body.error] || ([404, 405, 501].includes(response.status) ? ERRORS.online : 'משהו השתבש. אפשר לנסות שוב.'); return; }
   items = (body.items || []).map(item => ({...item, ...describe(item)}));
   showResults(body.reply);
  } catch { error.textContent = ERRORS.server; }
  finally { go.disabled = false; go.classList.remove('thinking'); go.querySelector('span').textContent = 'להבין שוב'; }
 });

 function showResults(reply) {
  if (!items.length) { results.innerHTML = `<p class="helper-reply">${escapeHTML(reply || 'לא מצאנו משהו להוסיף. אפשר לנסות לנסח אחרת.')}</p>`; return; }
  results.innerHTML = `<p class="helper-reply">${escapeHTML(reply)}</p><div class="helper-items">${items.map((item, i) => `<label class="helper-item ${item.problem ? 'has-problem' : ''}"><input type="checkbox" data-i="${i}" ${item.problem ? '' : 'checked'} ${item.data ? '' : 'disabled'}><span class="helper-item-body"><input type="text" class="helper-title" data-i="${i}" value="${escapeHTML(item.title)}" maxlength="120" aria-label="שם הפריט"><small>${escapeHTML(item.label)}</small>${item.problem ? `<em>${escapeHTML(item.problem)}</em>` : ''}</span></label>`).join('')}</div><button type="button" class="primary submit-button helper-add"></button><p class="helper-tip">אפשר לתקן שם, או להוריד את הסימון ממה שלא צריך. את השאר אפשר לערוך אחר כך כרגיל.</p>`;
  results.querySelectorAll('.helper-title').forEach(input => input.addEventListener('input', () => { items[input.dataset.i].title = input.value; }));
  results.addEventListener('change', count);
  results.querySelector('.helper-add').addEventListener('click', () => {
   const chosen = [...results.querySelectorAll('input[type=checkbox]:checked')].map(box => items[box.dataset.i]).filter(item => item.title.trim());
   if (chosen.length) add(chosen);
  });
  count();
 }
 function count() {
  const n = results.querySelectorAll('input[type=checkbox]:checked').length, button = results.querySelector('.helper-add');
  button.disabled = !n;
  button.textContent = n === 0 ? 'לא נבחר כלום' : n === 1 ? 'להוסיף לתוכנית' : `להוסיף ${n} פריטים לתוכנית`;
 }
}
