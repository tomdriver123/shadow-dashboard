#!/usr/bin/env node
'use strict';

/**
 * dashboard/scripts/dev.js
 *
 * Runs the dashboard the way `npm start` means it: the feedback API
 * (server/feedback-api.js) and `ng serve` together, so "if localhost is
 * up, the API is up" holds. Zero dependencies on purpose, to avoid a
 * devDependency, lockfile churn and a registry hit just to run two
 * processes side by side.
 *
 * If the API dies it is restarted a few times with a short pause; if it
 * never comes back, `ng serve` keeps running (the Feedback page has an
 * offline mode for exactly this, saving entries on the device). If
 * `ng serve` dies, the API is stopped and this process exits with the
 * same code, since there is nothing left to serve.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXTRA_ARGS = process.argv.slice(2);
const MAX_API_RESTARTS = 3;
const RESTART_DELAY_MS = 2000;

let apiChild = null;
let webChild = null;
let apiRestarts = 0;
let shuttingDown = false;

function prefixed(stream, label, out) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) out.write(`[${label}] ${line}\n`);
  });
  stream.on('end', () => {
    if (buffer.length) out.write(`[${label}] ${buffer}\n`);
    buffer = '';
  });
}

function spawnLabeled(label, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  prefixed(child.stdout, label, process.stdout);
  prefixed(child.stderr, label, process.stderr);
  return child;
}

function ngCommand() {
  const localBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'ng.cmd' : 'ng');
  if (fs.existsSync(localBin)) {
    return { command: localBin, args: ['serve', ...EXTRA_ARGS] };
  }
  return { command: 'npx', args: ['ng', 'serve', ...EXTRA_ARGS] };
}

function startApi() {
  apiChild = spawnLabeled('api', process.execPath, [path.join(ROOT, 'server', 'feedback-api.js')]);
  apiChild.on('exit', (code, signal) => {
    apiChild = null;
    if (shuttingDown) return;
    process.stdout.write(`[dev] api exited (code=${code}, signal=${signal})\n`);
    if (apiRestarts >= MAX_API_RESTARTS) {
      process.stdout.write('[dev] api gave up after 3 restarts, ng serve keeps running (offline mode)\n');
      return;
    }
    apiRestarts += 1;
    process.stdout.write(`[dev] restarting api in 2s (attempt ${apiRestarts}/${MAX_API_RESTARTS})\n`);
    setTimeout(() => {
      if (!shuttingDown) startApi();
    }, RESTART_DELAY_MS);
  });
}

function startWeb() {
  const { command, args } = ngCommand();
  webChild = spawnLabeled('web', command, args);
  webChild.on('exit', (code, signal) => {
    webChild = null;
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`[dev] ng serve exited (code=${code}, signal=${signal}), stopping api\n`);
    if (apiChild) apiChild.kill();
    process.exit(code === null ? 1 : code);
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`[dev] received ${signal}, stopping api and web\n`);
  if (apiChild) apiChild.kill(signal);
  if (webChild) webChild.kill(signal);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startApi();
startWeb();
