#!/usr/bin/env node
'use strict';

/**
 * dashboard/server/vault-api.js
 *
 * Tiny zero dependency HTTP API behind the dashboard. It lets the Feedback
 * page write feedback entries (text plus optional screenshots) as markdown
 * files under vault/feedback/<author>/, and read them back. No agent, no
 * chat, no git; one way writes from the page, read later by a daily
 * automation that turns PENDING entries into fixes or tickets. It also owns
 * quiz attempt logging, Sabrina's job queue verdicts, and the routes that
 * trigger and report on the dashboard's data refresh pipeline.
 *
 * Storage contract: vault/feedback/README.md
 *
 * Also carries POST /api/feedback/jobs/verdict: Sabrina's queue thumbs.
 * Tom's queue verdicts go through the voice server on :18790
 * (vault/tools/voice_server.py), which already owns his queue.md and his
 * jobs.json regen path. Sabrina has neither, and standing up a second
 * FastAPI process for one route was not worth it, so her verdict route
 * lives here instead: same process as the rest of this API, reachable on
 * the tailnet through the same 4200 dev proxy (proxy.conf.json's
 * /api/feedback prefix already matches it, no proxy change needed). The
 * ledger path is hardcoded to her queue.md; there is no author field on
 * this route, that hardcoding is the security model.
 *
 * Refresh routes (GET /api/refresh/status, POST /api/refresh/:target) shell
 * out to dashboard/scripts/refresh.js, the single orchestrator that also
 * backs launchd and the CLI, and report its per target result so the
 * dashboard can show automation health even when a run fails.
 *
 * Started by `npm start` (dashboard/scripts/dev.js) alongside `ng serve`
 * and reached same origin through Angular's dev proxy (proxy.conf.json).
 * Binds 127.0.0.1 only; there is no CORS support because there is no
 * cross-origin caller.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const HOST = '127.0.0.1';
const PORT = Number(process.env.VAULT_API_PORT || process.env.FEEDBACK_API_PORT) || 4201;
const ROOT = path.resolve(__dirname, '..', '..', 'vault', 'feedback');
const AUTHORS = ['tom', 'sabrina'];

const ID_RE = /^\d{4}-\d{2}-\d{2}-\d{6}-[a-z0-9]{4}$/;
const ATTACHMENT_NAME_RE = /^[0-9a-z-]+\.(png|jpe?g|gif|webp|heic)$/i;

const MAX_BODY_BYTES = 48 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_TEXT_LEN = 20000;

const SABRINA_QUEUE = path.resolve(
  __dirname, '..', '..', 'vault', 'projects', 'job-hunt-sabrina', 'digest', 'queue.md'
);
const CAREER_GENERATOR = path.resolve(__dirname, '..', 'scripts', 'generate-career-data.js');
const QUEUE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_VERDICT_BODY_BYTES = 4096;
const VERDICTS = ['liked', 'passed'];

// ── quiz offline attempts ─────────────────────────────────────────────────
// POST /api/quiz/attempt and GET /api/quiz/attempts: dashboard-local quiz
// grading with no LLM running. Each attempt drops one frontmatter-only file
// under OFFLINE_DIR; the /quiz skill reconciles these into kb-log.md later
// and deletes the file as it goes. This route never touches kb-log.md, the
// question bank, or the career generator.

const OFFLINE_DIR = path.resolve(
  __dirname, '..', '..', 'vault', 'projects', 'job-hunt', 'interview-prep', 'kb', 'offline'
);
const QUESTION_ID_RE = /^[a-z]{2,6}-\d{3,}$/;
const QUIZ_TOPIC_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LETTER_RE = /^[A-F]$/;
const QUIZ_RESULTS = ['pass', 'miss'];
const ANSWERED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const MAX_QUIZ_BODY_BYTES = 4096;

// ── dashboard data refresh ────────────────────────────────────────────────
// Shells out to dashboard/scripts/refresh.js, the one orchestrator that also
// backs launchd and the CLI. This API only starts a run and reports on it;
// the "how to refresh X" logic lives entirely in that script.

const DATA_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'data');
const REFRESH_SCRIPT = path.resolve(__dirname, '..', 'scripts', 'refresh.js');
const REFRESH_STATE = path.join(DATA_DIR, 'refresh.json');
const REFRESH_TARGETS = ['finance', 'habits', 'career', 'jobs', 'brain', 'agents', 'all'];
const SYNC_BY_DEFAULT = new Set(['finance', 'habits', 'all']);
const DATA_FILES = {
  finance: 'finance.json',
  habits: 'habits.json',
  career: 'career.json',
  jobs: 'jobs.json',
  brain: 'brain.json',
  agents: 'agents.json',
};
const REFRESH_TIMEOUT_MS = 180000;
const PERSONS = ['tom', 'sabrina'];
const running = new Set();

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

const CONTENT_TYPE_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

// ── paths ──────────────────────────────────────────────────────────────────

function authorDir(author) {
  return path.join(ROOT, author);
}

function attachmentsDir(author) {
  return path.join(authorDir(author), 'attachments');
}

function entryPath(author, id) {
  return path.join(authorDir(author), `${id}.md`);
}

// ── response helpers ──────────────────────────────────────────────────────

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// ── frontmatter parse ─────────────────────────────────────────────────────
// Small line based parser in the spirit of sticky-quotes/server/notes-api.js:
// require a `---` opening line, read key: value pairs (plus an `images:`
// list) until the closing `---`, then take the body verbatim with one
// leading blank line stripped. Because the body is everything after the
// closing delimiter, a message that itself starts with `---` cannot be
// mistaken for a second frontmatter block.

function parseEntry(author, raw) {
  if (!raw.startsWith('---\n')) return null;
  const lines = raw.split('\n');

  let i = 1;
  const fmLines = [];
  let closed = false;
  for (; i < lines.length; i++) {
    if (lines[i] === '---') {
      closed = true;
      i++;
      break;
    }
    fmLines.push(lines[i]);
  }
  if (!closed) return null;

  let bodyLines = lines.slice(i);
  if (bodyLines[0] === '') bodyLines = bodyLines.slice(1);
  const body = bodyLines.join('\n');

  const fm = {};
  for (let idx = 0; idx < fmLines.length; idx++) {
    const line = fmLines[idx];
    if (/^images:\s*\[\]\s*$/.test(line)) {
      fm.images = [];
      continue;
    }
    if (/^images:\s*$/.test(line)) {
      const images = [];
      let j = idx + 1;
      while (j < fmLines.length && /^\s*-\s+/.test(fmLines[j])) {
        images.push(fmLines[j].replace(/^\s*-\s+/, '').trim());
        j++;
      }
      fm.images = images;
      idx = j - 1;
      continue;
    }
    const m = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (m) {
      const value = m[2].trim();
      fm[m[1]] = value === '' ? null : value;
    }
  }

  const images = (fm.images || []).map(
    (rel) => `/api/feedback/attachments/${author}/${path.basename(String(rel))}`
  );

  return {
    id: fm.id ?? null,
    author,
    created: fm.created ?? null,
    status: fm.status ?? null,
    text: body,
    images,
    ticket: fm.ticket ?? null,
    resolved: fm.resolved ?? null,
    resolvedAt: fm.resolved_at ?? null,
  };
}

function readEntry(author, id) {
  const fp = entryPath(author, id);
  if (!fs.existsSync(fp)) return null;
  try {
    return parseEntry(author, fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function listEntries(author) {
  const dir = authorDir(author);
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    files = [];
  }

  const rows = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const entry = parseEntry(author, raw);
      if (!entry) throw new Error('missing or malformed frontmatter block');
      rows.push({ file, entry });
    } catch (err) {
      process.stderr.write(`[vault-api] skipping unparsable entry ${file}: ${err.message}\n`);
    }
  }

  rows.sort((a, b) => {
    const ad = a.entry.created ? Date.parse(a.entry.created) : NaN;
    const bd = b.entry.created ? Date.parse(b.entry.created) : NaN;
    const aValid = !Number.isNaN(ad);
    const bValid = !Number.isNaN(bd);
    if (aValid && bValid && ad !== bd) return ad - bd;
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return a.file.localeCompare(b.file);
  });

  return rows.map((r) => r.entry);
}

// ── image validation ──────────────────────────────────────────────────────

function magicBytesOk(type, buf) {
  switch (type) {
    case 'image/png':
      return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'image/jpeg':
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/gif':
      return buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'GIF8';
    case 'image/webp':
      return (
        buf.length >= 12 &&
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'image/heic': {
      if (buf.length < 12) return false;
      if (buf.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
      const brand = buf.subarray(8, 12).toString('ascii');
      return brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1';
    }
    default:
      return false;
  }
}

// ── request body reading with a running byte counter ─────────────────────

function readBody(req, res, maxBytes) {
  return new Promise((resolve) => {
    let total = 0;
    const chunks = [];
    let finished = false;

    const overLimit = () => {
      if (finished) return;
      finished = true;
      sendJson(res, 413, { error: `request body exceeds ${maxBytes} bytes` });
      req.destroy();
      resolve(null);
    };

    req.on('data', (chunk) => {
      if (finished) return;
      total += chunk.length;
      if (total > maxBytes) {
        overLimit();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', () => {
      if (finished) return;
      finished = true;
      resolve(null);
    });
  });
}

// ── POST /api/feedback ────────────────────────────────────────────────────

async function handlePost(req, res) {
  const raw = await readBody(req, res, MAX_BODY_BYTES);
  if (raw === null) return; // 413 already sent, or the connection died

  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    sendJson(res, 400, { error: 'body must be a JSON object' });
    return;
  }

  const { id, author, created, text } = data;
  const images = data.images;

  if (typeof id !== 'string' || !ID_RE.test(id)) {
    sendJson(res, 400, { error: 'id must match /^\\d{4}-\\d{2}-\\d{2}-\\d{6}-[a-z0-9]{4}$/' });
    return;
  }
  if (typeof author !== 'string' || !AUTHORS.includes(author)) {
    sendJson(res, 400, { error: `author must be one of ${AUTHORS.join(', ')}` });
    return;
  }
  if (typeof created !== 'string' || created.trim() === '' || Number.isNaN(Date.parse(created))) {
    sendJson(res, 400, { error: 'created must be a parseable ISO 8601 date string' });
    return;
  }
  if (typeof text !== 'string') {
    sendJson(res, 400, { error: 'text must be a string' });
    return;
  }
  const trimmedLen = text.trim().length;
  if (trimmedLen < 1 || trimmedLen > MAX_TEXT_LEN) {
    sendJson(res, 400, { error: `text must be 1 to ${MAX_TEXT_LEN} characters after trim` });
    return;
  }
  if (images !== undefined && !Array.isArray(images)) {
    sendJson(res, 400, { error: 'images must be an array' });
    return;
  }
  const imageList = images || [];
  if (imageList.length > MAX_IMAGES) {
    sendJson(res, 400, { error: `images must contain at most ${MAX_IMAGES} entries` });
    return;
  }

  const decoded = [];
  for (let n = 0; n < imageList.length; n++) {
    const img = imageList[n];
    if (!img || typeof img !== 'object') {
      sendJson(res, 400, { error: `images[${n}] must be an object` });
      return;
    }
    const { type, dataBase64 } = img;
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(IMAGE_TYPES, type)) {
      sendJson(res, 400, { error: `images[${n}].type must be one of ${Object.keys(IMAGE_TYPES).join(', ')}` });
      return;
    }
    if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
      sendJson(res, 400, { error: `images[${n}].dataBase64 must be a non-empty base64 string` });
      return;
    }
    let buf;
    try {
      buf = Buffer.from(dataBase64, 'base64');
    } catch {
      sendJson(res, 400, { error: `images[${n}].dataBase64 is not valid base64` });
      return;
    }
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
      sendJson(res, 400, { error: `images[${n}] decoded size must be 1 to ${MAX_IMAGE_BYTES} bytes` });
      return;
    }
    if (!magicBytesOk(type, buf)) {
      sendJson(res, 400, { error: `images[${n}] bytes do not match declared type ${type}` });
      return;
    }
    decoded.push({ ext: IMAGE_TYPES[type], buf });
  }

  // Idempotent retry: the id already has a file on disk. Respond with what
  // is actually stored and write nothing new.
  const existing = readEntry(author, id);
  if (existing) {
    sendJson(res, 200, { entry: existing });
    return;
  }

  const attDir = attachmentsDir(author);
  fs.mkdirSync(attDir, { recursive: true });
  const imageRelPaths = [];
  try {
    decoded.forEach((img, idx) => {
      const fileName = `${id}-${idx + 1}.${img.ext}`;
      fs.writeFileSync(path.join(attDir, fileName), img.buf);
      imageRelPaths.push(`attachments/${fileName}`);
    });
  } catch (err) {
    sendJson(res, 500, { error: `failed to write attachments: ${err.message}` });
    return;
  }

  const imagesBlock = imageRelPaths.length
    ? `images:\n${imageRelPaths.map((p) => `  - ${p}`).join('\n')}\n`
    : 'images: []\n';

  const md =
    `---\n` +
    `id: ${id}\n` +
    `author: ${author}\n` +
    `created: ${created}\n` +
    `source: dashboard\n` +
    `status: PENDING\n` +
    imagesBlock +
    `ticket:\n` +
    `resolved:\n` +
    `resolved_at:\n` +
    `---\n\n${text}`;

  const fp = entryPath(author, id);
  const tmp = `${fp}.tmp`;
  try {
    fs.writeFileSync(tmp, md, 'utf8');
    fs.renameSync(tmp, fp);
  } catch (err) {
    sendJson(res, 500, { error: `failed to write entry: ${err.message}` });
    return;
  }

  sendJson(res, 201, { entry: readEntry(author, id) });
}

// ── POST /api/feedback/jobs/verdict ───────────────────────────────────────
// Sabrina's queue thumbs. Mirrors _update_queue_status in
// vault/tools/voice_server.py:858-883: queue.md rows split on '|' into 12+
// parts (leading/trailing empty strings), id is parts[1], status is
// parts[10]; cells never contain '|' (enforced by the job-scan skill).

function updateSabrinaQueueStatus(id, verdict) {
  if (!fs.existsSync(SABRINA_QUEUE)) return false;
  const lines = fs.readFileSync(SABRINA_QUEUE, 'utf8').split('\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    const parts = line.split('|');
    if (parts.length >= 12 && parts[1].trim() === id) {
      parts[10] = ` ${verdict} `;
      lines[i] = parts.join('|');
      updated = true;
      break;
    }
  }
  if (!updated) return false;

  const tmp = `${SABRINA_QUEUE}.tmp`;
  fs.writeFileSync(tmp, lines.join('\n'), 'utf8');
  fs.renameSync(tmp, SABRINA_QUEUE);
  return true;
}

async function handleJobsVerdict(req, res) {
  const raw = await readBody(req, res, MAX_VERDICT_BODY_BYTES);
  if (raw === null) return; // 413 already sent, or the connection died

  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    sendJson(res, 400, { error: 'body must be a JSON object' });
    return;
  }

  const { id, verdict } = data;
  if (typeof id !== 'string' || !QUEUE_ID_RE.test(id)) {
    sendJson(res, 400, { error: 'id must match /^[a-z0-9][a-z0-9-]{0,63}$/' });
    return;
  }
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict)) {
    sendJson(res, 400, { error: `verdict must be one of ${VERDICTS.join(', ')}` });
    return;
  }

  let updated;
  try {
    updated = updateSabrinaQueueStatus(id, verdict);
  } catch (err) {
    sendJson(res, 500, { error: `failed to update queue ledger: ${err.message}` });
    return;
  }
  if (!updated) {
    sendJson(res, 404, { ok: false, id, verdict, error: 'id not found in sabrina queue ledger' });
    return;
  }

  try {
    await execFileAsync(process.execPath, [CAREER_GENERATOR, '--person', 'sabrina'], { timeout: 30000 });
  } catch (err) {
    // The ledger write already succeeded and is truth; rolling the UI
    // response back to a failure would lie. The next regen heals the JSON.
    process.stderr.write(`[vault-api] sabrina career regen failed: ${err.stderr || err.message}\n`);
    sendJson(res, 200, { ok: true, id, verdict, warning: 'ledger updated, regenerate failed' });
    return;
  }

  sendJson(res, 200, { ok: true, id, verdict });
}

// ── POST /api/quiz/attempt, GET /api/quiz/attempts ────────────────────────

function offlineEntryPath(questionId) {
  return path.join(OFFLINE_DIR, `${questionId}.md`);
}

function parseOfflineEntry(raw) {
  if (!raw.startsWith('---\n')) return null;
  const lines = raw.split('\n');

  let i = 1;
  const fmLines = [];
  let closed = false;
  for (; i < lines.length; i++) {
    if (lines[i] === '---') {
      closed = true;
      break;
    }
    fmLines.push(lines[i]);
  }
  if (!closed) return null;

  const fm = {};
  for (const line of fmLines) {
    const m = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (m) fm[m[1]] = m[2].trim();
  }

  return {
    id: fm.id ?? null,
    question: fm.question ?? null,
    topic: fm.topic ?? null,
    pick: fm.pick ?? null,
    answer: fm.answer ?? null,
    result: fm.result ?? null,
    answered: fm.answered ?? null,
    source: fm.source ?? null,
  };
}

function readOfflineEntry(questionId) {
  const fp = offlineEntryPath(questionId);
  if (!fs.existsSync(fp)) return null;
  try {
    return parseOfflineEntry(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function listOfflineEntries() {
  let files;
  try {
    files = fs.readdirSync(OFFLINE_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    files = [];
  }

  const entries = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(OFFLINE_DIR, file), 'utf8');
      const entry = parseOfflineEntry(raw);
      if (!entry) throw new Error('missing or malformed frontmatter block');
      entries.push(entry);
    } catch (err) {
      process.stderr.write(`[vault-api] skipping unparsable offline entry ${file}: ${err.message}\n`);
    }
  }

  entries.sort((a, b) => {
    const ad = a.answered ? Date.parse(a.answered) : NaN;
    const bd = b.answered ? Date.parse(b.answered) : NaN;
    const aValid = !Number.isNaN(ad);
    const bValid = !Number.isNaN(bd);
    if (aValid && bValid && ad !== bd) return ad - bd;
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return String(a.id).localeCompare(String(b.id));
  });

  return entries;
}

async function handleQuizAttempt(req, res) {
  const raw = await readBody(req, res, MAX_QUIZ_BODY_BYTES);
  if (raw === null) return; // 413 already sent, or the connection died

  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    sendJson(res, 400, { error: 'body must be a JSON object' });
    return;
  }

  const { questionId, topic, pick, answer, result, answered } = data;

  if (typeof questionId !== 'string' || !QUESTION_ID_RE.test(questionId)) {
    sendJson(res, 400, { error: 'questionId must match /^[a-z]{2,6}-\\d{3,}$/' });
    return;
  }
  if (typeof topic !== 'string' || !QUIZ_TOPIC_RE.test(topic)) {
    sendJson(res, 400, { error: 'topic must match /^[a-z0-9][a-z0-9-]{0,31}$/' });
    return;
  }
  if (typeof pick !== 'string' || !LETTER_RE.test(pick)) {
    sendJson(res, 400, { error: 'pick must match /^[A-F]$/' });
    return;
  }
  if (typeof answer !== 'string' || !LETTER_RE.test(answer)) {
    sendJson(res, 400, { error: 'answer must match /^[A-F]$/' });
    return;
  }
  if (typeof result !== 'string' || !QUIZ_RESULTS.includes(result)) {
    sendJson(res, 400, { error: `result must be one of ${QUIZ_RESULTS.join(', ')}` });
    return;
  }
  if (typeof answered !== 'string' || !ANSWERED_RE.test(answered) || Number.isNaN(Date.parse(answered))) {
    sendJson(res, 400, {
      error: 'answered must match /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[+-]\\d{2}:\\d{2}$/ with an explicit local offset (no Z) and be parseable',
    });
    return;
  }

  // Idempotent retry: the file already exists. Respond with what is
  // actually stored and write nothing new.
  const existing = readOfflineEntry(questionId);
  if (existing) {
    sendJson(res, 200, { entry: existing });
    return;
  }

  fs.mkdirSync(OFFLINE_DIR, { recursive: true });

  const fp = offlineEntryPath(questionId);
  const resolved = path.resolve(fp);
  if (resolved !== fp || !resolved.startsWith(OFFLINE_DIR + path.sep)) {
    sendJson(res, 400, { error: 'invalid questionId path' });
    return;
  }

  const md =
    `---\n` +
    `id: ${questionId}\n` +
    `question: ${questionId}\n` +
    `topic: ${topic}\n` +
    `pick: ${pick}\n` +
    `answer: ${answer}\n` +
    `result: ${result}\n` +
    `answered: ${answered}\n` +
    `source: dashboard\n` +
    `---\n`;

  const tmp = `${resolved}.tmp`;
  try {
    fs.writeFileSync(tmp, md, 'utf8');
    fs.renameSync(tmp, resolved);
  } catch (err) {
    sendJson(res, 500, { error: `failed to write attempt: ${err.message}` });
    return;
  }

  sendJson(res, 201, { entry: readOfflineEntry(questionId) });
}

function handleQuizAttempts(res) {
  sendJson(res, 200, { entries: listOfflineEntries() });
}

// ── GET /api/feedback/attachments/:author/:file ───────────────────────────

function serveAttachment(res, pathname) {
  const prefix = '/api/feedback/attachments/';
  const rest = pathname.slice(prefix.length);
  const parts = rest.split('/');
  if (parts.length !== 2) {
    sendJson(res, 400, { error: 'expected /api/feedback/attachments/<author>/<file>' });
    return;
  }

  let author;
  let fileName;
  try {
    author = decodeURIComponent(parts[0]);
    fileName = decodeURIComponent(parts[1]);
  } catch {
    sendJson(res, 400, { error: 'invalid path encoding' });
    return;
  }

  if (!AUTHORS.includes(author)) {
    sendJson(res, 400, { error: `author must be one of ${AUTHORS.join(', ')}` });
    return;
  }
  if (!ATTACHMENT_NAME_RE.test(fileName)) {
    sendJson(res, 400, { error: 'invalid attachment file name' });
    return;
  }

  const dir = attachmentsDir(author);
  const resolved = path.resolve(dir, fileName);
  if (resolved !== path.join(dir, fileName) || !resolved.startsWith(dir + path.sep)) {
    sendJson(res, 400, { error: 'invalid attachment path' });
    return;
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    sendJson(res, 404, { error: 'attachment not found' });
    return;
  }

  const ext = path.extname(resolved).slice(1).toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(resolved).pipe(res);
}

// ── GET /api/refresh/status, POST /api/refresh/:target ───────────────────
// Thin wrapper around dashboard/scripts/refresh.js. This process never
// decides how to refresh anything; it only starts the orchestrator as a
// child process, waits for its one JSON object on stdout, and relays it.

function readRefreshState() {
  try {
    return JSON.parse(fs.readFileSync(REFRESH_STATE, 'utf8'));
  } catch {
    return { generatedAt: null, targets: {} };
  }
}

function readGeneratedAt(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { generatedAt: null, mtime: null };
  }

  let generatedAt = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    // agents.json is a bare array with no generatedAt field; every other
    // generator writes an object. Treat an array as having no timestamp of
    // its own and fall back to the file's mtime.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      generatedAt = parsed.generatedAt ?? null;
    }
  } catch {
    generatedAt = null;
  }

  return { generatedAt, mtime: stat.mtime.toISOString() };
}

function handleRefreshStatus(res) {
  const data = {};
  for (const target of Object.keys(DATA_FILES)) {
    data[target] = readGeneratedAt(path.join(DATA_DIR, DATA_FILES[target]));
  }
  sendJson(res, 200, { ok: true, state: readRefreshState(), running: [...running], data });
}

async function handleRefreshRun(res, target, urlObj) {
  if (!REFRESH_TARGETS.includes(target)) {
    sendJson(res, 400, { error: `target must be one of ${REFRESH_TARGETS.join(', ')}` });
    return;
  }
  if (running.has(target) || running.has('all') || (target === 'all' && running.size > 0)) {
    sendJson(res, 409, {
      ok: false,
      target,
      error: 'a refresh is already running',
      running: [...running],
    });
    return;
  }

  const syncParam = urlObj.searchParams.get('sync');
  const sync = syncParam === null
    ? SYNC_BY_DEFAULT.has(target)
    : (syncParam === '1' || syncParam === 'true');

  const person = urlObj.searchParams.get('person');
  if (person !== null && !PERSONS.includes(person)) {
    sendJson(res, 400, { error: `person must be one of ${PERSONS.join(', ')}` });
    return;
  }

  running.add(target);
  try {
    const args = [
      REFRESH_SCRIPT,
      target,
      '--json',
      sync ? '--sync' : '--no-sync',
      ...(person ? ['--person', person] : []),
    ];
    const { stdout } = await execFileAsync(process.execPath, args, {
      timeout: REFRESH_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
    sendJson(res, 200, JSON.parse(stdout));
  } catch (err) {
    // A failed target still exits non zero, but refresh.js prints its one
    // JSON object first. That is what the page needs (the step tails), so
    // relay it with a 200 rather than collapsing it to a bare 500.
    let relayed = false;
    if (err.stdout) {
      try {
        sendJson(res, 200, JSON.parse(err.stdout));
        relayed = true;
      } catch {
        // stdout was not JSON; fall through to the error response below.
      }
    }
    if (!relayed) {
      const error = err.killed
        ? `refresh timed out after ${REFRESH_TIMEOUT_MS}ms`
        : (err.stderr || err.message);
      process.stderr.write(`[vault-api] refresh ${target} failed: ${error}\n`);
      sendJson(res, 500, { ok: false, target, error });
    }
  } finally {
    running.delete(target);
  }
}

// ── routing ────────────────────────────────────────────────────────────────

async function handleRequest(req, res, method, pathname, urlObj) {
  if (!urlObj) {
    sendJson(res, 400, { error: 'invalid request url' });
    return;
  }

  if (method === 'GET' && (pathname === '/api/health' || pathname === '/api/feedback/health')) {
    sendJson(res, 200, {
      ok: true,
      root: ROOT,
      authors: AUTHORS,
      queue: SABRINA_QUEUE,
      quizOfflineDir: OFFLINE_DIR,
      refreshTargets: REFRESH_TARGETS,
      running: [...running],
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/refresh/status') {
    handleRefreshStatus(res);
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/feedback/attachments/')) {
    serveAttachment(res, pathname);
    return;
  }

  if (method === 'GET' && pathname === '/api/feedback') {
    const author = urlObj.searchParams.get('author');
    if (!author || !AUTHORS.includes(author)) {
      sendJson(res, 400, { error: `author must be one of ${AUTHORS.join(', ')}` });
      return;
    }
    sendJson(res, 200, { entries: listEntries(author) });
    return;
  }

  if (method === 'POST' && pathname === '/api/feedback/jobs/verdict') {
    await handleJobsVerdict(req, res);
    return;
  }

  if (method === 'POST' && pathname === '/api/feedback') {
    await handlePost(req, res);
    return;
  }

  if (method === 'POST' && pathname === '/api/quiz/attempt') {
    await handleQuizAttempt(req, res);
    return;
  }

  if (method === 'GET' && pathname === '/api/quiz/attempts') {
    handleQuizAttempts(res);
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/refresh/')) {
    const target = decodeURIComponent(pathname.slice('/api/refresh/'.length));
    await handleRefreshRun(res, target, urlObj);
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

// ── boot ───────────────────────────────────────────────────────────────────

for (const author of AUTHORS) {
  fs.mkdirSync(attachmentsDir(author), { recursive: true });
}

const server = http.createServer((req, res) => {
  const start = process.hrtime.bigint();
  const method = req.method || 'GET';

  let urlObj = null;
  try {
    urlObj = new URL(req.url, `http://${HOST}`);
  } catch {
    urlObj = null;
  }
  const pathname = urlObj ? urlObj.pathname : req.url || '/';

  let logged = false;
  const originalEnd = res.end.bind(res);
  res.end = (...args) => {
    if (!logged) {
      logged = true;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${method} ${pathname} ${res.statusCode} ${ms.toFixed(1)}ms`);
    }
    return originalEnd(...args);
  };

  handleRequest(req, res, method, pathname, urlObj).catch((err) => {
    process.stderr.write(`[vault-api] unhandled error: ${err.stack || err.message}\n`);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal server error' });
    } else {
      res.end();
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`vault-api already running on ${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`vault-api listening on http://${HOST}:${PORT} (root: ${ROOT})`);
});
