// SN ReviewFlow – review draft engine (no AI, no server).
// Builds a draft only from what the customer selected: star rating, per-topic Good/Okay/Poor, own comment.
// Same picks can be re-rendered in another language (sentence lists are aligned by index).

export const CATEGORIES = ['product', 'service', 'staff', 'cleanliness', 'value', 'speed', 'communication', 'ambience', 'expertise'];
export const SENTIMENTS = ['pos', 'neu', 'neg'];
export const LENGTHS = ['short', 'medium', 'detailed'];
const SCORE = { pos: 1, neu: 0, neg: -1 };

export function sentimentOfRating(rating) {
  if (rating == null) return null;
  return rating >= 4 ? 'pos' : rating === 3 ? 'neu' : 'neg';
}

/** Overall tone: from the stars if given, otherwise from the average of the topic choices. */
export function overallSentiment(rating, cats = {}) {
  const fromStars = sentimentOfRating(rating);
  if (fromStars) return fromStars;
  const vals = Object.values(cats).filter(v => SENTIMENTS.includes(v));
  if (!vals.length) return null;
  const avg = vals.reduce((a, v) => a + SCORE[v], 0) / vals.length;
  return avg > 0.34 ? 'pos' : avg < -0.34 ? 'neg' : 'neu';
}

/** A draft needs at least one real input from the customer. */
export function canDraft({ rating = null, cats = {}, comment = '', services = [] } = {}) {
  return rating != null || Object.keys(cats).length > 0 || comment.trim().length > 0 || services.length > 0;
}

/** "A", "A and B", "A, B and C" in the library's language. */
export function joinList(lib, items) {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] || '';
  return xs.slice(0, -1).join(', ') + ` ${lib.and || 'and'} ` + xs[xs.length - 1];
}

/** Sentence naming the services / items the customer took. kind = "service" | "product". */
export function serviceSentence(lib, kind, index, names) {
  const list = lib.svc?.[kind === 'product' ? 'product' : 'service'];
  if (!list || !names?.length) return '';
  const s = list[index % list.length].replace('{s}', joinList(lib, names));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIndex(rand, n, avoid) {
  if (n <= 1) return 0;
  let i = Math.floor(rand() * n);
  if (i === avoid) i = (i + 1 + Math.floor(rand() * (n - 1))) % n;
  return i;
}

/** Choose sentence indices. `prev` = previous picks, so "Regenerate" always changes every sentence. */
export function makePicks(lib, input, rand = Math.random, prev = null) {
  const overall = overallSentiment(input.rating, input.cats);
  const picks = { overall, open: null, close: null, svc: null, cats: {}, order: [] };
  if (input.services?.length) {
    const n = lib.svc?.[input.kind === 'product' ? 'product' : 'service']?.length || 1;
    picks.svc = pickIndex(rand, n, prev?.svc ?? -1);
  }
  if (overall) {
    picks.open = pickIndex(rand, lib.open[overall].length, prev?.overall === overall ? prev.open : -1);
    picks.close = pickIndex(rand, lib.close[overall].length, prev?.overall === overall ? prev.close : -1);
  }
  const keys = CATEGORIES.filter(k => input.cats?.[k]);
  for (const k of keys) {
    const s = input.cats[k];
    const same = prev?.cats?.[k] && prev.cats[k].s === s;
    picks.cats[k] = { s, i: pickIndex(rand, lib.cat[k][s].length, same ? prev.cats[k].i : -1) };
  }
  // shuffle topic order a little for variety, but keep same-tone topics together
  const shuffled = keys.map(k => ({ k, r: rand() })).sort((a, b) => a.r - b.r).map(x => x.k);
  const toneRank = k => (picks.cats[k].s === overall ? 0 : 1);
  picks.order = shuffled.sort((a, b) => toneRank(a) - toneRank(b));
  return picks;
}

function joinConnector(lib, sentence) {
  const c = lib.connector || '';
  if (!c) return sentence;
  if (lib.lang === 'en') {
    const keepCap = /^(I\b|I'm|I've)/.test(sentence);
    return c + (keepCap ? sentence : sentence.charAt(0).toLowerCase() + sentence.slice(1));
  }
  return c + sentence;
}

/** Turn picks into text in the given language. */
export function render(lib, input, picks, length = 'medium') {
  const parts = [];
  const comment = (input.comment || '').trim();
  const order = picks.order || [];
  const maxCats = length === 'short' ? 2 : 4;
  const cats = order.slice(0, maxCats);

  const withOpening = picks.overall && (length !== 'short' || cats.length === 0);
  if (withOpening) parts.push(lib.open[picks.overall][picks.open]);
  if (picks.svc != null && input.services?.length) parts.push(serviceSentence(lib, input.kind, picks.svc, input.services));

  let connectorUsed = false;
  for (const k of cats) {
    const { s, i } = picks.cats[k];
    let sentence = lib.cat[k][s][i];
    const contrast = picks.overall && s !== picks.overall;
    if (contrast && !connectorUsed && parts.length > 0) { sentence = joinConnector(lib, sentence); connectorUsed = true; }
    parts.push(sentence);
  }
  if (comment) parts.push(comment);
  if (picks.overall && length === 'detailed') parts.push(lib.close[picks.overall][picks.close]);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function shorter(length) { return LENGTHS[Math.max(0, LENGTHS.indexOf(length) - 1)]; }
export function longer(length) { return LENGTHS[Math.min(LENGTHS.length - 1, LENGTHS.indexOf(length) + 1)]; }

/** Number of different drafts possible for this input (for info / tests). */
export function combinations(lib, input) {
  const o = overallSentiment(input.rating, input.cats);
  let n = o ? lib.open[o].length * lib.close[o].length : 1;
  if (input.services?.length) n *= lib.svc?.[input.kind === 'product' ? 'product' : 'service']?.length || 1;
  for (const k of CATEGORIES) if (input.cats?.[k]) n *= lib.cat[k][input.cats[k]].length;
  return n;
}

/** Only real Google review / Maps links are accepted. */
export function isGoogleReviewUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return ['search.google.com', 'www.google.com', 'google.com', 'maps.google.com', 'g.page', 'maps.app.goo.gl', 'goo.gl', 'www.google.co.in', 'google.co.in'].includes(h);
  } catch { return false; }
}

/**
 * Screen order. Deliberately has NO rating input: every customer – 1 star, 5 stars or no rating –
 * gets the same screens and the same Google button (no review gating).
 */
export function nextScreen(screen, choice) {
  switch (screen) {
    case 'welcome': return 'rating';
    case 'rating': return 'topics';
    case 'topics': return 'choose';
    case 'choose': return choice === 'rating_only' ? 'google' : 'write';
    case 'write': return 'confirm';
    case 'confirm': return 'google';
    case 'google': return 'thanks';
    default: return 'welcome';
  }
}
