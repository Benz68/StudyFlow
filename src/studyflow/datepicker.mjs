import {icon} from './views.mjs';

// Replaces the browser's grey date box with a friendly one: the date in words,
// a few one-tap choices, and a small round-day calendar.
// The real value lives in a hidden <input data-picker>, so forms work as before.
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(`${value}T12:00:00`) : null;
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const QUICK = [['היום', 0], ['מחר', 1], ['בעוד 3 ימים', 3], ['בעוד שבוע', 7]];
const DAYS = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];

export function enhanceDates(root) {
 root.querySelectorAll('input[data-picker]').forEach(input => input.picker ? input.picker.sync() : build(input));
}

function build(input) {
 const box = document.createElement('div');
 box.className = 'date-picker';
 const buttonId = `${input.id}-button`;
 box.innerHTML = `<button type="button" class="date-display" id="${buttonId}" aria-expanded="false">${icon('week')}<span class="date-text"></span><span class="date-change">שינוי</span></button>${input.dataset.quick !== undefined ? '<div class="date-quick"></div>' : ''}<div class="date-cal" hidden><div class="date-cal-head"><button type="button" class="icon-button date-prev" aria-label="החודש הקודם">${icon('arrow')}</button><b class="date-month" aria-live="polite"></b><button type="button" class="icon-button date-next" aria-label="החודש הבא">${icon('arrow')}</button></div><div class="date-grid" role="grid"></div></div>`;
 input.after(box);
 input.closest('form')?.querySelector(`label[for="${input.id}"]`)?.setAttribute('for', buttonId);
 const display = box.querySelector('.date-display'), cal = box.querySelector('.date-cal'), quick = box.querySelector('.date-quick');
 let month = null;

 const min = () => parse(input.getAttribute('min'));
 const allowed = date => { const m = min(); return !m || iso(date) >= iso(m); };
 function choose(date) {
  input.value = iso(date);
  input.dispatchEvent(new Event('change', {bubbles: true}));
  close(); sync();
 }
 function open() { cal.hidden = false; display.setAttribute('aria-expanded', 'true'); const v = parse(input.value) || today(); month = new Date(v.getFullYear(), v.getMonth(), 1, 12); drawMonth(); }
 function close() { cal.hidden = true; display.setAttribute('aria-expanded', 'false'); }

 function drawMonth() {
  box.querySelector('.date-month').textContent = month.toLocaleDateString('he-IL', {month: 'long', year: 'numeric'});
  const m = min();
  box.querySelector('.date-prev').disabled = !!m && new Date(month.getFullYear(), month.getMonth(), 0) < m;
  const first = new Date(month), start = addDays(first, -first.getDay()), value = input.value, now = iso(today());
  let html = DAYS.map(d => `<span class="dow">${d}</span>`).join('');
  for (let i = 0; i < 42; i++) {
   const d = addDays(start, i), key = iso(d), other = d.getMonth() !== month.getMonth();
   if (i >= 35 && other) break;
   html += `<button type="button" data-day="${key}" class="${other ? 'other' : ''} ${key === now ? 'today' : ''} ${key === value ? 'selected' : ''}" ${allowed(d) ? '' : 'disabled'} aria-label="${d.toLocaleDateString('he-IL', {weekday: 'long', day: 'numeric', month: 'long'})}">${d.getDate()}</button>`;
  }
  box.querySelector('.date-grid').innerHTML = html;
 }

 function sync() {
  const v = parse(input.value);
  box.querySelector('.date-text').textContent = v ? v.toLocaleDateString('he-IL', {weekday: 'long', day: 'numeric', month: 'long', ...(v.getFullYear() !== today().getFullYear() && {year: 'numeric'})}) : 'בחירת תאריך';
  if (quick) quick.innerHTML = QUICK.filter(([, n]) => allowed(addDays(today(), n))).map(([label, n]) => `<button type="button" data-offset="${n}" class="${iso(addDays(today(), n)) === input.value ? 'active' : ''}">${label}</button>`).join('');
  if (!cal.hidden) drawMonth();
 }

 display.addEventListener('click', () => cal.hidden ? open() : close());
 box.querySelector('.date-prev').addEventListener('click', () => { month.setMonth(month.getMonth() - 1); drawMonth(); });
 box.querySelector('.date-next').addEventListener('click', () => { month.setMonth(month.getMonth() + 1); drawMonth(); });
 box.addEventListener('click', event => {
  const day = event.target.closest('[data-day]'), offset = event.target.closest('[data-offset]');
  if (day && !day.disabled) choose(parse(day.dataset.day));
  else if (offset) choose(addDays(today(), Number(offset.dataset.offset)));
 });
 input.picker = {sync};
 sync();
}
