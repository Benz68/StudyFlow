import {icon} from './views.mjs';

const days = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
const timeOptions = (value='any', inherit=false) => `${inherit?'<option value="inherit">לפי ההעדפה שלי</option>':''}${[['any','מתי שפנוי'],['morning','בוקר · עד 12:00'],['afternoon','צהריים · 12:00–17:00'],['evening','ערב · מ־17:00']].map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('')}`;
const dayOptions = (name, selected=[]) => days.map((day,index)=>`<label><input type="checkbox" name="${name}" value="${index}" ${selected.includes(index)?'checked':''}><span>${day}</span></label>`).join('');
const heading = (title,subtitle) => `<div class="sheet-top"><div><span class="eyebrow">${subtitle}</span><h2 id="dialog-title">${title}</h2></div><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;

export function addForm(today,deadline,tab='task') {
 const weekday=new Date(`${today}T12:00:00`).getDay();
 return `${heading('מה נוסיף?','מפנים מקום בראש')}
 <div class="form-tabs"><button data-form-tab="task" class="${tab==='task'?'active':''}">משימה גמישה</button><button data-form-tab="event" class="${tab==='event'?'active':''}">התחייבות קבועה</button></div>
 <form id="add-form" data-kind="${tab}">
 <label for="title">${tab==='task'?'מה תרצה לקדם?':'מה קורה?'}</label>
 <input id="title" name="title" required maxlength="120" autocomplete="off" placeholder="${tab==='task'?'למשל, לתרגל למבחן בסטטיסטיקה':'לימודים, עבודה, אימון בשעה קבועה'}" autofocus>
 ${tab==='task'?taskFields(today,deadline):eventFields(today,weekday)}
 <p id="form-error" class="form-error" role="alert"></p>
 <button class="primary submit-button" type="submit">${tab==='task'?'להוסיף ולמצוא זמן':'לשמור את הזמן הזה'} ${icon('arrow')}</button>
 <p class="form-footnote">אפשר לשנות את הקצב בכל רגע.</p></form>`;
}

function taskFields(today,deadline) {
 return `<label for="minutes">כמה זמן בערך?</label><div class="duration-options">${[30,60,120].map(n=>`<button type="button" data-minutes="${n}" class="${n===60?'active':''}">${n===30?'חצי שעה':n===60?'שעה':'שעתיים'}</button>`).join('')}<input id="minutes" name="minutes" type="number" value="60" min="5" max="10080" step="5" required aria-label="זמן משוער בדקות"></div>
 <small class="field-help">בדקות. נפרק משימות גדולות למקטעים נוחים.</small>
 <label for="deadline">עד מתי?</label><input id="deadline" name="deadline" type="date" min="${today}" value="${deadline}" required>
 <small class="field-help">נמצא זמן פנוי עד סוף היום שנבחר.</small>
 <details class="advanced"><summary>העדפה אישית ועוד אפשרויות</summary>
 <label for="preferredTime">מתי נוח לך לעשות את זה?</label><select id="preferredTime" name="preferredTime">${timeOptions('inherit',true)}</select>
 <div class="form-row"><div><label for="category">סוג המשימה</label><select id="category" name="category"><option value="study">לימודים</option><option value="personal">אישי</option><option value="work">עבודה</option></select></div><div><label for="priority">חשיבות</label><select id="priority" name="priority"><option value="normal">רגילה</option><option value="high">גבוהה</option><option value="low">כשיש זמן</option></select></div></div></details>`;
}

function eventFields(today,weekday) {
 return `<label for="date">תאריך התחלה</label><input id="date" name="date" type="date" value="${today}" min="${today}" required>
 <div class="form-row"><div><label for="start">משעה</label><input id="start" name="start" type="time" value="10:00" required></div><div><label for="end">עד שעה</label><input id="end" name="end" type="time" value="11:00" required></div></div>
 <label for="repeatMode">לכמה זמן?</label><select id="repeatMode" name="repeatMode"><option value="once">פעם אחת</option><option value="weeks">למספר שבועות</option><option value="year">שנה מתאריך ההתחלה</option><option value="custom">עד תאריך שאבחר</option></select>
 <div id="repeat-fields" hidden><fieldset class="off-days"><legend>חוזר בכל שבוע בימים</legend>${dayOptions('weekdays',[weekday])}</fieldset>
 <div id="weeks-field" hidden><label for="weeksCount">כמה שבועות?</label><input id="weeksCount" name="weeksCount" type="number" value="4" min="1" max="52" step="1"></div>
 <div id="until-field" hidden><label for="repeatUntil">עד תאריך (כולל)</label><input id="repeatUntil" name="repeatUntil" type="date" min="${today}"></div></div>
 <p id="repeat-summary" class="field-help" aria-live="polite">נשמור את הזמן הזה ונמצא למשימות זמן מסביבו.</p>`;
}

export function settingsForm(p) {
 return `${heading('הקצב שלך','התוכנית מתאימה את עצמה אליך')}<form id="settings-form">
 <label for="preferredTime">מתי הכי נוח לך?</label><select id="preferredTime" name="preferredTime">${timeOptions(p.preferredTime)}</select>
 <fieldset class="off-days"><legend>ימים מועדפים למשימות</legend>${dayOptions('preferredDays',p.preferredDays||[])}</fieldset><small class="field-help">לא בחרת ימים? כל הימים מתאימים באותה מידה.</small>
 <label for="scheduleStyle">איך נחלק את השבוע?</label><select id="scheduleStyle" name="scheduleStyle"><option value="early" ${p.scheduleStyle!=='balanced'?'selected':''}>להתקדם מוקדם ולפנות את הראש</option><option value="balanced" ${p.scheduleStyle==='balanced'?'selected':''}>לפזר את העומס בין הימים</option></select>
 <label class="repeat-option"><input type="checkbox" name="allowOutsidePreferred" ${p.allowOutsidePreferred!==false?'checked':''}> אם חסר זמן לפני היעד, אפשר גם מחוץ להעדפות</label><small class="field-help">תמיד נשמור על שעות הפעילות ועל הימים החופשיים שלך.</small>
 <details class="advanced"><summary>שעות, הפסקות וימים חופשיים</summary>
 <div class="form-row"><div><label for="startHour">אפשר להתחיל משעה</label><input id="startHour" name="startHour" type="number" min="0" max="22" required value="${p.startHour}"></div><div><label for="endHour">מסיימים עד שעה</label><input id="endHour" name="endHour" type="number" min="1" max="23" required value="${p.endHour}"></div></div>
 <label for="maxDailyMinutes">כמה זמן למשימות ביום?</label><select name="maxDailyMinutes" id="maxDailyMinutes">${[60,120,180,240,300,360,480].map(n=>`<option value="${n}" ${p.maxDailyMinutes===n?'selected':''}>עד ${n/60} שעות</option>`).join('')}</select>
 <div class="form-row"><div><label for="sessionMinutes">מקטע למידה</label><select name="sessionMinutes" id="sessionMinutes">${[25,40,50,60,90].map(n=>`<option value="${n}" ${p.sessionMinutes===n?'selected':''}>${n} דקות</option>`).join('')}</select></div><div><label for="breakMinutes">הפסקה בין מקטעים</label><select name="breakMinutes" id="breakMinutes">${[5,10,15,20,30].map(n=>`<option value="${n}" ${p.breakMinutes===n?'selected':''}>${n} דקות</option>`).join('')}</select></div></div>
 <fieldset class="off-days"><legend>ימים בלי משימות</legend>${dayOptions('excludedDays',p.excludedDays)}</fieldset></details>
 <p id="form-error" class="form-error" role="alert"></p><button class="primary submit-button" type="submit">לשמור ולעדכן את התוכנית ${icon('arrow')}</button></form>
 <details class="data-tools"><summary>גיבוי והעברה למכשיר אחר</summary><p>הנתונים נשמרים רק בדפדפן הזה.</p><button class="text-button" data-action="export">הורדת גיבוי</button><label class="text-button import-label">טעינת גיבוי<input type="file" id="import-file" accept="application/json,.json"></label></details>`;
}
export function proContent() {
 return `<div class="sheet-top"><span class="pro-label">STUDYFLOW PRO</span><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div><div class="pro-content">${icon('spark')}<h2 id="dialog-title">עוד עזרה.<br>אותו שקט בראש.</h2><p>אנחנו מתכננים עוזר AI שיאפשר להוסיף משימות בשיחה ולקבל עזרה בהתאמת השבוע.</p><div class="pro-status">בפיתוח · עדיין לא זמין לרכישה</div><p class="pro-small">בינתיים, תכנון השבוע, חלוקה למקטעים ותכנון מחדש זמינים בחינם, ללא AI.</p><button class="primary submit-button" data-action="close">חזרה לתוכנית שלי</button></div>`;
}
