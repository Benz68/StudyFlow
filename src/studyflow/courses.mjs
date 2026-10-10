const statuses = ['new', 'learning', 'ready'];
const clean = value => typeof value === 'string' ? value.trim().slice(0, 160) : '';

export function normalizeTopics(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, 200).filter(topic => {
    if (!topic || !clean(topic.id) || !clean(topic.title) || seen.has(clean(topic.id))) return false;
    seen.add(clean(topic.id)); return true;
  }).map(topic => ({id: clean(topic.id), title: clean(topic.title), status: statuses.includes(topic.status) ? topic.status : 'new'}));
}

// Re-importing a title keeps its progress and identity, including linked goals.
export function topicsFromText(text, existing = [], createId = () => crypto.randomUUID()) {
  if (typeof text !== 'string' || text.length > 100000) throw Error('הרשימה ארוכה מדי. אפשר להוסיף עד 200 נושאים בכל קורס.');
  const titles = [...new Set(text.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean))];
  if (titles.length > 200 || titles.some(title => title.length > 160)) throw Error('אפשר לשמור עד 200 נושאים, ועד 160 תווים בשם נושא.');
  const previous = new Map(normalizeTopics(existing).map(topic => [topic.title, topic]));
  return titles.map(title => previous.has(title) ? {...previous.get(title)} : {id: createId(), title, status: 'new'});
}

export function courseProgress(course) {
  const topics = normalizeTopics(course?.topics), ready = topics.filter(topic => topic.status === 'ready').length;
  return {total: topics.length, ready, learning: topics.filter(topic => topic.status === 'learning').length,
    percent: topics.length ? Math.round(ready / topics.length * 100) : 0};
}

export function courseLearningMinutes(state, courseId) {
  const ids = new Set((state.goals || []).filter(goal => goal.courseId === courseId).map(goal => goal.id));
  return (state.weekly?.completions || []).reduce((sum, completion) => sum + (ids.has(completion.goalId) && Number.isFinite(completion.minutes) ? Math.max(0, completion.minutes) : 0), 0);
}
