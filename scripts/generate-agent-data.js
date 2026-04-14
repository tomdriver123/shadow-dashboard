#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const SHADOW_ROOT = path.resolve(__dirname, '..', '..');
const OPENCLAW_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const OUTPUT = path.join(__dirname, '..', 'src', 'assets', 'data', 'agents.json');
const AVATARS_DIR = path.join(__dirname, '..', 'src', 'assets', 'images', 'avatars');
const AGENT_META_PATH = path.join(__dirname, 'agent-meta.json');

const COLORS = {
  shadow: '#6366f1',
  void: '#a855f7',
  dexter: '#f59e0b',
  forge: '#ef4444',
  bonnie: '#06b6d4',
  glitch: '#10b981',
  lens: '#3b82f6',
  tweak: '#f97316',
  beam: '#eab308',
  surge: '#dc2626',
  flow: '#8b5cf6',
  link: '#14b8a6',
  vital: '#22c55e',
  mint: '#84cc16',
  steve: '#6366f1',
  cosmo: '#ec4899',
  drive: '#f43f5e',
};

function extractRole(agentsmdPath) {
  try {
    const content = fs.readFileSync(agentsmdPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('**')) {
        let sentence = trimmed.split(/\.\s/)[0];
        sentence = sentence.replace(/^You are \w+[\s,—–-]+\s*/i, '');
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
        return sentence.endsWith('.') ? sentence : sentence + '.';
      }
    }
  } catch {
    // file doesn't exist
  }
  return 'Agent';
}

function findAvatar(agentId) {
  const extensions = ['png', 'jpg', 'jpeg', 'webp'];
  for (const ext of extensions) {
    const avatarPath = path.join(AVATARS_DIR, `${agentId}.${ext}`);
    if (fs.existsSync(avatarPath)) {
      return `assets/images/avatars/${agentId}.${ext}`;
    }
  }
  return undefined;
}

function main() {
  let openclawConfig;
  try {
    openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf-8'));
  } catch (err) {
    console.error('Could not read openclaw config:', err.message);
    process.exit(1);
  }

  const agentList = openclawConfig.agents?.list || [];
  const defaults = openclawConfig.agents?.defaults || {};

  let agentMeta = {};
  try {
    agentMeta = JSON.parse(fs.readFileSync(AGENT_META_PATH, 'utf-8'));
  } catch { /* no meta file */ }

  const agents = agentList.map(agent => {
    const id = agent.id;
    const meta = agentMeta[id] || {};
    const name = agent.name || agent.id;
    const model = meta.model || (agent.model || defaults.model || 'unknown').replace('anthropic/', '');
    const heartbeat = meta.heartbeat || agent.heartbeat?.every || defaults.heartbeat?.every || 'off';

    // Find AGENTS.md - shadow's is in vault/, others in agents/{id}/
    let agentsMdPath;
    if (id === 'shadow') {
      agentsMdPath = path.join(SHADOW_ROOT, 'vault', 'AGENTS.md');
    } else {
      agentsMdPath = path.join(SHADOW_ROOT, 'agents', id, 'AGENTS.md');
    }

    // Use role from config identity if available, otherwise extract from AGENTS.md
    const role = meta.role || extractRole(agentsMdPath);
    const workspace = agent.workspace || defaults.workspace || '';
    const color = meta.color || COLORS[id] || '#6b7280';
    const status = meta.status || 'active';
    const animal = meta.animal || undefined;
    const imageUrl = meta.imageUrl || findAvatar(id);

    if (status === 'archived') return null;

    const result = {
      id,
      name,
      role,
      model,
      heartbeat,
      workspace,
      status,
      color,
    };

    if (animal) result.animal = animal;
    if (imageUrl) result.imageUrl = imageUrl;

    return result;
  }).filter(Boolean);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(agents, null, 2));
  console.log(`Generated ${agents.length} agents -> ${OUTPUT}`);

  // Summary
  const active = agents.filter(a => a.status === 'active').length;
  const paused = agents.filter(a => a.status === 'paused').length;
  const planned = agents.filter(a => a.status === 'planned').length;
  const withAvatars = agents.filter(a => a.imageUrl).length;
  console.log(`  Active: ${active} | Paused: ${paused} | Planned: ${planned} | Avatars: ${withAvatars}`);
}

main();
