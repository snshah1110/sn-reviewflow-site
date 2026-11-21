import { CONFIG } from './config.js';

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
  ));
}

if (!code || !CONFIG.STATS_URL) app.replaceChildren(el('section', { class: 'screen' }, el('h2', {}, !code ? 'Stats link is incomplete.' : 'Stats are not switched on yet.')));
else login();
