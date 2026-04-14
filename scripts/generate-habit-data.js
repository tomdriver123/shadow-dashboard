#!/usr/bin/env node
/**
 * generate-habit-data.js
 * Reads vault/habits/YYYY-MM-DD.md daily logs + streaks
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

// ── Habit config ─────────────────────────────────────────────────────────────

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
    maxPoints: 25,
  },
  {
    id: 'sleep_duration',
    name: 'Sleep',
    category: 'sleep',
    target: 6.0,           // streak hit = 6+ hours
    unit: 'hours',
    direction: 'above',
    icon: 'moon-outline',
    color: '#6366f1',
    maxPoints: 8,
  },
  {
    id: 'sleep_timing',
    name: 'Bedtime',
    category: 'sleep',
    target: 300,           // streak hit = before 2 AM (300 min after 9 PM)
    unit: 'minutes-after-9pm',
    direction: 'below',
    icon: 'bed-outline',
    color: '#8b5cf6',
    maxPoints: 6,
  },
  {
    id: 'wake_timing',
    name: 'Wake Time',
    category: 'sleep',
    target: 540,           // streak hit = before 9 AM (540 min after midnight)
    unit: 'minutes-after-midnight',
    direction: 'below',
    icon: 'sunny-outline',
    color: '#f59e0b',
    maxPoints: 6,
  },
  {
    id: 'gym_time',
    name: 'Gym Time',
    category: 'fitness',
    target: 60,            // streak hit = 60+ min
    unit: 'minutes',
    direction: 'above',
    icon: 'barbell-outline',
    color: '#ef4444',
    maxPoints: 15,
  },
  {
    id: 'social_media',
    name: 'Social Media',
    category: 'focus',
    target: 120,
    unit: 'minutes',
    direction: 'below',
    icon: 'logo-tiktok',
    color: '#ec4899',
    maxPoints: 15,
  },
];

const TOTAL_MAX_POINTS = HABIT_CONFIG.reduce((sum, h) => sum + h.maxPoints, 0); // 75

// ── Points calculation ────────────────────────────────────────────────────────

function calcPoints(value, habitId) {
  if (value === null || value === undefined) return 0;
  switch (habitId) {
    case 'steps':
      return Math.min(25, value / 1000);
    case 'sleep_duration':
      return Math.min(8, value);
    case 'sleep_timing':
      // minutes after 9 PM; 10 PM (60) = 6pts, 3 AM (360) = 0pts
      return Math.min(6, Math.max(0, (360 - value) / 50));
    case 'wake_timing':
      // minutes after midnight; 6 AM (360) = 6pts, 11 AM (660) = 0pts
      return Math.max(0, Math.min(6, (660 - value) / 50));
    case 'gym_time':
      return Math.min(15, value / 10);
    case 'social_media':
      return Math.max(0, (300 - value) / 20);
    default:
      return 0;
  }
}

// ── Value parsers ─────────────────────────────────────────────────────────────

function clockToMinutesAfterMidnight(s) {
  // Parses "7:30 AM", "11:45 PM", "12:00 AM" etc → minutes after midnight
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'AM' && hour === 12) hour = 0;
  else if (ampm === 'PM' && hour !== 12) hour += 12;
  return hour * 60 + min;
}

function parseValue(raw, habitId) {
  if (!raw || raw.trim() === '—') return null;
  const s = raw.trim();
  switch (habitId) {
    case 'steps': {
      const n = parseInt(s.replace(/,/g, ''), 10);
      return isNaN(n) ? null : n;
    }
    case 'sleep_duration': {
      const n = parseFloat(s.replace('h', ''));
      return isNaN(n) ? null : n;
    }
    case 'sleep_timing': {
      // Stored as clock time (e.g. "11:30 PM") → minutes after 9 PM
      const minAfterMidnight = clockToMinutesAfterMidnight(s);
      if (minAfterMidnight === null) return null;
      // Convert to minutes after 9 PM (21:00 = 1260 min after midnight)
      let diff = minAfterMidnight - 21 * 60;
      if (diff < 0) diff += 24 * 60; // wrap for early AM times
      return diff;
    }
    case 'wake_timing': {
      // Stored as clock time (e.g. "7:30 AM") → minutes after midnight
      return clockToMinutesAfterMidnight(s);
    }
    case 'gym_time': {
      const n = parseFloat(s.replace('m', ''));
      return isNaN(n) ? null : n;
    }
    case 'social_media': {
      const n = parseFloat(s.replace('m', ''));
      return isNaN(n) ? null : n;
    }
    default:
      return null;
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────

function minutesAfterMidnightToClock(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  let displayHour, ampm;
  if (h === 0) { displayHour = 12; ampm = 'AM'; }
  else if (h < 12) { displayHour = h; ampm = 'AM'; }
  else if (h === 12) { displayHour = 12; ampm = 'PM'; }
  else { displayHour = h - 12; ampm = 'PM'; }
  return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatValue(value, habitId) {
  if (value === null || value === undefined) return null;
  switch (habitId) {
    case 'steps': return value.toLocaleString();
    case 'sleep_duration': return `${value}h`;
    case 'sleep_timing': {
      const minFromMidnight = (21 * 60 + value) % (24 * 60);
      return minutesAfterMidnightToClock(minFromMidnight);
    }
    case 'wake_timing':
      return minutesAfterMidnightToClock(value);
    case 'gym_time': return `${Math.round(value)}m`;
    case 'social_media': return `${Math.round(value)}m`;
    default: return String(value);
  }
}

function getProgress(value, target, direction) {
  if (value === null || value === undefined) return null;
  if (direction === 'above') {
    return Math.min(100, Math.round((value / target) * 100));
  } else {
    return Math.max(0, Math.min(100, Math.round(((2 * target - value) / target) * 100)));
  }
}

// ── File parsers ──────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
  const files = fs.readdirSync(HABITS_DIR)
    .filter(f => datePattern.test(f))
    .sort();

  const history = files.map(f => parseDailyFile(path.join(HABITS_DIR, f)));

  // Annotate each day with per-habit values, progress, and points
  const annotatedHistory = history.map(day => {
    const annotated = { date: day.date, habits: {}, points: {}, totalPoints: 0 };

    for (const cfg of HABIT_CONFIG) {
      const h = day.habits[cfg.id] || { value: null, status: null };
      const pts = Math.round(calcPoints(h.value, cfg.id) * 10) / 10;
      annotated.habits[cfg.id] = {
        value: h.value,
        displayValue: formatValue(h.value, cfg.id),
        status: h.status,
        progress: getProgress(h.value, cfg.target, cfg.direction),
        points: pts,
      };
      annotated.points[cfg.id] = pts;
      annotated.totalPoints += pts;
    }
    annotated.totalPoints = Math.round(annotated.totalPoints * 10) / 10;
    annotated.pointsProgress = Math.round((annotated.totalPoints / TOTAL_MAX_POINTS) * 100);

    return annotated;
  });

  const streaks = parseStreaks(path.join(HABITS_DIR, 'streaks.md'));

  const today = new Date().toISOString().split('T')[0];

  // For past days: null status → 'miss' (everything is auto-tracked now)
  // Today stays null — data may still be syncing
  for (const day of annotatedHistory) {
    if (day.date >= today) continue;
    for (const cfg of HABIT_CONFIG) {
      const entry = day.habits[cfg.id];
      if (entry && entry.status === null) {
        entry.status = 'miss';
      }
    }
  }

  const todayData = annotatedHistory.find(d => d.date === today) || null;
  const last30 = annotatedHistory.slice(-30);

  // Daily points series for line graph
  const pointsSeries = annotatedHistory.map(d => ({
    date: d.date,
    totalPoints: d.totalPoints,
    pointsProgress: d.pointsProgress,
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    totalMaxPoints: TOTAL_MAX_POINTS,
    today: todayData,
    last30,
    allHistory: annotatedHistory,
    pointsSeries,
    streaks,
    config: HABIT_CONFIG,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  const days = annotatedHistory.length;
  console.log(`Generated habits.json: ${days} days of history`);
  console.log(`  Today: ${today} (${todayData ? `${todayData.totalPoints}/${TOTAL_MAX_POINTS} pts` : 'no data'})`);
  console.log(`  Last 30 days: ${last30.length} entries`);
  console.log(`  Total max points: ${TOTAL_MAX_POINTS}`);
  console.log(`  Habits: ${HABIT_CONFIG.map(h => h.id).join(', ')}`);
  console.log(`  Output: ${OUTPUT}`);
}

main();
