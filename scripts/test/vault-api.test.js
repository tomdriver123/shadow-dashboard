'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 40000 + Math.floor(Math.random() * 10000);
const BASE = `http://127.0.0.1:${PORT}`;
const API = path.resolve(__dirname, '..', '..', 'server', 'vault-api.js');

let tmp;
let dataDir;
let pokedex;
let child;

const POKEDEX = `---
title: Pokedex
type: game-state
season: 1
seasons:
  - { number: 1, started: 2026-08-12 }
tags: [game]
---

# Pokedex

Exactly one table.

| Date | Species | Town | Question | Result |
|---|---|---|---|---|
| 2026-10-13 | charmander | pallet-town | gift | caught |
`;

function writeTowns(open) {
  fs.writeFileSync(
    path.join(dataDir, 'towns.json'),
    JSON.stringify([
      { id: 'saffron-city', name: 'Saffron City' },
      {
        id: 'cerulean-city',
        name: 'Cerulean City',
        gates: [{ scope: 'species', species: 'mewtwo', kind: 'offer-full-time', open, reason: 'x' }],
      },
    ])
  );
}

function post(body, route = '/api/game/encounter') {
  return fetch(BASE + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const quiz = (id, result, extra = {}) => ({
  questionId: id,
  topic: 'ng',
  pick: result === 'pass' ? 'A' : 'B',
  answer: 'A',
  result,
  answered: '2026-10-14T10:00:00-04:00',
  town: 'saffron-city',
  species: 'abra',
  ...extra,
});

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-api-test-'));
  const vault = path.join(tmp, 'vault');
  dataDir = path.join(tmp, 'data');
  pokedex = path.join(vault, 'projects', 'game', 'pokedex.md');
  fs.mkdirSync(path.dirname(pokedex), { recursive: true });
  fs.writeFileSync(pokedex, POKEDEX);
  fs.mkdirSync(path.join(vault, 'projects', 'job-hunt', 'interview-prep', 'kb', 'offline'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'feedback'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  writeTowns(false);

  child = spawn(process.execPath, [API], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: { ...process.env, VAULT_API_PORT: String(PORT), SHADOW_VAULT_DIR: vault, SHADOW_DATA_DIR: dataDir },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('vault-api did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  if (child) child.kill();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

const rowCount = () =>
  fs.readFileSync(pokedex, 'utf8').split('\n').filter((l) => /^\| \d{4}-/.test(l)).length;

test('health reports the isolated game paths', async () => {
  const body = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(body.pokedexFile, pokedex);
  assert.ok(body.gameDir.startsWith(tmp));
});

test('first pass on abra is caught and writes the offline file', async () => {
  const r = await post(quiz('ng-101', 'pass'));
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.deepEqual(body.row, {
    date: '2026-10-14', species: 'abra', town: 'saffron-city', question: 'ng-101', result: 'caught',
  });
  const file = path.join(tmp, 'vault', 'projects', 'job-hunt', 'interview-prep', 'kb', 'offline', 'ng-101.md');
  assert.equal(
    fs.readFileSync(file, 'utf8'),
    '---\nid: ng-101\nquestion: ng-101\ntopic: ng\npick: A\nanswer: A\nresult: pass\nanswered: 2026-10-14T10:00:00-04:00\nsource: dashboard\n---\n'
  );
});

test('second pass on abra is xp', async () => {
  const r = await post(quiz('ng-102', 'pass'));
  assert.equal(r.status, 201);
  assert.equal((await r.json()).row.result, 'xp');
});

test('a miss is fled', async () => {
  const r = await post(quiz('ng-103', 'miss'));
  assert.equal(r.status, 201);
  assert.equal((await r.json()).row.result, 'fled');
});

test('repeating ng-101 returns 200 with the same row and adds nothing', async () => {
  const before = rowCount();
  const r = await post(quiz('ng-101', 'pass'));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).row.result, 'caught');
  assert.equal(rowCount(), before);
});

test('null questionId with the gate closed is 400', async () => {
  const r = await post({
    questionId: null, topic: null, pick: null, answer: null, result: null,
    answered: '2026-10-14T11:00:00-04:00', town: 'cerulean-city', species: 'mewtwo',
  });
  assert.equal(r.status, 400);
});

test('free catch with the gate open is 201 then 200', async () => {
  writeTowns(true);
  const body = {
    questionId: null, topic: null, pick: null, answer: null, result: null,
    answered: '2026-10-14T11:00:00-04:00', town: 'cerulean-city', species: 'mewtwo',
  };
  const first = await post(body);
  assert.equal(first.status, 201);
  assert.deepEqual((await first.json()).row, {
    date: '2026-10-14', species: 'mewtwo', town: 'cerulean-city', question: 'free', result: 'caught',
  });
  const before = rowCount();
  const second = await post(body);
  assert.equal(second.status, 200);
  assert.equal(rowCount(), before);
});

test('unknown town is 404', async () => {
  const r = await post(quiz('ng-104', 'pass', { town: 'nowhere-town' }));
  assert.equal(r.status, 404);
});

test('malformed bodies and a Z timestamp are 400', async () => {
  assert.equal((await post('{nope')).status, 400);
  assert.equal((await post('[]')).status, 400);
  assert.equal((await post(quiz('ng-105', 'pass', { species: 'Abra!' }))).status, 400);
  assert.equal((await post(quiz('ng-106', 'pass', { answered: '2026-10-14T10:00:00Z' }))).status, 400);
  assert.equal((await post(quiz('BAD', 'pass'))).status, 400);
});

test('legacy quiz route still works', async () => {
  const r = await post(
    { questionId: 'ng-107', topic: 'ng', pick: 'A', answer: 'A', result: 'pass', answered: '2026-10-14T10:00:00-04:00' },
    '/api/quiz/attempt'
  );
  assert.equal(r.status, 201);
});

test('pokedex stays one clean table', () => {
  const text = fs.readFileSync(pokedex, 'utf8');
  assert.ok(text.endsWith('|\n') && !text.endsWith('\n\n'));
  const lines = text.split('\n');
  const headers = lines.filter((l) => l.startsWith('| Date |'));
  assert.equal(headers.length, 1);
  const start = lines.indexOf(headers[0]);
  const tableLines = [];
  for (let i = start; i < lines.length && lines[i] !== ''; i++) tableLines.push(lines[i]);
  assert.equal(tableLines.length, 2 + 5); // header, separator, gift + 4 encounters
  assert.equal(rowCount(), 5);
  assert.ok(lines.slice(start + tableLines.length).every((l) => l === ''));
});
