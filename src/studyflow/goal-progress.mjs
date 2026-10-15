import {localDate, validDate, timeMinutes} from './planner.mjs';
import {addDays} from './weekly.mjs';

const copy = state => structuredClone(state);
const fail = message => { throw new RangeError(message); };
const clock = n => `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`;

// Reports describe actual elapsed work. Editing replaces a report by stable identity.
export function saveGoalReport(state, input, now = new Date()) {
 const goal = state.goals.find(g => g.id === input.goalId);
 if (!goal) fail('המטרה לא נמצאה.');
 const date = input.date, start = timeMinutes(input.start), end = timeMinutes(input.end), minutes = Number(input.minutes);
 if (!validDate(date) || date < state.weekly.weekStart || date > addDays(state.weekly.weekStart,6)) fail('אפשר לדווח על השבוע המוצג בלבד.');
 if (start === null || end === null || end <= start || !Number.isInteger(minutes) || minutes < 1 || minutes > end-start) fail('נבחר שעות ומשך ביצוע תקינים.');
 if (date > localDate(now) || (date === localDate(now) && end > now.getHours()*60+now.getMinutes())) fail('אפשר לדווח רק על זמן שכבר עבר.');
 const existing = state.weekly.completions.find(c => c.sessionId === input.sessionId);
 if (existing && existing.goalId !== goal.id) fail('הדיווח שייך למטרה אחרת.');
 const session = state.weekly.sessions.find(s => s.id === input.sessionId);
 if (session && session.goalId !== goal.id) fail('המפגש שייך למטרה אחרת.');
 const others = state.weekly.completions.filter(c => c.sessionId !== input.sessionId);
 if (others.some(c => c.date === date && start < timeMinutes(c.end) && end > timeMinutes(c.start) && c.minutes > 0)) fail('כבר יש דיווח בשעות האלה. אפשר לערוך את הדיווח הקיים.');
 if (others.filter(c => c.goalId === goal.id).reduce((sum,c)=>sum+c.minutes,0)+minutes > goal.minutes) fail('הדיווח עובר את יעד הזמן. אפשר להגדיל את היעד בעריכת המטרה.');
 const next = copy(state), sessionId = input.sessionId || `manual-${crypto.randomUUID()}`;
 next.weekly.completions = [...others,{sessionId,goalId:goal.id,date,start:input.start,end:input.end,minutes}];
 next.weekly.sessions = next.weekly.sessions.filter(s => s.id !== sessionId);
 return next;
}

export function reportGoalSession(state, id, minutes, now = new Date()) {
 const session = state.weekly.sessions.find(s => s.id === id);
 if (!session || state.weekly.completions.some(c => c.sessionId === id)) fail('המפגש כבר דווח או לא נמצא.');
 if (!Number.isInteger(minutes) || minutes < 0 || minutes > session.minutes) fail('משך הדיווח אינו תקין.');
 if (minutes === 0) {
  if (session.date > localDate(now) || (session.date === localDate(now) && timeMinutes(session.start) > now.getHours()*60+now.getMinutes())) fail('המפגש עדיין לא התחיל.');
  const next = copy(state); next.weekly.sessions = next.weekly.sessions.filter(s=>s.id!==id); return next;
 }
 return saveGoalReport(state,{sessionId:id,goalId:session.goalId,date:session.date,start:session.start,end:clock(timeMinutes(session.start)+minutes),minutes},now);
}

export function removeGoalReport(state, goalId, sessionId) {
 const next = copy(state);
 next.weekly.completions = next.weekly.completions.filter(c => c.goalId !== goalId || c.sessionId !== sessionId);
 return next;
}

export function updateGoalJournal(state, goalId, index, entry) {
 const next = copy(state), goal = next.goals.find(g => g.id === goalId);
 if (!goal) fail('המטרה לא נמצאה.');
 goal.journal ||= [];
 if (!Number.isInteger(index) || index < 0 || index > goal.journal.length || (entry === null && index === goal.journal.length)) fail('הרשומה לא נמצאה.');
 if (entry === null) goal.journal.splice(index,1);
 else {
  const text = String(entry.text || '').trim(), date = goal.journal[index]?.date || entry.date;
  if (!text || !validDate(date)) fail('נכתוב כמה מילים ותאריך תקין.');
  goal.journal[index] = {text:text.slice(0,2000),date,feel:['good','ok','hard'].includes(entry.feel)?entry.feel:'ok'};
 }
 return next;
}
