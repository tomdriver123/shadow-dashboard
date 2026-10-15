#!/usr/bin/env node
/**
 * generate-career-data.js
 * Reads vault/projects/job-hunt/* (Tom) or vault/projects/job-hunt-sabrina/*
 * (Sabrina): applications ledger, scan queue, pipeline opportunities, comms
 * log, drill log, resume variants, strategy docs. Computes points and
 * metrics for the dashboard Career tab.
 * Outputs src/assets/data/career.json (Tom) and/or
 * src/assets/data/career-sabrina.json (Sabrina). See PERSONS below.
 * Per-person details (display name, resume PDF filename, hunt dates) live in
 * vault/projects/job-hunt/career-persons.json, not in this file.
 *
 * Usage:
 *   node scripts/generate-career-data.js                  # all persons (default)
 *   node scripts/generate-career-data.js --person tom
 *   node scripts/generate-career-data.js --person sabrina
 */

const fs = require('fs');
const path = require('path');

let yaml;
try {
  yaml = require('js-yaml');
} catch (err) {
  console.error('[career] Fatal: js-yaml is not installed. Run npm install in dashboard/.');
  process.exit(1);
}

const { requireVault, dataDir } = require('./lib/shadow-paths');

const VAULT         = requireVault('generate-career-data');
// Paths written into the payload (variant PDFs, delta logs) are relative to
// the directory that holds the vault, e.g. "vault/projects/job-hunt/...".
const SHADOW_ROOT   = path.dirname(VAULT);
const PERSONS_FILE  = path.join(VAULT, 'projects', 'job-hunt', 'career-persons.json');

// One entry per person this generator supports: the structural parts only.
// configure() below reads this to populate every path and feature constant
// for a given run. The personal parts (displayName, resumePdf, huntStart,
// lastDay) come from PERSONS_FILE via loadPersonProfile().
const PERSONS = {
  tom:     { dir: 'job-hunt',         out: 'career.json',         routeBase: '/tabs/career',    features: { drills: true,  kb: true  } },
  sabrina: { dir: 'job-hunt-sabrina', out: 'career-sabrina.json', routeBase: '/sabrina/career', features: { drills: false, kb: false } },
};

let JOB_HUNT_DIR, DIGEST_DIR, APPLICATIONS_FILE, QUEUE_FILE, PIPELINE_DIR, COMMS_FILE,
    LINKEDIN_VIEWS_FILE, LESSONS_FILE, DRILL_LOG_FILE, KB_LOG_FILE, KB_DIR, RESUME_DIR, VARIANTS_DIR,
    OUTPUT, HUNT_START, LAST_DAY;
let PERSON, DISPLAY_NAME, ROUTE_BASE, RESUME_PDF, FEATURES;

const POINTS_CONFIG = { perOfficeDay: 30, contractFactor: 0.5, hoursPerYear: 2080 };

// Hard guard: profile.md holds raw PII (SSN-adjacent form answers, full
// address, etc) for whichever person is active. It must never be read by
// this script, full stop, for Tom's profile.md or Sabrina's. Every file
// read in this generator goes through safeReadFile() so this check is the
// single choke point, and it is a basename match, so it guards every
// person's profile.md regardless of which job-hunt directory is active.
// Never directory-scan job-hunt/ for .md as a shortcut around that: only
// known subdirectories (pipeline/, resume/variants/) are listed, and
// everything else is an explicit allowlisted path.
const NEVER_READ = ['profile.md'];

const warnings = [];
function warn(msg) {
  warnings.push(msg);
}

// Reads the per-person details from PERSONS_FILE, a JSON object keyed by
// person ("tom", "sabrina") whose values may carry displayName, resumePdf,
// huntStart (YYYY-MM-DD) and lastDay (YYYY-MM-DD or null). Anything missing,
// or the whole file being absent, falls back to a generic built-in default so
// the generator runs on a vault that has never heard of these people.
function loadPersonProfile(personKey) {
  const today = new Date().toISOString().slice(0, 10);
  const profile = {
    displayName: personKey === 'tom' ? 'Trainer' : personKey.charAt(0).toUpperCase() + personKey.slice(1),
    resumePdf: 'Resume.pdf',
    huntStart: today,
    lastDay: null,
  };
  if (!fs.existsSync(PERSONS_FILE)) return profile;
  let entry;
  try {
    entry = JSON.parse(safeReadFile(PERSONS_FILE))[personKey];
  } catch (err) {
    warn(`career-persons.json: unreadable (${err.message}); using built-in defaults`);
    return profile;
  }
  if (!entry || typeof entry !== 'object') return profile;
  for (const key of Object.keys(profile)) {
    if (entry[key] !== undefined) profile[key] = entry[key];
  }
  return profile;
}

// Populates every path/date/feature constant above for one person. Called
// once at the top of main() per run. Also clears warnings, since that array
// is shared module state and a single process run (the default, no args)
// generates every person in turn.
function configure(personKey) {
  const p = PERSONS[personKey];
  warnings.length = 0;
  const profile = loadPersonProfile(personKey);
  PERSON       = personKey;
  DISPLAY_NAME = profile.displayName;
  JOB_HUNT_DIR = path.join(VAULT, 'projects', p.dir);
  DIGEST_DIR   = path.join(JOB_HUNT_DIR, 'digest');
  APPLICATIONS_FILE   = path.join(JOB_HUNT_DIR, 'applications.md');
  QUEUE_FILE          = path.join(DIGEST_DIR, 'queue.md');
  PIPELINE_DIR        = path.join(JOB_HUNT_DIR, 'pipeline');
  COMMS_FILE          = path.join(JOB_HUNT_DIR, 'comms.md');
  LINKEDIN_VIEWS_FILE = path.join(JOB_HUNT_DIR, 'metrics', 'linkedin-views.md');
  LESSONS_FILE        = path.join(JOB_HUNT_DIR, 'lessons.md');
  DRILL_LOG_FILE      = path.join(JOB_HUNT_DIR, 'interview-prep', 'drill-log.md');
  KB_LOG_FILE         = path.join(JOB_HUNT_DIR, 'interview-prep', 'kb-log.md');
  KB_DIR              = path.join(JOB_HUNT_DIR, 'interview-prep', 'kb');
  RESUME_DIR          = path.join(JOB_HUNT_DIR, 'resume');
  VARIANTS_DIR        = path.join(RESUME_DIR, 'variants');
  OUTPUT     = path.join(dataDir(), p.out);
  HUNT_START = profile.huntStart;
  LAST_DAY   = profile.lastDay;
  ROUTE_BASE = p.routeBase;
  RESUME_PDF = profile.resumePdf;
  FEATURES   = p.features;
}

// ── Generic helpers ───────────────────────────────────────────────────────

function splitRow(line) {
  const parts = line.split('|');
  parts.shift(); // drop the empty string before the opening pipe
  // Only drop a trailing empty string if the row actually closes with a
  // pipe. Several History rows in drill-log.md are missing the trailing
  // pipe, which would otherwise silently eat the last real cell.
  if (parts.length && parts[parts.length - 1].trim() === '') {
    parts.pop();
  }
  return parts.map(c => c.trim());
}

function isSeparator(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeReadFile(filePath) {
  const base = path.basename(filePath);
  if (NEVER_READ.includes(base)) {
    throw new Error(`Refused to read guarded file: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// Splits "---\nyaml\n---\nbody" into { data, body }. Tolerant of missing or
// malformed frontmatter: falls back to data={}, body=full content.
function splitFrontmatter(content) {
  if (!content.startsWith('---')) return { data: {}, body: content };
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return { data: {}, body: content };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { data: {}, body: content };
  const fmText = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n');
  let data = {};
  try {
    data = yaml.load(fmText) || {};
  } catch (err) {
    warn(`Frontmatter parse error: ${err.message}`);
  }
  return { data, body };
}

// js-yaml auto-detects bare (unquoted) YAML timestamps like "2026-09-08" or
// "2026-09-16T13:00:00-04:00" and hands back a native JS Date instead of a
// string. Every pipeline frontmatter date field goes through this so the
// rest of the generator can keep treating dates as plain strings. A
// date-only value (parsed at UTC midnight) formats back to "YYYY-MM-DD"; a
// value with a real time component keeps full ISO precision.
function normalizeYamlDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const isMidnightUtc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
    return isMidnightUtc ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  return String(value);
}

// All calendar-day helpers below work in UTC throughout, never local time.
// The vault only ever stores plain "YYYY-MM-DD" strings (no timezone), and
// this script can run from a launchd job in any local timezone; mixing
// local-time Date methods (setHours, getDate/setDate, getDay) with the
// UTC-anchored constants (HUNT_START, LAST_DAY parsed with a "Z" suffix)
// silently shifts day counts by one depending on the host's offset.
function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date) {
  const d = startOfDay(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function countBy(arr, keyFn) {
  const result = {};
  for (const item of arr) {
    const k = keyFn(item) || 'unknown';
    result[k] = (result[k] || 0) + 1;
  }
  return result;
}

function median(sortedNums) {
  if (!sortedNums.length) return null;
  const mid = Math.floor(sortedNums.length / 2);
  if (sortedNums.length % 2) return sortedNums[mid];
  return (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

// ── Points formula ────────────────────────────────────────────────────────

// Parses free-text salary strings into a single midpoint number.
// Handles: "$150,000-$225,000" (hyphen or en dash), "$160K-$180K",
// "$140K to $171K", "$175,000", "up to $250K", "$55/hr", "$160-200k" (unit
// borrowed from the second number), "est. $120K to $140K" (leading "est."
// strips to an estimate flag), plus trailing annotations like "by zone",
// "(MD band)", "+ equity" which are ignored. Unparseable text (e.g.
// "unstated") returns salaryMid: null.
function parseSalary(raw) {
  if (raw === null || raw === undefined) return { salaryMid: null, isEstimate: false, isHourly: false };
  let text = String(raw).trim();
  if (!text) return { salaryMid: null, isEstimate: false, isHourly: false };

  const isEstimate = /^est\.?\s+/i.test(text);
  if (isEstimate) text = text.replace(/^est\.?\s+/i, '');

  if (!text || text === '-' || text === '?' || /^unstated\b/i.test(text)) {
    return { salaryMid: null, isEstimate, isHourly: false };
  }

  // Hourly is detected separately from the numeric extraction so a range
  // like "$50/hr to $90/hr" (pipeline salary estimates) is still read as a
  // range and only THEN converted to an annual figure.
  const isHourly = /\/\s*hr\b|\/\s*hour\b|per\s*hour|hourly/i.test(text);

  // Range: NUM [K]? (hyphen | en dash | em dash | "to") NUM [K]?. The $
  // sign is optional on each side so "$160-200k" (unit only on the second
  // number) still parses; a missing unit borrows the other side's. The
  // optional "/hr" after the first number lets an hourly range like
  // "$50/hr to $90/hr" still match the connector that follows it.
  const rangeMatch = text.match(
    /\$?\s*([\d][\d,]*(?:\.\d+)?)\s*([kK])?\s*(?:\/\s*hr\b|\/\s*hour\b)?\s*(?:-|–|—|to)\s*\$?\s*([\d][\d,]*(?:\.\d+)?)\s*([kK])?/
  );

  let base = null;
  if (rangeMatch) {
    const unit1 = rangeMatch[2] || rangeMatch[4];
    const unit2 = rangeMatch[4] || rangeMatch[2];
    const v1 = parseFloat(rangeMatch[1].replace(/,/g, '')) * (unit1 ? 1000 : 1);
    const v2 = parseFloat(rangeMatch[3].replace(/,/g, '')) * (unit2 ? 1000 : 1);
    base = (v1 + v2) / 2;
  } else {
    // Single value: first $-prefixed token, e.g. "$175,000", "up to
    // $250K", "$130k+", "$157,500 base + 15% bonus" (the 15% has no $ so
    // is ignored), "$55/hr".
    const singleMatch = text.match(/\$\s?([\d][\d,]*(?:\.\d+)?)\s*([kK])?/);
    if (singleMatch) {
      base = parseFloat(singleMatch[1].replace(/,/g, '')) * (singleMatch[2] ? 1000 : 1);
    }
  }

  if (base == null) return { salaryMid: null, isEstimate, isHourly };
  const salaryMid = isHourly ? Math.round(base * POINTS_CONFIG.hoursPerYear) : Math.round(base);
  return { salaryMid, isEstimate, isHourly };
}

function inferBand(role) {
  return /senior|sr\.?|staff|lead|principal/i.test(role || '') ? 'senior' : 'standard';
}

function inferEmployment(role, salaryText, frontmatterEmployment) {
  if (frontmatterEmployment) return frontmatterEmployment;
  const probe = `${role || ''} ${salaryText || ''}`;
  return /contract|W2|C2C|\/hr|hourly/i.test(probe) ? 'contract' : 'full-time';
}

// daysOfficeRaw is the raw enum string from the vault ("0"/"1"/"2"/"?"/"-"
// or "unknown" once a non-enum value has been normalized by the caller).
function resolveOfficeDays(daysOfficeRaw, location, assumptions) {
  const raw = daysOfficeRaw === null || daysOfficeRaw === undefined ? 'unknown' : String(daysOfficeRaw).trim();
  if (raw === '0' || raw === '1' || raw === '2') return Number(raw);
  if (raw === '?') {
    assumptions.push('days_office unknown, assumed 2');
    return 2;
  }
  if (raw === '-') {
    if (location === 'remote') return 0;
    assumptions.push('days_office not applicable, assumed 2 for a non-remote role');
    return 2;
  }
  assumptions.push('days_office unknown, assumed 2');
  return 2;
}

function computePoints(salaryText, daysOfficeRaw, location, employment) {
  const { salaryMid, isEstimate } = parseSalary(salaryText);
  const assumptions = [];
  if (isEstimate) assumptions.push('estimate');
  const officeDays = resolveOfficeDays(daysOfficeRaw, location, assumptions);

  let points = null;
  if (salaryMid != null) {
    points = Math.round(salaryMid / 1000) - POINTS_CONFIG.perOfficeDay * officeDays;
    if (employment === 'contract' || employment === 'gig') {
      points = points * POINTS_CONFIG.contractFactor;
    }
    points = Math.max(0, Math.round(points));
  }

  return {
    points,
    salaryMid,
    pointsBasis: { salaryMid, daysOffice: officeDays, employment, assumptions },
  };
}

// ── Applications parser ───────────────────────────────────────────────────

function parseApplications(filePath) {
  const result = [];
  if (!fs.existsSync(filePath)) {
    warn(`applications.md not found (${filePath})`);
    return result;
  }

  const now = new Date();
  const lines = safeReadFile(filePath).split('\n');
  const seenIds = new Set();

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return;
    if (isSeparator(trimmed)) return;

    const cells = splitRow(trimmed);
    // The mid-file Status Legend table has 2 cells per row; both real
    // tables have 7. This alone is enough to skip the legend without any
    // section tracking.
    if (cells.length !== 7) return;
    if (cells[0].toLowerCase() === 'date') return; // header row (either table)
    if (cells.every(c => c === '' || c === '-' || c === '—')) return; // all-dash placeholder

    const [dateStr, company, role, sourceCell, resumeCell, statusRaw, nextActionCell] = cells;

    const url = /^https?:\/\//.test(sourceCell) ? sourceCell : null;
    const sourceNote = url ? null : (sourceCell || null);

    const laneMatch = resumeCell.match(/^Lane ([AB])/);
    const lane = laneMatch ? `lane-${laneMatch[1].toLowerCase()}` : null;
    const variantMatch = resumeCell.match(/variants\/([a-z0-9-]+)\//);
    const variantSlug = variantMatch ? variantMatch[1] : null;
    let variantPdf = null;
    if (variantSlug) {
      const pdfPath = path.join(VARIANTS_DIR, variantSlug, RESUME_PDF);
      if (fs.existsSync(pdfPath)) variantPdf = path.relative(SHADOW_ROOT, pdfPath);
    }

    const rejectedMatch = nextActionCell.match(/rejected (\d{4}-\d{2}-\d{2})/);
    const rejectedDate = rejectedMatch ? rejectedMatch[1] : null;
    const followUpMatch = nextActionCell.match(/follow up (\d{4}-\d{2}-\d{2})/);
    const followUpDate = followUpMatch ? followUpMatch[1] : null;

    let status = statusRaw.trim().toLowerCase();
    if (status === 'assessment done') status = 'assessment';
    else if (status === 'interview-scheduling') status = 'interview';

    let daysSinceApplied = null;
    const parsedDate = new Date(`${dateStr}T00:00:00Z`);
    if (!isNaN(parsedDate.getTime())) {
      daysSinceApplied = Math.floor((now - parsedDate) / 86400000);
    } else {
      warn(`applications.md line ${lineNum}: unparseable date "${dateStr}"`);
    }
    const stale = status === 'submitted' && daysSinceApplied != null && daysSinceApplied > 21;

    const id = slug(`${company}-${role}`);
    if (seenIds.has(id)) {
      warn(`applications.md line ${lineNum}: duplicate derived id "${id}" (${company} / ${role})`);
    }
    seenIds.add(id);

    result.push({
      id,
      date: dateStr,
      company,
      role,
      url,
      sourceNote,
      resumeVariant: resumeCell || null,
      variantSlug,
      variantPdf,
      lane,
      status,
      nextAction: nextActionCell || null,
      rejectedDate,
      followUpDate,
      daysSinceApplied,
      stale,
      queueId: null,
      score: null,
      salaryText: null,
      salaryMid: null,
      points: null,
      pointsBasis: null,
      location: null,
      daysOffice: null,
      source: null,
      band: inferBand(role),
      employment: inferEmployment(role, null, null),
      pipelineId: null,
      fitBullets: [],
    });
  });

  return result;
}

// ── Queue parser ──────────────────────────────────────────────────────────

const DAYS_OFFICE_ENUM = ['0', '1', '2', '?', '-'];

function parseQueue(filePath) {
  const rows = [];
  if (!fs.existsSync(filePath)) {
    warn(`queue.md not found (${filePath})`);
    return rows;
  }

  const content = safeReadFile(filePath);
  const lines = content.split('\n');
  let pastHeader = false;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('|') && /\|\s*id\s*\|/i.test(trimmed)) {
      pastHeader = true;
      return;
    }
    if (isSeparator(trimmed)) return;
    if (!pastHeader || !trimmed.startsWith('|')) return;

    const parts = trimmed.split('|');
    if (parts.length !== 14) {
      warn(`queue.md malformed row at line ${lineNum}: expected 14 pipe-parts, got ${parts.length}`);
      return;
    }

    const [, idRaw, dateRaw, companyRaw, roleRaw, urlRaw, sourceRaw, salaryTextRaw, laneRaw, scoreRaw, statusRaw, locationRaw, daysOfficeRaw] = parts;

    const scoreTrim = scoreRaw.trim();
    const score = /^\d+$/.test(scoreTrim) ? Number(scoreTrim) : null;

    let daysOffice = daysOfficeRaw.trim();
    if (!DAYS_OFFICE_ENUM.includes(daysOffice)) {
      warn(`queue.md line ${lineNum} (${idRaw.trim()}): non-enum days_office "${daysOffice}", treated as unknown`);
      daysOffice = 'unknown';
    }

    const role = roleRaw.trim();
    const salaryText = salaryTextRaw.trim();
    const location = locationRaw.trim();
    const employment = inferEmployment(role, salaryText, null);
    const { points, salaryMid, pointsBasis } = computePoints(salaryText, daysOffice, location, employment);
    const status = statusRaw.trim();

    rows.push({
      id: idRaw.trim(),
      date: dateRaw.trim(),
      company: companyRaw.trim(),
      role,
      url: urlRaw.trim(),
      source: sourceRaw.trim(),
      salaryText,
      lane: laneRaw.trim(),
      score,
      status,
      location,
      daysOffice,
      applied: status === 'applied',
      salaryMid,
      points,
      pointsBasis,
    });
  });

  return rows;
}

// ── Digest fit-bullet lookup (same approach as generate-jobs-data.js) ──────

function parseFitBullets(digestDate, url) {
  if (!digestDate || !url) return [];
  const digestFile = path.join(DIGEST_DIR, `${digestDate}.md`);
  if (!fs.existsSync(digestFile)) return [];

  const lines = safeReadFile(digestFile).split('\n');
  let urlLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === `**URL:** ${url}`) {
      urlLineIndex = i;
      break;
    }
  }
  if (urlLineIndex === -1) return [];

  const bullets = [];
  let inFit = false;
  for (let i = urlLineIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '**Fit:**') {
      inFit = true;
      continue;
    }
    if (inFit) {
      if (trimmed.startsWith('**') || trimmed.startsWith('##')) break;
      if (trimmed.startsWith('- ')) bullets.push(trimmed.slice(2));
    }
  }
  return bullets;
}

// ── Join applications to queue ───────────────────────────────────────────

function normalizeUrl(url) {
  if (!url) return null;
  const KEEP_PARAMS = ['for', 'token'];
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.replace(/\/+$/, '');
    const params = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (KEEP_PARAMS.includes(k)) params.append(k, v);
    }
    const qs = params.toString();
    return `${host}${pathname}${qs ? `?${qs}` : ''}`.toLowerCase();
  } catch (err) {
    return url.trim().toLowerCase().replace(/\/+$/, '').replace(/#.*$/, '');
  }
}

function joinApplicationsToQueue(applications, queueRows) {
  const byUrl = new Map();
  const byCompanyRole = new Map();
  for (const q of queueRows) {
    const nu = normalizeUrl(q.url);
    if (nu && !byUrl.has(nu)) byUrl.set(nu, q);
    const key = `${q.company.toLowerCase()}|${q.role.toLowerCase()}`;
    if (!byCompanyRole.has(key)) byCompanyRole.set(key, q);
  }

  for (const app of applications) {
    let match = null;
    if (app.url) {
      match = byUrl.get(normalizeUrl(app.url)) || null;
    }
    if (!match) {
      match = byCompanyRole.get(`${app.company.toLowerCase()}|${app.role.toLowerCase()}`) || null;
    }

    if (match) {
      app.queueId = match.id;
      app.score = match.score;
      app.salaryText = match.salaryText;
      app.location = match.location;
      app.daysOffice = match.daysOffice;
      app.source = match.source;
      app.fitBullets = parseFitBullets(match.date, match.url);
    } else {
      warn(`No queue match for application: ${app.company}, role "${app.role}" (${app.url || app.sourceNote || 'no url/source'})`);
    }

    app.employment = inferEmployment(app.role, app.salaryText, null);
    const { points, salaryMid, pointsBasis } = computePoints(app.salaryText, app.daysOffice, app.location, app.employment);
    app.points = points;
    app.salaryMid = salaryMid;
    app.pointsBasis = pointsBasis;
  }
}

// ── Pipeline parser ───────────────────────────────────────────────────────

function parsePipeline(dirPath) {
  const result = [];
  if (!fs.existsSync(dirPath)) {
    warn(`pipeline/ directory not found (${dirPath}), no advanced opportunities yet`);
    return result;
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const content = safeReadFile(filePath);
      const { data, body } = splitFrontmatter(content);
      if (!data.id) {
        warn(`pipeline/${file}: missing id in frontmatter, skipped`);
        continue;
      }

      const employment = data.employment || 'full-time';
      const location = data.location || null;
      const { points, salaryMid, pointsBasis } = computePoints(data.salary_text, data.days_office, location, employment);

      const rawStages = Array.isArray(data.stages) ? data.stages : [];
      const stages = rawStages.map(s => ({
        name: s.name || null,
        type: s.type || 'other',
        date: normalizeYamlDate(s.date),
        durationMin: s.duration_min != null ? s.duration_min : null,
        status: s.status || 'upcoming',
        notes: s.notes || null,
        with: s.with || null,
        link: s.link || null,
      }));

      const scheduleEvents = stages
        .filter(s => s.date)
        .map(s => {
          let endDate = null;
          if (s.durationMin) {
            const start = new Date(s.date);
            if (!isNaN(start.getTime())) {
              endDate = new Date(start.getTime() + s.durationMin * 60000).toISOString();
            }
          }
          return {
            date: s.date,
            endDate,
            company: data.company || null,
            role: data.role || null,
            stage: s.name,
            type: s.type,
            status: s.status,
            with: s.with,
            link: s.link,
            pipelineId: data.id,
          };
        });

      const DONE_LIKE = ['done', 'passed', 'scheduled', 'awaiting'];
      let currentStage = null;
      for (let i = stages.length - 1; i >= 0; i--) {
        if (DONE_LIKE.includes(stages[i].status)) { currentStage = stages[i]; break; }
      }
      if (!currentStage) {
        currentStage = stages.find(s => s.status === 'upcoming') || stages[0] || null;
      }

      result.push({
        id: data.id,
        company: data.company || null,
        role: data.role || null,
        applicationDate: normalizeYamlDate(data.application_date),
        applicationUrl: data.application_url || null,
        status: data.status || 'active',
        employment,
        location,
        daysOffice: data.days_office != null ? data.days_office : null,
        salaryText: data.salary_text || null,
        salarySource: data.salary_source || null,
        contacts: Array.isArray(data.contacts) ? data.contacts : [],
        process: Array.isArray(data.process) ? data.process : [],
        stages,
        ball: data.ball || 'none',
        nextAction: data.next_action || null,
        nextActionDue: normalizeYamlDate(data.next_action_due),
        prepNotesMd: body.trim(),
        points,
        salaryMid,
        pointsBasis,
        currentStage: currentStage ? currentStage.name : null,
        applicationId: null,
        scheduleEvents, // consumed by buildSchedule(), not part of the emitted shape
      });
    } catch (err) {
      warn(`pipeline/${file}: parse error: ${err.message}`);
    }
  }

  return result;
}

function crossCheckPipelineCoverage(applications, pipeline) {
  const ADVANCED = ['screen', 'assessment', 'interview', 'offer'];
  const pipelineById = new Map(pipeline.map(p => [p.id, p]));
  const claimed = new Set();

  // First token of the company name ("Acme Widgets Inc (via Staffing Co)" -> "acme"),
  // used as a fallback key for recruiter sourced rows that never had a queue id.
  const companyKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)[0] || '';
  const words = s => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2));
  const overlap = (a, b) => { let n = 0; for (const w of words(a)) if (words(b).has(w)) n++; return n; };

  function fuzzyPipeline(app) {
    const key = companyKey(app.company);
    if (!key) return null;
    const candidates = pipeline.filter(p => !claimed.has(p.id) && companyKey(p.company) === key);
    if (!candidates.length) return null;
    candidates.sort((a, b) => overlap(b.role, app.role) - overlap(a.role, app.role));
    return candidates[0];
  }

  // Pipeline ids are hand authored to mirror the queue slug when one exists.
  // Try the derived id, then the queue joined id, then the company token
  // fallback (best role word overlap wins, each pipeline file claimed once).
  for (const app of applications) {
    if (!ADVANCED.includes(app.status)) continue;
    let match = null;
    if (pipelineById.has(app.id)) match = pipelineById.get(app.id);
    else if (app.queueId && pipelineById.has(app.queueId)) match = pipelineById.get(app.queueId);
    else match = fuzzyPipeline(app);
    if (match) {
      app.pipelineId = match.id;
      match.applicationId = app.id;
      claimed.add(match.id);
    } else {
      warn(`Application "${app.company}" / "${app.role}" has status "${app.status}" but no matching pipeline file (expected id ${app.id})`);
    }
  }

  for (const p of pipeline) {
    if (!p.applicationId) {
      p.applicationId = null;
      warn(`pipeline/${p.id}.md has no matching row in applications.md`);
    }
  }
}

function buildSchedule(pipeline, now) {
  const all = [];
  for (const p of pipeline) {
    all.push(...p.scheduleEvents);
    delete p.scheduleEvents; // internal only, not part of the emitted PipelineOpportunity shape
  }
  const upcoming = all.filter(e => !isNaN(new Date(e.date).getTime()) && new Date(e.date) >= now)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = all.filter(e => !isNaN(new Date(e.date).getTime()) && new Date(e.date) < now)
    .sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, past };
}

// ── Comms, LinkedIn views, lessons ───────────────────────────────────────

function parseComms(filePath) {
  const result = [];
  if (!fs.existsSync(filePath)) {
    warn(`comms.md not found (${filePath})`);
    return result;
  }

  const content = safeReadFile(filePath);
  const { body } = splitFrontmatter(content);
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (isSeparator(trimmed)) continue;
    const cells = splitRow(trimmed);
    if (cells[0] && cells[0].toLowerCase() === 'date') continue;
    if (cells.length !== 9) {
      warn(`comms.md malformed row: expected 9 cells, got ${cells.length} ("${trimmed.slice(0, 60)}")`);
      continue;
    }
    const [date, company, direction, channel, who, summary, ball, due, pipelineId] = cells;
    result.push({ date, company, direction, channel, who, summary, ball, due: due || null, pipelineId: pipelineId || null });
  }

  return result;
}

function parseLinkedinViews(filePath) {
  const result = [];
  if (!fs.existsSync(filePath)) {
    warn(`metrics/linkedin-views.md not found (${filePath})`);
    return result;
  }

  const lines = safeReadFile(filePath).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (isSeparator(trimmed)) continue;
    const cells = splitRow(trimmed);
    if (cells[0] && cells[0].toLowerCase() === 'date') continue;
    if (cells.length !== 2) continue;
    const views = Number(cells[1]);
    result.push({ date: cells[0], views: Number.isFinite(views) ? views : null });
  }

  return result;
}

function parseLessons(filePath) {
  if (!fs.existsSync(filePath)) {
    warn(`lessons.md not found (${filePath})`);
    return '';
  }
  const { body } = splitFrontmatter(safeReadFile(filePath));
  return body.trim();
}

// ── Drill log parser ──────────────────────────────────────────────────────

function extractSection(content, heading) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === heading) { start = i + 1; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim().startsWith('## ')) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

// "2/5" -> guided decisions, "no pass" -> blind fail, anything with "PASS"
// -> learned, with an ordinal pulled from "3rd"/"first"/etc when present.
function parseScoreCell(scoreText) {
  const t = (scoreText || '').trim();
  const fracMatch = t.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) return { kind: 'fraction', x: Number(fracMatch[1]), y: Number(fracMatch[2]) };
  if (/^no pass$/i.test(t)) return { kind: 'nopass' };
  if (/PASS/i.test(t)) {
    const ordMatch = t.match(/(\d+)(?:st|nd|rd|th)|first/i);
    const ordinal = ordMatch ? (ordMatch[1] ? Number(ordMatch[1]) : 1) : null;
    return { kind: 'pass', ordinal };
  }
  return { kind: 'other', raw: t };
}

// Module level so main() can reuse the same empty shape when
// FEATURES.drills is false, without pushing a "not found" warning: there is
// nothing to warn about when drills are deliberately off for this person.
function emptyDrills() {
  return {
    currentPositionMd: '', weakSpotsMd: '', redoQueue: [], history: [],
    problems: [], patterns: [], accuracySeries: [],
  };
}

function parseDrillLog(filePath, now) {
  if (!fs.existsSync(filePath)) {
    warn(`drill-log.md not found (${filePath})`);
    return emptyDrills();
  }

  const content = safeReadFile(filePath);
  const currentPositionMd = extractSection(content, '## Current position');
  const weakSpotsMd = extractSection(content, '## Weak spots');

  const lines = content.split('\n');
  const redoQueue = [];
  const history = [];
  let mode = null; // 'redo' | 'history' | null

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '## Redo queue') { mode = 'redo'; continue; }
    if (trimmed === '## History') { mode = 'history'; continue; }
    if (trimmed.startsWith('## ')) { mode = null; continue; }
    if (!trimmed.startsWith('|')) continue;
    if (isSeparator(trimmed)) continue;

    const cells = splitRow(trimmed);

    if (mode === 'redo') {
      if (cells[0] && cells[0].toLowerCase() === 'problem') continue;
      if (cells.length < 5) { warn(`drill-log.md Redo queue row too short: "${trimmed.slice(0, 60)}"`); continue; }
      const [problem, pattern, due, modeCell, ...rest] = cells;
      redoQueue.push({ problem, pattern, due, mode: modeCell, reason: rest.join('|') });
    } else if (mode === 'history') {
      if (cells[0] && cells[0].toLowerCase() === 'date') continue;
      if (cells.length < 6) { warn(`drill-log.md History row too short: "${trimmed.slice(0, 60)}"`); continue; }
      const [date, problem, pattern, modeCell, score, ...rest] = cells;
      const last = rest[rest.length - 1] || '';
      let nextDue = null;
      let result;
      if (/^\d{4}-\d{2}-\d{2}$/.test(last.trim())) {
        nextDue = last.trim();
        result = rest.slice(0, -1).join('|');
      } else {
        result = rest.join('|');
      }
      history.push({ date, problem, pattern, mode: modeCell, score, result, nextDue });
    }
  }

  const problems = aggregateProblems(history, redoQueue, now);
  const patterns = aggregatePatterns(problems);
  const accuracySeries = computeAccuracySeries(history);

  return { currentPositionMd, weakSpotsMd, redoQueue, history, problems, patterns, accuracySeries };
}

function aggregateProblems(history, redoQueue, now) {
  const byName = new Map();

  for (const h of history) {
    if (!byName.has(h.problem)) {
      byName.set(h.problem, {
        id: slug(h.problem),
        name: h.problem,
        pattern: h.pattern,
        topic: h.pattern.split(' — ')[0].trim(),
        attempts: [],
        guidedCount: 0,
        blindCount: 0,
        learned: false,
        lastScore: null,
        nextDue: null,
        state: null,
      });
    }
    const p = byName.get(h.problem);
    p.attempts.push(h);
    if (/blind/i.test(h.mode)) p.blindCount++; else p.guidedCount++;
    p.lastScore = h.score;
    if (parseScoreCell(h.score).kind === 'pass') p.learned = true;
  }

  const redoByProblem = new Map();
  for (const r of redoQueue) redoByProblem.set(r.problem, r); // later rows win if duplicated

  const today = startOfDay(now);

  for (const p of byName.values()) {
    if (p.learned) {
      p.state = 'learned';
      p.nextDue = null;
      continue;
    }

    const redo = redoByProblem.get(p.name);
    if (redo && /^\d{4}-\d{2}-\d{2}$/.test(redo.due)) {
      p.nextDue = redo.due;
      const due = startOfDay(new Date(`${redo.due}T00:00:00Z`));
      if (due < today) p.state = 'overdue';
      else if (due.getTime() === today.getTime()) p.state = 'due';
      else p.state = 'scheduled';
    } else {
      p.nextDue = null;
      p.state = 'scheduled';
    }

    const noPassCount = p.attempts.filter(a => parseScoreCell(a.score).kind === 'nopass').length;
    if (noPassCount >= 2) p.state = 'struggling';
  }

  return Array.from(byName.values());
}

function aggregatePatterns(problems) {
  const byTopic = new Map();
  for (const p of problems) {
    if (!byTopic.has(p.topic)) byTopic.set(p.topic, { topic: p.topic, attempted: 0, learned: 0, sumX: 0, sumY: 0 });
    const t = byTopic.get(p.topic);
    t.attempted++;
    if (p.learned) t.learned++;
    for (const a of p.attempts) {
      const parsed = parseScoreCell(a.score);
      if (parsed.kind === 'fraction') { t.sumX += parsed.x; t.sumY += parsed.y; }
    }
  }
  return Array.from(byTopic.values()).map(t => ({
    topic: t.topic,
    attempted: t.attempted,
    learned: t.learned,
    decisionRate: t.sumY > 0 ? t.sumX / t.sumY : null,
  }));
}

function computeAccuracySeries(history) {
  const dates = Array.from(new Set(history.map(h => h.date))).sort();
  let cumulativeLearned = 0;
  const series = [];

  for (const date of dates) {
    const rowsOnDate = history.filter(h => h.date === date);
    let sumX = 0, sumY = 0, hasGuided = false;
    for (const h of rowsOnDate) {
      const parsed = parseScoreCell(h.score);
      if (parsed.kind === 'pass') cumulativeLearned++;
      if (!/blind/i.test(h.mode) && parsed.kind === 'fraction') {
        sumX += parsed.x;
        sumY += parsed.y;
        hasGuided = true;
      }
    }
    series.push({
      date,
      rate: hasGuided && sumY > 0 ? sumX / sumY : null,
      cumulativeLearned,
    });
  }

  return series;
}

// ── Knowledge base (optional, not created yet) ────────────────────────────

function parseKb(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const lines = safeReadFile(filePath).split('\n');
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (isSeparator(trimmed)) continue;
    const cells = splitRow(trimmed);
    if (cells[0] && cells[0].toLowerCase() === 'date') continue;
    if (cells.length !== 5) continue;
    rows.push({ date: cells[0], topic: cells[1], question: cells[2], result: cells[3], nextDue: cells[4] });
  }

  if (!rows.length) return { topics: 0, questions: 0, accuracy: null };
  const topics = new Set(rows.map(r => r.topic)).size;
  const passCount = rows.filter(r => /pass/i.test(r.result)).length;
  return { topics, questions: rows.length, accuracy: passCount / rows.length };
}

// ── Knowledge base bank parser ─────────────────────────────────────────────
// Reads interview-prep/kb/*.md, the per-topic question banks that back
// /quiz. parseKb() above only sees the log's History table; this is the
// only place that reads the Index (recall queue, single source of truth for
// status/due/seen/label) and the full Questions detail blocks (stem,
// options, why, rubric, model answer, attempts).

// Same 5-level difficulty ramp target as the quiz skill. Duplicated here
// rather than imported since this generator has no dependency on the vault
// skill files; see vault/skills/quiz/SKILL.md, "Difficulty Ramp" (5
// consecutive passes at a level promotes).
const KB_PROMOTION_STREAK = 5;

const KB_RESULT_PATTERNS = [
  { re: /\brecall pass\b/, result: 'pass' },
  { re: /\brecall miss\b/, result: 'miss' },
  { re: /\bpass\b/, result: 'pass' },
  { re: /\bmiss\b/, result: 'miss' },
  { re: /\bguess\b/, result: 'guess' },
  { re: /\bskip\b/, result: 'skip' },
];

// One Attempts line, e.g. "2026-09-19 mcq D miss tier0" or the recall shape
// "2026-09-23 recall pass tier1" (no pick token). Tokenizes rather than one
// fixed width regex because recall attempts are one field short. Returns
// null on anything that does not fit, so the caller can warn and skip just
// that line.
function parseKbAttemptLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;

  const tierMatch = line.match(/\s+tier\s*(\d+)$/);
  if (!tierMatch) return null;
  const tier = Number(tierMatch[1]);
  const withoutTier = line.slice(0, line.length - tierMatch[0].length).trim();

  let result = null;
  for (const { re, result: r } of KB_RESULT_PATTERNS) {
    if (re.test(withoutTier)) { result = r; break; }
  }
  if (result === null) return null;

  const tokens = withoutTier.split(/\s+/).filter(Boolean);
  const date = tokens[0];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const mode = tokens[1];
  if (!mode) return null;

  const resultWords = ['pass', 'miss', 'guess', 'skip'];
  const rest = tokens.slice(2).filter(t => !resultWords.includes(t.toLowerCase()));
  const pick = rest.length === 1 ? rest[0] : null;

  return { date, mode, pick, result, tier };
}

// Reads one bank file's body with a single pass, fence aware line scan.
// Mutates fileState (topic, file, indexRowsById, items, warn-tracking) in
// place; kept separate from parseKbBank's file loop only to keep that loop
// readable.
function parseKbBankFile(body, file, topic) {
  const indexRowsById = new Map();
  let indexHeaderCells = null;
  const items = []; // in encounter order; caller sorts globally

  let topLevel = null; // null | 'index' | 'questions'
  let currentBlock = null;
  let openSection = null; // null | 'stem' | 'options' | 'why' | 'rubric' | 'model answer' | 'attempts'
  let inFence = false;
  let fenceChar = null;
  let fenceLen = 0;

  function newBlock(id) {
    return {
      id, key: null, kind: null, level: null, deck: null, firstAsked: null,
      answer: null, versions: null,
      _stemLines: [], _whyLines: [], _modelAnswerLines: [],
      options: [], rubric: [], _attemptLines: [],
    };
  }

  function finalizeBlock(block) {
    if (!block) return;
    const attempts = [];
    for (const line of block._attemptLines) {
      const parsed = parseKbAttemptLine(line);
      if (!parsed) { warn(`kb/${file}: ${block.id}: unparseable Attempts line "${line}"`); continue; }
      attempts.push(parsed);
    }
    items.push({
      id: block.id,
      topic,
      key: block.key,
      kind: block.kind,
      level: block.level,
      status: null, due: null, seen: null, label: null, // filled from Index below
      stem: block._stemLines.join('\n').trim(),
      options: block.options,
      answer: block.answer,
      why: block._whyLines.join('\n').trim(),
      rubric: block.rubric,
      modelAnswer: block._modelAnswerLines.join('\n').trim(),
      versions: block.versions,
      deck: block.deck,
      firstAsked: block.firstAsked,
      attempts,
    });
  }

  // Lines inside a fence are never structure (no ## / ### / **Section** /
  // field detection), but still belong to whatever raw or list section is
  // currently open, so a fenced code sample inside a Stem is preserved
  // verbatim rather than dropped.
  function appendFenceLine(line) {
    if (!currentBlock) return;
    const t = line.trim();
    if (openSection === 'stem') currentBlock._stemLines.push(line);
    else if (openSection === 'why') currentBlock._whyLines.push(line);
    else if (openSection === 'model answer') currentBlock._modelAnswerLines.push(line);
    else if (openSection === 'options') {
      if (t && currentBlock.options.length) {
        const last = currentBlock.options[currentBlock.options.length - 1];
        last.text = (last.text + ' ' + t).trim();
      }
    } else if (openSection === 'rubric') {
      if (t) currentBlock.rubric.push(t.replace(/^\d+\.\s*/, ''));
    } else if (openSection === 'attempts') {
      if (t) currentBlock._attemptLines.push(t);
    }
  }

  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Fence state machine gates every structural check below.
    const fenceMarker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (!inFence) {
      if (fenceMarker) {
        inFence = true;
        fenceChar = fenceMarker[1][0];
        fenceLen = fenceMarker[1].length;
        appendFenceLine(line);
        continue;
      }
    } else {
      if (fenceMarker && fenceMarker[1][0] === fenceChar && fenceMarker[1].length >= fenceLen) {
        inFence = false;
      }
      appendFenceLine(line);
      continue;
    }

    if (topLevel !== 'questions') {
      if (trimmed === '## Index') { topLevel = 'index'; continue; }
      if (trimmed === '## Questions') { topLevel = 'questions'; continue; }
      if (topLevel === 'index') {
        if (!trimmed.startsWith('|')) continue;
        if (isSeparator(trimmed)) continue;
        const cells = splitRow(trimmed);
        if (cells.length < 8) continue;
        if (cells[0] && cells[0].toLowerCase() === 'id') {
          indexHeaderCells = cells.map(c => c.toLowerCase());
          continue;
        }
        if (!indexHeaderCells) continue;
        const row = {};
        indexHeaderCells.forEach((h, i) => { row[h] = cells[i]; });
        const due = row.due && row.due.toLowerCase() === 'none' ? null : (row.due || null);
        const seen = row.seen !== undefined && row.seen !== '' ? Number(row.seen) : null;
        indexRowsById.set(row.id, {
          id: row.id, key: row.key, kind: row.kind, level: row.level,
          status: row.status, due, seen, label: row.label,
        });
      }
      continue;
    }

    // topLevel === 'questions'
    const idMatch = trimmed.match(/^### (\S+)$/);
    if (idMatch) {
      finalizeBlock(currentBlock);
      currentBlock = newBlock(idMatch[1]);
      openSection = null;
      continue;
    }
    if (!currentBlock) continue;

    const headerMatch = trimmed.match(/^\*\*(Stem|Options|Why|Rubric|Model answer|Attempts)\*\*$/);
    if (headerMatch) {
      openSection = headerMatch[1].toLowerCase();
      continue;
    }

    if (openSection === null) {
      const fieldMatch = trimmed.match(/^(key|kind|level|deck|first asked|answer|versions):\s*(.*)$/);
      if (fieldMatch) {
        const [, fname, fval] = fieldMatch;
        if (fname === 'key') currentBlock.key = fval;
        else if (fname === 'kind') currentBlock.kind = fval;
        else if (fname === 'level') currentBlock.level = fval;
        else if (fname === 'deck') currentBlock.deck = fval;
        else if (fname === 'first asked') currentBlock.firstAsked = fval;
        else if (fname === 'answer') currentBlock.answer = fval.toUpperCase();
        else if (fname === 'versions') currentBlock.versions = fval;
      }
      continue;
    }

    if (openSection === 'stem') { currentBlock._stemLines.push(line); continue; }
    if (openSection === 'why') { currentBlock._whyLines.push(line); continue; }
    if (openSection === 'model answer') { currentBlock._modelAnswerLines.push(line); continue; }

    if (openSection === 'options') {
      const optMatch = trimmed.match(/^([A-Z])[.)]\s+(.*)$/);
      if (optMatch) {
        currentBlock.options.push({ letter: optMatch[1], text: optMatch[2] });
      } else if (trimmed && currentBlock.options.length) {
        const last = currentBlock.options[currentBlock.options.length - 1];
        last.text = (last.text + ' ' + trimmed).trim();
      }
      continue;
    }

    if (openSection === 'rubric') {
      if (trimmed) currentBlock.rubric.push(trimmed.replace(/^\d+\.\s*/, ''));
      continue;
    }

    if (openSection === 'attempts') {
      if (trimmed) currentBlock._attemptLines.push(trimmed);
      continue;
    }
  }
  finalizeBlock(currentBlock);

  // Reconcile blocks against the Index: Index supplies status/due/seen/label
  // and wins on a level disagreement; warn (never throw) either direction.
  const seenIds = new Set();
  for (const item of items) {
    seenIds.add(item.id);
    const row = indexRowsById.get(item.id);
    if (!row) {
      warn(`kb/${file}: ${item.id} has a question block but no Index row`);
      continue;
    }
    if (row.level && item.level && row.level !== item.level) {
      warn(`kb/${file}: ${item.id} level mismatch (block says ${item.level}, Index says ${row.level}), using Index`);
    }
    item.level = row.level || item.level;
    item.status = row.status;
    item.due = row.due;
    item.seen = row.seen;
    item.label = row.label;
  }
  for (const id of indexRowsById.keys()) {
    if (!seenIds.has(id)) warn(`kb/${file}: Index row ${id} has no matching question block`);
  }

  return { items };
}

// Directory of per-topic bank files (interview-prep/kb/<topic>[-N].md,
// listed non recursively so a future decks/ subdirectory is excluded).
// Returns null when the directory does not exist; parseKb() staying byte
// identical is a hard constraint, so this and buildKb() below are additive
// siblings, never edits to it.
function parseKbBank(dir) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  const topicStates = new Map(); // topic -> state, count accumulates across rollover files
  const allItems = [];
  const seenGlobalIds = new Map(); // id -> file it was first seen in

  for (const file of files) {
    const filePath = path.join(dir, file);
    let content;
    try {
      content = safeReadFile(filePath);
    } catch (err) {
      warn(`kb/${file}: read error: ${err.message}`);
      continue;
    }

    const { data, body } = splitFrontmatter(content);
    const filenameTopic = file.replace(/\.md$/, '').replace(/-\d+$/, '');
    const topic = data.topic || filenameTopic;
    const prefix = data.prefix || null;
    // js-yaml returns null (not undefined) for a present-but-empty key, so
    // check loosely for both to fall back to schema defaults.
    const level = data.level != null ? data.level : 'fundamentals';
    const streak = data.streak != null ? data.streak : 0;
    const frontmatterCount = data.count != null ? data.count : 0;

    if (!topicStates.has(topic)) {
      // level/streak/prefix come from the first file encountered for this
      // topic only; a rollover file's frontmatter never overwrites them.
      topicStates.set(topic, { topic, prefix, level, streak, count: 0 });
    }
    const topicState = topicStates.get(topic);

    const { items } = parseKbBankFile(body, file, topic);

    if (items.length !== frontmatterCount) {
      warn(`kb/${file}: frontmatter count (${frontmatterCount}) does not match parsed question blocks (${items.length})`);
    }
    topicState.count += items.length;

    for (const item of items) {
      if (seenGlobalIds.has(item.id)) {
        warn(`kb: duplicate id ${item.id} in ${file} (already seen in ${seenGlobalIds.get(item.id)})`);
        continue;
      }
      seenGlobalIds.set(item.id, file);
      allItems.push(item);
    }
  }

  allItems.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const byLevel = { fundamentals: { asked: 0, passed: 0 }, medium: { asked: 0, passed: 0 }, senior: { asked: 0, passed: 0 } };
  let attemptCount = 0;
  for (const item of allItems) {
    for (const a of item.attempts) {
      attemptCount++;
      if (a.mode !== 'mcq') continue;
      const bucket = byLevel[item.level];
      if (!bucket) continue;
      bucket.asked++;
      if (a.result === 'pass') bucket.passed++;
    }
  }

  const topicStatesOut = Array.from(topicStates.values()).map(t => ({
    topic: t.topic,
    prefix: t.prefix,
    level: t.level,
    streak: t.streak,
    count: t.count,
    toPromote: t.level === 'senior' ? null : Math.max(0, KB_PROMOTION_STREAK - t.streak),
  }));

  return { topicStates: topicStatesOut, items: allItems, byLevel, attemptCount };
}

// Counts *.md files sitting in <kbDir>/offline, the drop point for answers
// submitted from the offline queue card (POSTed one file per questionId,
// kb/offline/<questionId>.md). parseKbBank() already skips this
// subdirectory when it walks kbDir non recursively, so it never shows up as
// a bank file. A missing offline/ dir is the normal case (nothing has been
// answered offline yet), so this stays silent rather than warning; any
// other read error still goes through warn() and returns 0.
function countOfflinePending(kbDir) {
  const offlineDir = path.join(kbDir, 'offline');
  if (!fs.existsSync(offlineDir)) return 0;
  try {
    return fs.readdirSync(offlineDir).filter(f => f.endsWith('.md')).length;
  } catch (err) {
    warn(`kb/offline: read error: ${err.message}`);
    return 0;
  }
}

// Combines the log (parseKb, unchanged) with the bank (parseKbBank) into
// the payload the Career tab kb tile and pages read. Returns null only when
// neither the log nor any bank file exists for this person.
function buildKb(logPath, kbDir) {
  const summary = parseKb(logPath);
  const bank = parseKbBank(kbDir);
  if (!summary && !bank) return null;

  let activeDeck = null;
  let currentPositionMd = '';
  let weakSpotsMd = '';
  if (fs.existsSync(logPath)) {
    const { data, body } = splitFrontmatter(safeReadFile(logPath));
    activeDeck = data.active_deck || null;
    currentPositionMd = extractSection(body, '## Current position');
    weakSpotsMd = extractSection(body, '## Weak spots');
  }

  const emptyByLevel = { fundamentals: { asked: 0, passed: 0 }, medium: { asked: 0, passed: 0 }, senior: { asked: 0, passed: 0 } };
  const byLevel = bank ? bank.byLevel : emptyByLevel;
  const topicStates = bank ? bank.topicStates : [];
  const items = bank ? bank.items : [];
  const recallDue = bank
    ? bank.items
        .filter(it => it.status === 'due')
        .map(it => ({ id: it.id, topic: it.topic, label: it.label, due: it.due }))
        .sort((a, b) => {
          const ad = a.due || '', bd = b.due || '';
          if (ad !== bd) return ad < bd ? -1 : 1;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        })
    : [];

  // Parity check: the log's History table logs every event (mcq and
  // recall), so its row count should match the bank's all-mode attempt
  // count. A mismatch means a session updated one side but not the other.
  if (bank && summary) {
    if (bank.attemptCount !== summary.questions) {
      warn(`kb parity: bank attempts (${bank.attemptCount}) does not match kb-log.md History rows (${summary.questions})`);
    }
  }

  // Round robin across topics so the card does not serve four javascript
  // questions in a row. Within a topic the order stays id ascending, which
  // keeps the sequence stable between runs.
  const queue = [];
  if (bank) {
    const byTopic = new Map();
    for (const it of bank.items.filter(i => i.status === 'queued')) {
      if (!byTopic.has(it.topic)) byTopic.set(it.topic, []);
      byTopic.get(it.topic).push(it.id);
    }
    const lanes = [...byTopic.keys()].sort().map(t => byTopic.get(t).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    for (let i = 0; queue.length < lanes.reduce((n, l) => n + l.length, 0); i++) {
      for (const lane of lanes) if (i < lane.length) queue.push(lane[i]);
    }
  }
  const offlinePending = countOfflinePending(kbDir);

  return {
    ...(summary || { topics: 0, questions: 0, accuracy: null }),
    activeDeck,
    byLevel,
    topicStates,
    recallDue,
    items,
    queue,
    offlinePending,
    currentPositionMd,
    weakSpotsMd,
  };
}

// ── Playbook (base resume, variants, strategy docs) ───────────────────────

function readBaseResume() {
  const p = path.join(RESUME_DIR, 'base-ats.md');
  if (!fs.existsSync(p)) {
    warn(`resume/base-ats.md not found`);
    return '';
  }
  const { body } = splitFrontmatter(safeReadFile(p));
  return body.trim();
}

function deriveCompanyRoleFromHeading(body) {
  const headingMatch = body.match(/^#\s+(.+)$/m);
  if (!headingMatch) return { company: null, role: null };
  let heading = headingMatch[1].trim();
  heading = heading.replace(/^Resume Variant\s*[—–-]?\s*/i, '');
  const parts = heading.split(/\s+[—–]\s+|\s+·\s+/);
  return {
    company: parts[0] ? parts[0].trim() : null,
    role: parts[1] ? parts[1].trim() : null,
  };
}

function parseResumeVariants() {
  if (!fs.existsSync(VARIANTS_DIR)) {
    warn(`resume/variants/ not found`);
    return [];
  }

  const files = fs.readdirSync(VARIANTS_DIR).filter(f => f.endsWith('.md'));
  const result = [];

  for (const file of files) {
    const variantSlug = file.slice(0, -3);
    const filePath = path.join(VARIANTS_DIR, file);
    try {
      const content = safeReadFile(filePath);
      const { data, body } = splitFrontmatter(content);
      const derived = deriveCompanyRoleFromHeading(body);
      const company = data.company || derived.company;
      const role = data.role || derived.role;

      const pdfPath = path.join(VARIANTS_DIR, variantSlug, RESUME_PDF);
      let hasPdf = false;
      let pdfPathRel = null;
      let pdfMtime = null;
      if (fs.existsSync(pdfPath)) {
        hasPdf = true;
        pdfPathRel = path.relative(SHADOW_ROOT, pdfPath);
        pdfMtime = fs.statSync(pdfPath).mtime.toISOString();
      }

      result.push({
        slug: variantSlug,
        title: data.title || (body.match(/^#\s+(.+)$/m) || [])[1] || variantSlug,
        company,
        role,
        docType: data.type || 'resume-variant',
        created: normalizeYamlDate(data.created),
        hasPdf,
        pdfPath: pdfPathRel,
        pdfMtime,
        deltaLogPath: path.relative(SHADOW_ROOT, filePath),
      });
    } catch (err) {
      warn(`resume/variants/${file}: parse error: ${err.message}`);
    }
  }

  return result;
}

const STRATEGY_DOCS = ['PLAN.md', 'positioning.md', 'targets.md', 'research/SYNTHESIS.md', 'linkedin.md'];

function parseStrategyDocs() {
  const result = [];
  for (const rel of STRATEGY_DOCS) {
    const filePath = path.join(JOB_HUNT_DIR, rel);
    if (NEVER_READ.includes(path.basename(filePath))) continue; // guard, unreachable given the allowlist above
    if (!fs.existsSync(filePath)) {
      warn(`strategy doc not found: ${rel}`);
      continue;
    }
    try {
      const content = safeReadFile(filePath);
      const { data, body } = splitFrontmatter(content);
      result.push({
        id: slug(rel.replace(/\.md$/, '')),
        title: data.title || rel,
        md: body.trim(),
      });
    } catch (err) {
      warn(`strategy doc ${rel}: parse error: ${err.message}`);
    }
  }
  return result;
}

function parsePlaybook() {
  return {
    baseResumeMd: readBaseResume(),
    variants: parseResumeVariants(),
    docs: parseStrategyDocs(),
    lessonsMd: parseLessons(LESSONS_FILE),
  };
}

// ── Metrics ───────────────────────────────────────────────────────────────

const ADVANCED_STATUSES = ['screen', 'assessment', 'interview', 'offer'];

function computeMetrics(applications, queue, pipeline, comms, drills, linkedinViews, now) {
  // Weekly buckets, Monday-anchored, from the Monday on or before HUNT_START
  // through the current week. Tom's HUNT_START (2026-08-12) lands on
  // 2026-08-10, matching the previous hardcoded anchor exactly.
  const weekly = [];
  let cursor = mondayOf(new Date(`${HUNT_START}T00:00:00Z`));
  const nowWeekStart = mondayOf(now);
  while (cursor <= nowWeekStart) {
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekStartStr = isoDate(cursor);
    const weekEndStr = isoDate(weekEnd);
    const inWeek = applications.filter(a => a.date >= weekStartStr && a.date < weekEndStr);
    weekly.push({
      weekStart: weekStartStr,
      submitted: inWeek.length,
      advanced: inWeek.filter(a => ADVANCED_STATUSES.includes(a.status)).length,
      rejected: inWeek.filter(a => a.status === 'rejected').length,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const total = applications.length;
  const responded = applications.filter(a => a.status !== 'submitted').length;
  const assessmentOrScreen = applications.filter(a => a.status === 'screen' || a.status === 'assessment').length;
  const interview = applications.filter(a => a.status === 'interview').length;
  const finalCount = pipeline.filter(p => p.currentStage && /final|onsite/i.test(p.currentStage)).length;
  const offer = applications.filter(a => a.status === 'offer').length;
  const funnel = [
    { stage: 'applied', count: total },
    { stage: 'responded', count: responded },
    { stage: 'assessment or screen', count: assessmentOrScreen },
    { stage: 'interview', count: interview },
    { stage: 'final', count: finalCount },
    { stage: 'offer', count: offer },
  ];

  const rejectedCount = applications.filter(a => a.status === 'rejected').length;
  const advancedCount = applications.filter(a => ADVANCED_STATUSES.includes(a.status)).length;
  const responseRate = total > 0 ? (advancedCount + rejectedCount) / total : null;

  const rejectionDays = applications
    .filter(a => a.status === 'rejected' && a.rejectedDate)
    .map(a => Math.floor((new Date(`${a.rejectedDate}T00:00:00Z`) - new Date(`${a.date}T00:00:00Z`)) / 86400000))
    .filter(d => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);
  const medianDaysToRejection = median(rejectionDays);

  const staleIds = applications.filter(a => a.stale).map(a => a.id);

  const mix = {
    location: countBy(applications, a => a.location),
    band: countBy(applications, a => a.band),
    employment: countBy(applications, a => a.employment),
    lane: countBy(applications, a => a.lane),
    source: countBy(applications, a => a.source),
  };

  const needsYou = [];
  const flaggedPipelineIds = new Set();
  for (const p of pipeline) {
    if (p.ball === 'tom') {
      flaggedPipelineIds.add(p.id);
      needsYou.push({
        kind: 'pipeline',
        title: `${p.company}: ${p.nextAction || 'action needed'}`,
        due: p.nextActionDue || null,
        link: `${ROUTE_BASE}/pipeline/${p.id}`,
      });
    }
  }
  for (const c of comms) {
    // A thread already surfaced through its pipeline file is not repeated here.
    if (c.ball === 'tom' && !(c.pipelineId && flaggedPipelineIds.has(c.pipelineId))) {
      needsYou.push({
        kind: 'comms',
        title: `${c.company}: ${c.summary}`,
        due: c.due || null,
        link: `${ROUTE_BASE}/comms`,
      });
    }
  }
  const queueNeedsAttention = queue.filter(q => q.status === 'needs-tom' || q.status === 'blocked');
  if (queueNeedsAttention.length) {
    needsYou.push({
      kind: 'queue',
      title: `${queueNeedsAttention.length} queue rows need review`,
      due: null,
      link: `${ROUTE_BASE}/applications`,
    });
  }
  const overdueDrills = drills.problems.filter(p => p.state === 'overdue');
  if (overdueDrills.length) {
    needsYou.push({
      kind: 'drills',
      title: `${overdueDrills.length} overdue blind redos`,
      due: null,
      link: `${ROUTE_BASE}/drills`,
    });
  }

  // Soonest due first; undated counters (queue, drills) sink to the bottom. Sort is stable, so ties keep file order.
  const dueKey = item => item.due || '9999-12-31';
  needsYou.sort((a, b) => dueKey(a).localeCompare(dueKey(b)));

  const metrics = { weekly, funnel, mix, responseRate, medianDaysToRejection, staleIds, linkedinViews };
  return { metrics, needsYou };
}

function buildContext(now) {
  const huntStart = new Date(`${HUNT_START}T00:00:00Z`);
  const today = startOfDay(now);
  const huntDay = Math.floor((today - huntStart) / 86400000) + 1;
  let lastDay = null;
  let daysToLastDay = null;
  if (LAST_DAY) {
    const lastDayDate = new Date(`${LAST_DAY}T00:00:00Z`);
    daysToLastDay = Math.floor((lastDayDate - today) / 86400000);
    lastDay = LAST_DAY;
  }
  return { person: PERSON, displayName: DISPLAY_NAME, huntStart: HUNT_START, huntDay, lastDay, daysToLastDay };
}

function computeKpis(applications, queue, pipeline, schedule, drills, needsYou, metrics, now) {
  const thisWeekStart = isoDate(mondayOf(now));
  const thisWeek = applications.filter(a => a.date >= thisWeekStart).length;
  const awaiting = applications.filter(a => a.status === 'submitted').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;
  const pipelineActive = pipeline.filter(p => p.status === 'active').length;
  const upcomingEvents = schedule.upcoming.length;
  const drillsLearned = drills.problems.filter(p => p.learned).length;
  const drillsDue = drills.problems.filter(p => p.state === 'due' || p.state === 'overdue').length;

  let sumX = 0, sumY = 0;
  for (const h of drills.history) {
    if (/blind/i.test(h.mode)) continue;
    const parsed = parseScoreCell(h.score);
    if (parsed.kind === 'fraction') { sumX += parsed.x; sumY += parsed.y; }
  }
  const drillAccuracy = sumY > 0 ? sumX / sumY : null;

  // Queue rows still waiting on a decision from Tom (not yet applied,
  // not terminal like expired/passed/rejected/blocked/interviewing).
  const queuePending = queue.filter(q => !q.applied && (q.status === 'needs-tom' || q.status === 'manual' || q.status === 'pending' || q.status === 'queued' || q.status === 'liked')).length;

  return {
    applications: applications.length,
    thisWeek,
    awaiting,
    rejected,
    responseRate: metrics.responseRate,
    pipelineActive,
    upcomingEvents,
    needsYou: needsYou.length,
    drillsLearned,
    drillsDue,
    drillAccuracy,
    queuePending,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main(personKey) {
  configure(personKey);
  const now = new Date();

  // Individual parsers already warn-and-empty on a missing file or dir, so a
  // missing JOB_HUNT_DIR never throws; it just cascades into every child
  // path also being missing. This one extra warning names the actual root
  // cause instead of leaving Tom to infer it from a dozen "not found" lines.
  if (!fs.existsSync(JOB_HUNT_DIR)) {
    warn(`job hunt directory not found (${JOB_HUNT_DIR})`);
  }

  const applications = parseApplications(APPLICATIONS_FILE);
  const queue = parseQueue(QUEUE_FILE);
  joinApplicationsToQueue(applications, queue);

  const pipeline = parsePipeline(PIPELINE_DIR);
  crossCheckPipelineCoverage(applications, pipeline);
  const schedule = buildSchedule(pipeline, now);

  const comms = parseComms(COMMS_FILE);
  const linkedinViews = parseLinkedinViews(LINKEDIN_VIEWS_FILE);
  const drills = FEATURES.drills ? parseDrillLog(DRILL_LOG_FILE, now) : emptyDrills();
  const playbook = parsePlaybook();
  const kb = FEATURES.kb ? buildKb(KB_LOG_FILE, KB_DIR) : null;

  const { metrics, needsYou } = computeMetrics(applications, queue, pipeline, comms, drills, linkedinViews, now);
  const context = buildContext(now);
  const kpis = computeKpis(applications, queue, pipeline, schedule, drills, needsYou, metrics, now);

  const output = {
    generatedAt: now.toISOString(),
    warnings,
    context,
    kpis,
    needsYou,
    applications,
    queue,
    pipeline,
    schedule,
    comms,
    drills,
    playbook,
    metrics,
    kb,
  };

  try {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  } catch (err) {
    console.error(`[career] Fatal: cannot write output to ${OUTPUT}: ${err.message}`);
    throw err;
  }

  console.log(`Generated ${path.basename(OUTPUT)}: ${applications.length} apps, ${queue.length} queue, ${pipeline.length} pipeline, ${drills.problems.length} drill problems, ${warnings.length} warnings`);
  console.log(`  Output: ${OUTPUT}`);
}

// --person tom|sabrina runs one person; the default (no flag, or
// --person all) runs every key in PERSONS in declaration order, which is
// what the existing "node scripts/generate-career-data.js" allow rule in
// .claude/settings.json and every regen hook already expect. A thrown
// failure for one person (e.g. a write failure inside main()) is logged and
// does not stop the other person's run; the process exits 1 only if every
// requested person failed.
function parsePersonArg(argv) {
  const idx = argv.indexOf('--person');
  return idx === -1 ? 'all' : argv[idx + 1];
}

const personArg = parsePersonArg(process.argv.slice(2));
let personKeys;
if (personArg === 'all') {
  personKeys = Object.keys(PERSONS);
} else if (PERSONS[personArg]) {
  personKeys = [personArg];
} else {
  console.error(`[career] Unknown person: ${personArg}`);
  process.exit(1);
}

let successCount = 0;
for (const key of personKeys) {
  try {
    main(key);
    successCount++;
  } catch (err) {
    console.error(`[career] Person "${key}" failed: ${err.message}`);
  }
}
if (successCount === 0) process.exit(1);
