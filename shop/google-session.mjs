export const GOOGLE_CLIENT_ID = '934644417883-72iujt055o25snvt6i1cr9egomvvgm2l.apps.googleusercontent.com';
const sessionKey = 'vtch.google.tab-session';
const profileKey = 'vtch_google_profile';
const listeners = new Set();
let token = '';
let channel;

function readCookie(name) {
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function writeCookie(name, value, maxAge = 31536000) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; path=/; SameSite=Lax`;
  } catch {}
}

function removeCookie(name) {
  try {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  } catch {}
}

function readStorage(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function loadStoredToken() {
  const fromLocal = readStorage(sessionKey);
  if (fromLocal) return fromLocal;
  const fromCookie = readCookie(sessionKey);
  if (fromCookie) {
    writeStorage(sessionKey, fromCookie);
    return fromCookie;
  }
  return '';
}

export function getStoredProfile() {
  try {
    const raw = readStorage(profileKey) || readCookie(profileKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return null;
}

try {
  token = loadStoredToken();
  channel = new BroadcastChannel(sessionKey);
} catch {
  // Storage or cross-tab messaging unavailable
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
  if (!value) return null;
  const claims = googleClaims(value);
  if (claims && claims.aud === GOOGLE_CLIENT_ID) {
    return {
      name: claims.name || (claims.email ? claims.email.split('@')[0] : 'Tài khoản Google'),
      picture: claims.picture || ''
    };
  }
  const cached = getStoredProfile();
  if (cached && (cached.name || cached.picture)) return cached;
  return null;
}

export function readGoogleSession() {
  if (!token) {
    token = loadStoredToken();
  }
  return (token && googleProfile(token)) ? token : '';
}

function remember(value) {
  if (value) {
    const profile = googleProfile(value) || getStoredProfile();
    token = profile ? value : '';
    if (token) {
      writeStorage(sessionKey, token);
      writeCookie(sessionKey, token);
      if (profile) {
        const json = JSON.stringify(profile);
        writeStorage(profileKey, json);
        writeCookie(profileKey, json);
      }
      return;
    }
  }
  token = '';
  removeStorage(sessionKey);
  removeCookie(sessionKey);
  removeStorage(profileKey);
  removeCookie(profileKey);
}

export function saveGoogleSession(value) {
  remember(value);
  channel?.postMessage({type: 'session', value: token});
}

export function subscribeGoogleSession(listener) {
  listeners.add(listener);
}

if (channel) {
  channel.onmessage = ({data}) => {
    if (data?.type === 'request') {
      const value = readGoogleSession();
      if (value) channel.postMessage({type: 'session', value});
    } else if (data?.type === 'session' && typeof data.value === 'string' &&
        data.value !== token && (!data.value || googleProfile(data.value))) {
      remember(data.value);
      for (const listener of listeners) listener(token);
    }
  };
}

try {
  window.addEventListener('storage', event => {
    if (event.key === sessionKey) {
      const newVal = event.newValue || '';
      if (newVal !== token) {
        remember(newVal);
        for (const listener of listeners) listener(token);
      }
    }
  });
} catch {}

export function requestGoogleSession() {
  if (!readGoogleSession()) channel?.postMessage({type: 'request'});
}
