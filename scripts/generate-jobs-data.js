#!/usr/bin/env node
/**
 * generate-jobs-data.js
 * Reads vault/projects/job-hunt/digest/queue.md + daily digest markdown
 * Outputs src/assets/data/jobs.json for the dashboard jobs tab.
 *
 * Usage:
 *   node scripts/generate-jobs-data.js
 */

const fs = require('fs');
const path = require('path');

const SHADOW_ROOT = path.resolve(__dirname, '..', '..');
const DIGEST_DIR  = path.join(SHADOW_ROOT, 'vault', 'projects', 'job-hunt', 'digest');
const QUEUE_FILE  = path.join(DIGEST_DIR, 'queue.md');
const OUTPUT      = path.join(__dirname, '..', 'src', 'assets', 'data', 'jobs.json');

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

    // Valid data row: split on '|' yields exactly 12 parts (leading/trailing empty)
    const parts = trimmed.split('|');
    if (parts.length !== 12) {
      console.warn(`[jobs] Skipping malformed row at line ${lineNum}: expected 12 pipe-parts, got ${parts.length}`);
      continue;
    }

    // parts[0] and parts[11] are the empty strings surrounding the outer pipes
    const [, id, date, company, role, url, source, salary_text, lane, scoreRaw, status] = parts;

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

  // Pending rows sorted by date ascending; take the last 3 (newest 3 pending).
  // slice(-3) of an ascending sort gives oldest-first among the newest 3.
  const pending  = rows.filter(r => r.status === 'pending');
  const sorted   = [...pending].sort((a, b) => a.date.localeCompare(b.date));
  const selected = sorted.slice(-3);

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
  }));

  const output = {
    generatedAt:  new Date().toISOString(),
    pendingCount: pending.length,
    recs,
  };

  try {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  } catch (err) {
    console.error(`[jobs] Fatal: cannot write output to ${OUTPUT}: ${err.message}`);
    process.exit(1);
  }

  console.log(`Generated jobs.json: ${pending.length} pending, showing ${recs.length}`);
  console.log(`  Output: ${OUTPUT}`);
}

main();
