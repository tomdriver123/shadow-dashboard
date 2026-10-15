'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HELPER_SRC = path.resolve(__dirname, '..', 'lib', 'shadow-paths.js');
const ENV_KEYS = ['SHADOW_ROOT', 'SHADOW_VAULT_DIR', 'SHADOW_DATA_DIR', 'HOME'];

// Every case runs against temp dirs only, with the path-related env vars
// saved, cleared and restored, so neither the developer's real vault nor a
// shell that exports SHADOW_ROOT can change the outcome. HOME is pointed at
// an empty temp dir so the ~/shadow fallback cannot find the real checkout.
function sandbox(fn) {
  return () => {
    const saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    // realpath: on macOS os.tmpdir() sits behind a /var -> /private/var symlink and
    // Node reports the real path as __dirname for a required module.
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-paths-')));
    const home = path.join(tmp, 'home');
    fs.mkdirSync(home);
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.HOME = home;
    try {
      fn(tmp, home);
    } finally {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

// Copies the helper into <base>/dashboard/scripts/lib so its DASHBOARD_ROOT
// is <base>/dashboard, i.e. a layout we control, and loads that copy fresh.
function loadHelperAt(base) {
  const libDir = path.join(base, 'dashboard', 'scripts', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  const copy = path.join(libDir, 'shadow-paths.js');
  fs.copyFileSync(HELPER_SRC, copy);
  return require(copy);
}

function makeRoot(dir) {
  fs.mkdirSync(path.join(dir, 'vault'), { recursive: true });
  return dir;
}

test('SHADOW_ROOT wins over the in-tree layout and ~/shadow', sandbox((tmp, home) => {
  makeRoot(path.join(tmp, 'layout')); // in-tree candidate (parent of dashboard/)
  makeRoot(path.join(home, 'shadow')); // ~/shadow candidate
  const explicit = makeRoot(path.join(tmp, 'explicit'));
  const h = loadHelperAt(path.join(tmp, 'layout'));
  process.env.SHADOW_ROOT = explicit;
  assert.equal(h.shadowRoot(), explicit);
  assert.equal(h.vaultDir(), path.join(explicit, 'vault'));
}));

test('SHADOW_VAULT_DIR and SHADOW_DATA_DIR override the derived paths', sandbox((tmp) => {
  const root = makeRoot(path.join(tmp, 'layout'));
  const h = loadHelperAt(root);
  assert.equal(h.vaultDir(), path.join(root, 'vault'));
  assert.equal(h.dataDir(), path.join(root, 'dashboard', 'src', 'assets', 'data'));
  process.env.SHADOW_VAULT_DIR = path.join(tmp, 'other-vault');
  process.env.SHADOW_DATA_DIR = path.join(tmp, 'other-data');
  assert.equal(h.vaultDir(), path.join(tmp, 'other-vault'));
  assert.equal(h.dataDir(), path.join(tmp, 'other-data'));
}));

test('an explicit SHADOW_ROOT without vault/ throws and never falls back', sandbox((tmp) => {
  const root = makeRoot(path.join(tmp, 'layout')); // a valid in-tree fallback exists on purpose
  const h = loadHelperAt(root);
  const bad = path.join(tmp, 'no-vault-here');
  fs.mkdirSync(bad);
  process.env.SHADOW_ROOT = bad;
  assert.throws(() => h.shadowRoot(), /SHADOW_ROOT is set to .* no vault\//);
  assert.throws(() => h.vaultDir(), /SHADOW_ROOT/);
  process.env.SHADOW_ROOT = path.join(tmp, 'does-not-exist');
  assert.throws(() => h.shadowRoot(), /SHADOW_ROOT/);
}));

test('legacy in-tree layout resolves with no env', sandbox((tmp) => {
  const root = makeRoot(path.join(tmp, 'layout'));
  const h = loadHelperAt(root);
  assert.equal(h.DASHBOARD_ROOT, path.join(root, 'dashboard'));
  assert.equal(h.shadowRoot(), root);
  assert.equal(h.vaultDir(), path.join(root, 'vault'));
}));

test('~/shadow is the next fallback when the dashboard sits outside the repo', sandbox((tmp, home) => {
  const elsewhere = path.join(tmp, 'standalone'); // no vault/ above the dashboard
  fs.mkdirSync(elsewhere);
  makeRoot(path.join(home, 'shadow'));
  const h = loadHelperAt(elsewhere);
  assert.equal(h.shadowRoot(), path.join(home, 'shadow'));
}));

test('null when nothing matches, and requireVault exits 2 with the hint', sandbox((tmp) => {
  const elsewhere = path.join(tmp, 'standalone');
  fs.mkdirSync(elsewhere);
  const h = loadHelperAt(elsewhere);
  assert.equal(h.shadowRoot(), null);
  assert.equal(h.vaultDir(), null);

  const realExit = process.exit;
  const realWrite = process.stderr.write;
  let code = null;
  let stderr = '';
  process.exit = (c) => { code = c; throw new Error('exit called'); };
  process.stderr.write = (chunk) => { stderr += chunk; return true; };
  try {
    assert.throws(() => h.requireVault('unit-tool'), /exit called/);
  } finally {
    process.exit = realExit;
    process.stderr.write = realWrite;
  }
  assert.equal(code, 2);
  assert.equal(stderr, 'unit-tool: no vault found. Set SHADOW_ROOT (or SHADOW_VAULT_DIR), or run npm run sample.\n');
}));

test('requireVault returns the vault when one resolves', sandbox((tmp) => {
  const root = makeRoot(path.join(tmp, 'layout'));
  const h = loadHelperAt(root);
  assert.equal(h.requireVault('unit-tool'), path.join(root, 'vault'));
}));

test('the result is cached per environment, not served stale after SHADOW_ROOT changes', sandbox((tmp) => {
  const root = makeRoot(path.join(tmp, 'layout'));
  const h = loadHelperAt(root);
  assert.equal(h.shadowRoot(), root);
  const other = makeRoot(path.join(tmp, 'other'));
  process.env.SHADOW_ROOT = other;
  assert.equal(h.shadowRoot(), other);
  delete process.env.SHADOW_ROOT;
  assert.equal(h.shadowRoot(), root);
}));
