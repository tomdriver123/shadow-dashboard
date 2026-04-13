#!/usr/bin/env node
/**
 * generate-habit-data.js
 * Reads vault/habits/YYYY-MM-DD.md daily logs + config + streaks
 * Outputs src/assets/data/habits.json for the dashboard habits tab.
 *
 * Usage:
 *   node scripts/generate-habit-data.js
 */

const fs = require('fs');
const path = require('path');

const SHADOW_ROOT = path.resolve(__dirname, '..', '..');
const HABITS_DIR = path.join(SHADOW_ROOT, 'vault', 'habits');
const OUTPUT = path.join(__dirname, '..', 'src', 'assets', 'data', 'habits.json');

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseValue(raw, habitId) {
  if (!raw || raw.trim() === '—') return null;
  const s = raw.trim();
  if (habitId === 'steps') {
    const n = parseInt(s.replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  if (habitId === 'sleep_duration') {
    const n = parseFloat(s.replace('h', ''));
    return isNaN(n) ? null : n;
  }
  if (habitId === 'screen_time') {
    const n = parseFloat(s.replace('m', ''));
    return isNaN(n) ? null : n;
  }
  return null;
}

function parseDailyFile(filePath) {
  const date = path.basename(filePath, '.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const habits = {};
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('| Habit')) { inTable = true; continue; }
    if (trimmed.startsWith('|---'))    { continue; }
    if (!inTable || !trimmed.startsWith('|')) { if (inTable) break; continue; }

    const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;
    const [habitId, valueRaw, , statusRaw] = cols;
    const id = habitId.trim();
    habits[id] = {
      value: parseValue(valueRaw, id),
      status: statusRaw.trim() === '—' ? null : statusRaw.trim(),
    };
  }

  return { date, habits };
}

function parseStreaks(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const streaks = {};
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('| Habit')) { inTable = true; continue; }
    if (trimmed.startsWith('|---'))    { continue; }
    if (!inTable || !trimmed.startsWith('|')) { if (inTable) break; continue; }

    const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 5) continue;
    const [id, current, best, lastHit, lastMiss] = cols;
    streaks[id.trim()] = {
      current: parseInt(current) || 0,
      best: parseInt(best) || 0,
      lastHit: lastHit.trim() === '—' ? null : lastHit.trim(),
      lastMiss: lastMiss.trim() === '—' ? null : lastMiss.trim(),
    };
  }
  return streaks;
}

// ── Config (habit definitions) ───────────────────────────────────────────────

const HABIT_CONFIG = [
  {
    id: 'steps',
    name: 'Daily Steps',
    category: 'fitness',
    target: 7500,
    unit: 'steps',
    direction: 'above',
    icon: 'walk-outline',
    color: '#10b981',
  },
  {
    id: 'sleep_duration',
    name: 'Sleep',
    category: 'sleep',
    target: 7.0,
    unit: 'hours',
    direction: 'above',
    icon: 'moon-outline',
    color: '#6366f1',
  },
  {
    id: 'screen_time',
    name: 'Screen Time',
    category: 'focus',
    target: 180,
    unit: 'minutes',
    direction: 'below',
    icon: 'phone-portrait-outline',
    color: '#f59e0b',
  },
];

// ── Format helpers ───────────────────────────────────────────────────────────

function formatValue(value, habitId) {
  if (value === null) return null;
  if (habitId === 'steps') return value.toLocaleString();
  if (habitId === 'sleep_duration') return `${value}h`;
  if (habitId === 'screen_time') return `${Math.round(value)}m`;
  return String(value);
}

function getProgress(value, target, direction) {
  if (value === null) return null;
  if (direction === 'above') {
    return Math.min(100, Math.round((value / target) * 100));
  } else {
    // below = less is better; at 0 you get 100%, at 2x target you get 0%
    return Math.max(0, Math.min(100, Math.round(((2 * target - value) / target) * 100)));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Read all dated habit files
  const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
  const files = fs.readdirSync(HABITS_DIR)
    .filter(f => datePattern.test(f))
    .sort();

  const history = files.map(f => parseDailyFile(path.join(HABITS_DIR, f)));

  // Annotate each day with progress %
  const annotatedHistory = history.map(day => {
    const annotated = { date: day.date, habits: {} };
    for (const cfg of HABIT_CONFIG) {
      const h = day.habits[cfg.id] || { value: null, status: null };
      annotated.habits[cfg.id] = {
        value: h.value,
        displayValue: formatValue(h.value, cfg.id),
        status: h.status,
        progress: getProgress(h.value, cfg.target, cfg.direction),
      };
    }
    return annotated;
  });

  const streaks = parseStreaks(path.join(HABITS_DIR, 'streaks.md'));

  // Today's date
  const today = new Date().toISOString().split('T')[0];
  const todayData = annotatedHistory.find(d => d.date === today) || null;

  // Last 30 days for calendar / charts
  const last30 = annotatedHistory.slice(-30);

  const output = {
    generatedAt: new Date().toISOString(),
    today: todayData,
    last30: last30,
    allHistory: annotatedHistory,
    streaks,
    config: HABIT_CONFIG,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  const days = annotatedHistory.length;
  console.log(`Generated habits.json: ${days} days of history`);
  console.log(`  Today: ${today} (${todayData ? 'found' : 'no data'})`);
  console.log(`  Last 30 days: ${last30.length} entries`);
  console.log(`  Output: ${OUTPUT}`);
}

main();
