import * as E from './engine.js';
import { LANGS, UI } from './i18n.js';
import { CONFIG } from './config.js';
import { licenseState } from './license.js';

const app = document.getElementById('app');
const SCREENS = ['welcome', 'rating', 'topics', 'choose', 'write', 'confirm', 'google', 'thanks'];

const S = {
  biz: null, lang: 'en', screen: 'welcome', history: [],
  rating: null, cats: {}, comment: '', svc: [], mode: null,
  text: '', approved: false, picks: null, length: 'medium',
  session: Math.random().toString(36).slice(2, 10),
};
const libs = {};
const t = () => UI[S.lang] || UI.en;

// ---------- helpers ----------
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
const btn = (label, onclick, cls = '', extra = {}) => el('button', { type: 'button', class: 'btn ' + cls, onclick, ...extra }, label);

function bizCode() {
  const q = new URLSearchParams(location.search).get('b');
  const m = location.pathname.match(/\/r\/([A-Za-z0-9_-]{2,40})\/?$/);
  const code = (q || (m && m[1]) || '').toLowerCase();
  return /^[a-z0-9_-]{2,40}$/.test(code) ? code : null;
}

async function loadLib(lang) {
  if (!libs[lang]) libs[lang] = await (await fetch(new URL(`./phrases/${lang}.json`, import.meta.url))).json();
  return libs[lang];
}

/** Anonymous counters only: no name, phone, email or IP is sent. */
function track(type, extra = {}) {
  if (!CONFIG.STATS_URL || !S.biz) return;
  const body = JSON.stringify({ token: CONFIG.STATS_TOKEN, kind: 'event', b: S.biz.code, type, lang: S.lang, s: S.session, ...extra });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(CONFIG.STATS_URL, new Blob([body], { type: 'text/plain' }));
    else fetch(CONFIG.STATS_URL, { method: 'POST', body, mode: 'no-cors', keepalive: true });
  } catch { /* counting must never break the page */ }
}

const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const svcName = (o, lang) => (o && (o[lang] || o.en)) || '';

/** Everything the customer told us, with service names in the given language. */
function inputFor(lang) {
  const list = S.biz.services || [];
  return { rating: S.rating, cats: S.cats, comment: S.comment, kind: S.biz.kind || 'service',
    services: S.svc.map(id => svcName(list.find(x => x.id === id), lang)).filter(Boolean) };
}

function go(screen) { S.history.push(S.screen); S.screen = screen; render(); window.scrollTo(0, 0); }
function back() { if (S.history.length) { S.screen = S.history.pop(); render(); } }

function shell(...content) {
  const idx = SCREENS.indexOf(S.screen);
  const top = S.screen === 'welcome' || S.screen === 'thanks' ? null : el('div', { class: 'top' },
    el('button', { type: 'button', class: 'back', onclick: back, 'aria-label': t().back }, '‹ ' + t().back),
    el('div', { class: 'progress', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.round(idx / (SCREENS.length - 1) * 100)}%` })));
  app.replaceChildren(...[top, el('section', { class: 'screen' }, ...content)].filter(Boolean));
}

// ---------- screens ----------
const views = {
  welcome() {
    const b = S.biz;
    const logo = b.logo ? el('img', { src: b.logo, alt: '' }) : el('div', { class: 'mono', 'aria-hidden': 'true' }, ((b.name.match(/[\p{L}\p{N}]/u) || ['★'])[0]).toUpperCase());
    const langs = LANGS.filter(l => (b.languages || ['en']).includes(l.code));
    shell(
      el('div', { class: 'brand' }, logo, el('h1', {}, b.name)),
      el('p', { class: 'center' }, (b.welcome && b.welcome[S.lang]) || t().welcomeDefault),
      el('div', { class: 'spacer' }),
      el('p', { class: 'center muted' }, t().chooseLang),
      el('div', { class: 'langs' }, langs.map(l => btn(l.label, async () => {
        S.lang = l.code; document.documentElement.lang = l.code === 'hinglish' ? 'hi-Latn' : l.code;
        await loadLib(l.code); track('language'); go('rating');
      }, l.code === S.lang ? 'primary' : ''))),
      el('p', { class: 'foot' }, t().privacy),
    );
  },

  rating() {
    const stars = el('div', { class: 'stars', role: 'radiogroup', 'aria-label': t().ratingTitle });
    const next = btn(t().next, () => { track('rating', { rating: S.rating }); go('topics'); }, 'primary', { disabled: S.rating == null });
    const paint = () => { [...stars.children].forEach((s, i) => { s.classList.toggle('on', S.rating != null && i < S.rating); s.setAttribute('aria-checked', String(S.rating === i + 1)); }); next.disabled = S.rating == null; };
    for (let i = 1; i <= 5; i++) stars.append(el('button', { type: 'button', class: 'star', role: 'radio', 'aria-label': `${i} / 5`, onclick: () => { S.rating = i; paint(); } }, '★'));
    paint();
    shell(el('h2', {}, t().ratingTitle), stars, el('div', { class: 'spacer' }),
      el('div', { class: 'stack' }, next, btn(t().skipRating, () => { S.rating = null; track('rating_skipped'); go('topics'); }, 'link')));
  },

  topics() {
    const cats = (S.biz.categories || E.CATEGORIES).filter(k => E.CATEGORIES.includes(k));
    const list = cats.map(k => {
      const chips = el('div', { class: 'chips' });
      const opts = [['pos', t().good], ['neu', t().okay], ['neg', t().poor]];
      const paint = () => [...chips.children].forEach((c, i) => c.setAttribute('aria-pressed', String(S.cats[k] === opts[i][0])));
      opts.forEach(([v, label]) => chips.append(el('button', { type: 'button', class: 'chip', onclick: () => { if (S.cats[k] === v) delete S.cats[k]; else S.cats[k] = v; paint(); } }, label)));
      paint();
      const label = (S.biz.labels && S.biz.labels[k] && S.biz.labels[k][S.lang]) || t().cat[k];
      return el('div', { class: 'topic' }, el('div', { class: 'name' }, label), chips);
    });
    const ta = el('textarea', { id: 'cm', maxlength: '500', placeholder: t().commentPh, oninput: e => { S.comment = e.target.value; } });
    ta.value = S.comment;
    const services = S.biz.services || [];
    let svcBlock = [];
    if (services.length) {
      const box = el('div', { class: 'svcs' });
      services.forEach(o => {
        const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.svc.includes(o.id)), onclick: () => {
          S.svc = S.svc.includes(o.id) ? S.svc.filter(x => x !== o.id) : [...S.svc, o.id];
          b.setAttribute('aria-pressed', String(S.svc.includes(o.id)));
        } }, cap(svcName(o, S.lang)));
        box.append(b);
      });
      svcBlock = [el('h2', {}, t().svcTitle[S.biz.kind === 'product' ? 'product' : 'service']), el('p', { class: 'muted' }, t().svcHint), box];
    }
    shell(...svcBlock, el('h2', {}, t().topicsTitle), el('p', { class: 'muted' }, t().topicsHint), ...list,
      el('label', { for: 'cm' }, t().commentLabel), ta,
      btn(t().next, () => { track('topics', { n: Object.keys(S.cats).length, svc: S.svc.join(',') }); go('choose'); }, 'primary'));
  },

  choose() {
    // Same three options, same order and same look for every rating.
    const pick = mode => { S.mode = mode; track('choice', { mode }); S.approved = false;
      if (mode === 'ai') { S.picks = null; S.length = 'medium'; }
      if (mode === 'own') S.text = S.text || S.comment;
      if (mode === 'rating_only') S.text = '';
      go(E.nextScreen('choose', mode)); };
    shell(el('h2', {}, t().chooseTitle), el('div', { class: 'stack' },
      el('button', { type: 'button', class: 'btn option', onclick: () => pick('own') }, el('span', { class: 'ico' }, '✎'), t().optOwn),
      el('button', { type: 'button', class: 'btn option', onclick: () => pick('ai') }, el('span', { class: 'ico' }, '✦'), t().optAi),
      el('button', { type: 'button', class: 'btn option', onclick: () => pick('rating_only') }, el('span', { class: 'ico' }, '★'), t().optRating)));
  },

  async write() {
    if (S.mode === 'ai' && !E.canDraft(inputFor(S.lang))) {
      return shell(el('h2', {}, t().writeTitleAi), el('p', {}, t().needInput), el('div', { class: 'spacer' }), btn(t().back, back, 'primary'));
    }
    const ta = el('textarea', { class: 'big', id: 'rv', maxlength: '4000', placeholder: t().ownPh, oninput: e => { S.text = e.target.value; ok.disabled = !S.text.trim(); } });
    const ok = btn(t().next, () => { track(S.mode === 'ai' ? 'draft_ready' : 'own_ready'); go('confirm'); }, 'primary');
    const draft = async (fresh) => {
      const lib = await loadLib(S.lang);
      const input = inputFor(S.lang);
      if (fresh || !S.picks) { S.picks = E.makePicks(lib, input, Math.random, S.picks); }
      S.text = E.render(lib, input, S.picks, S.length);
      ta.value = S.text; ok.disabled = !S.text.trim();
    };
    const parts = [el('h2', {}, S.mode === 'ai' ? t().writeTitleAi : t().writeTitleOwn)];
    if (S.mode === 'ai') {
      parts.push(el('p', { class: 'muted' }, t().aiHint));
      const langRow = el('div', { class: 'seg', role: 'group', 'aria-label': t().language });
      const paintLang = () => [...langRow.children].forEach((c, i) => c.setAttribute('aria-pressed', String(LANGS.filter(l => (S.biz.languages || ['en']).includes(l.code))[i].code === S.lang)));
      LANGS.filter(l => (S.biz.languages || ['en']).includes(l.code)).forEach(l => langRow.append(el('button', { type: 'button', class: 'chip', onclick: async () => {
        S.lang = l.code; await draft(false); track('translate'); render();
      } }, l.label)));
      paintLang();
      parts.push(ta, el('div', { class: 'row' },
        btn('↻ ' + t().regen, async () => { await draft(true); track('regenerate'); }),
        btn(t().shorter, async () => { S.length = E.shorter(S.length); await draft(false); }),
        btn(t().longer, async () => { S.length = E.longer(S.length); await draft(false); })), langRow);
      shell(...parts, el('div', { class: 'spacer' }), ok);
      if (S.text && S.picks) { ta.value = S.text; } else await draft(true);
    } else {
      ta.value = S.text; ok.disabled = !S.text.trim();
      shell(...parts, ta, el('div', { class: 'spacer' }), ok);
    }
  },

  confirm() {
    shell(el('h2', {}, t().confirmTitle), el('div', { class: 'quote' }, S.text), el('p', {}, el('strong', {}, t().confirmQ)),
      el('div', { class: 'spacer' }),
      el('div', { class: 'stack' },
        btn(t().yes, () => { S.approved = true; track('approved'); go('google'); }, 'primary'),
        btn(t().edit, back),
        btn(t().withoutText, () => { S.approved = false; S.text = ''; track('without_text'); go('google'); }, 'link')));
  },

  google() {
    const hasText = S.approved && S.text.trim().length > 0;
    const url = S.biz.googleReviewUrl;
    const valid = E.isGoogleReviewUrl(url);
    const copyBtn = hasText ? btn(t().copy, async () => {
      try { await navigator.clipboard.writeText(S.text); }
      catch { const x = el('textarea'); x.value = S.text; document.body.append(x); x.select(); document.execCommand('copy'); x.remove(); }
      copyBtn.textContent = t().copied; track('copied');
    }) : null;
    const open = el('a', { class: 'btn primary', href: valid ? url : '#', target: '_blank', rel: 'noopener noreferrer', onclick: e => {
      if (!valid) { e.preventDefault(); return; }
      if (hasText && navigator.clipboard) navigator.clipboard.writeText(S.text).catch(() => {});
      track('google_click');
    } }, t().openGoogle);
    shell(el('h2', {}, t().googleTitle),
      hasText ? el('div', { class: 'quote' }, S.text) : null,
      el('ol', { class: 'steps' }, (hasText ? t().steps : t().stepsNoText).map(s => el('li', {}, s))),
      el('p', { class: 'note' }, t().googleNote),
      valid ? null : el('p', { class: 'note', role: 'alert' }, 'Google review link is not set up yet for this business.'),
      el('div', { class: 'spacer' }),
      el('div', { class: 'stack' }, copyBtn, open, btn(t().done, () => { track('done'); go('thanks'); }, 'link')));
  },

  thanks() {
    shell(el('div', { class: 'check', 'aria-hidden': 'true' }, '✓'),
      el('h1', { class: 'center' }, (S.biz.thanks && S.biz.thanks[S.lang]) || t().thanksDefault),
      el('div', { class: 'spacer' }), el('p', { class: 'foot' }, CONFIG.BRAND));
  },
};

function render() { const v = views[S.screen]; if (v) v(); }

function message(text) { app.replaceChildren(el('section', { class: 'screen' }, el('div', { class: 'spacer' }), el('h2', { class: 'center' }, text), el('div', { class: 'spacer' }))); }

async function start() {
  const code = bizCode();
  if (!code) return message(UI.en.notFound);
  try {
    const r = await fetch(new URL(`./b/${code}.json`, import.meta.url), { cache: 'no-cache' });
    if (!r.ok) throw new Error('not found');
    S.biz = await r.json();
  } catch { return message(UI.en.notFound); }
  if (S.biz.active === false) return message(UI.en.paused);
  // Paid businesses need a valid SN ReviewFlow key (S N Enterprise's own firms are marked ownFirm).
  if (!S.biz.ownFirm) {
    const lic = await licenseState(S.biz.code, S.biz.license);
    if (!['active', 'grace'].includes(lic.state)) return message(UI.en.paused);
  }
  if (S.biz.color && /^#[0-9a-f]{6}$/i.test(S.biz.color)) {
    document.documentElement.style.setProperty('--brand', S.biz.color);
    document.querySelector('meta[name=theme-color]').setAttribute('content', S.biz.color);
  }
  document.title = S.biz.name;
  const langs = S.biz.languages || ['en'];
  const pref = (navigator.language || 'en').toLowerCase().startsWith('hi') ? 'hi' : 'en';
  S.lang = langs.includes(pref) ? pref : langs[0];
  loadLib(S.lang).catch(() => {});
  track('visit', { src: new URLSearchParams(location.search).get('src') || '' });
  render();
}
start();
