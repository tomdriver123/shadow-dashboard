#!/usr/bin/env node
'use strict';

/**
 * dashboard/scripts/refresh.js
 *
 * The one place that knows how to refresh a dashboard data target. Launchd
 * wrappers, the vault API and a person at a terminal all call this file
 * instead of each reinventing "how to regenerate finance.json" or "how to
 * run the Plaid sync." Zero dependencies on purpose, in the spirit of
 * dev.js and vault-api.js: this is core Node only, so there is no
 * devDependency, no lockfile churn, and no registry hit just to shell out
 * to a handful of scripts in order.
 *
 * A target is a named unit of work (finance, habits, career, jobs, brain,
 * agents) made of one or more steps. A step is a single child process
 * (a Python sync script or a `generate-*-data.js` file) run with
 * `execFile`, never a shell, so there is no quoting to get wrong. Steps
 * marked optional can fail without failing the target; their tail goes
 * into warnings instead of error. Every step failure is caught here and
 * turned into a StepResult; nothing a step does ever throws back out of
 * runStep, so one broken sync never stops the rest of a run.
 *
 * `all` runs every target in ORDER and writes each target's result to
 * dashboard/src/assets/data/refresh.json as soon as that target finishes,
 * so a long run publishes progress instead of going dark until the end.
 * That file is the offline fallback the dashboard reads when the local
 * API is not running.
 *
 * A lockfile per target under os.tmpdir()/shadow-refresh stops two runs
 * of the same target from overlapping (a manual CLI run colliding with
 * launchd, for example). A lock older than fifteen minutes, or one whose
 * pid is no longer alive, is treated as abandoned and cleared.
 *
 * CLI:
 *   node refresh.js <target> [--sync] [--no-sync] [--person tom|sabrina] [--json]
 *
 * Exit codes: 0 the target's non optional steps all passed, 1 at least
 * one did not (the JSON result, if requested, is still printed first),
 * 2 the target is missing or unrecognized (usage goes to stderr), 3 the
 * target (or `all`) is already running elsewhere.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const { shadowRoot, vaultDir, dataDir, requireVault } = require('./lib/shadow-paths');

const execFileAsync = promisify(execFile);

// ── paths and constants ───────────────────────────────────────────────────

// Refreshing needs a vault, so a missing or misconfigured one stops the CLI
// here with a clear message (exit 2). This module is also required by tests
// and tools that only want the exports, so the check is a no-op unless this
// file is the entry point.
const VAULT = require.main === module ? requireVault('refresh') : vaultDir();
// The shadow repo root: python steps run from here and find vault/ beneath
// it. With only SHADOW_VAULT_DIR set it is the directory above that vault.
const ROOT = shadowRoot() || (VAULT ? path.dirname(VAULT) : null);
const DATA_DIR = dataDir();
const STATE_FILE = path.join(DATA_DIR, 'refresh.json');
const LOCK_DIR = path.join(os.tmpdir(), 'shadow-refresh');

// ROOT is null only when this file is required (not run) on a machine with no
// vault; runRefresh() refuses to start in that case, so these never get used.
const PLAID_DIR = path.join(ROOT || '', 'vault', 'tools', 'plaid');
const PLAID_PY = path.join(PLAID_DIR, '.venv', 'bin', 'python');
const PY311 = '/usr/local/bin/python3.11';
const HABITS_PY = path.join(ROOT || '', 'vault', 'habits', 'sync-habits.py');
const NODE = process.execPath;

// launchd runs with a minimal PATH, so a step needs somewhere to fall back
// to when process.env.PATH is empty (as it is under launchd, unlike an
// interactive shell). The directory of the running node always leads, so a
// child that shells out to `node` gets the same node as this process.
// SHADOW_EXTRA_PATH (a PATH style list) replaces the default ~/.local/bin
// entry and, when set, is also appended to a PATH that was passed in.
function childPath() {
  const nodeDir = path.dirname(process.execPath);
  const extra = (process.env.SHADOW_EXTRA_PATH || path.join(os.homedir(), '.local', 'bin')).split(path.delimiter);
  const system = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const base = process.env.PATH ? process.env.PATH.split(path.delimiter) : [...extra, ...system];
  const dirs = process.env.SHADOW_EXTRA_PATH ? [...base, ...extra] : base;
  return [...new Set([nodeDir, ...dirs.filter(Boolean)])].join(path.delimiter);
}

// Children get the same SHADOW_ROOT this process resolved, so a generator can
// never disagree with the orchestrator about where the vault is.
function childEnv() {
  const env = { ...process.env, PATH: childPath() };
  if (ROOT) env.SHADOW_ROOT = ROOT;
  return env;
}

const STALE_LOCK_MS = 15 * 60 * 1000;
const TAIL_CHARS = 500;
const PERSONS = ['tom', 'sabrina'];

function gen(name) {
  return path.join(__dirname, `generate-${name}-data.js`);
}

// ── target table ───────────────────────────────────────────────────────────
// Each target is a label plus a function from run options to a step list,
// so the same table can build "just the generator" or "sync then generate"
// depending on whether --sync was passed.

const TARGETS = {
  finance: {
    label: 'Finance',
    steps: (o) => [
      ...(o.sync
        ? [{ name: 'plaid sync', cmd: PLAID_PY, args: [path.join(PLAID_DIR, 'sync.py')], cwd: PLAID_DIR, timeoutMs: 120000, optional: true }]
        : []),
      { name: 'generate finance.json', cmd: NODE, args: [gen('finance')], cwd: ROOT, timeoutMs: 60000 },
    ],
  },
  habits: {
    label: 'Habits',
    steps: (o) => [
      ...(o.sync
        ? [
            { name: 'habits today', cmd: PY311, args: [HABITS_PY], cwd: ROOT, timeoutMs: 120000, optional: true },
            { name: 'habits backfill', cmd: PY311, args: [HABITS_PY, '--backfill', '7'], cwd: ROOT, timeoutMs: 180000, optional: true },
            { name: 'habits streaks', cmd: PY311, args: [HABITS_PY, '--streaks'], cwd: ROOT, timeoutMs: 120000, optional: true },
          ]
        : []),
      { name: 'generate habits.json', cmd: NODE, args: [gen('habit')], cwd: ROOT, timeoutMs: 60000 },
    ],
  },
  career: {
    label: 'Career',
    steps: (o) => [
      { name: 'generate career.json', cmd: NODE, args: [gen('career'), ...(o.person ? ['--person', o.person] : [])], cwd: ROOT, timeoutMs: 120000 },
    ],
  },
  game: {
    label: 'Game',
    steps: () => [{ name: 'generate game.json', cmd: NODE, args: [gen('game'), '--offline'], cwd: ROOT, timeoutMs: 120000 }],
  },
  jobs: {
    label: 'Job hunt',
    steps: () => [{ name: 'generate jobs.json', cmd: NODE, args: [gen('jobs')], cwd: ROOT, timeoutMs: 60000 }],
  },
  brain: {
    label: 'Brain',
    steps: () => [{ name: 'generate brain.json', cmd: NODE, args: [gen('brain')], cwd: ROOT, timeoutMs: 60000 }],
  },
  agents: {
    label: 'Agents',
    steps: () => [{ name: 'generate agents.json', cmd: NODE, args: [gen('agent')], cwd: ROOT, timeoutMs: 60000, optional: true }],
  },
};

const ORDER = ['finance', 'habits', 'career', 'game', 'jobs', 'brain', 'agents'];
const TARGET_NAMES = [...ORDER, 'all'];

// ── step execution ───────────────────────────────────────────────────────

// Last TAIL_CHARS characters of stderr, or stdout when stderr is empty,
// with runs of whitespace (including newlines) collapsed to one space so a
// tail always prints as a single line.
function computeTail(stdout, stderr) {
  const source = stderr && stderr.trim() ? stderr : stdout || '';
  return source.replace(/\s+/g, ' ').trim().slice(-TAIL_CHARS);
}

// Runs one step and always resolves to a StepResult, win or lose. Nothing a
// child process does (bad exit code, timeout, missing binary) ever rejects
// this promise; the caller does not need a try/catch around runStep.
async function runStep(step) {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(step.cmd, step.args, {
      cwd: step.cwd,
      timeout: step.timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: childEnv(),
    });
    return { name: step.name, ok: true, ms: Date.now() - start, optional: !!step.optional, tail: computeTail(stdout, stderr) };
  } catch (err) {
    const ms = Date.now() - start;
    // execFile's timeout option kills the child and marks the error
    // `killed`; nothing else in this file sends a signal, so that flag
    // means the timeout fired, not that the output should be trusted.
    const tail = err && err.killed
      ? `timed out after ${Math.round(step.timeoutMs / 1000)}s`
      : computeTail(err && err.stdout, err && err.stderr);
    return { name: step.name, ok: false, ms, optional: !!step.optional, tail };
  }
}

// ── locking ────────────────────────────────────────────────────────────────

function lockPath(target) {
  return path.join(LOCK_DIR, `${target}.lock`);
}

// A lock is stale (safe to clear) once it is older than STALE_LOCK_MS, or
// once its recorded pid no longer exists. A lock file that cannot be read
// or parsed is treated as stale too, since a lock we cannot make sense of
// cannot be trusted to represent a live run.
function isLockStale(info) {
  if (!info || typeof info.pid !== 'number' || typeof info.startedAt !== 'string') return true;
  const started = Date.parse(info.startedAt);
  if (Number.isNaN(started) || Date.now() - started > STALE_LOCK_MS) return true;
  try {
    process.kill(info.pid, 0);
    return false;
  } catch (err) {
    return err.code === 'ESRCH';
  }
}

function readLockInfo(lp) {
  try {
    return JSON.parse(fs.readFileSync(lp, 'utf8'));
  } catch (_err) {
    return null;
  }
}

// Acquires the lock for `target`, or throws an Error with `code: 'ELOCKED'`
// when it is genuinely held. On a collision the lock is read once; if it
// looks abandoned it is unlinked and acquisition is retried exactly once
// more, otherwise this throws straight away.
function acquireLock(target) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const lp = lockPath(target);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(lp, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      fs.closeSync(fd);
      return lp;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (attempt === 1) break; // the one retry is already spent
      if (!isLockStale(readLockInfo(lp))) break;
      try {
        fs.unlinkSync(lp);
      } catch (_unlinkErr) {
        // another process cleared it first; the retry below will settle it
      }
    }
  }
  const lockedErr = new Error(`target "${target}" is already being refreshed (lock: ${lp})`);
  lockedErr.code = 'ELOCKED';
  throw lockedErr;
}

function releaseLock(lp) {
  try {
    fs.unlinkSync(lp);
  } catch (_err) {
    // already gone; releasing a lock that vanished is not an error
  }
}

// ── state file (refresh.json) ─────────────────────────────────────────────

function atomicWriteJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

// Reads refresh.json, tolerating a missing file, a corrupt file, or one
// that does not look like a state object, by falling back to an empty
// shell in every case.
function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.targets && typeof parsed.targets === 'object') {
      return parsed;
    }
  } catch (_err) {
    // missing or corrupt; the empty shell below is the tolerant fallback
  }
  return { generatedAt: null, targets: {} };
}

// Merges `patch` (one or more { targetName: TargetResult } entries) into
// the persisted state and writes it back atomically. Called once per
// target immediately after that target finishes, so a long `all` run
// publishes progress instead of writing once at the very end.
function mergeState(patch) {
  const state = readState();
  Object.assign(state.targets, patch);
  state.generatedAt = new Date().toISOString();
  atomicWriteJson(STATE_FILE, state);
  return state;
}

// ── running a target ───────────────────────────────────────────────────────

// Runs every step of one target under its lock and returns a TargetResult.
// `ok` is true only when every non optional step passed; a failed optional
// step is recorded in `warnings` and does not affect `ok` or `error`.
async function runTarget(name, opts) {
  const def = TARGETS[name];
  if (!def) throw new Error(`unknown target: ${name}`);

  const startedAt = new Date();
  const t0 = Date.now();
  const lockFile = acquireLock(name);
  const steps = [];
  const warnings = [];
  let error = null;
  try {
    for (const stepDef of def.steps(opts)) {
      const result = await runStep(stepDef);
      steps.push(result);
      if (!result.ok) {
        if (result.optional) {
          warnings.push(`${result.name}: ${result.tail}`);
        } else if (error === null) {
          error = `${result.name}: ${result.tail}`;
        }
      }
    }
  } finally {
    releaseLock(lockFile);
  }

  const targetResult = {
    lastRun: startedAt.toISOString(),
    ok: error === null,
    durationMs: Date.now() - t0,
    error,
    warnings,
    synced: !!opts.sync,
    steps,
  };
  if (name === 'career' && opts.person) targetResult.person = opts.person;
  return targetResult;
}

// Runs `target` (one of ORDER, or 'all') and returns a RefreshResult.
// `all` takes the `all` lock for the whole run, then each target's own
// lock in turn as runTarget is called for it; releasing the `all` lock in
// `finally` means a failure partway through still frees it for next time.
async function runRefresh(target, options = {}) {
  if (options.person !== undefined && !PERSONS.includes(options.person)) {
    throw new Error(`invalid person: ${options.person}`);
  }
  const opts = { sync: !!options.sync, person: options.person };
  if (!ROOT) throw new Error('no vault found. Set SHADOW_ROOT (or SHADOW_VAULT_DIR).');

  if (target === 'all') {
    const allLock = acquireLock('all');
    try {
      const targets = {};
      let ok = true;
      for (const name of ORDER) {
        const targetOpts = name === 'career' ? opts : { sync: opts.sync };
        const targetResult = await runTarget(name, targetOpts);
        targets[name] = targetResult;
        mergeState({ [name]: targetResult });
        if (!targetResult.ok) ok = false;
      }
      return { ok, target: 'all', targets };
    } finally {
      releaseLock(allLock);
    }
  }

  if (!TARGETS[target]) throw new Error(`unknown target: ${target}`);
  const targetResult = await runTarget(target, opts);
  mergeState({ [target]: targetResult });
  return { ok: targetResult.ok, target, targets: { [target]: targetResult } };
}

// ── CLI ──────────────────────────────────────────────────────────────────

function printUsage(stream) {
  stream.write('Usage: node refresh.js <target> [--sync] [--no-sync] [--person tom|sabrina] [--json]\n');
  stream.write(`  target: ${TARGET_NAMES.join(', ')}\n`);
}

function parseArgs(argv) {
  const target = argv[0];
  const options = { sync: false, person: undefined, json: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--sync') {
      options.sync = true;
    } else if (arg === '--no-sync') {
      options.sync = false;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--person') {
      const val = argv[i + 1];
      if (val === undefined) throw new Error('--person requires a value (tom or sabrina)');
      options.person = val;
      i += 1;
    } else {
      throw new Error(`unrecognized argument: ${arg}`);
    }
  }
  return { target, options };
}

// Renders one step as "  ok    name (123ms)" or "  FAIL  name (123ms) tail",
// with the status column padded to six characters either way.
function formatStepLine(step) {
  const status = (step.ok ? 'ok' : 'FAIL').padEnd(6);
  let line = `  ${status}${step.name} (${step.ms}ms)`;
  if (!step.ok && step.tail) line += ` ${step.tail}`;
  return line;
}

function printHuman(result, out) {
  for (const [name, targetResult] of Object.entries(result.targets)) {
    const label = (TARGETS[name] && TARGETS[name].label) || name;
    out.write(`${label}\n`);
    for (const step of targetResult.steps) out.write(`${formatStepLine(step)}\n`);
    for (const warning of targetResult.warnings) out.write(`  warn  ${warning}\n`);
  }
  out.write(`refresh ${result.target}: ${result.ok ? 'ok' : 'FAILED'}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printUsage(process.stderr);
    process.exitCode = 2;
    return;
  }

  let target;
  let options;
  try {
    ({ target, options } = parseArgs(argv));
  } catch (err) {
    process.stderr.write(`refresh: ${err.message}\n`);
    printUsage(process.stderr);
    process.exitCode = 2;
    return;
  }

  if (!TARGET_NAMES.includes(target)) {
    printUsage(process.stderr);
    process.exitCode = 2;
    return;
  }
  if (options.person !== undefined && !PERSONS.includes(options.person)) {
    process.stderr.write(`refresh: --person must be one of ${PERSONS.join(', ')}\n`);
    printUsage(process.stderr);
    process.exitCode = 2;
    return;
  }

  const out = options.json ? process.stderr : process.stdout;

  let result;
  try {
    result = await runRefresh(target, { sync: options.sync, person: options.person });
  } catch (err) {
    if (err && err.code === 'ELOCKED') {
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ ok: false, target, error: err.message, code: 'ELOCKED' })}\n`);
      } else {
        process.stderr.write(`refresh: ${err.message}\n`);
      }
      process.exitCode = 3;
      return;
    }
    process.stderr.write(`refresh: ${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  printHuman(result, out);
  if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`refresh: unexpected error: ${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { runRefresh, TARGET_NAMES, STATE_FILE, readState };
