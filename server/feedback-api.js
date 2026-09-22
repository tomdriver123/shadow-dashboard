#!/usr/bin/env node
'use strict';

/**
 * dashboard/server/feedback-api.js
 *
 * Tiny zero dependency HTTP API behind the dashboard Feedback page. It lets
 * the page write feedback entries (text plus optional screenshots) as
 * markdown files under vault/feedback/<author>/, and read them back. No
 * agent, no chat, no git; one way writes from the page, read later by a
 * daily automation that turns PENDING entries into fixes or tickets.
 *
 * Storage contract: vault/feedback/README.md
 *
 * Started by `npm start` (dashboard/scripts/dev.js) alongside `ng serve`
 * and reached same origin through Angular's dev proxy (proxy.conf.json).
 * Binds 127.0.0.1 only; there is no CORS support because there is no
 * cross-origin caller.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.FEEDBACK_API_PORT) || 4201;
const ROOT = path.resolve(__dirname, '..', '..', 'vault', 'feedback');
const AUTHORS = ['tom', 'sabrina'];

const ID_RE = /^\d{4}-\d{2}-\d{2}-\d{6}-[a-z0-9]{4}$/;
const ATTACHMENT_NAME_RE = /^[0-9a-z-]+\.(png|jpe?g|gif|webp|heic)$/i;

const MAX_BODY_BYTES = 48 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_TEXT_LEN = 20000;

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
      process.stderr.write(`[feedback-api] skipping unparsable entry ${file}: ${err.message}\n`);
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

// ── routing ────────────────────────────────────────────────────────────────

async function handleRequest(req, res, method, pathname, urlObj) {
  if (!urlObj) {
    sendJson(res, 400, { error: 'invalid request url' });
    return;
  }

  if (method === 'GET' && pathname === '/api/feedback/health') {
    sendJson(res, 200, { ok: true, root: ROOT, authors: AUTHORS });
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

  if (method === 'POST' && pathname === '/api/feedback') {
    await handlePost(req, res);
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
    process.stderr.write(`[feedback-api] unhandled error: ${err.stack || err.message}\n`);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal server error' });
    } else {
      res.end();
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`feedback-api already running on ${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`feedback-api listening on http://${HOST}:${PORT} (root: ${ROOT})`);
});
