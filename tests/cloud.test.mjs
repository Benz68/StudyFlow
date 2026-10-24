import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloud, decide, isEmpty} from '../src/studyflow/cloud.mjs';

const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
const reply = (status, body) => ({ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body))});
const at = iso => Date.parse(iso);

test('which copy wins: the device, the account, or ask', () => {
  const remote = {edited_at: '2026-10-20T10:00:00Z'};
  assert.equal(decide({empty: true}, null), 'nothing', 'nothing here and nothing there');
  assert.equal(decide({editedAt: 5}, null), 'push', 'first save to an empty account');
  assert.equal(decide({empty: true}, remote), 'pull', 'a new phone takes the account');
  assert.equal(decide({editedAt: at('2026-10-19T10:00:00Z')}, remote), 'ask', 'both have data and never met: the person chooses');
  const synced = at('2026-10-20T10:00:00Z');
  assert.equal(decide({editedAt: synced, syncedAt: synced}, remote), 'same');
  assert.equal(decide({editedAt: synced + 1000, syncedAt: synced}, remote), 'push', 'changed only here');
  assert.equal(decide({editedAt: synced - 5000, syncedAt: synced - 5000}, remote), 'pull', 'changed only on another device');
  assert.equal(decide({editedAt: synced + 1000, syncedAt: synced - 5000}, remote), 'push-keep-other', 'both changed: the newer wins, the other is kept');
  assert.equal(decide({editedAt: synced - 1000, syncedAt: synced - 5000}, remote), 'pull-keep-other');
  assert.equal(isEmpty({classes: [], items: [], courses: [], goals: [], jobs: [], shifts: []}), true);
  assert.equal(isEmpty({classes: [{}]}), false);
  assert.equal(isEmpty({classes: [], profile: {onboarded: true}}), false, 'someone who finished the first-time questions has something to keep, even with no classes yet');
});

test('sign in with a code, keep the session, renew it when it runs out', async () => {
  const storage = memory(), calls = [];
  let clock = 1_000_000_000_000;
  const fetchFn = async (url, init) => {
    calls.push([url.replace('https://x.supabase.co', ''), init.method, init.headers.Authorization || '']);
    if (url.includes('/otp')) return reply(200, {});
    if (url.includes('/verify')) return reply(200, {access_token: 'a1', refresh_token: 'r1', expires_in: 3600, user: {id: 'u1', email: 'a@b.co'}});
    if (url.includes('grant_type=refresh_token')) return reply(200, {access_token: 'a2', refresh_token: 'r2', expires_in: 3600, user: {id: 'u1', email: 'a@b.co'}});
    if (url.includes('/rest/v1/user_state') && init.method === 'GET') return reply(200, []);
    return reply(404, {message: 'unexpected'});
  };
  const cloud = createCloud({url: 'https://x.supabase.co', key: 'k', storage, fetchFn, now: () => clock});
  await cloud.sendCode('a@b.co');
  const user = await cloud.verifyCode('a@b.co', '123456');
  assert.deepEqual(user, {id: 'u1', email: 'a@b.co'});
  assert.equal(createCloud({url: 'https://x.supabase.co', key: 'k', storage, fetchFn}).user.email, 'a@b.co', 'the sign-in survives a restart');
  assert.equal(await cloud.pull(), null);
  assert.equal(calls.at(-1)[2], 'Bearer a1');
  clock += 2 * 3600 * 1000;
  await cloud.pull();
  assert.deepEqual(calls.slice(-2).map(c => c[2]), ['', 'Bearer a2'], 'an expired sign-in renews itself first');
  assert.equal(await cloud.peek(), null);
  assert.ok(calls.at(-1)[0].includes('select=edited_at&'), 'checking for changes asks only for the time, not the whole planner');
});

test('errors a person can act on are told apart', async () => {
  const make = response => createCloud({url: 'https://x.supabase.co', key: 'k', storage: memory(), fetchFn: async () => response});
  const codeOf = async (response, run) => { try { await run(make(response)); return 'none'; } catch (e) { return e.code; } };
  assert.equal(await codeOf(reply(403, {error_code: 'otp_expired', msg: 'Token has expired or is invalid'}), c => c.verifyCode('a@b.co', '1')), 'bad-code');
  assert.equal(await codeOf(reply(429, {msg: 'rate limit exceeded'}), c => c.sendCode('a@b.co')), 'too-many');
  const offline = createCloud({url: 'https://x.supabase.co', key: 'k', storage: memory(), fetchFn: async () => { throw new TypeError('Failed to fetch'); }});
  let code = 'none';
  try { await offline.sendCode('a@b.co'); } catch (e) { code = e.code; }
  assert.equal(code, 'offline');
});

test('coming back from the email link or Google signs in from the address', () => {
  const cloud = createCloud({url: 'https://x.supabase.co', key: 'k', storage: memory(), fetchFn: async () => reply(200, {})});
  assert.equal(cloud.takeRedirect('#today'), false);
  assert.equal(cloud.takeRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), 'expired');
  assert.equal(cloud.user, null);
  assert.equal(cloud.takeRedirect('#access_token=t&refresh_token=r&expires_in=3600&token_type=bearer&type=magiclink'), 'signed-in');
  assert.ok(cloud.googleUrl('https://benz68.github.io/StudyFlow/').includes('provider=google&redirect_to=https%3A%2F%2Fbenz68.github.io'));
});
