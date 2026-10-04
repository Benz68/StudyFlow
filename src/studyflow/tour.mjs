import {icon} from './views.mjs';

// A guided tour: a pen-drawn circle moves between real controls while a paper note explains each one.
// Steps whose target isn't on screen (e.g. no tasks yet) are skipped.
const STEPS = [
 {he:['היי, רגע לפני שמתחילים','נראה לכם בקצרה איפה הכול נמצא. אפשר לסגור את זה מתי שרוצים.'],
  en:['Hi, quick look around?','Let us show you where everything is. You can close this anytime.']},
 {target:['.sidebar-add','.mobile-add'],
  he:['מתחילים מכאן','יש מבחן? עבודה להגשה? לוחצים כאן, כותבים מה צריך לעשות, כמה זמן זה ייקח ועד מתי. את השאר אנחנו מסדרים.'],
  en:['Start here','Got an exam? An essay due? Click here, write what it is, how long it\'ll take and when it\'s due. We\'ll sort out the rest.']},
 {target:['.helper-button','.topbar [data-action="helper"]'],
  he:['או פשוט אומרים','לא בא לכתוב? לוחצים כאן ומדברים: "מחר בחמש ללמוד למבחן שעתיים". העוזר מבין, מראה מה הבין, ואתם מאשרים.'],
  en:['Or just say it','Not in the mood for typing? Click here and talk: "tomorrow at five, study for the exam for two hours". The helper shows what it understood and you approve it.']},
 {target:['[data-view="today"]'],
  he:['מה יש היום','כל מה שתוכנן להיום, לפי השעות.'],
  en:['What\'s on today','Everything planned for today, in order.']},
 {target:['.week-strip'],
  he:['שאר הימים','לחיצה על יום מראה מה מחכה בו. נקודה קטנה אומרת שיש שם משהו.'],
  en:['The other days','Click a day to see what\'s coming. A little dot means something\'s there.']},
 {target:['.session-card:not(.fixed-card)'],
  he:['סיימתם? מסמנים','"סיימתי" כשזה מאחוריכם. לא הספקתם? "לדחות בשעה" וזה זז קצת קדימה.'],
  en:['Done? Tick it off','Press "סיימתי" when it\'s done. Ran out of time? "לדחות בשעה" moves it an hour later.']},
 {target:['[data-view="week"]'],
  he:['כל השבוע','השבוע כולו על דף אחד.'],
  en:['The whole week','Your whole week on one page.']},
 {target:['[data-view="tasks"]'],
  he:['הרשימה שלכם','כל מה שהוספתם. מכאן מסמנים, עורכים או מוחקים.'],
  en:['Your list','Everything you\'ve added. Tick, edit or delete from here.']},
 {target:['.sidebar-settings[data-action="settings"]','.topbar [data-action="settings"]'],
  he:['השעות שלכם','מתי אתם פנויים, כמה ארוכות ההפסקות, ואיזה ימים בלי משימות בכלל.'],
  en:['Your hours','When you\'re free, how long the breaks are, and which days stay task-free.']},
 {target:['.sidebar-settings[data-action="tour"]','.topbar [data-action="tour"]'],
  he:['זהו, בהצלחה!','שכחתם משהו? הכפתור הזה תמיד כאן.'],
  en:['That\'s it, good luck!','Forgot something? This button is always here.']}
];
const UI = {
 he:{next:'הבא',back:'אחורה',done:'יאללה, מתחילים',close:'סגירת ההדרכה',lang:'English',of:'מתוך'},
 en:{next:'Next',back:'Back',done:'Got it',close:'Close the tour',lang:'עברית',of:'of'}
};

function readLang(){try{return localStorage.getItem('studyflow-tour-lang')==='en'?'en':'he';}catch{return 'he';}}
function saveLang(lang){try{localStorage.setItem('studyflow-tour-lang',lang);}catch{}}
const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const find = selectors => {
 for (const selector of selectors || []) { const el = [...document.querySelectorAll(selector)].find(visible); if (el) return el; }
 return null;
};

// A loose, slightly wobbly loop that overshoots its start, like circling something with a pen.
function scribble(w, h) {
 const cx = w/2, cy = h/2, a = w/2 - 4, b = h/2 - 4, start = -2.2 + Math.random()*.4, sweep = Math.PI*2 + .45;
 const points = [];
 for (let i = 0; i <= 48; i++) {
  const t = start + sweep*i/48, wobble = 1 + Math.sin(i*.9 + start*3)*.025 - i/48*.05;
  const c = Math.cos(t), s = Math.sin(t);
  // Exponent < 2 squares the loop off a little so it hugs wide buttons.
  const x = Math.sign(c)*Math.abs(c)**.75, y = Math.sign(s)*Math.abs(s)**.75;
  points.push(`${(cx + a*x*wobble).toFixed(1)},${(cy + b*y*wobble + i/48*3).toFixed(1)}`);
 }
 return 'M' + points.join(' L');
}

export function startTour() {
 if (document.querySelector('.tour')) return;
 const steps = STEPS.filter(step => !step.target || find(step.target));
 const returnFocus = document.activeElement;
 const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
 let index = 0, lang = readLang();

 const root = document.createElement('div');
 root.className = 'tour';
 root.innerHTML = `<div class="tour-spot"><svg class="tour-pen" aria-hidden="true"><path/></svg></div><div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text"><div class="tour-top"><span class="tour-count"></span><button type="button" class="tour-lang"></button><button type="button" class="tour-close">${icon('close')}</button></div><h2 id="tour-title"></h2><p id="tour-text"></p><div class="tour-foot"><button type="button" class="tour-back"></button><button type="button" class="tour-next"></button></div></div>`;
 document.body.append(root);
 document.body.classList.add('tour-open');
 const spot = root.querySelector('.tour-spot'), bubble = root.querySelector('.tour-bubble');
 const pen = root.querySelector('.tour-pen'), penPath = pen.querySelector('path');
 const nextButton = root.querySelector('.tour-next'), backButton = root.querySelector('.tour-back');

 function draw(w, h) {
  const pad = 14, W = w + pad*2, H = h + pad*2;
  pen.setAttribute('viewBox', `0 0 ${W} ${H}`);
  pen.setAttribute('width', W); pen.setAttribute('height', H);
  penPath.setAttribute('d', scribble(W, H));
  const length = penPath.getTotalLength();
  penPath.style.strokeDasharray = length;
  penPath.style.animation = 'none'; void penPath.getBoundingClientRect();
  penPath.style.setProperty('--length', length);
  penPath.style.animation = '';
 }

 function place(redraw = false) {
  const target = find(steps[index].target), margin = 12, gap = 22, pad = 8;
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight, W = innerWidth, H = innerHeight;
  if (!target) {
   spot.style.cssText = `top:${H/2}px;left:${W/2}px;width:0;height:0`;
   pen.style.display = 'none';
   bubble.style.top = `${Math.max(margin,(H-bh)/2)}px`; bubble.style.left = `${(W-bw)/2}px`;
   return;
  }
  pen.style.display = '';
  const r = target.getBoundingClientRect();
  const s = {top:r.top-pad, left:r.left-pad, width:r.width+pad*2, height:r.height+pad*2};
  spot.style.cssText = `top:${s.top}px;left:${s.left}px;width:${s.width}px;height:${s.height}px`;
  if (redraw) draw(s.width, s.height);
  const clampX = x => Math.max(margin, Math.min(W-bw-margin, x));
  const clampY = y => Math.max(margin, Math.min(H-bh-margin, y));
  let top, left;
  if (s.top + s.height + gap + bh <= H - margin) { top = s.top + s.height + gap; left = clampX(s.left + s.width/2 - bw/2); }
  else if (s.top - gap - bh >= margin) { top = s.top - gap - bh; left = clampX(s.left + s.width/2 - bw/2); }
  else if (s.left - gap - bw >= margin) { left = s.left - gap - bw; top = clampY(s.top); }
  else if (s.left + s.width + gap + bw <= W - margin) { left = s.left + s.width + gap; top = clampY(s.top); }
  else { left = clampX((W-bw)/2); top = H - bh - margin; }
  bubble.style.top = `${top}px`; bubble.style.left = `${left}px`;
 }

 function show() {
  const step = steps[index], t = UI[lang], [title, text] = step[lang], last = index === steps.length - 1;
  root.dir = lang === 'he' ? 'rtl' : 'ltr'; bubble.lang = lang;
  root.querySelector('#tour-title').textContent = title;
  root.querySelector('#tour-text').textContent = text;
  root.querySelector('.tour-count').textContent = `${index+1} ${t.of} ${steps.length}`;
  root.querySelector('.tour-lang').textContent = t.lang;
  root.querySelector('.tour-close').setAttribute('aria-label', t.close);
  backButton.textContent = t.back; backButton.hidden = index === 0;
  nextButton.textContent = last ? t.done : t.next;
  // Each note sits at a slightly different angle, like it was stuck on by hand.
  bubble.style.setProperty('--tilt', `${[-1.4, .9, -.6, 1.2, -1, .5][index % 6]}deg`);
  bubble.classList.remove('swap'); void bubble.offsetWidth; bubble.classList.add('swap');
  const target = find(step.target);
  if (target) {
   const r = target.getBoundingClientRect();
   if (r.top < 0 || r.bottom > innerHeight) target.scrollIntoView({block:'center', behavior: reduced ? 'auto' : 'smooth'});
  }
  place(true);
  nextButton.focus({preventScroll:true});
 }

 const go = delta => { const next = index + delta; if (next >= steps.length) return end(); if (next < 0) return; index = next; show(); };
 const onMove = () => place();
 function end() {
  removeEventListener('resize', onMove); removeEventListener('scroll', onMove, true); document.removeEventListener('keydown', onKey, true);
  root.classList.add('leaving'); document.body.classList.remove('tour-open');
  setTimeout(() => root.remove(), reduced ? 0 : 250);
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
 }
 function onKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); end(); }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
   event.preventDefault(); const forward = (event.key === 'ArrowLeft') === (lang === 'he'); go(forward ? 1 : -1);
  } else if (event.key === 'Tab') {
   // Keep keyboard focus inside the note while the tour is open.
   const items = [...bubble.querySelectorAll('button')].filter(b => !b.hidden);
   const i = items.indexOf(document.activeElement);
   event.preventDefault(); items[(i + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
  }
 }

 nextButton.addEventListener('click', () => go(1));
 backButton.addEventListener('click', () => go(-1));
 root.querySelector('.tour-close').addEventListener('click', end);
 root.querySelector('.tour-lang').addEventListener('click', () => { lang = lang === 'he' ? 'en' : 'he'; saveLang(lang); show(); });
 addEventListener('resize', onMove); addEventListener('scroll', onMove, true);
 document.addEventListener('keydown', onKey, true);
 show();
}
