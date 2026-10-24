// The way in. Everyone signs in first, so their planner lives in their account on every device;
// then a few short questions set it up, and a first try of "tell me" shows how it works.
// Each step is one full screen with one clear action, and every question can be skipped.
import {esc, icon, timeSelect} from './util.mjs';
import {GOOGLE_SIGN_IN} from './config.mjs';

const mark = '<img class="gate-mark" src="src/studyflow/brand/app-icon-192.png" alt="" width="84" height="84">';
const googleG = '<svg class="google-g" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"/></svg>';
// The terms and privacy policy, as agreed on the way in. A new version asks again.
export const TERMS_VERSION = '2026-10-24';
const consent = agreed => `<label class="gate-consent"><input type="checkbox" id="gate-agree"${agreed ? ' checked' : ''}><span>קראתי ואני מסכים/ה ל<a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a> ול<a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a></span></label>`;
const dots = (n, total) => `<div class="gate-steps" role="img" aria-label="שלב ${n} מתוך ${total}">${Array.from({length: total}, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
const error = text => `<p class="form-error" data-error role="alert">${esc(text || '')}</p>`;

export function signInScreen({email = '', sent = false, error: problem = '', busy = false, agreed = false} = {}) {
  if (sent) {
    return `<section class="gate-page">
      ${mark}
      <h1>בדוק את המייל</h1>
      <p class="gate-lead">שלחנו מייל ל־<b dir="ltr">${esc(email)}</b>. לוחצים בו על הקישור, באותו מכשיר, ונכנסים. הוא מגיע תוך דקה, וכדאי לבדוק גם בספאם.</p>
      <form data-form="gate-code" class="gate-form">
        <label for="gate-code">יש במייל קוד? אפשר להקליד אותו כאן</label>
        <input id="gate-code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="8" dir="ltr" required>
        ${error(problem)}
        <button class="primary gate-button" type="submit"${busy ? ' disabled' : ''}>כניסה</button>
      </form>
      <div class="gate-links"><button class="text-button" data-action="gate-resend">לשלוח שוב</button><button class="text-button" data-action="gate-other">מייל אחר</button></div>
    </section>`;
  }
  return `<section class="gate-page">
    ${mark}
    <h1>ברוך הבא ל־StudyFlow</h1>
    <p class="gate-lead">לימודים, עבודה ומטרות אישיות במקום אחד. מספרים מה יש, והשבוע מסתדר בזמן הפנוי.</p>
    ${consent(agreed)}
    ${GOOGLE_SIGN_IN ? `<button class="google-button gate-button" data-action="google">${googleG} המשך עם Google</button><div class="or-line"><span>או</span></div>` : ''}
    <form data-form="gate-email" class="gate-form">
      <label for="gate-email">מייל</label>
      <input id="gate-email" name="email" type="email" autocomplete="email" inputmode="email" required dir="ltr" placeholder="name@example.com" value="${esc(email)}">
      ${error(problem)}
      <button class="${GOOGLE_SIGN_IN ? 'secondary' : 'primary'} gate-button" type="submit"${busy ? ' disabled' : ''}>המשך עם מייל</button>
    </form>
    <p class="gate-fine">החשבון שומר את הכול: בכל טלפון או מחשב שמתחברים, הכול שם. בלי סיסמה.</p>
  </section>`;
}

export function waitScreen(text, {retry = false} = {}) {
  return `<section class="gate-page">
    ${mark}
    <p class="gate-lead">${esc(text)}</p>
    ${retry ? '<button class="primary gate-button" data-action="gate-retry">לנסות שוב</button><button class="text-button" data-action="sign-out">להתנתק</button>' : '<div class="gate-spinner" aria-hidden="true"></div>'}
  </section>`;
}

const AREAS = [
  ['studies', 'book', 'לימודים', 'מערכת שעות, קורסים, מבחנים'],
  ['work', 'work', 'עבודה', 'משמרות ושכר'],
  ['goals', 'target', 'מטרות אישיות', 'ספורט, תחביבים, קריאה'],
];
export function onboardingScreen(step, state) {
  const {profile, prefs} = state;
  const skip = `<button class="text-button gate-skip" data-action="ob-next" data-step="${step}">דלג</button>`;
  if (step === 'name') {
    return `<section class="gate-page">
      ${dots(1, 3)}
      <h1>נעים מאוד! איך לקרוא לך?</h1>
      <form data-form="ob-name" class="gate-form">
        <label for="ob-name" class="visually-hidden">שם</label>
        <input id="ob-name" name="name" maxlength="40" autocomplete="given-name" value="${esc(profile.name)}" placeholder="השם שלך" autofocus>
        <button class="primary gate-button" type="submit">המשך</button>
      </form>
      ${skip}
    </section>`;
  }
  if (step === 'areas') {
    return `<section class="gate-page">
      ${dots(2, 3)}
      <h1>${profile.name ? `${esc(profile.name)}, מה` : 'מה'} יש לך בשבוע?</h1>
      <p class="gate-lead">אפשר לבחור כמה. ההדרכה שאחרי תתמקד במה שבחרת.</p>
      <form data-form="ob-areas" class="gate-form">
        <div class="area-picks">${AREAS.map(([value, img, label, hint]) => `<label class="area-pick"><input type="checkbox" name="area" value="${value}"${profile.areas.includes(value) ? ' checked' : ''}><span>${icon(img)}<b>${label}</b><small>${hint}</small></span></label>`).join('')}</div>
        <button class="primary gate-button" type="submit">המשך</button>
      </form>
      ${skip}
    </section>`;
  }
  if (step === 'day') {
    return `<section class="gate-page">
      ${dots(3, 3)}
      <h1>מתי היום שלך מתחיל ונגמר?</h1>
      <p class="gate-lead">מחוץ לשעות האלה לא אשבץ לך כלום.</p>
      <form data-form="ob-day" class="gate-form">
        <div class="form-row"><div><label for="ob-start">מתחיל ב־</label>${timeSelect('id="ob-start" name="dayStart"', prefs.dayStart)}</div>
        <div><label for="ob-end">נגמר ב־</label>${timeSelect('id="ob-end" name="dayEnd"', prefs.dayEnd)}</div></div>
        <button class="primary gate-button" type="submit">יאללה, להדרכה</button>
      </form>
      ${skip}
    </section>`;
  }
  return '';
}