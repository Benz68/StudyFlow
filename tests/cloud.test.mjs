import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloud, decide, isEmpty, isDirty} from '../src/studyflow/cloud.mjs';

const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
const reply = (status, body) => ({ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body))});
const at = iso => Date.parse(iso);

test('which copy wins: the device, the account, both joined, or ask', () => {
  const remote = {edited_at: '2026-10-20T10:00:00Z'}, synced = at('2026-10-20T10:00:00Z');
  assert.equal(decide({empty: true}, null), 'nothing', 'nothing here and nothing there');
  assert.equal(decide({dirty: true}, null), 'push', 'first save to an empty account');
  assert.equal(decide({empty: true}, remote), 'pull', 'a new phone takes the account');
  assert.equal(decide({empty: true, syncedAt: synced + 99999}, remote), 'pull', 'a device wiped for someone else takes their account, whatever it matched before');
  assert.equal(decide({dirty: true}, remote), 'ask', 'both have data and never met: the person chooses');
  assert.equal(decide({syncedAt: synced}, remote), 'same');
  assert.equal(decide({dirty: true, syncedAt: synced}, remote), 'push', 'changed only here');
  assert.equal(decide({syncedAt: synced - 5000}, remote), 'pull', 'changed only on another device');
  assert.equal(decide({dirty: true, syncedAt: synced - 5000}, remote), 'merge', 'both changed: joined, nothing lost');
  assert.equal(decide({dirty: true, syncedAt: synced + 5000}, remote), 'merge', 'a phone clock ahead or behind changes nothing: versions are compared, not clocks');
  assert.equal(isDirty({editedAt: 10, syncedAt: 5}), true, 'saves from before the edit count still know they changed');
  assert.equal(isDirty({dirty: false, editedAt: 10, syncedAt: 5}), false);
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

test('coming back from the email link or Google signs in from the address, only when this browser asked', () => {
  const cloud = createCloud({url: 'https://x.supabase.co', key: 'k', storage: memory(), fetchFn: async () => reply(200, {})});
  const back = '#access_token=t&refresh_token=r&expires_in=3600&token_type=bearer&type=magiclink';
  assert.equal(cloud.takeRedirect('#today'), false);
  assert.equal(cloud.takeRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), 'expired');
  assert.equal(cloud.takeRedirect(back), 'unasked', 'a link someone sent cannot sign this browser into their account');
  assert.equal(cloud.user, null);
  assert.ok(cloud.googleUrl('https://benz68.github.io/StudyFlow/').includes('provider=google&redirect_to=https%3A%2F%2Fbenz68.github.io'));
  assert.equal(cloud.takeRedirect(back), 'signed-in');
  assert.equal(cloud.user, null, 'the new sign-in never borrows the person of an earlier one');
  assert.equal(cloud.takeRedirect(back), 'unasked', 'and the request is used once');
});

test('a server hiccup while renewing keeps the sign-in; a refused renewal ends it', async () => {
  let clock = 1_000_000_000_000, answer = reply(503, {message: 'down'});
  const storage = memory(), fetchFn = async url => url.includes('/verify') ? reply(200, {access_token: 'a', refresh_token: 'r', expires_in: 60, user: {id: 'u', email: 'a@b.co'}}) : answer;
  const cloud = createCloud({url: 'https://x.supabase.co', key: 'k', storage, fetchFn, now: () => clock});
  await cloud.verifyCode('a@b.co', '1');
  clock += 3600 * 1000;
  try { await cloud.pull(); } catch { /* expected */ }
  assert.equal(cloud.user?.id, 'u', 'still signed in after a 503');
  answer = reply(400, {error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token'});
  try { await cloud.pull(); } catch { /* expected */ }
  assert.equal(cloud.user, null, 'signed out after the server refused the renewal');
});
