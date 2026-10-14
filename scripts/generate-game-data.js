#!/usr/bin/env node
/**
 * generate-game-data.js
 * Reads the Pokemon game design tables (vault/projects/game/towns.md, party.md,
 * pokedex.md) plus the interview prep logs, the applications ledger and the
 * pipeline files, and writes towns.json and game.json for the dashboard.
 * Species data (dex, types, growth curve, evolutions) is cached under
 * vault/projects/game/species/<slug>.json and fetched from PokeAPI when missing.
 *
 * Usage:
 *   node scripts/generate-game-data.js [--vault <dir>] [--out <dir>] [--offline] [--now <iso>]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SHADOW_ROOT = path.resolve(__dirname, '..', '..');
const DEX_CAP = 151;

const TRACKS = {
  'ai judgment': 'ai-judgment',
  'ai knowledge': 'ai-knowledge',
  'velocity': 'velocity',
  'dsa': 'dsa',
  'subject knowledge': 'subject-knowledge',
  'hunt grind': 'hunt-grind',
};
const TRACK_LABELS = {
  'ai-judgment': 'AI judgment',
  'ai-knowledge': 'AI knowledge',
  'velocity': 'Velocity',
  'dsa': 'DSA',
  'subject-knowledge': 'Subject knowledge',
  'hunt-grind': 'Hunt grind',
};
const EXTERNAL = {
  'dsa': 'DSA is caught in Claude Code with /drill.',
  'ai-judgment': 'Judgment Pokemon are caught in Claude Code sparring.',
  'velocity': 'Velocity Pokemon are caught in timed builds.',
  'hunt-grind': 'Hunt grind Pokemon are caught by applying. Every application is a Safari Zone throw.',
};
const BASE_XP = { fundamentals: 20, medium: 50, senior: 100 };
const HUNT_BONUS = { screen: 50, assessment: 50, interview: 100, offer: 200 };
const ROUND_TYPES = ['hiring-manager', 'interview', 'technical', 'system-design', 'assessment'];

// ── generic helpers ───────────────────────────────────────────────────────

function splitRow(line) {
  const parts = line.split('|');
  parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map(c => c.trim());
}

function isSeparator(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function trackSlug(name) {
  const k = String(name || '').replace(/\(.*$/, '').trim().toLowerCase();
  return TRACKS[k] || (k ? slug(k) : null);
}

function trackLabel(t) {
  return t ? (TRACK_LABELS[t] || t) : null;
}

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function splitFrontmatter(content, warn) {
  if (!content.startsWith('---')) return { data: {}, body: content };
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return { data: {}, body: content };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { data: {}, body: content };
  let data = {};
  try {
    data = yaml.load(lines.slice(1, end).join('\n'), { schema: yaml.CORE_SCHEMA }) || {};
  } catch (err) {
    if (warn) warn(`Frontmatter parse error: ${err.message}`);
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}

function readIfExists(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch (e) { return null; }
}

function listMd(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => path.join(dir, f));
  } catch (e) { return []; }
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

// First pipe table after a heading line whose text equals headingText.
// Returns an array of row objects keyed by lowercased header text.
function tableUnder(markdown, headingText) {
  const lines = markdown.split('\n');
  const re = new RegExp(`^#{1,6}\\s+${headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  let i = lines.findIndex(l => re.test(l));
  if (i === -1) return [];
  i++;
  while (i < lines.length && !lines[i].trim().startsWith('|')) {
    if (/^#{1,6}\s/.test(lines[i])) return [];
    i++;
  }
  const rows = [];
  for (; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(lines[i].trim());
  if (!rows.length) return [];
  const headers = splitRow(rows[0]).map(h => h.toLowerCase());
  return rows.slice(1).filter(r => !isSeparator(r)).map(r => {
    const cells = splitRow(r);
    const o = {};
    headers.forEach((h, k) => { o[h] = cells[k] !== undefined ? cells[k] : ''; });
    return o;
  });
}

// ── species names ─────────────────────────────────────────────────────────

function speciesSlug(name) {
  return slug(String(name).replace(/\./g, ''));
}

function displayName(sl) {
  if (sl === 'mr-mime') return 'Mr. Mime';
  return String(sl).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function spriteUrl(dex) {
  return dex ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png` : null;
}

// Splits on commas that are not inside parentheses.
function splitTopLevel(text) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parsePool(cell) {
  return splitTopLevel(cell || '').map(part => {
    const gift = /\(\s*gift\s*\)/i.test(part);
    const name = part.replace(/\([^)]*\)/g, '').trim();
    return name ? { species: speciesSlug(name), gift } : null;
  }).filter(Boolean);
}

// ── towns.md ──────────────────────────────────────────────────────────────

function parseTrackServed(cell) {
  const c = String(cell || '').trim().toLowerCase();
  if (c === 'none') return { mode: 'home', track: null };
  if (c.startsWith("next round")) return { mode: 'scout', track: null };
  if (c.startsWith('reflection')) return { mode: 'reflection', track: null };
  if (c.startsWith('later')) return { mode: 'league', track: null };
  return { mode: 'mcq', track: trackSlug(c) };
}

function parseTowns(md) {
  const party = tableUnder(md, 'Party').map(r => ({
    slot: Number(r['slot']),
    track: trackSlug(r['track']),
    type: String(r['type'] || '').toLowerCase() || null,
    gymTown: slug(r['gym town'] || ''),
  }));
  const encounters = tableUnder(md, 'Encounter tables').map((r, i) => {
    const ts = parseTrackServed(r['track served']);
    return {
      id: slug(r['town']), name: r['town'], order: i + 1, role: r['role'],
      mode: ts.mode, track: ts.track, pool: parsePool(r['pool']),
    };
  });
  const banks = tableUnder(md, 'Banks').map(r => ({
    topic: r['bank'], track: trackSlug(r['track']), town: slug(r['town']),
  }));
  const gates = tableUnder(md, 'Gates').map(r => {
    const sp = String(r['species'] || '').trim();
    const isTown = sp.toLowerCase() === 'town';
    return { town: slug(r['town']), scope: isTown ? 'town' : 'species', species: isTown ? null : speciesSlug(sp), kind: r['kind'] };
  });
  const grid = {};
  for (const r of tableUnder(md, 'Map')) grid[slug(r['town'])] = { x: Number(r['x']), y: Number(r['y']) };
  const routes = tableUnder(md, 'Routes').map(r => [slug(r['from']), slug(r['to'])]);
  const seasons = tableUnder(md, 'Seasons').map(r => ({
    number: Number(r['season']), started: r['started'] || null, ended: r['ended'] || null,
  }));
  return { party, encounters, banks, gates, grid, routes, seasons };
}

function currentSeason(seasons) {
  const open = seasons.filter(s => !s.ended);
  const list = open.length ? open : seasons;
  return list[list.length - 1] || { number: 1, started: '0000-00-00', ended: null };
}

function seasonFor(date, seasons) {
  let n = null;
  for (const s of seasons) if (s.started && date >= s.started && (n === null || s.number > n)) n = s.number;
  return n;
}

// ── party.md and pokedex.md ───────────────────────────────────────────────

function parseParty(md) {
  const out = {};
  for (const r of tableUnder(md, 'Party')) {
    const slot = Number(r['slot']);
    const sp = String(r['species'] || '').trim();
    const real = sp && !/^first\b/i.test(sp) && !/^[—-]+$/.test(sp);
    const nick = String(r['nickname'] || '').trim();
    out[slot] = { species: real ? speciesSlug(sp) : null, nickname: nick && !/^[—-]+$/.test(nick) ? nick : null };
  }
  return out;
}

function parsePokedex(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || isSeparator(t)) continue;
    const c = splitRow(t);
    if (c.length !== 5 || !isDate(c[0])) continue;
    rows.push({ date: c[0], species: c[1].toLowerCase(), town: c[2], question: c[3], result: c[4].toLowerCase() });
  }
  return rows;
}

// ── quiz banks, offline files, kb-log, drill-log, applications ───────────

const KB_RESULT_PATTERNS = [
  { re: /\brecall pass\b/, result: 'pass' },
  { re: /\brecall miss\b/, result: 'miss' },
  { re: /\bpass\b/, result: 'pass' },
  { re: /\bmiss\b/, result: 'miss' },
  { re: /\bguess\b/, result: 'guess' },
  { re: /\bskip\b/, result: 'skip' },
];

function parseAttemptLine(rawLine) {
  const line = rawLine.trim();
  const tierMatch = line.match(/\s+tier\s*(\d+)$/);
  if (!tierMatch) return null;
  const body = line.slice(0, line.length - tierMatch[0].length).trim();
  let result = null;
  for (const { re, result: r } of KB_RESULT_PATTERNS) if (re.test(body)) { result = r; break; }
  if (result === null) return null;
  const tokens = body.split(/\s+/).filter(Boolean);
  if (!isDate(tokens[0]) || !tokens[1]) return null;
  const words = ['pass', 'miss', 'guess', 'skip', 'recall'];
  const rest = tokens.slice(2).filter(t => !words.includes(t.toLowerCase()));
  return { date: tokens[0], mode: tokens[1], pick: rest.length === 1 ? rest[0] : null, result, tier: Number(tierMatch[1]) };
}

// Returns { index: { id: { topic, level } }, attempts: [{ id, date, pass }] }
function parseBanks(kbDir, warn) {
  const index = {};
  const attempts = [];
  const files = [...listMd(kbDir), ...listMd(path.join(kbDir, 'decks'))];
  for (const file of files) {
    const content = readIfExists(file);
    if (content === null) continue;
    const { data, body } = splitFrontmatter(content, warn);
    const topic = data.topic ? String(data.topic) : path.basename(file, '.md');
    const lines = body.split('\n');
    let cur = null;
    let inAttempts = false;
    for (const line of lines) {
      const h = line.match(/^###\s+([a-z0-9]+-\d+)\s*$/);
      if (h) {
        cur = h[1];
        index[cur] = { topic, level: null };
        inAttempts = false;
        continue;
      }
      if (/^#{1,3}\s/.test(line)) { cur = null; inAttempts = false; continue; }
      if (!cur) continue;
      const lv = line.match(/^level:\s*(\S+)/);
      if (lv && !index[cur].level) { index[cur].level = lv[1].toLowerCase(); continue; }
      if (line.trim() === '**Attempts**') { inAttempts = true; continue; }
      if (inAttempts) {
        if (!line.trim() || line.startsWith('**')) { inAttempts = false; continue; }
        const a = parseAttemptLine(line);
        if (a) attempts.push({ id: cur, date: a.date, pass: a.result === 'pass' });
      }
    }
  }
  return { index, attempts };
}

function parseOffline(dir, warn) {
  const out = [];
  for (const file of listMd(dir)) {
    const { data } = splitFrontmatter(readIfExists(file) || '', warn);
    if (!data.id || !data.result || !data.answered) continue;
    out.push({ id: String(data.id), date: String(data.answered).slice(0, 10), pass: /\bpass\b/i.test(String(data.result)) && !/no pass/i.test(String(data.result)) });
  }
  return out;
}

function parseKbLog(md) {
  const out = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || isSeparator(t)) continue;
    const c = splitRow(t);
    if (c.length !== 5 || !isDate(c[0])) continue;
    const id = (c[2].split(/\s+/)[0] || '').trim();
    const r = c[3].toLowerCase();
    out.push({ date: c[0], topic: c[1].trim(), id, pass: /\bpass\b/.test(r) && !/no pass/.test(r) });
  }
  return out;
}

function parseDrillLog(md) {
  const out = [];
  let inHistory = false;
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (t === '## History') { inHistory = true; continue; }
    if (t.startsWith('## ')) { inHistory = false; continue; }
    if (!inHistory || !t.startsWith('|') || isSeparator(t)) continue;
    const c = splitRow(t);
    if (c.length < 6 || !isDate(c[0])) continue;
    out.push({ date: c[0], problem: c[1], score: c[4].replace(/\*/g, '').trim() });
  }
  return out;
}

function drillBase(score) {
  const s = String(score || '').replace(/\*/g, '').trim();
  if (/no pass/i.test(s)) return 0;
  if (/\bPASS\b/i.test(s)) return 100;
  const m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) {
    const n = Number(m[1]), d = Number(m[2]);
    if (d > 0 && n / d >= 0.5) return 50;
    if (n > 0) return 20;
  }
  return 0;
}

function parseApplications(md) {
  const out = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || isSeparator(t)) continue;
    const c = splitRow(t);
    if (c.length !== 7 || c[0].toLowerCase() === 'date') continue;
    if (!isDate(c[0])) continue;
    const m = c[5].toLowerCase().match(/^[a-z]+/);
    out.push({ date: c[0], company: c[1], role: c[2], status: m ? m[0] : '' });
  }
  return out;
}

function parsePipelines(dir, warn) {
  const out = [];
  for (const file of listMd(dir)) {
    const { data } = splitFrontmatter(readIfExists(file) || '', warn);
    if (!data.company) continue;
    out.push({
      id: data.id ? String(data.id) : path.basename(file, '.md'),
      company: String(data.company),
      status: String(data.status || '').toLowerCase(),
      employment: String(data.employment || '').toLowerCase(),
      process: Array.isArray(data.process) ? data.process.map(String) : [],
      stages: (Array.isArray(data.stages) ? data.stages : []).filter(s => s && typeof s === 'object' && s.name && s.type).map(s => ({
        name: String(s.name), type: String(s.type), date: s.date ? String(s.date) : null,
        status: String(s.status || '').toLowerCase(), notes: s.notes ? String(s.notes) : '',
      })),
    });
  }
  return out;
}

// ── levels and evolution ──────────────────────────────────────────────────

function levelFor(xp, levels) {
  let lv = 1;
  for (let i = 0; i < levels.length; i++) if (levels[i] <= xp) lv = i + 1;
  return lv;
}

function levelInfo(xp, levels) {
  const level = levelFor(xp, levels);
  const levelXp = levels[level - 1];
  const nextLevelXp = level >= 100 ? null : levels[level];
  const progress = nextLevelXp === null ? 1 : (xp - levelXp) / (nextLevelXp - levelXp);
  return { level, levelXp, nextLevelXp, progress };
}

function formFor(data, level, cache) {
  let cur = data;
  for (let guard = 0; guard < 6; guard++) {
    const evo = (cur.evolvesTo || []).find(e => e.trigger === 'level-up' && typeof e.minLevel === 'number' && e.minLevel <= level && cache.get(e.name));
    if (!evo) break;
    cur = cache.get(evo.name);
  }
  return cur;
}

function nextEvolution(data, level) {
  const evos = data.evolvesTo || [];
  const lv = evos.filter(e => e.trigger === 'level-up' && typeof e.minLevel === 'number' && e.minLevel > level)
    .sort((a, b) => a.minLevel - b.minLevel)[0];
  return lv || evos.find(e => e.trigger && e.trigger !== 'level-up') || null;
}

// ── PokeAPI ───────────────────────────────────────────────────────────────

// Finds the node for `name` anywhere in a PokeAPI evolution chain ({species, evolves_to}).
function findChainNode(node, name) {
  if (!node) return null;
  const root = node.chain ? node.chain : node;
  if (root.species && root.species.name === name) return root;
  for (const child of root.evolves_to || []) {
    const hit = findChainNode(child, name);
    if (hit) return hit;
  }
  return null;
}

function dexFromUrl(url) {
  const m = String(url || '').match(/\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
}

function evolutionsFromNode(node) {
  if (!node) return [];
  return (node.evolves_to || []).map(ev => {
    const d = (ev.evolution_details && ev.evolution_details[0]) || {};
    const dex = dexFromUrl(ev.species.url);
    return {
      name: ev.species.name, display: displayName(ev.species.name), dex,
      trigger: d.trigger ? d.trigger.name : null,
      minLevel: d.min_level === undefined ? null : d.min_level,
      item: d.item ? d.item.name : null,
    };
  }).filter(e => e.dex !== null && e.dex <= DEX_CAP);
}

async function fetchJson(url, fetchFn) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetchFn(url, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
  }
  throw lastErr;
}

async function fetchSpecies(sl, growthMemo, fetchFn) {
  const base = 'https://pokeapi.co/api/v2';
  const sp = await fetchJson(`${base}/pokemon-species/${sl}`, fetchFn);
  const pk = await fetchJson(`${base}/pokemon/${sl}`, fetchFn);
  const chain = await fetchJson(sp.evolution_chain.url, fetchFn);
  const gname = sp.growth_rate.name;
  if (!growthMemo.has(gname)) {
    growthMemo.set(gname, fetchJson(`${base}/growth-rate/${gname}`, fetchFn).then(g => {
      const levels = g.levels.slice().sort((a, b) => a.level - b.level).map(l => l.experience);
      return levels.slice(0, 100);
    }));
  }
  const levels = await growthMemo.get(gname);
  return {
    name: sl, display: displayName(sl), dex: sp.id,
    types: pk.types.slice().sort((a, b) => a.slot - b.slot).map(t => t.type.name),
    growthRate: gname, levels,
    evolvesTo: evolutionsFromNode(findChainNode(chain, sl)),
  };
}

async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const item = items[next++]; await worker(item); }
  });
  await Promise.all(runners);
}

// Loads (and when allowed, fetches) every requested species plus every evolved form it reaches.
async function ensureSpecies(slugs, opts) {
  const { speciesDir, offline, warn } = opts;
  const fetchFn = opts.fetchFn || (typeof fetch === 'function' ? fetch : null);
  const cache = new Map();
  const growthMemo = new Map();
  let todo = [...new Set(slugs)];
  const seen = new Set();
  while (todo.length) {
    const round = todo.filter(s => !seen.has(s));
    round.forEach(s => seen.add(s));
    if (!round.length) break;
    await runPool(round, 4, async (sl) => {
      const file = path.join(speciesDir, `${sl}.json`);
      const raw = readIfExists(file);
      if (raw) {
        try { cache.set(sl, JSON.parse(raw)); return; } catch (e) { warn(`Bad species cache ${sl}.json: ${e.message}`); }
      }
      if (offline || !fetchFn) { warn(`Species ${sl} not cached (offline); dex and sprite unavailable`); cache.set(sl, null); return; }
      try {
        const data = await fetchSpecies(sl, growthMemo, fetchFn);
        writeAtomic(file, JSON.stringify(data, null, 2) + '\n');
        cache.set(sl, data);
      } catch (e) {
        warn(`Could not fetch species ${sl}: ${e.message}`);
        cache.set(sl, null);
      }
    });
    todo = [];
    for (const sl of round) {
      const d = cache.get(sl);
      if (d) for (const e of d.evolvesTo || []) todo.push(e.name);
    }
  }
  return cache;
}

// ── XP ────────────────────────────────────────────────────────────────────

function computeXp(inp) {
  const { bankIndex, bankAttempts, offline, kbLog, pokedex, drills, apps, banks, slots, season, warn } = inp;
  const topicTrack = {};
  for (const b of banks) topicTrack[b.topic] = b.track;
  const startedOk = d => d >= (season.started || '0000-00-00');
  const events = [];

  // question events
  const q = new Map();
  const touch = (id, date, pass, topic) => {
    const key = `${id}|${date}`;
    if (!q.has(key)) q.set(key, { id, date, pass: false, topic: null, mult: 1 });
    const e = q.get(key);
    if (pass) e.pass = true;
    if (topic && !e.topic) e.topic = topic;
    return e;
  };
  for (const a of bankAttempts) touch(a.id, a.date, a.pass, null);
  for (const a of offline) touch(a.id, a.date, a.pass, null);
  for (const a of kbLog) if (a.id) touch(a.id, a.date, a.pass, a.topic);
  for (const r of pokedex) {
    if (!r.question || r.question === 'gift' || r.question === 'free') continue;
    const e = touch(r.question, r.date, ['caught', 'xp'].includes(r.result), null);
    if (r.town === 'viridian-city') e.mult = 2;
  }
  for (const e of q.values()) {
    if (!e.pass || !startedOk(e.date)) continue;
    const idx = bankIndex[e.id];
    const topic = idx ? idx.topic : e.topic;
    if (!topic) { warn(`Question ${e.id} is not in any bank and has no topic; 0 XP`); continue; }
    const track = topicTrack[topic];
    if (!track) { warn(`Question ${e.id} topic "${topic}" is not in the Banks table; 0 XP`); continue; }
    let level = idx ? idx.level : null;
    if (!level) { warn(`Question ${e.id} has no level; treated as fundamentals`); level = 'fundamentals'; }
    if (!(level in BASE_XP)) { warn(`Question ${e.id} has unknown level "${level}"; treated as fundamentals`); level = 'fundamentals'; }
    events.push({ date: e.date, source: 'question', ref: e.id, track, base: BASE_XP[level], multiplier: e.mult });
  }

  // drills
  const d = new Map();
  for (const r of drills) {
    const base = drillBase(r.score);
    const key = `${r.problem}|${r.date}`;
    if (!d.has(key) || d.get(key).base < base) d.set(key, { date: r.date, source: 'drill', ref: r.problem, track: 'dsa', base, multiplier: 1 });
  }
  for (const e of d.values()) if (e.base > 0 && startedOk(e.date)) events.push(e);

  // hunt
  const h = new Map();
  for (const a of apps) {
    const key = `${a.date}|${a.company}|${a.role}`;
    if (!h.has(key)) h.set(key, { date: a.date, source: 'hunt', ref: `${a.company}: ${a.role}`, track: 'hunt-grind', base: 10 + (HUNT_BONUS[a.status] || 0), multiplier: 1 });
  }
  for (const e of h.values()) if (startedOk(e.date)) events.push(e);

  // totals
  const slotXp = slots.map(s => ({ track: s.track, xp: 0, bySource: { question: 0, drill: 0, share: 0, hunt: 0 } }));
  for (const e of events) {
    const amount = e.base * e.multiplier;
    if (e.source === 'hunt') {
      const s = slotXp.find(x => x.track === e.track);
      if (s) { s.xp += amount; s.bySource.hunt += amount; }
      continue;
    }
    for (const s of slotXp) {
      if (s.track === e.track) { s.xp += amount; s.bySource[e.source] += amount; }
      else { const half = Math.floor(amount / 2); s.xp += half; s.bySource.share += half; }
    }
  }
  return { events, slotXp };
}

// ── gates ─────────────────────────────────────────────────────────────────

function isRound(stage) {
  return ROUND_TYPES.includes(stage.type) && ['done', 'passed'].includes(stage.status) && !!stage.date;
}

function evalGate(kind, pipelines) {
  if (kind === 'offer-full-time') {
    const hit = pipelines.find(p => p.status === 'offer' && p.employment === 'full-time');
    if (hit) return { open: true, reason: `Signed full-time offer at ${hit.company}.` };
    let reason = 'No full-time offer yet.';
    const other = pipelines.find(p => p.status === 'offer');
    if (other) reason += ` ${other.company}'s offer is a ${other.employment}, which does not count.`;
    return { open: false, reason };
  }
  if (kind === 'third-round') {
    let best = { n: 0, company: null };
    for (const p of pipelines) {
      const n = p.stages.filter(isRound).length;
      if (n > best.n) best = { n, company: p.company };
    }
    if (best.n >= 3) return { open: true, reason: `${best.n} rounds at ${best.company}.` };
    return { open: false, reason: best.company ? `Most rounds in one loop: ${best.n} (${best.company}). Needs 3.` : 'No rounds yet. Needs 3.' };
  }
  if (kind === 'rejection-past-screen') {
    const hits = [];
    for (const p of pipelines) {
      if (p.status !== 'rejected') continue;
      const st = p.stages.filter(s => ROUND_TYPES.includes(s.type) && ['done', 'passed', 'failed'].includes(s.status) && s.date);
      if (!st.length) continue;
      const far = st.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).pop();
      hits.push({ company: p.company, name: far.name, date: far.date.slice(0, 10) });
    }
    if (!hits.length) return { open: false, reason: 'No rejection past a screen yet.' };
    hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { open: true, reason: 'Rejected past a screen: ' + hits.map(h => `${h.company} (${h.name}, ${h.date})`).join('; ') + '.' };
  }
  return { open: false, reason: `Unknown gate kind: ${kind}` };
}

// ── scout ─────────────────────────────────────────────────────────────────

function stageEnd(date) {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const month = Number(date.slice(5, 7));
    const off = month >= 4 && month <= 10 ? '-04:00' : '-05:00';
    return Date.parse(`${date}T23:59:59${off}`);
  }
  const t = Date.parse(date);
  return Number.isNaN(t) ? null : t;
}

function trackForStage(stage) {
  const text = `${stage.name} ${stage.notes || ''}`;
  switch (stage.type) {
    case 'recruiter-screen': case 'hiring-manager': case 'interview':
      return /\bAI\b|agentic|LLM|prompt/i.test(text) ? 'ai-knowledge' : 'hunt-grind';
    case 'technical': case 'system-design': return 'subject-knowledge';
    case 'assessment': return /take ?home/i.test(text) ? 'velocity' : 'dsa';
    default: return 'subject-knowledge';
  }
}

function resolveScout(pipelines, now) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const active = pipelines.filter(p => p.status === 'active');
  const open = s => ['scheduled', 'upcoming'].includes(s.status);
  let pick = null;
  for (const p of active) {
    for (const s of p.stages) {
      if (!open(s) || !s.date) continue;
      const end = stageEnd(s.date);
      if (end !== null && end > nowMs && (!pick || end < pick.end)) pick = { p, s, end };
    }
  }
  if (!pick) {
    let bestRecent = -Infinity;
    for (const p of active) {
      const s = p.stages.find(x => open(x) && !x.date);
      if (!s) continue;
      const recent = Math.max(-Infinity, ...p.stages.filter(x => x.date).map(x => stageEnd(x.date) || -Infinity));
      if (recent > bestRecent) { bestRecent = recent; pick = { p, s }; }
    }
  }
  if (!pick) {
    return { track: 'subject-knowledge', trackLabel: trackLabel('subject-knowledge'), company: null, stage: null, stageType: null, date: null, reason: 'Nothing scheduled; Viridian serves subject knowledge' };
  }
  const track = trackForStage(pick.s);
  return {
    track, trackLabel: trackLabel(track), company: pick.p.company, stage: pick.s.name, stageType: pick.s.type,
    date: pick.s.date, reason: `Next round: ${pick.p.company}, ${pick.s.name}${pick.s.date ? ` on ${pick.s.date}` : ' (not yet scheduled)'}`,
  };
}

// ── build ─────────────────────────────────────────────────────────────────

async function build(opts) {
  const vaultDir = opts.vaultDir;
  const now = opts.now ? new Date(opts.now) : new Date();
  const warnings = [];
  const warn = (msg) => { if (!warnings.includes(msg)) warnings.push(msg); };

  const townsMd = readIfExists(path.join(vaultDir, 'projects/game/towns.md'));
  if (townsMd === null) throw new Error('towns.md not found');
  const T = parseTowns(townsMd);
  if (!T.encounters.length || !T.party.length) throw new Error('towns.md could not be parsed (no Party or Encounter tables)');
  const season = currentSeason(T.seasons);

  const partyMd = readIfExists(path.join(vaultDir, 'projects/game/party.md')) || '';
  const partyFile = parseParty(partyMd);
  const dexRows = parsePokedex(readIfExists(path.join(vaultDir, 'projects/game/pokedex.md')) || '');

  const prep = path.join(vaultDir, 'projects/job-hunt/interview-prep');
  const kb = parseBanks(path.join(prep, 'kb'), warn);
  const offline = parseOffline(path.join(prep, 'kb/offline'), warn);
  const kbLog = parseKbLog(readIfExists(path.join(prep, 'kb-log.md')) || '');
  const drills = parseDrillLog(readIfExists(path.join(prep, 'drill-log.md')) || '');
  const apps = parseApplications(readIfExists(path.join(vaultDir, 'projects/job-hunt/applications.md')) || '');
  const pipelines = parsePipelines(path.join(vaultDir, 'projects/job-hunt/pipeline'), warn);

  const scout = resolveScout(pipelines, now);

  // species needed
  const need = new Set();
  for (const e of T.encounters) for (const p of e.pool) need.add(p.species);
  for (const g of T.gates) if (g.species) need.add(g.species);
  for (const r of dexRows) need.add(r.species);
  for (const s of Object.values(partyFile)) if (s.species) need.add(s.species);
  const cache = await ensureSpecies([...need], {
    speciesDir: path.join(vaultDir, 'projects/game/species'), offline: opts.offline, fetchFn: opts.fetchFn, warn,
  });
  const info = (sl) => {
    const d = cache.get(sl) || null;
    return d ? { name: sl, display: d.display || displayName(sl), dex: d.dex, types: d.types || [], sprite: spriteUrl(d.dex), data: d }
             : { name: sl, display: displayName(sl), dex: null, types: [], sprite: null, data: null };
  };

  // gates
  const gateResults = T.gates.map(g => ({ ...g, ...evalGate(g.kind, pipelines) }));
  const gateKey = g => (g.species ? g.species : g.town.split('-')[0]);

  // towns.json
  const slotTypeByTrack = {};
  for (const s of T.party) slotTypeByTrack[s.track] = s.type;
  const towns = T.encounters.map(e => {
    let { mode, track } = e;
    if (mode === 'scout') track = scout.track;
    let banks = [];
    if (mode === 'league') banks = T.banks.map(b => b.topic);
    else if (mode === 'scout') {
      // Scouting serves the next round's banks. When that track has no bank
      // (a recruiter screen), any prep is scouting, so every bank is fair game.
      banks = T.banks.filter(b => b.track === track).map(b => b.topic);
      if (!banks.length) banks = T.banks.map(b => b.topic);
    } else banks = T.banks.filter(b => b.town === e.id).map(b => b.topic);
    const external = mode === 'mcq' && !banks.length && track && EXTERNAL[track] ? EXTERNAL[track] : null;
    if (external) mode = 'external';
    const gates = gateResults.filter(g => g.town === e.id).map(g => ({ scope: g.scope, species: g.species, kind: g.kind, open: g.open, reason: g.reason }));
    const pool = e.pool.map(p => {
      const i = info(p.species);
      return { species: p.species, display: i.display, dex: i.dex, types: i.types, sprite: i.sprite, gift: p.gift, gated: gates.some(g => g.species === p.species) };
    });
    for (const g of gates) {
      if (g.species && !pool.some(p => p.species === g.species)) {
        const i = info(g.species);
        pool.push({ species: g.species, display: i.display, dex: i.dex, types: i.types, sprite: i.sprite, gift: false, gated: true });
      }
    }
    const first = String(e.role).split(/\.\s/)[0].replace(/\.$/, '');
    const tl = trackLabel(track);
    return {
      id: e.id, name: e.name, order: e.order, role: e.role,
      description: tl ? `${first}. ${tl}.` : `${first}.`,
      mode, track: track || null, trackLabel: tl,
      type: track ? (slotTypeByTrack[track] || null) : null,
      banks, external, grid: T.grid[e.id] || null, pool, gates, amenities: [], images: [],
    };
  });

  // xp
  const { events, slotXp } = computeXp({
    bankIndex: kb.index, bankAttempts: kb.attempts, offline, kbLog, pokedex: dexRows, drills, apps,
    banks: T.banks, slots: T.party, season, warn,
  });

  // pokedex entries
  const entries = [];
  const bySpecies = new Map();
  for (const r of dexRows) {
    if (!bySpecies.has(r.species)) bySpecies.set(r.species, []);
    bySpecies.get(r.species).push(r);
  }
  for (const [sl, rows] of bySpecies) {
    const i = info(sl);
    const caughtRows = rows.filter(r => r.result === 'caught');
    const first = caughtRows[0] || rows[0];
    entries.push({
      species: sl, display: i.display, dex: i.dex, sprite: i.sprite,
      firstSeen: rows[0].date, caught: caughtRows.length ? caughtRows[0].date : null,
      town: first.town, question: first.question,
      seasons: [...new Set(caughtRows.map(r => seasonFor(r.date, T.seasons)).filter(n => n !== null))],
    });
  }
  const seasonCaughtRows = dexRows.filter(r => r.result === 'caught' && r.date >= (season.started || ''));

  // party
  const party = T.party.map((slotDef, idx) => {
    const fileSlot = partyFile[slotDef.slot] || { species: null, nickname: null };
    let chosen = null;
    if (fileSlot.species && seasonCaughtRows.some(r => r.species === fileSlot.species)) chosen = fileSlot.species;
    if (!chosen) {
      const hit = seasonCaughtRows.find(r => info(r.species).types.includes(slotDef.type));
      if (hit) chosen = hit.species;
    }
    const xp = slotXp[idx].xp;
    const base = { slot: slotDef.slot, track: slotDef.track, trackLabel: trackLabel(slotDef.track), type: slotDef.type };
    if (!chosen) {
      return { ...base, species: null, form: null, nickname: fileSlot.nickname, xp, level: null, levelXp: null, nextLevelXp: null, progress: null, evolution: null, xpBySource: slotXp[idx].bySource };
    }
    const i = info(chosen);
    const species = { name: chosen, display: i.display, dex: i.dex, sprite: i.sprite, growthRate: i.data ? i.data.growthRate : null };
    if (!i.data || !i.data.levels) {
      return { ...base, species, form: null, nickname: fileSlot.nickname, xp, level: null, levelXp: null, nextLevelXp: null, progress: null, evolution: null, xpBySource: slotXp[idx].bySource };
    }
    const li = levelInfo(xp, i.data.levels);
    const formData = formFor(i.data, li.level, cache);
    const fi = info(formData.name);
    const evo = nextEvolution(formData, li.level);
    let evolution = null;
    if (evo) {
      const ei = info(evo.name);
      evolution = { name: evo.name, display: ei.display, dex: ei.dex, sprite: ei.sprite, trigger: evo.trigger, minLevel: evo.minLevel, item: evo.item };
    }
    return {
      ...base, species, form: { name: fi.name, display: fi.display, dex: fi.dex, sprite: fi.sprite },
      nickname: fileSlot.nickname, xp, ...li, evolution, xpBySource: slotXp[idx].bySource,
    };
  });

  const gates = {};
  for (const g of gateResults) gates[gateKey(g)] = { open: g.open, reason: g.reason };

  const xpLog = events.map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : b.i - a.i))
    .slice(0, 30).map(x => x.e);

  const game = {
    generatedAt: now.toISOString(),
    warnings,
    season: { number: season.number, started: season.started },
    trainer: {
      name: 'Tom',
      xpTotal: slotXp.reduce((a, s) => a + s.xp, 0),
      pokedex: {
        seen: bySpecies.size,
        caught: entries.filter(e => e.caught).length,
        seasonCaught: new Set(seasonCaughtRows.map(r => r.species)).size,
        cap: DEX_CAP,
      },
    },
    party, pokedex: { entries }, scout, gates,
    routes: T.routes, grid: T.grid, xpLog,
  };
  return { towns, game, warnings };
}

// ── main ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { vaultDir: path.join(SHADOW_ROOT, 'vault'), outDir: path.join(SHADOW_ROOT, 'dashboard', 'src', 'assets', 'data'), offline: false, now: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--vault') o.vaultDir = path.resolve(argv[++i]);
    else if (argv[i] === '--out') o.outDir = path.resolve(argv[++i]);
    else if (argv[i] === '--offline') o.offline = true;
    else if (argv[i] === '--now') o.now = argv[++i];
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = await build(opts);
  } catch (err) {
    console.error(`[game] Fatal: ${err.message}`);
    process.exit(1);
  }
  for (const w of result.warnings) console.error(`[game] warning: ${w}`);
  writeAtomic(path.join(opts.outDir, 'towns.json'), JSON.stringify(result.towns, null, 2) + '\n');
  writeAtomic(path.join(opts.outDir, 'game.json'), JSON.stringify(result.game, null, 2) + '\n');
  console.log(`[game] wrote towns.json (${result.towns.length} towns) and game.json (${result.game.warnings.length} warnings)`);
}

module.exports = {
  splitRow, isSeparator, slug, trackSlug, splitFrontmatter, tableUnder, speciesSlug, displayName, spriteUrl,
  parsePool, parseTrackServed, parseTowns, currentSeason, seasonFor, parseParty, parsePokedex,
  parseAttemptLine, parseBanks, parseOffline, parseKbLog, parseDrillLog, drillBase, parseApplications, parsePipelines,
  levelFor, levelInfo, formFor, nextEvolution, findChainNode, evolutionsFromNode, dexFromUrl,
  ensureSpecies, computeXp, evalGate, isRound, stageEnd, trackForStage, resolveScout, build, parseArgs, main,
};

if (require.main === module) main();
