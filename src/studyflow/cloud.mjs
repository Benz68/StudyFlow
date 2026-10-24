// The account and the cloud copy. Signing in is optional: the planner keeps working on the device without it,
// and an account adds one saved copy per person, so a new phone gets everything back.
// Sign-in is a one-time code by email (Google once it is switched on). Talks to Supabase over plain fetch.
import {SUPABASE_URL, SUPABASE_KEY} from './config.mjs';

const SESSION_KEY = 'studyflow.session', SYNC_KEY = 'studyflow.sync';
const read = (storage, key) => { try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; } };
const write = (storage, key, value) => {
  try { if (value === null) storage?.removeItem(key); else storage?.setItem(key, JSON.stringify(value)); } catch { /* a private window: sign-in lasts until it closes */ }
};

export class CloudError extends Error {
  constructor(code, detail = '') { super(code); this.code = code; this.detail = detail; }
}
// The few things a person needs told apart; everything else is "something went wrong".
function codeOf(status, data) {
  const text = `${data?.error_code || ''} ${data?.code || ''} ${data?.msg || data?.message || data?.error_description || ''}`.toLowerCase();
  if (status === 429 || text.includes('rate')) return 'too-many';
  if (text.includes('otp') && (text.includes('expired') || text.includes('invalid'))) return 'bad-code';
  if (text.includes('token') && text.includes('expired')) return 'bad-code';
  if (text.includes('provider') && text.includes('not enabled')) return 'provider-off';
  if (text.includes('pgrst205') || text.includes('could not find the table')) return 'no-table';
  if (status === 401 || status === 403) return 'signed-out';
  return 'failed';
}

export function createCloud({url = SUPABASE_URL, key = SUPABASE_KEY, storage = globalThis.localStorage,
  fetchFn = globalThis.fetch?.bind(globalThis), now = () => Date.now()} = {}) {
  let session = read(storage, SESSION_KEY);

  const keep = s => {
    session = s ? {access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: s.expires_at || Math.floor(now() / 1000) + (Number(s.expires_in) || 3600),
      user: s.user?.id ? {id: s.user.id, email: s.user.email || ''} : session?.user || null} : null;
    write(storage, SESSION_KEY, session);
  };

  async function call(path, {method = 'GET', body, auth = false, headers = {}} = {}) {
    const h = {apikey: key, 'Content-Type': 'application/json', ...headers};
    if (auth) {
      const token = await accessToken();
      if (!token) throw new CloudError('signed-out');
      h.Authorization = `Bearer ${token}`;
    }
    let res;
    try { res = await fetchFn(url + path, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)}); }
    catch { throw new CloudError('offline'); }
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      if (auth && res.status === 401) keep(null); // the sign-in was revoked or is no longer valid: sign in again
      throw new CloudError(codeOf(res.status, data), data);
    }
    return data;
  }

  // A sign-in lasts an hour and renews itself; a renewal the server refuses means signing in again.
  async function accessToken() {
    if (!session?.access_token) return null;
    if (session.expires_at - 60 > now() / 1000) return session.access_token;
    try {
      keep(await call('/auth/v1/token?grant_type=refresh_token', {method: 'POST', body: {refresh_token: session.refresh_token}}));
    } catch (e) {
      if (e.code !== 'offline') keep(null);
      throw e;
    }
    return session.access_token;
  }

  const forget = () => { keep(null); write(storage, SYNC_KEY, null); };

  return {
    get user() { return session?.user || null; },
    sendCode: email => call('/auth/v1/otp', {method: 'POST', body: {email, create_user: true}}),
    async verifyCode(email, token) {
      keep(await call('/auth/v1/verify', {method: 'POST', body: {type: 'email', email, token}}));
      return session.user;
    },
    googleUrl: redirectTo => `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`,
    // Coming back from Google or from the link in the sign-in email, the address carries "#access_token=…&refresh_token=…",
    // or "#error=…" when the link expired. Returns 'signed-in', 'expired' or false.
    takeRedirect(hash) {
      const p = new URLSearchParams(String(hash).replace(/^#/, ''));
      if (p.get('error') || p.get('error_code')) return 'expired';
      if (!p.get('access_token')) return false;
      keep({access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
        expires_in: p.get('expires_in'), expires_at: Number(p.get('expires_at')) || undefined});
      return 'signed-in';
    },
    async loadUser() {
      const user = await call('/auth/v1/user', {auth: true});
      keep({...session, user});
      return session.user;
    },
    async signOut() {
      try { await call('/auth/v1/logout', {method: 'POST', auth: true}); } catch { /* signed out on this device anyway */ }
      forget();
    },
    async deleteAccount() {
      await call('/rest/v1/rpc/delete_my_account', {method: 'POST', auth: true, body: {}});
      forget();
    },
    async pull() {
      const rows = await call(`/rest/v1/user_state?select=state,edited_at&user_id=eq.${encodeURIComponent(session.user.id)}`, {auth: true});
      return rows?.[0] || null;
    },
    async push(state, editedAt) {
      const rows = await call('/rest/v1/user_state?on_conflict=user_id', {method: 'POST', auth: true,
        headers: {Prefer: 'resolution=merge-duplicates,return=representation'},
        body: {user_id: session.user.id, state, edited_at: new Date(editedAt).toISOString()}});
      return rows?.[0] || null;
    },
    // Per device: when the planner was last changed here, and which version of the account it last matched.
    syncInfo: () => read(storage, SYNC_KEY) || {},
    setSyncInfo: info => write(storage, SYNC_KEY, {...(read(storage, SYNC_KEY) || {}), ...info}),
  };
}

// What to do when this device and the account may both have changed since they last matched.
// editedAt: last change on this device; syncedAt: the account's version this device last matched (0 = never).
export function decide({editedAt = 0, syncedAt = 0, empty = false} = {}, remote = null) {
  if (!remote) return empty ? 'nothing' : 'push';
  const remoteAt = Date.parse(remote.edited_at) || 0;
  if (!syncedAt) return empty ? 'pull' : remoteAt === editedAt ? 'same' : 'ask';
  const here = editedAt > syncedAt, there = remoteAt > syncedAt;
  if (here && there) return editedAt >= remoteAt ? 'push-keep-other' : 'pull-keep-other';
  if (there) return 'pull';
  if (here) return 'push';
  return 'same';
}

// Nothing worth keeping yet: a fresh install, before the first-time questions were answered or anything was added.
export const isEmpty = s => !s?.profile?.onboarded && !['classes', 'items', 'courses', 'goals', 'jobs', 'shifts'].some(k => s?.[k]?.length);
