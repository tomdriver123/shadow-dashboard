'use strict';

/**
 * dashboard/scripts/lib/shadow-paths.js
 *
 * The one place that decides where the dashboard's inputs and outputs live,
 * so no script assumes "the vault is two directories above __dirname". The
 * dashboard can sit inside the shadow repo (legacy layout), or be a separate
 * checkout (or a symlink target, where Node resolves __dirname to the real
 * path) that finds the shadow repo through the environment. Zero dependencies.
 *
 * Resolution order for the shadow repo root (shadowRoot):
 *   1. SHADOW_ROOT, when set. It must contain a vault/ directory; an
 *      explicitly wrong value throws instead of falling back, because a typo
 *      that silently reads some other tree is worse than a loud failure.
 *   2. The legacy in-tree layout: the parent of the dashboard root.
 *   3. ~/shadow.
 *   4. null (no vault anywhere; callers decide what that means).
 *
 * Other knobs: SHADOW_VAULT_DIR overrides the vault directory itself,
 * SHADOW_DATA_DIR overrides where generated JSON is written and read.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// The dashboard repo root: this file lives at <root>/scripts/lib/.
const DASHBOARD_ROOT = path.resolve(__dirname, '..', '..');

function hasVault(dir) {
  try {
    return fs.statSync(path.join(dir, 'vault')).isDirectory();
  } catch (_err) {
    return false;
  }
}

// Cache keyed by the inputs that decide the answer, so a changed env var (as
// in the unit tests, which move SHADOW_ROOT between cases) is never served a
// stale result, while a normal process pays for the directory probes once.
// A throw is never cached.
let cache = null;

function shadowRoot() {
  const explicit = process.env.SHADOW_ROOT || '';
  const key = `${explicit}\0${DASHBOARD_ROOT}\0${os.homedir()}`;
  if (cache && cache.key === key) return cache.value;

  let value;
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!hasVault(resolved)) {
      throw new Error(`SHADOW_ROOT is set to ${resolved} but it has no vault/ directory. Fix or unset SHADOW_ROOT.`);
    }
    value = resolved;
  } else if (hasVault(path.resolve(DASHBOARD_ROOT, '..'))) {
    value = path.resolve(DASHBOARD_ROOT, '..');
  } else if (hasVault(path.join(os.homedir(), 'shadow'))) {
    value = path.join(os.homedir(), 'shadow');
  } else {
    value = null;
  }
  cache = { key, value };
  return value;
}

function vaultDir() {
  if (process.env.SHADOW_VAULT_DIR) return path.resolve(process.env.SHADOW_VAULT_DIR);
  const root = shadowRoot();
  return root ? path.join(root, 'vault') : null;
}

function dataDir() {
  if (process.env.SHADOW_DATA_DIR) return path.resolve(process.env.SHADOW_DATA_DIR);
  return path.join(DASHBOARD_ROOT, 'src', 'assets', 'data');
}

// For CLI entry points: returns the vault directory, or says so on stderr and
// exits 2. A misconfigured SHADOW_ROOT (which shadowRoot() throws on) is
// reported the same way rather than as a stack trace.
function requireVault(toolName) {
  let vault;
  try {
    vault = vaultDir();
  } catch (err) {
    process.stderr.write(`${toolName}: ${err.message}\n`);
    process.exit(2);
  }
  if (!vault) {
    process.stderr.write(`${toolName}: no vault found. Set SHADOW_ROOT (or SHADOW_VAULT_DIR), or run npm run sample.\n`);
    process.exit(2);
  }
  return vault;
}

module.exports = { DASHBOARD_ROOT, shadowRoot, vaultDir, dataDir, requireVault };
