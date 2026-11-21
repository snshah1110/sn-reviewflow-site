import { CONFIG } from './config.js';
import { licenseState } from './license.js';

let licNote = null;
async function loadLicense() {
  try {
    const b = await (await fetch(new URL(`./b/${code}.json`, import.meta.url), { cache: 'no-cache' })).json();
    if (b.ownFirm) return;
    const st = await licenseState(code, b.license);
    const txt = st.state === 'active' ? (st.daysLeft <= 7 ? `Your SN ReviewFlow plan ends on ${st.expiry} (${st.daysLeft} day(s) left). Please renew to keep your review page running.` : null)
      : st.state === 'grace' ? `Your SN ReviewFlow plan ended on ${st.expiry}. The review page will stop in a few days – please renew now.`
      : 'Your SN ReviewFlow plan is not active, so the review page is switched off. Please contact S N Enterprise to renew.';
    if (txt) licNote = el('p', { class: st.state === 'active' ? 'note' : 'err' }, txt);
  } catch { /* stats still work without this */ }
}

const app = document.getElementById('app');
const code = (new URLSearchParams(location.search).get('b') || '').toLowerCase();

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}

async function ask(pin) {
  const r = await fetch(CONFIG.STATS_URL, { method: 'POST', body: JSON.stringify({ token: CONFIG.STATS_TOKEN, kind: 'stats', b: code, pin }) });
  return r.json();
}

function login(error) {
  const pin = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Stats PIN', 'aria-label': 'Stats PIN' });
  const go = el('button', { type: 'submit', class: 'btn primary' }, 'Show stats');
  const form = el('form', { class: 'stack', onsubmit: async e => {
    e.preventDefault(); go.disabled = true; go.textContent = 'Loading…';
    try { const d = await ask(pin.value.trim()); if (!d.ok) return login(d.error === 'pin' ? 'Wrong PIN.' : 'Could not load stats.'); show(d); }
    catch { login('No connection. Please try again.'); }
  } }, pin, go);
  app.replaceChildren(el('section', { class: 'screen' }, el('h1', {}, 'Review page stats'),
    el('p', { class: 'muted' }, 'Enter the PIN you received from S N Enterprise.'), error ? el('p', { class: 'err' }, error) : null, form));
  pin.focus();
}

function sum(days, k) { return days.reduce((a, d) => a + (d[k] || 0), 0); }

function show(data, range = 30) {
  const today = new Date();
  const cutoff = new Date(today.getTime() - (range - 1) * 864e5).toISOString().slice(0, 10);
  const days = data.days.filter(d => d.date >= cutoff);
  const tile = (label, value) => el('div', { class: 'tile' }, el('span', {}, label), el('b', {}, value.toLocaleString('en-IN')));
  const visits = sum(days, 'visit');
  const opened = sum(days, 'google_click');
  const rated = [1, 2, 3, 4, 5].map(r => sum(days, 'r' + r));
  const maxR = Math.max(1, ...rated);
  const sel = el('select', { 'aria-label': 'Period', onchange: e => show(data, Number(e.target.value)) },
    [7, 30, 90].map(n => { const o = el('option', { value: n }, `Last ${n} days`); if (n === range) o.selected = true; return o; }));

  app.replaceChildren(el('section', { class: 'screen' },
    el('h1', {}, data.name || code),
    data.active === false ? el('p', { class: 'err' }, 'This account is not active. Please contact S N Enterprise.') : null,
    licNote,
    sel,
    el('p', { class: 'group' }, 'Feedback captured on your review page'),
    el('div', { class: 'grid' },
      tile('Page visits', visits), tile('Star ratings given', rated.reduce((a, b) => a + b, 0)), tile('Rating skipped', sum(days, 'rating_skipped')),
      tile('Asked for writing help', sum(days, 'ai')), tile('Wrote their own', sum(days, 'own')), tile('Rating only', sum(days, 'rating_only')),
      tile('Review text approved', sum(days, 'approved'))),
    el('p', { class: 'group' }, 'Star ratings on your page'),
    el('div', { class: 'stack' }, [5, 4, 3, 2, 1].map(r => el('div', { class: 'bar' }, el('span', {}, r + '★'),
      el('div', {}, el('i', { style: `width:${Math.round(rated[r - 1] / maxR * 100)}%` })), el('span', {}, rated[r - 1])))),
    el('p', { class: 'group' }, 'Google'),
    el('div', { class: 'grid' }, tile('Google review page opened', opened),
      tile('Opened ÷ visits', visits ? Math.round(opened / visits * 100) + '%' : '–')),
    el('p', { class: 'note' }, '“Google review page opened” counts button presses only. Google does not tell us whether a review was actually posted – check your Google Business Profile for real reviews.'),
    ...qrSection(data.name || code),
  ));
}

/** Download your QR codes / print cards, and share the review link on WhatsApp. */
function qrSection(name) {
  const f = file => `qr/${code}/${file}`;
  const dl = (label, file) => el('a', { class: 'btn', href: f(file), download: `${code}-${file}` }, label);
  const page = new URL(`r/${code}/?src=whatsapp`, document.baseURI).href;
  const wa = 'https://wa.me/?text=' + encodeURIComponent(`Thank you for choosing ${name}! We would love to hear about your experience: ${page}`);
  return [
    el('p', { class: 'group' }, 'Your QR codes'),
    el('p', { class: 'muted' }, 'Print cards (A6 size): open, then print – or send the file to your printer shop. Put them where your old Google review QR was.'),
    el('div', { class: 'grid' }, dl('⬇ Counter card', 'card-counter-A6.svg'), dl('⬇ Table card', 'card-table-A6.svg'), dl('⬇ Packaging card', 'card-packaging-A6.svg')),
    el('p', { class: 'muted' }, 'Plain QR images (for your own bills, stickers, banners or website):'),
    el('div', { class: 'grid' }, dl('⬇ QR – counter', 'qr-counter.png'), dl('⬇ QR – table', 'qr-table.png'), dl('⬇ QR – packaging', 'qr-packaging.png'), dl('⬇ QR – website', 'qr-website.png')),
    el('p', { class: 'muted' }, 'Send the review link to your customers after a sale:'),
    el('a', { class: 'btn primary', href: wa, target: '_blank', rel: 'noopener' }, 'Share on WhatsApp'),
  ];
}

if (!code || !CONFIG.STATS_URL) app.replaceChildren(el('section', { class: 'screen' }, el('h2', {}, !code ? 'Stats link is incomplete.' : 'Stats are not switched on yet.')));
else { loadLicense(); login(); }
