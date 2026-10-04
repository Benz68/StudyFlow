import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Turns a spoken/typed request ("ללמוד למבחן ביום שלישי בחמש, שעתיים") into planner items with Claude.
// The API key never reaches the browser: it comes from ANTHROPIC_API_KEY or from ai-key.txt next to index.html.

const ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'title', 'minutes', 'date', 'time', 'deadline', 'start', 'end', 'weekly', 'category'],
  properties: {
    kind: { type: 'string', enum: ['task', 'event'] },
    title: { type: 'string' },
    minutes: { type: 'integer' },
    date: { type: 'string' },
    time: { type: 'string' },
    deadline: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
    weekly: { type: 'boolean' },
    category: { type: 'string', enum: ['study', 'personal', 'work'] }
  }
};
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'reply'],
  properties: { items: { type: 'array', items: ITEM }, reply: { type: 'string' } }
};

const SYSTEM = `You help a student fill a weekly study planner. The student speaks or types (usually Hebrew, sometimes English or mixed) and lists things they need to do. Turn what they said into planner items.

Two kinds of items:
- "task": something that needs time set aside for it, which the planner will schedule (studying, homework, an essay, errands, practice). Fill "minutes" with how long it takes; if they didn't say, estimate sensibly (30 for small errands, 60 for normal study, 120 for big study sessions). If they named the day to do it on, put it in "date"; if they also named a clock time, put it in "time". If they said it must be done by some day, put that in "deadline".
- "event": something that happens at a fixed time and blocks the calendar (a class, lecture, work shift, training, appointment, meeting). Fill "date", "start" and "end". If no end time was said, use start + 1 hour. Set "weekly" to true only if they said it repeats every week.

Rules:
- Dates are YYYY-MM-DD, times are HH:MM in 24-hour format. Resolve words like "מחר", "יום שלישי", "בשבוע הבא", "בערב" against today's date given in the message. A weekday name with no other hint means its next occurrence (today counts if it's that day). "בערב" with no hour means 18:00, "בבוקר" 09:00, "בצהריים" 13:00. Hebrew speakers often say "בחמש" meaning 17:00 when talking about the afternoon; use common sense.
- Use "" for any text field that doesn't apply, 0 for minutes on events, and false for weekly on tasks.
- Keep titles short and in the language the student used, e.g. "ללמוד למבחן בסטטיסטיקה".
- category: "study" for school/university, "work" for a job, "personal" for everything else.
- Never invent items the student didn't mention. If nothing usable was said, return an empty items list.
- "reply": one short, friendly sentence in Hebrew telling the student what you understood, or what was unclear.`;

async function apiKey(root) {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try { return (await readFile(resolve(root, 'ai-key.txt'), 'utf8')).trim() || null; }
  catch { return null; }
}

export async function understand(root, { text, today, weekday }) {
  const key = await apiKey(root);
  if (!key) return { status: 503, body: { error: 'no-key' } };
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); }
  catch { return { status: 503, body: { error: 'no-library' } }; }

  const client = new Anthropic({ apiKey: key });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Re-runs the request on Anthropic's recommended model if this one declines it.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Today is ${weekday}, ${today}.\n\nWhat the student said:\n${text}` }]
    });
    if (response.stop_reason === 'refusal') return { status: 422, body: { error: 'refused' } };
    if (response.stop_reason === 'max_tokens') return { status: 502, body: { error: 'too-long' } };
    const textBlock = response.content.findLast(block => block.type === 'text');
    const result = JSON.parse(textBlock?.text ?? '');
    return { status: 200, body: result };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { status: 401, body: { error: 'bad-key' } };
    if (error instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'busy' } };
    if (error instanceof Anthropic.APIConnectionError) return { status: 502, body: { error: 'offline' } };
    if (error instanceof Anthropic.APIError) return { status: 502, body: { error: 'api', detail: error.message } };
    if (error instanceof SyntaxError) return { status: 502, body: { error: 'unreadable' } };
    throw error;
  }
}
