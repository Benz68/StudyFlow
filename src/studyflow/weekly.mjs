import { localDate, validDate, timeMinutes, normalizePreferences } from './planner.mjs';
import {normalizeTopics} from './courses.mjs';

const dayDate = value => new Date(`${value}T12:00:00`);
export const addDays = (date, count) => { const d = dayDate(date); d.setDate(d.getDate() + count); return localDate(d); };
export function weekStart(date = new Date()) { const key = typeof date === 'string' ? date : localDate(date); return addDays(key, -dayDate(key).getDay()); }
const clock = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const bounded = (n, fallback, min, max) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : fallback)));
const clean = (s, max = 120) => typeof s === 'string' ? s.trim().slice(0, max) : '';
const list = a => Array.isArray(a) ? a : [];
const choice = (v, options, fallback) => options.includes(v) ? v : fallback;
const priorities = ['high', 'normal', 'low'];
const unique = a => [...new Map(a.map(x => [x.id, x])).values()];

export function normalizeWeekly(value = {}, now = new Date(), nested = false) {
  if (!nested && validDate(value.weekly?.nextWeek?.weekly?.weekStart) && value.weekly.nextWeek.weekly.weekStart <= localDate(now)) {
    const future = value.weekly.nextWeek;
    value = {...value,goals:future.goals,courses:Array.isArray(value.courses) ? value.courses : future.courses,weekly:future.weekly};
  }
  const w = value.weekly || {};
  const start = validDate(w.weekStart) ? weekStart(w.weekStart) : weekStart(now);
  const courses = unique(list(value.courses).slice(0, 100).filter(x => x && clean(x.id) && clean(x.name)).map(x => ({
    id: clean(x.id), name: clean(x.name), topics:normalizeTopics(x.topics), difficulty: bounded(x.difficulty, 2, 1, 3), ...(validDate(x.examDate) ? { examDate: x.examDate } : {}),
  })));
  const goals = unique(list(value.goals).slice(0, 300).filter(x => x && clean(x.id) && clean(x.title)).map(x => ({
    id: clean(x.id), title: clean(x.title), minutes: bounded(x.minutes, 60, 5, 10080),
    priority: choice(x.priority, priorities, 'normal'), category: choice(x.category, ['study', 'personal', 'work'], 'study'),
    courseId: courses.some(c => c.id === x.courseId) ? x.courseId : '', repeatWeekly: x.repeatWeekly === true,
    topicId: courses.find(c=>c.id===x.courseId)?.topics.some(t=>t.id===x.topicId)?x.topicId:'',
    weekStart: validDate(x.weekStart) ? weekStart(x.weekStart) : start,
    preferredTime: choice(x.preferredTime, ['any', 'morning', 'afternoon', 'evening'], 'any'),
    sessionMinutes: bounded(x.sessionMinutes, 50, 15, 180),
  })));
  const sessions = unique(list(w.sessions).slice(0, 2000).filter(x => x && clean(x.id) && validDate(x.date)
    && timeMinutes(x.start) !== null && timeMinutes(x.end) > timeMinutes(x.start)).map(x => ({
    id: clean(x.id, 200), goalId: clean(x.goalId), taskId: clean(x.taskId), title: clean(x.title), date: x.date,
    start: x.start, end: x.end, minutes: timeMinutes(x.end) - timeMinutes(x.start), locked: x.locked === true,
    category: choice(x.category, ['study', 'personal', 'work'], 'study'),
  })));
  const completionIds = new Set();
  const completions = list(w.completions).slice(0, 2000).filter(x => {
    if (!x || !validDate(x.date) || !goals.some(g=>g.id===clean(x.goalId)) || !clean(x.sessionId) || completionIds.has(clean(x.sessionId,200))) return false;
    completionIds.add(clean(x.sessionId,200)); return true;
  }).map(x => ({
    sessionId: clean(x.sessionId, 200), goalId: clean(x.goalId), date: x.date, minutes: bounded(x.minutes, 0, 0, Math.min(goals.find(g=>g.id===clean(x.goalId)).minutes,Math.max(0,(timeMinutes(x.end)||0)-(timeMinutes(x.start)||0)))),
    start: timeMinutes(x.start) !== null ? x.start : '00:00', end: timeMinutes(x.end) !== null ? x.end : '00:00',
  }));
  return { courses, goals, weekly: { weekStart: start, load: choice(w.load, ['light', 'balanced', 'heavy'], 'balanced'),
    ...(!nested && validDate(w.nextWeek?.weekly?.weekStart) ? {nextWeek:normalizeWeekly(w.nextWeek,now,true)} : {}),
    energy: choice(w.energy, ['low', 'normal', 'high'], 'normal'), fewerSwitches: w.fewerSwitches === true,
    skippedGoalIds: [...new Set(list(w.skippedGoalIds).map(id=>clean(id)).filter(id=>goals.some(g=>g.id===id)))], sessions, completions,
    reviews: list(w.reviews).slice(-52).filter(x => x && validDate(x.weekStart)).map(x => ({weekStart: x.weekStart,
      completedMinutes: bounded(x.completedMinutes, 0, 0, 10080), note: clean(x.note, 500)})),
    overrides: list(w.overrides).slice(0, 14).filter(x => x && validDate(x.date)).map(x => ({date: x.date,
      maxMinutes: bounded(x.maxMinutes, 120, 0, 720), energy: choice(x.energy, ['low', 'normal', 'high'], 'normal')})),
  } };
}

// Commitments are immutable obstacles. Travel may cross midnight; dates are local calendar dates.
export function commitmentIntervals(events, start, end) {
  const result = [];
  for (let date = addDays(start, -1); date <= addDays(end, 1); date = addDays(date, 1)) {
    for (const event of list(events)) {
      if (!event || !validDate(event.date) || list(event.excludedDates).includes(date)) continue;
      const days = list(event.weekdays).length ? event.weekdays : [dayDate(event.date).getDay()];
      if (event.repeat === 'weekly' ? date < event.date || (event.repeatUntil && date > event.repeatUntil) || !days.includes(dayDate(date).getDay()) : date !== event.date) continue;
      const a = timeMinutes(event.start), b = timeMinutes(event.end);
      if (a === null || b === null || a === b || (b < a && !event.overnight)) continue;
      const from = a - bounded(event.travelBefore, 0, 0, 180);
      const to = b + (b < a ? 1440 : 0) + bounded(event.travelAfter, 0, 0, 180);
      for (let offset = -1; offset <= 2; offset++) {
        const key = addDays(date, offset), low = Math.max(0, from - offset * 1440), high = Math.min(1440, to - offset * 1440);
        if (key >= start && key <= end && high > low) result.push({date: key, start: low, end: high, eventId: event.id});
      }
    }
  }
  return result;
}

export function buildWeeklyPlan(input, now = new Date()) {
  const state = {...input, ...normalizeWeekly(input, now)}, w = state.weekly, p = normalizePreferences(state.preferences);
  const start = w.weekStart, end = addDays(start, 6), today = localDate(now);
  const dates = Array.from({length: 7}, (_, i) => addDays(start, i));
  const busy = new Map(dates.map(date => [date, []]));
  const used = new Map(dates.map(date => [date, 0]));
  const cap = date => {
    const override = w.overrides.find(x => x.date === date);
    const energy = override?.energy || w.energy;
    return Math.min(p.maxDailyMinutes, override?.maxMinutes ?? Infinity,
      Math.round(({light: 120, balanced: 240, heavy: 360}[w.load]) * ({low: .65, normal: 1, high: 1.15}[energy])));
  };
  const obstacles = commitmentIntervals(state.events, start, end);
  for (const item of obstacles) busy.get(item.date).push(item);
  const sessions = [];
  const blockedSessions = [];
  const reserve = (s, completed = false) => {
    busy.get(s.date)?.push({start: Math.max(0, timeMinutes(s.start)-p.breakMinutes), end: timeMinutes(s.end)+p.breakMinutes});
    used.set(s.date, (used.get(s.date) || 0) + (completed ? s.minutes : s.minutes));
  };
  for (const s of sessions) reserve(s);
  for (const c of w.completions) if (busy.has(c.date)) reserve(c, true);
  for (const t of list(state.tasks)) for (const c of list(t.completionLog)) if (used.has(c.date)) used.set(c.date, used.get(c.date)+c.minutes);
  const unscheduled = [];
  const isProtected = s => s.locked || s.date<today || (s.date===today && timeMinutes(s.start)<now.getHours()*60+now.getMinutes());
  const active = state.goals.filter(g => g.repeatWeekly || g.weekStart === start).map(g=>({...g,key:`goal:${g.id}`,
    ...(w.skippedGoalIds.includes(g.id) ? {minutes:w.completions.filter(c=>c.goalId===g.id && c.date>=start && c.date<=end).reduce((n,c)=>n+c.minutes,0)
      + w.sessions.filter(s=>s.goalId===g.id && isProtected(s) && !w.completions.some(c=>c.sessionId===s.id)).reduce((n,s)=>n+s.minutes,0)} : {})}));
  for (const t of list(state.tasks)) if (!t.done && validDate(t.deadline) && Number.isFinite(t.minutes) && t.minutes > 0) {
    active.push({...t,key:`task:${t.id}`,legacy:true,sessionMinutes:p.sessionMinutes,minutes:Math.max(0,t.minutes-(t.completedMinutes||0))});
  }
  const remaining = new Map(active.map(g => [g.key, Math.max(0, g.minutes - (g.legacy ? 0 : w.completions.filter(c => c.goalId === g.id && c.date >= start && c.date <= end).reduce((a,c) => a+c.minutes,0)))]));
  const fits = s => {
    const a = timeMinutes(s.start), b = timeMinutes(s.end), date = s.date;
    if (!busy.has(date) || date < today || (date === today && a < now.getHours()*60+now.getMinutes())
      || p.excludedDays.includes(dayDate(date).getDay()) || a < p.startHour*60 || b > p.endHour*60 || used.get(date)+s.minutes > cap(date)) return false;
    return !busy.get(date).some(x => a < x.end && b > x.start);
  };
  // Locked and surviving placements have first claim; displaced work stays in its goal budget.
  for (const s of [...w.sessions].sort((a,b) => Number(b.locked)-Number(a.locked))) {
    const key = s.goalId ? `goal:${s.goalId}` : `task:${s.taskId}`;
    const target = active.find(g=>g.key===key);
    if (!remaining.has(key) || w.completions.some(c => c.sessionId === s.id) || s.date < start || s.date > end) continue;
    if (w.skippedGoalIds.includes(s.goalId) && !isProtected(s)) continue;
    const past = s.date < today || (s.date === today && timeMinutes(s.start) < now.getHours()*60+now.getMinutes());
    const deferred = target.notBefore && new Date(`${s.date}T${s.start}`) < new Date(target.notBefore);
    if (!deferred && s.minutes <= remaining.get(key) && (!target.deadline || s.date <= target.deadline) && (past || fits(s))) {
      sessions.push({...s,title:target.title,...(past ? {needsUpdate:true} : {})}); reserve(s); remaining.set(key, remaining.get(key)-s.minutes);
    } else if (s.locked && s.date >= today && s.date <= end) {
      blockedSessions.push(s);
      unscheduled.push({goalId: s.goalId, taskId:s.taskId, title:s.title, minutes:Math.min(s.minutes, remaining.get(key)), reason:'מפגש נעול אינו מתאים לזמינות החדשה. יש לשנות או לשחרר אותו.', lockedConflict: true});
      remaining.set(key, Math.max(0, remaining.get(key)-s.minutes));
    }
  }
  const rank = g => {
    const c = state.courses.find(c => c.id === g.courseId);
    return (g.deadline ? Math.round((dayDate(g.deadline)-dayDate(today))/86400000)*100-1000 : 0) + priorities.indexOf(g.priority)*20 - (c?.difficulty || 1)*2 - (c?.examDate && c.examDate >= start && c.examDate <= addDays(end,7) ? 15 : 0);
  };
  for (const g of active.sort((a,b) => rank(a)-rank(b) || a.id.localeCompare(b.id))) {
    let left = remaining.get(g.key);
    const course = state.courses.find(c => c.id === g.courseId);
    const length = Math.min(g.sessionMinutes, w.energy === 'low' || course?.difficulty === 3 ? 30 : 180);
    const pref = !g.preferredTime || ['any','inherit'].includes(g.preferredTime) ? p.preferredTime : g.preferredTime;
    const window = {any:[0,1440],morning:[0,720],afternoon:[720,1020],evening:[1020,1440]}[pref];
    while (left > 0) {
      const candidates = [];
      for (const date of dates) {
        if (date < today || (g.deadline && date > g.deadline) || (g.notBefore && date < localDate(new Date(g.notBefore)))) continue;
        const override = w.overrides.find(x => x.date === date);
        const maximum = Math.min(left,length,override?.energy === 'low' ? 30 : 180,cap(date)-used.get(date));
        if (maximum < Math.min(15,left)) continue;
        for (let a = p.startHour*60; a < p.endHour*60; a+=5) {
          const nextBusy = Math.min(p.endHour*60,...busy.get(date).filter(x=>x.start>a).map(x=>x.start));
          const size = Math.min(maximum,nextBusy-a);
          if (size < Math.min(15,left)) continue;
          const fallback = a < window[0] || a+size > window[1] || (p.preferredDays.length && !p.preferredDays.includes(dayDate(date).getDay()));
          if (fallback && !p.allowOutsidePreferred) continue;
          if (g.notBefore && date === localDate(new Date(g.notBefore)) && a < new Date(g.notBefore).getHours()*60+new Date(g.notBefore).getMinutes()) continue;
          const s = {id:`${g.key}:${date}:${a}`, ...(g.legacy ? {} : {goalId:g.id}), taskId:g.legacy ? g.id : `goal:${g.id}`, title:g.title,date,start:clock(a),end:clock(a+size),minutes:size,category:g.category,locked:false};
          if (!fits(s) || w.completions.some(c=>c.sessionId===s.id)) continue;
          // Comfortable mid-morning/evening blocks, balanced days; preference outranks convenience.
          const ideal = pref === 'evening' ? 1080 : pref === 'afternoon' ? 840 : 600;
          const dayGoals = sessions.filter(s=>s.date===date).map(s=>s.goalId || s.taskId);
          const switching = w.fewerSwitches && dayGoals.length && !dayGoals.includes(g.id) ? 450 : 0;
          const score = (fallback ? 10000 : 0) + switching + used.get(date)*3 + Math.abs(a-ideal)/5 + dates.indexOf(date)*2;
          candidates.push({s,score});
        }
      }
      candidates.sort((a,b)=>a.score-b.score || a.s.date.localeCompare(b.s.date) || a.s.start.localeCompare(b.s.start));
      if (!candidates.length) break;
      const s = candidates[0].s;
      s.reason = course?.difficulty === 3 ? 'מפגשים קצרים כדי להקל על נושא מאתגר' : w.energy === 'low' ? 'קצב עדין לפי האנרגיה שבחרת' : 'זמן נוח לפי ההעדפות ודרגת העומס שלך';
      sessions.push(s);reserve(s);left-=s.minutes;
    }
    if (left > 0) unscheduled.push({...(g.legacy ? {} : {goalId:g.id}),taskId:g.legacy ? g.id : `goal:${g.id}`,title:g.title,minutes:left,reason:'היעד גדול מהזמן הזמין בקצב שבחרת. אפשר להפחית יעד, לשנות עומס או להעביר לשבוע הבא.'});
  }
  sessions.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  return {sessions,blockedSessions,retainedSessions:[...sessions,...blockedSessions],unscheduled,plannedMinutes:sessions.reduce((a,s)=>a+s.minutes,0),weekStart:start,weekEnd:end,needsReview:today>end};
}

export function completeWeeklySession(state, sessionId, minutes) {
  const normalized = {...state,...normalizeWeekly(state)}, w = normalized.weekly;
  const s = w.sessions.find(s => s.id === sessionId);
  if (!s?.goalId || !Number.isFinite(minutes) || minutes < 0 || minutes > s.minutes || w.completions.some(c=>c.sessionId===sessionId)) throw new RangeError('דיווח הביצוע אינו תקין');
  w.completions.push({sessionId,goalId:s.goalId,date:s.date,start:s.start,end:s.end,minutes:Math.round(minutes)});
  w.sessions = w.sessions.filter(x=>x.id!==sessionId);
  return normalized;
}
export function setSessionLocked(state, id, locked) {
  const next = {...state,...normalizeWeekly(state)};
  next.weekly.sessions = next.weekly.sessions.map(s=>s.id===id ? {...s,locked:!!locked} : s);
  return next;
}
export function moveWeeklySession(state, id, date, start, now = new Date()) {
  const next = {...state,...normalizeWeekly(state)}, s = next.weekly.sessions.find(x=>x.id===id);
  const a = timeMinutes(start);
  if (!s?.goalId || !validDate(date) || a===null || a+s.minutes>=1440 || date<next.weekly.weekStart || date>addDays(next.weekly.weekStart,6)) throw new RangeError('זמן המפגש אינו תקין');
  if (date < localDate(now) || (date === localDate(now) && a < now.getHours()*60+now.getMinutes())) throw new RangeError('אי אפשר להעביר מפגש לזמן שכבר עבר');
  const moved = {...s,date,start,end:clock(a+s.minutes),locked:true};
  next.weekly.sessions = [moved,...next.weekly.sessions.filter(x=>x.id!==id)];
  const plan = buildWeeklyPlan(next,now);
  if (!plan.sessions.some(x=>x.id===id && x.date===date && x.start===start) || plan.unscheduled.some(x=>x.lockedConflict)) throw new RangeError('הזמן תפוס או חורג מהזמינות ומדרגת העומס');
  next.weekly.sessions = plan.retainedSessions;
  return next;
}
export function reviewAvailability(state, now = new Date()) {
  const normalized = normalizeWeekly(state, now), w = normalized.weekly;
  const opensAt = new Date(`${addDays(w.weekStart, 6)}T20:00:00`);
  const submitted = [...w.reviews, ...list(w.nextWeek?.weekly?.reviews)].some(r=>r.weekStart===w.weekStart);
  return {open: !submitted && w.weekStart <= weekStart(now) && now >= opensAt, submitted, opensAt};
}
function requireReview(state, now) {
  const availability = reviewAvailability(state, now);
  if (availability.submitted) throw new RangeError('סיכום השבוע כבר נשמר. אפשר לערוך את התוכנית שהכנת.');
  if (!availability.open) throw new RangeError('סיכום השבוע ייפתח במוצ״ש בשעה 20:00.');
}
export function previewNextWeek(state, now = new Date(), options = {}) {
  requireReview(state, now);
  const next = {...state,...normalizeWeekly(state,now)};
  const previous = next.weekly;
  const start = addDays(previous.weekStart,7) < weekStart(now) ? weekStart(now) : addDays(previous.weekStart,7);
  const carry = list(options.carryGoalIds);
  next.goals = next.goals.map(g => !g.repeatWeekly && carry.includes(g.id) ? {...g,weekStart:start,minutes:Math.max(0,g.minutes-previous.completions.filter(c=>c.goalId===g.id).reduce((a,c)=>a+c.minutes,0))} : g).filter(g=>g.minutes>0);
  next.weekly = {...previous,nextWeek:undefined,weekStart:start,sessions:[],completions:[],overrides:[],
    load:choice(options.load,['light','balanced','heavy'],previous.load), energy:choice(options.energy,['low','normal','high'],previous.energy),
    reviews:[...previous.reviews,{weekStart:previous.weekStart,completedMinutes:previous.completions.reduce((a,c)=>a+c.minutes,0),note:clean(options.note,500)}].slice(-52)};
  const plan = buildWeeklyPlan(next, now);
  next.weekly.sessions = plan.retainedSessions;
  next.unscheduled = plan.unscheduled;
  return next;
}
export function acceptNextWeek(state, preview, now = new Date()) {
  const next = normalizeWeekly(preview,now);
  const current = normalizeWeekly(state, now);
  const pending=current.weekly.nextWeek;
  if (pending && next.weekly.weekStart===pending.weekly.weekStart && next.weekly.weekStart===addDays(weekStart(now),7)) {
    next.weekly.reviews=pending.weekly.reviews;
    return {...state,...current,weekly:{...current.weekly,nextWeek:next}};
  }
  requireReview(state, now);
  const expected = addDays(current.weekly.weekStart,7) < weekStart(now) ? weekStart(now) : addDays(current.weekly.weekStart,7);
  if (next.weekly.weekStart !== expected || expected > addDays(weekStart(now),7)) throw new RangeError('אפשר לתכנן רק את השבוע הנוכחי והשבוע הבא');
  if (!next.weekly.reviews.some(r=>r.weekStart===current.weekly.weekStart)) throw new RangeError('יש להכין תצוגה מקדימה חדשה');
  if (next.weekly.weekStart <= localDate(now)) return {...state,...next};
  return {...state,...current,weekly:{...current.weekly,reviews:next.weekly.reviews,nextWeek:next}};
}

export function releaseFlexibleSessions(state, now = new Date()) {
  const next={...state,...normalizeWeekly(state,now)}, today=localDate(now);
  next.weekly.sessions=next.weekly.sessions.filter(s=>s.locked || s.date<today || (s.date===today && timeMinutes(s.start)<now.getHours()*60+now.getMinutes()));
  return next;
}

// Only movable future work is rebuilt; completed, past and user-locked placements survive.
export function adjustWeeklyPlan(state, action, now = new Date()) {
  const actions = ['lighter','shorter','study-more','personal-more','morning','evening','fewer-switches'];
  if (!actions.includes(action)) throw new RangeError('אפשרות ההתאמה אינה תקינה');
  const next = releaseFlexibleSessions(state,now), w=next.weekly;
  if (w.weekStart > addDays(weekStart(now),7)) throw new RangeError('אפשר לתכנן רק את השבוע הנוכחי והשבוע הבא');
  const preserved = w.sessions;
  const active = next.goals.filter(g=>!w.skippedGoalIds.includes(g.id) && (g.repeatWeekly || g.weekStart===w.weekStart));
  const floor = g => w.completions.filter(c=>c.goalId===g.id && c.date>=w.weekStart && c.date<=addDays(w.weekStart,6)).reduce((n,c)=>n+c.minutes,0)
    + preserved.filter(s=>s.goalId===g.id && !w.completions.some(c=>c.sessionId===s.id)).reduce((n,s)=>n+s.minutes,0);
  if (action==='lighter') for (const g of active) g.minutes=Math.max(5,floor(g)+Math.floor(Math.max(0,g.minutes-floor(g))*.75));
  if (action==='shorter') for (const g of active) g.sessionMinutes=Math.min(30,g.sessionMinutes);
  if (action==='morning' || action==='evening') for (const g of active) g.preferredTime=action;
  if (action==='fewer-switches') w.fewerSwitches=true;
  if (action==='study-more' || action==='personal-more') {
    const category=action==='study-more' ? 'study' : 'personal';
    const recipients=active.filter(g=>g.category===category);
    const donors=active.filter(g=>g.category!==category && g.minutes>Math.max(5,floor(g)));
    if (!recipients.length || !donors.length) throw new RangeError('כדי להעביר זמן צריך מטרות בשני התחומים וזמן שעדיין לא נעול או בוצע.');
    let remaining=30, transferred=0;
    for (const g of donors) {
      const minutes=Math.min(remaining,g.minutes-Math.max(5,floor(g)));
      g.minutes-=minutes; remaining-=minutes; transferred+=minutes;
      if (!remaining) break;
    }
    recipients.sort((a,b)=>priorities.indexOf(a.priority)-priorities.indexOf(b.priority));
    recipients[0].minutes+=transferred;
  }
  w.sessions=preserved;
  const plan=buildWeeklyPlan(next,now);
  w.sessions=plan.retainedSessions;
  next.unscheduled=plan.unscheduled;
  return next;
}

