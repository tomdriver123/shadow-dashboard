const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const g = require('../generate-game-data.js');

const REAL_VAULT = path.resolve(__dirname, '..', '..', '..', 'vault');
const FIX = path.join(__dirname, 'fixtures', 'game');

const BANKS_TABLE = `## Banks

| Bank | Track | Town |
|---|---|---|
| angular | Subject knowledge | Saffron City |
| ai-native | AI knowledge | Cerulean City |
`;
const MINI_TOWNS = `# Towns

## Party

| Slot | Track | Type | Gym town |
|---|---|---|---|
| 1 | AI judgment | Fire | Cinnabar Island |
| 2 | AI knowledge | Water | Cerulean City |
| 3 | Velocity | Electric | Vermilion City |
| 4 | DSA | Rock | Pewter City |
| 5 | Subject knowledge | Psychic | Saffron City |
| 6 | Hunt grind | Normal | Fuchsia City |

## Encounter tables

| Town | Role | Track served | Pool | Gate |
|---|---|---|---|---|
| Pallet Town | Home. Starter | none | Charmander (gift) | none |
| Viridian City | Scout town | next round's track | Pidgey | none |

${BANKS_TABLE}
## Gates

| Town | Species | Kind |
|---|---|---|
| Lavender Town | town | rejection-past-screen |

## Map

| Town | X | Y |
|---|---|---|
| Pallet Town | 3 | 14 |

## Routes

| From | To |
|---|---|
| Pallet Town | Viridian City |

## Seasons

| Season | Started | Ended |
|---|---|---|
| 1 | 2026-08-12 | |
`;

function makeVault(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-vault-'));
  const sp = path.join(dir, 'projects/game/species');
  fs.mkdirSync(sp, { recursive: true });
  for (const n of ['charmander', 'charmeleon', 'charizard']) fs.copyFileSync(path.join(REAL_VAULT, 'projects/game/species', `${n}.json`), path.join(sp, `${n}.json`));
  for (const [rel, content] of Object.entries({ 'projects/game/towns.md': MINI_TOWNS, ...files })) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return dir;
}

const BANK_ANGULAR = `---
topic: angular
---
# Angular

## Questions

### ng-001
level: senior

**Attempts**
2026-10-10 mcq A pass tier0

### ng-002
level: medium

**Attempts**
2026-08-01 mcq B pass tier0
2026-09-23 recall pass tier1

### ng-003
level: fundamentals

**Attempts**
2026-10-10 mcq C miss tier0
`;

function dexTable(rows) {
  return `---\ntitle: x\n---\n| Date | Species | Town | Question | Result |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

async function buildMini(files) {
  const vault = makeVault(files);
  const r = await g.build({ vaultDir: vault, offline: true, now: '2026-10-14T12:00:00-04:00' });
  return r.game;
}

const slotXp = (game, track) => game.party.find(p => p.track === track).xp;

// ── towns.md on the real file ────────────────────────────────────────────

test('real towns.md parses to the expected table sizes', () => {
  const T = g.parseTowns(fs.readFileSync(path.join(REAL_VAULT, 'projects/game/towns.md'), 'utf-8'));
  assert.equal(T.encounters.length, 11);
  assert.equal(T.party.length, 6);
  assert.equal(T.banks.length, 9);
  assert.equal(T.gates.length, 3);
  assert.equal(Object.keys(T.grid).length, 11);
  assert.equal(T.routes.length, 12);
  assert.equal(g.currentSeason(T.seasons).started, '2026-08-12');
});

test('tableUnder returns the first table after a heading', () => {
  const rows = g.tableUnder('## A\n\ntext\n\n| X | Y |\n|---|---|\n| 1 | 2 |\n\n## B\n\n| Z |\n|---|\n| 9 |\n', 'A');
  assert.deepEqual(rows, [{ x: '1', y: '2' }]);
  assert.deepEqual(g.tableUnder('## A\n\n## B\n| Z |\n|---|\n| 9 |\n', 'A'), []);
});

test('pool parsing strips parentheticals, flags gifts and slugs Mr. Mime', () => {
  assert.deepEqual(g.parsePool('Charmander (gift)'), [{ species: 'charmander', gift: true }]);
  const p = g.parsePool('Chansey, Tauros, Kangaskhan (Safari exclusives, so grind pays in rare catches)');
  assert.deepEqual(p.map(x => x.species), ['chansey', 'tauros', 'kangaskhan']);
  assert.equal(p.some(x => x.gift), false);
  assert.equal(g.parsePool('Abra, Drowzee, Mr. Mime')[2].species, 'mr-mime');
  assert.equal(g.displayName('mr-mime'), 'Mr. Mime');
});

test('frontmatter dates stay strings', () => {
  const { data } = g.splitFrontmatter('---\nstarted: 2026-09-30\n---\nbody');
  assert.equal(data.started, '2026-09-30');
});

// ── levels ────────────────────────────────────────────────────────────────

test('medium slow levels from the cached charmander file', () => {
  const file = path.join(REAL_VAULT, 'projects/game/species/charmander.json');
  const c = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.equal(c.levels.length, 100);
  assert.equal(g.levelFor(2535, c.levels), 16);
  assert.equal(g.levelFor(2534, c.levels), 15);
  assert.equal(g.levelFor(40007, c.levels), 36);
  assert.equal(g.levelFor(40006, c.levels), 35);
  const info = g.levelInfo(2535, c.levels);
  assert.equal(info.levelXp, 2535);
  assert.equal(info.progress, 0);
});

test('evolution chain node lookup finds pikachu under pichu', () => {
  const chain = {
    chain: {
      species: { name: 'pichu', url: 'https://pokeapi.co/api/v2/pokemon-species/172/' },
      evolves_to: [{
        species: { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon-species/25/' },
        evolution_details: [{ trigger: { name: 'level-up' }, min_level: null }],
        evolves_to: [{
          species: { name: 'raichu', url: 'https://pokeapi.co/api/v2/pokemon-species/26/' },
          evolution_details: [{ trigger: { name: 'use-item' }, min_level: null, item: { name: 'thunder-stone' } }],
          evolves_to: [],
        }],
      }],
    },
  };
  const node = g.findChainNode(chain, 'pikachu');
  assert.equal(node.species.name, 'pikachu');
  assert.deepEqual(g.evolutionsFromNode(node), [{ name: 'raichu', display: 'Raichu', dex: 26, trigger: 'use-item', minLevel: null, item: 'thunder-stone' }]);
  assert.equal(g.findChainNode(chain, 'mew'), null);
  // evolutions above dex 151 are dropped
  const n2 = { species: { name: 'x' }, evolves_to: [{ species: { name: 'pichu2', url: '.../172/' }, evolution_details: [] }] };
  assert.deepEqual(g.evolutionsFromNode(n2), []);
});

// ── XP ────────────────────────────────────────────────────────────────────

test('one senior pass at viridian pays 200 to its track and 100 to the other five', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/kb/angular.md': '---\ntopic: angular\n---\n### ng-001\nlevel: senior\n\n**Attempts**\n2026-10-10 mcq A pass tier0\n',
    'projects/game/pokedex.md': dexTable(['| 2026-10-10 | pidgey | viridian-city | ng-001 | xp |']),
  });
  assert.equal(slotXp(game, 'subject-knowledge'), 200);
  for (const t of ['ai-judgment', 'ai-knowledge', 'velocity', 'dsa', 'hunt-grind']) assert.equal(slotXp(game, t), 100);
});

test('xp tiers: medium 50, fundamentals 20, season filter drops old events', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/kb/angular.md': BANK_ANGULAR,
  });
  // ng-001 senior 100 (10-10); ng-002 medium 50 on 09-23 recall; 08-01 is before season start 08-12
  const sk = game.party.find(p => p.track === 'subject-knowledge');
  assert.equal(sk.xpBySource.question, 150);
  assert.equal(game.party.find(p => p.track === 'dsa').xp, 75);
});

test('dedup: kb-log, offline file and pokedex row for one id and date pay once', async () => {
  const files = {
    'projects/job-hunt/interview-prep/kb/angular.md': BANK_ANGULAR.replace('2026-09-23 recall pass tier1', '2026-09-23 recall miss tier1'),
    'projects/job-hunt/interview-prep/kb-log.md': '| Date | Topic | Question | Result | Next due |\n|---|---|---|---|---|\n| 2026-10-10 | angular | ng-001 OnPush | pass | none |\n',
    'projects/job-hunt/interview-prep/kb/offline/a.md': '---\nid: ng-001\nresult: pass\nanswered: 2026-10-10T21:15:00-04:00\n---\n',
    'projects/game/pokedex.md': dexTable(['| 2026-10-10 | pidgey | pewter-city | ng-001 | xp |']),
  };
  const once = await buildMini(files);
  assert.equal(once.party.find(p => p.track === 'subject-knowledge').xpBySource.question, 100);
  files['projects/game/pokedex.md'] = dexTable(['| 2026-10-10 | pidgey | viridian-city | ng-001 | xp |']);
  const doubled = await buildMini(files);
  assert.equal(doubled.party.find(p => p.track === 'subject-knowledge').xpBySource.question, 200);
});

test('unknown question id warns and pays 0', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/kb-log.md': '| Date | Topic | Question | Result | Next due |\n|---|---|---|---|---|\n| 2026-10-10 | mystery | zz-001 thing | pass | none |\n',
  });
  assert.equal(game.trainer.xpTotal, 0);
  assert.ok(game.warnings.some(w => w.includes('zz-001')));
});

test('drill and hunt xp, hunt gets no share', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/drill-log.md': '## Current position\n\n## History\n\n| Date | Problem | Pattern | Mode | Score | Result | Next due |\n|---|---|---|---|---|---|---|\n| 2026-10-01 | A | p | guided | **PASS** | ok | 2026-10-05 |\n| 2026-10-02 | B | p | guided | 3/5 | x | 2026-10-05 |\n| 2026-10-03 | C | p | guided | 1/5 | x | 2026-10-05 |\n| 2026-10-04 | D | p | guided | no pass | x | 2026-10-05 |\n\n## Other\n| 2026-10-05 | E | p | guided | PASS | x | y |\n',
    'projects/job-hunt/applications.md': '| Date | Company | Role | Source | Resume variant | Status | Next action |\n|---|---|---|---|---|---|---|\n| 2026-10-10 | Acme | Dev | u | v | interview-scheduling | n |\n',
  });
  const dsa = game.party.find(p => p.track === 'dsa');
  assert.equal(dsa.xpBySource.drill, 170);
  const hunt = game.party.find(p => p.track === 'hunt-grind');
  assert.equal(hunt.xpBySource.hunt, 110);
  assert.equal(game.party.find(p => p.track === 'velocity').xpBySource.hunt, 0);
  assert.equal(game.party.find(p => p.track === 'velocity').xp, Math.floor(100 / 2) + 25 + 10);
});

test('applications parse handles both tables and skips header rows', () => {
  const md = '| date | company | role | url | resume | status | follow_up |\n|---|---|---|---|---|---|---|\n| 2026-08-31 | LD | FS | u | r | submitted | f |\n\n| Date | Company | Role | Source | Resume variant | Status | Next action |\n|---|---|---|---|---|---|---|\n| — | — | — | — | — | — | — |\n| 2026-08-24 | Nourish | Sr | u | r | assessment done | n |\n| 2026-08-25 | Tebra | Sr | u | r | Interview-scheduling | n |\n';
  const rows = g.parseApplications(md);
  assert.deepEqual(rows.map(r => [r.company, r.status]), [['LD', 'submitted'], ['Nourish', 'assessment'], ['Tebra', 'interview']]);
});

// ── gates ─────────────────────────────────────────────────────────────────

const stage = (name, type, status, date) => ({ name, type, status, date: date || null, notes: '' });

test('gates: gig offer does not open mewtwo', () => {
  const r = g.evalGate('offer-full-time', [{ company: 'initech', status: 'offer', employment: 'gig', stages: [] }]);
  assert.equal(r.open, false);
  assert.match(r.reason, /^No full-time offer yet\./);
  assert.match(r.reason, /initech's offer is a gig, which does not count\./);
  assert.equal(g.evalGate('offer-full-time', [{ company: 'X', status: 'offer', employment: 'full-time', stages: [] }]).open, true);
});

test('gates: two rounds keep moltres closed with the count', () => {
  const p = { company: 'Vandelay', status: 'rejected', employment: 'full-time', stages: [
    stage('a', 'assessment', 'passed', '2026-09-24'), stage('b', 'hiring-manager', 'done', '2026-10-07'),
    stage('c', 'recruiter-screen', 'done', '2026-09-22'), stage('d', 'system-design', 'failed') ] };
  const r = g.evalGate('third-round', [p]);
  assert.equal(r.open, false);
  assert.equal(r.reason, 'Most rounds in one loop: 2 (Vandelay). Needs 3.');
  p.stages.push(stage('e', 'technical', 'done', '2026-10-09'));
  assert.equal(g.evalGate('third-round', [p]).open, true);
});

test('gates: rejection with a done assessment opens lavender', () => {
  const p = { company: 'Hooli', status: 'rejected', employment: 'full-time', stages: [stage('Bryq assessment', 'assessment', 'done', '2026-10-09')] };
  const r = g.evalGate('rejection-past-screen', [p]);
  assert.equal(r.open, true);
  assert.match(r.reason, /Hooli/);
  assert.match(r.reason, /Bryq assessment/);
  assert.match(r.reason, /2026-10-09/);
  const closed = g.evalGate('rejection-past-screen', [{ ...p, stages: [stage('s', 'recruiter-screen', 'done', '2026-10-09')] }]);
  assert.equal(closed.open, false);
  assert.equal(closed.reason, 'No rejection past a screen yet.');
});

// ── scout ─────────────────────────────────────────────────────────────────

test('scout picks globex before its screen and acme after', () => {
  const pipes = g.parsePipelines(path.join(FIX, 'pipeline'), () => {});
  assert.equal(pipes.length, 2);
  const before = g.resolveScout(pipes, '2026-10-14T14:00:00-04:00');
  assert.equal(before.company, 'Globex');
  assert.equal(before.track, 'hunt-grind');
  const after = g.resolveScout(pipes, '2026-10-14T16:00:00-04:00');
  assert.equal(after.company, 'Acme');
  assert.equal(after.track, 'ai-knowledge');
  assert.equal(after.stageType, 'interview');
  const none = g.resolveScout([], '2026-10-14T16:00:00-04:00');
  assert.equal(none.track, 'subject-knowledge');
  assert.equal(none.reason, 'Nothing scheduled; Viridian serves subject knowledge');
});

test('stage to track mapping', () => {
  const s = (type, name, notes) => ({ type, name, notes: notes || '' });
  assert.equal(g.trackForStage(s('technical', 'x')), 'subject-knowledge');
  assert.equal(g.trackForStage(s('assessment', 'Take home')), 'velocity');
  assert.equal(g.trackForStage(s('assessment', 'Live coding')), 'dsa');
  assert.equal(g.trackForStage(s('other', 'x')), 'subject-knowledge');
});

// ── slot fill ─────────────────────────────────────────────────────────────

test('empty slots bank xp, gift charmander fills slot 1', async () => {
  const game = await buildMini({ 'projects/game/pokedex.md': dexTable(['| 2026-10-13 | charmander | pallet-town | gift | caught |']) });
  assert.equal(game.party[0].species.name, 'charmander');
  assert.equal(game.party[1].species, null);
  assert.equal(game.party[1].level, null);
  assert.equal(game.trainer.pokedex.caught, 1);
});
