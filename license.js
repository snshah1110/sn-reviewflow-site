// SN ReviewFlow – checks S N Enterprise license codes (SNRF1.<payload>.<signature>) in the browser.
// Same format as SN License Manager: ECDSA P-256 / SHA-256 over ASCII("SNRF1.") + payload bytes.
// Only the PUBLIC key is here; codes can be checked but never made.

export const PREFIX = 'SNRF1.';
export const PUBLIC_KEY_SPKI = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIwve3tQRpjRRQ8mCVnLgThQXqX7oTIePGYHlmI20vwbWvs1VjV1a59t/e8BuVqTwlPJ1jBxJI8KFlAukwU3qHw==';
export const GRACE_DAYS = 7;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - s.length % 4) % 4);
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function base32(bytes, chars) {
  let out = '', buffer = 0, bits = 0, i = 0;
  while (out.length < chars) {
    if (bits < 5) { buffer = (buffer << 8) | (i < bytes.length ? bytes[i] : 0); i++; bits += 8; }
    out += ALPHABET[(buffer >> (bits - 5)) & 31];
    bits -= 5;
  }
  return out;
}

function checkChar(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) { const v = ALPHABET.indexOf(data[i]); if (v >= 0) sum = (sum + v * (i + 3)) % 32; }
  return ALPHABET[(32 - sum) % 32];
}

/** The business's Activation Code (SNDEV-XXXXX-XXXXX), the same as SN License Manager's DeviceIdentity.Compute(["SNRF", code]). */
export async function activationCode(bizCode) {
  const joined = 'SNDEV|v1|' + ['SNRF', bizCode].map(f => String(f ?? '').trim().toUpperCase()).join('|');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(joined)));
  const body = base32(hash, 9);
  const full = body + checkChar(body);
  return `SNDEV-${full.slice(0, 5)}-${full.slice(5)}`;
}

const keys = new Map();
function publicKey(spki) {
  if (!keys.has(spki)) keys.set(spki, crypto.subtle.importKey('spki', Uint8Array.from(atob(spki), c => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
  return keys.get(spki);
}

/** Returns the signed payload, or null if the code is not a genuine SN ReviewFlow code. */
export async function verifyCode(text, spki = PUBLIC_KEY_SPKI) {
  try {
    const raw = String(text || '').replace(/\s+/g, '');
    const i = raw.indexOf(PREFIX);
    if (i < 0) return null;
    const [p, s] = raw.slice(i + PREFIX.length).split('.');
    if (!p || !s || s.length < 86) return null;
    const payload = b64urlToBytes(p), sig = b64urlToBytes(s.slice(0, 86));
    const signed = new Uint8Array(PREFIX.length + payload.length);
    signed.set(new TextEncoder().encode(PREFIX)); signed.set(payload, PREFIX.length);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(spki), sig, signed);
    if (!ok) return null;
    const j = JSON.parse(new TextDecoder().decode(payload));
    return j.prod === 'SNRF' ? j : null;
  } catch { return null; }
}

/** End of a date (yyyy-mm-dd) in India time, as a JS timestamp. */
const endOfDayIst = d => Date.parse(d + 'T23:59:59+05:30');

/**
 * License state for a business: { state: 'active' | 'grace' | 'expired' | 'invalid' | 'none', expiry, daysLeft }.
 * 'grace' = up to GRACE_DAYS after expiry: page still works, owner is reminded to renew.
 */
export async function licenseState(bizCode, codeText, now = Date.now(), spki = PUBLIC_KEY_SPKI) {
  if (!codeText) return { state: 'none' };
  const p = await verifyCode(codeText, spki);
  if (!p) return { state: 'invalid' };
  if (p.dev !== await activationCode(bizCode)) return { state: 'invalid', reason: 'other business' };
  if (now < Date.parse(p.start + 'T00:00:00+05:30')) return { state: 'invalid', reason: 'not started' };
  const end = endOfDayIst(p.exp);
  const daysLeft = Math.ceil((end - now) / 864e5);
  if (now <= end) return { state: 'active', expiry: p.exp, daysLeft, term: p.term };
  if (now <= end + GRACE_DAYS * 864e5) return { state: 'grace', expiry: p.exp, daysLeft, term: p.term };
  return { state: 'expired', expiry: p.exp, daysLeft, term: p.term };
}
