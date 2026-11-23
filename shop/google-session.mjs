export const GOOGLE_CLIENT_ID = '934644417883-72iujt055o25snvt6i1cr9egomvvgm2l.apps.googleusercontent.com';
const sessionKey = 'vtch.google.tab-session';
const listeners = new Set();
let token = '';
let channel;
try {
  token = sessionStorage.getItem(sessionKey) || '';
  channel = new BroadcastChannel(sessionKey);
} catch {
  // The current page can still sign in when storage or cross-tab messaging is unavailable.
}

export function googleClaims(value) {
  try {
    const payload = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function googleProfile(value) {
  const claims = googleClaims(value);
  if (claims?.aud !== GOOGLE_CLIENT_ID || !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)) return null;
  return {name: claims.name || 'Tài khoản Google', picture: claims.picture};
}

export function readGoogleSession() {
  return googleProfile(token) ? token : '';
}

function remember(value) {
  token = googleProfile(value) ? value : '';
  try {
    if (token) sessionStorage.setItem(sessionKey, token);
    else sessionStorage.removeItem(sessionKey);
  } catch {}
}

export function saveGoogleSession(value) {
  remember(value);
  channel?.postMessage({type: 'session', value: token});
}

export function subscribeGoogleSession(listener) {
  listeners.add(listener);
}

if (channel) channel.onmessage = ({data}) => {
  if (data?.type === 'request') {
    const value = readGoogleSession();
    if (value) channel.postMessage({type: 'session', value});
  } else if (data?.type === 'session' && typeof data.value === 'string' &&
      data.value !== token && (!data.value || googleProfile(data.value))) {
    remember(data.value);
    for (const listener of listeners) listener(token);
  }
};

export function requestGoogleSession() {
  if (!readGoogleSession()) channel?.postMessage({type: 'request'});
}
