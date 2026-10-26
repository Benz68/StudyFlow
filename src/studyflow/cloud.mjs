// The account and the cloud copy: one saved copy per person, so every phone or computer they sign in on has everything.
// The device copy is the one the app works on; the account follows it. Sign-in is Google or a one-time code by email.
// Talks to Supabase over plain fetch.
import {SUPABASE_URL, SUPABASE_KEY} from './config.mjs';

const SESSION_KEY = 'studyflow.session', SYNC_KEY = 'studyflow.sync', SIGNIN_KEY = 'studyflow.signin';
// A sign-in arriving in the address is taken only if this browser asked for one in the last hour,
// so a link someone else sends cannot sign a person into a stranger's account.
const SIGNIN_WINDOW = 60 * 60 * 1000;
const read = (storage, key) => { try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; } };
const write = (storage, key, value) => {
  try { if (value === null) storage?.removeItem(key); else storage?.setItem(key, JSON.stringify(value)); } catch { /* a private window: sign-in lasts until it closes */ }
};

export class CloudError extends Error {
  constructor(code, detail = '', status = 0) { super(code); this.code = code; this.detail = detail; this.status = status; }
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

  // A new sign-in never borrows the person of the one before it; a renewal of the same sign-in keeps them.
  const keep = (s, {renewal = false} = {}) => {
    session = s ? {access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: s.expires_at || Math.floor(now() / 1000) + (Number(s.expires_in) || 3600),
      user: s.user?.id ? {id: s.user.id, email: s.user.email || ''} : renewal ? session?.user || null : null} : null;
    write(storage, SESSION_KEY, session);
  };
  const askedToSignIn = () => { const at = Number(read(storage, SIGNIN_KEY)) || 0; return at && now() - at < SIGNIN_WINDOW; };

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
      throw new CloudError(codeOf(res.status, data), data, res.status);
    }
    return data;
  }

  // A sign-in lasts an hour and renews itself. Only a renewal the server refuses (400/401/403) means signing in again;
  // no connection, a server hiccup or a Wi-Fi login page keeps the sign-in for the next try.
  async function accessToken() {
    if (!session?.access_token) return null;
    if (session.expires_at - 60 > now() / 1000) return session.access_token;
    try {
      keep(await call('/auth/v1/token?grant_type=refresh_token', {method: 'POST', body: {refresh_token: session.refresh_token}}), {renewal: true});
    } catch (e) {
      if ([400, 401, 403].includes(e.status)) keep(null);
      throw e;
    }
    return session.access_token;
  }

  const forget = () => { keep(null); write(storage, SYNC_KEY, null); };

  return {
    get user() { return session?.user || null; },
    sendCode(email) { write(storage, SIGNIN_KEY, now()); return call('/auth/v1/otp', {method: 'POST', body: {email, create_user: true}}); },
    async verifyCode(email, token) {
      keep(await call('/auth/v1/verify', {method: 'POST', body: {type: 'email', email, token}}));
      write(storage, SIGNIN_KEY, null);
      return session.user;
    },
    googleUrl(redirectTo) { write(storage, SIGNIN_KEY, now()); return `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`; },
    // Coming back from Google or from the link in the sign-in email, the address carries "#access_token=…&refresh_token=…",
    // or "#error=…" when the link expired. Returns 'signed-in', 'expired', 'unasked' (a sign-in this browser never asked for) or false.
    takeRedirect(hash) {
      const p = new URLSearchParams(String(hash).replace(/^#/, ''));
      if (p.get('error') || p.get('error_code')) return 'expired';
      if (!p.get('access_token')) return false;
      if (!askedToSignIn()) return 'unasked';
      write(storage, SIGNIN_KEY, null);
      keep({access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
        expires_in: p.get('expires_in'), expires_at: Number(p.get('expires_at')) || undefined});
      return 'signed-in';
    },
    async loadUser() {
      const user = await call('/auth/v1/user', {auth: true});
      keep({...session, user}, {renewal: true});
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
    // Only when the account's copy last changed: a few bytes, so opening the app stays cheap with many people.
    async peek() {
      const rows = await call(`/rest/v1/user_state?select=edited_at&user_id=eq.${encodeURIComponent(session.user.id)}`, {auth: true});
      return rows?.[0] || null;
    },
    async pull() {
      const rows = await call(`/rest/v1/user_state?select=state,edited_at&user_id=eq.${encodeURIComponent(session.user.id)}`, {auth: true});
      return rows?.[0] || null;
    },
    async push(state, editedAt) {
      await call('/rest/v1/user_state?on_conflict=user_id', {method: 'POST', auth: true,
        headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
        body: {user_id: session.user.id, state, edited_at: new Date(editedAt).toISOString()}});
    },
    // Per device: when the planner was last changed here, and which version of the account it last matched.
    syncInfo: () => read(storage, SYNC_KEY) || {},
    setSyncInfo: info => write(storage, SYNC_KEY, {...(read(storage, SYNC_KEY) || {}), ...info}),
  };
}

// What to do when this device and the account may both have changed since they last matched.
// dirty: something changed on this device since then; syncedAt: the version of the account this device last matched (0 = never).
// No clocks are compared between devices: the account "changed" when its version is not the one this device last saw.
// An empty device always takes the account (a new phone, or a device wiped when someone else signs in).
export function decide({dirty = false, syncedAt = 0, empty = false} = {}, remote = null) {
  if (!remote) return empty && !dirty ? 'nothing' : 'push';
  if (empty && !dirty) return 'pull';
  if (!syncedAt) return 'ask';
  const there = (Date.parse(remote.edited_at) || 0) !== syncedAt;
  if (dirty && there) return 'merge';
  if (there) return 'pull';
  return dirty ? 'push' : 'same';
}
// Saves from before the edit count: a change after the last match is still a change.
export const isDirty = info => info.dirty ?? ((info.editedAt || 0) > (info.syncedAt || 0));

// Nothing worth keeping yet: a fresh install, before the first-time questions were answered or anything was added.
export const isEmpty = s => !s?.profile?.onboarded && !['classes', 'items', 'courses', 'goals', 'jobs', 'shifts'].some(k => s?.[k]?.length);
