#!/usr/bin/env node
/**
 * generate-jobs-data.js
 * Reads vault/projects/job-hunt/digest/queue.md + daily digest markdown
 * Outputs src/assets/data/jobs.json for the dashboard jobs tab.
 *
 * Usage:
 *   node scripts/generate-jobs-data.js
 *   node scripts/generate-jobs-data.js --liked-json   # prints the applier feed (queued + liked rows) as JSON, no file writes
 */

const fs = require('fs');
const path = require('path');

const { requireVault, dataDir } = require('./lib/shadow-paths');

const VAULT       = requireVault('generate-jobs-data');
const DIGEST_DIR  = path.join(VAULT, 'projects', 'job-hunt', 'digest');
const QUEUE_FILE  = path.join(DIGEST_DIR, 'queue.md');
const OUTPUT      = path.join(dataDir(), 'jobs.json');

// ── Queue parser ──────────────────────────────────────────────────────────────

function parseQueue(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[jobs] queue.md not found — emitting empty recs (${filePath})`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines   = content.split('\n');
  const rows    = [];
  let pastHeader = false;
  let lineNum    = 0;

  for (const line of lines) {
    lineNum++;
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Header row contains the column names
    if (trimmed.startsWith('|') && /\|\s*id\s*\|/.test(trimmed)) {
      pastHeader = true;
      continue;
    }

    // Separator row (|---|)
    if (/^\|[-| ]+\|$/.test(trimmed)) continue;

    if (!pastHeader || !trimmed.startsWith('|')) continue;

    // Valid data row: split on '|' yields exactly 14 parts (leading/trailing empty)
    const parts = trimmed.split('|');
    if (parts.length !== 14) {
      console.warn(`[jobs] Skipping malformed row at line ${lineNum}: expected 14 pipe-parts, got ${parts.length}`);
      continue;
    }

    // parts[0] and parts[13] are the empty strings surrounding the outer pipes
    const [, id, date, company, role, url, source, salary_text, lane, scoreRaw, status, location, days_office] = parts;

    const score = Number(scoreRaw.trim());
    if (isNaN(score)) {
      console.warn(`[jobs] Skipping row at line ${lineNum}: non-numeric score "${scoreRaw.trim()}"`);
      continue;
    }

    rows.push({
      id:         id.trim(),
      date:       date.trim(),
      company:    company.trim(),
      role:       role.trim(),
      url:        url.trim(),
      source:     source.trim(),
      salaryText: salary_text.trim(),
      lane:       lane.trim(),
      score,
      status:     status.trim(),
      location:   location.trim(),
      daysOffice: days_office.trim(),
    });
  }

  return rows;
}

// ── Digest parser ─────────────────────────────────────────────────────────────

function parseFitBullets(digestDate, url) {
  const digestFile = path.join(DIGEST_DIR, `${digestDate}.md`);

  if (!fs.existsSync(digestFile)) {
    console.warn(`[jobs] Digest file not found for ${digestDate} — fitBullets = [] (url: ${url})`);
    return [];
  }

  const content = fs.readFileSync(digestFile, 'utf-8');
  const lines   = content.split('\n');

  // Find the **URL:** line matching this rec's url
  let urlLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === `**URL:** ${url}`) {
      urlLineIndex = i;
      break;
    }
  }

  if (urlLineIndex === -1) {
    console.warn(`[jobs] URL not matched in digest ${digestDate}: ${url} — fitBullets = []`);
    return [];
  }

  // Scan forward for **Fit:** then collect '- ' bullets
  const bullets = [];
  let inFit = false;
  for (let i = urlLineIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === '**Fit:**') {
      inFit = true;
      continue;
    }

    if (inFit) {
      // Stop at next bold field or section heading
      if (trimmed.startsWith('**') || trimmed.startsWith('##')) break;
      if (trimmed.startsWith('- ')) bullets.push(trimmed.slice(2));
    }
  }

  return bullets;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const rows = parseQueue(QUEUE_FILE);

  // --liked-json mode: print the applier feed (queued + liked rows) as JSON to stdout, no file writes.
  // Flag name kept for compat with job-apply-runner.sh; 'queued' = scan auto lane, 'liked' = 👍 promote.
  if (process.argv.includes('--liked-json')) {
    const liked = rows
      .filter(r => r.status === 'liked' || r.status === 'queued')
      .map(r => ({ id: r.id, url: r.url, company: r.company, role: r.role, lane: r.lane }));
    console.log(JSON.stringify(liked));
    return;
  }

  // Display order: queued (auto-applying) first, then manual leads, then top legacy pending by score. Cap 6.
  const queued  = rows.filter(r => r.status === 'queued');
  const manual  = rows.filter(r => r.status === 'manual');
  const pending = rows.filter(r => r.status === 'pending');
  const pendingByScore = [...pending]
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .slice(0, 3);
  const selected = [...queued, ...manual, ...pendingByScore].slice(0, 6);

  const recs = selected.map(row => ({
    id:         row.id,
    company:    row.company,
    role:       row.role,
    url:        row.url,
    source:     row.source,
    salaryText: row.salaryText,
    posted:     null,           // queue doesn't store posted date; dashboard tolerates null
    found:      row.date,
    lane:       row.lane,
    score:      row.score,
    fitBullets: parseFitBullets(row.date, row.url),
    status:     row.status,
    location:   row.location,
    daysOffice: row.daysOffice,
  }));

  const output = {
    generatedAt:  new Date().toISOString(),
    // "active" rows: not yet applied/killed — queued (auto lane) + manual leads + legacy pending.
    pendingCount: queued.length + manual.length + pending.length,
    recs,
  };

  try {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  } catch (err) {
    console.error(`[jobs] Fatal: cannot write output to ${OUTPUT}: ${err.message}`);
    process.exit(1);
  }

  console.log(`Generated jobs.json: ${queued.length} queued, ${manual.length} manual, ${pending.length} pending, showing ${recs.length}`);
  console.log(`  Output: ${OUTPUT}`);
}

main();
