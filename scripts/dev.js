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

function spawnLabeled(label, command, args, stdin = 'ignore') {
  const child = spawn(command, args, {
    cwd: ROOT,
    // ng serve gets the terminal's stdin so its prompts (for example the
    // "port in use" question) can be answered instead of hanging forever.
    stdio: [stdin, 'pipe', 'pipe'],
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

function argValue(flag, fallback) {
  const i = EXTRA_ARGS.indexOf(flag);
  if (i > -1 && EXTRA_ARGS[i + 1]) return EXTRA_ARGS[i + 1];
  const eq = EXTRA_ARGS.find((a) => a.startsWith(flag + '='));
  return eq ? eq.slice(flag.length + 1) : fallback;
}

const webPort = () => Number(argValue('--port', '4200'));
const webHost = () => argValue('--host', 'localhost');

// Fail fast when the web host:port is taken; otherwise ng serve waits on an
// interactive prompt. Probe the same host ng serve will bind: tailscale serve
// holds the tailscale IP on 4200, so the wildcard (--host 0.0.0.0) collides
// with it while localhost is free, and the phone is served through tailscale.
function assertPortFree(port, host) {
  return new Promise((resolve) => {
    const probe = require('net').createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

function startWeb() {
  const { command, args } = ngCommand();
  webChild = spawnLabeled('web', command, args, 'inherit');
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

(async () => {
  const port = webPort();
  const host = webHost();
  if (!(await assertPortFree(port, host))) {
    const hint = host === '0.0.0.0' || host === '::'
      ? 'tailscale serve already holds the tailscale IP on this port, so drop --host 0.0.0.0 (the phone reaches the dashboard through tailscale on localhost:4200)'
      : 'a stale ng serve in another terminal? Stop it or pass --port';
    process.stderr.write(`[dev] ${host}:${port} is already in use: ${hint}. Then run npm start again.\n`);
    process.exit(1);
  }
  startApi();
  startWeb();
})();
