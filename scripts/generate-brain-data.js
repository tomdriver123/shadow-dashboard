#!/usr/bin/env node
/**
 * generate-brain-data.js
 * Parses vault/brain/insights.md, connections.md, research-queue.md
 * Outputs src/assets/data/brain.json for the dashboard brain tab.
 *
 * Usage:
 *   node scripts/generate-brain-data.js
 */

const fs = require('fs');
const path = require('path');

const { requireVault, dataDir } = require('./lib/shadow-paths');

const VAULT = requireVault('generate-brain-data');
const OUTPUT = path.join(dataDir(), 'brain.json');

// ── Priority helpers ─────────────────────────────────────────────────────────

const PRIORITY_EMOJI = { 5: '🔴', 4: '🟠', 3: '🟡', 2: '🔵', 1: '⚪' };
const PRIORITY_COLOR = {
  5: '#ef4444',
  4: '#f97316',
  3: '#eab308',
  2: '#3b82f6',
  1: '#6b7280',
};

function extractPriority(text) {
  const m = text.match(/PRIORITY\s+(\d)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ── Research Queue parser ────────────────────────────────────────────────────

function parseQueue(filePath) {
  if (!fs.existsSync(filePath)) return { pending: 0, inProgress: 0, done: 0, total: 0, items: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const items = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('| Priority')) { inTable = true; continue; }
    if (trimmed.startsWith('|---')) continue;
    if (!inTable || !trimmed.startsWith('|')) { if (inTable && trimmed && !trimmed.startsWith('|')) break; continue; }

    const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 6) continue;
    const [priority, status, topic, goal, addedBy, dateAdded] = cols;
    items.push({
      priority: parseInt(priority) || 0,
      status: status.toUpperCase(),
      topic,
      goal,
      addedBy,
      dateAdded,
    });
  }

  const pending = items.filter(i => i.status === 'PENDING').length;
  const inProgress = items.filter(i => i.status === 'IN_PROGRESS').length;
  const done = items.filter(i => i.status === 'DONE').length;

  return { pending, inProgress, done, total: items.length, items };
}

// ── Insights parser ──────────────────────────────────────────────────────────

function parseInsights(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const insights = [];
  let idCounter = 0;

  // Split on ## headings to get domain sections
  const sections = content.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const domainRaw = lines[0].trim();
    // Skip YAML frontmatter artifacts and meta sections
    if (domainRaw.startsWith('---') || domainRaw.toLowerCase().includes('cross-domain')) continue;

    const domain = domainRaw.replace(/^#+\s*/, '').trim();
    const sectionBody = lines.slice(1).join('\n');

    // Check if this section contains ### sub-sections (structured insights)
    if (sectionBody.includes('\n### ')) {
      // Split on ### to get individual structured insights
      const entries = sectionBody.split(/^### /m).filter(s => s.trim());
      for (const entry of entries) {
        const entryLines = entry.split('\n');
        const titleLine = entryLines[0].trim()
          .replace(/\*+/g, '')
          .replace(/^#+\s*/, '')
          .trim();

        const priority = extractPriority(titleLine);
        const emojiMatch = titleLine.match(/^([🔴🟠🟡🔵⚪])/u);
        const priorityEmoji = emojiMatch ? emojiMatch[1] : (priority ? PRIORITY_EMOJI[priority] : '⚪');

        // Clean title — strip priority prefix
        const title = titleLine
          .replace(/^[🔴🟠🟡🔵⚪]\s*/u, '')
          .replace(/^PRIORITY\s+\d+:\s*/i, '')
          .trim();

        if (!title) continue;

        const body = entryLines.slice(1).join('\n').trim();

        // Extract goal tag
        const goalMatch = body.match(/\*\*Goal:\*\*\s*([^\n]+)/);
        const goalTag = goalMatch ? goalMatch[1].trim() : null;

        // Extract pattern
        const patternMatch = body.match(/\*\*Pattern:\*\*\s*([\s\S]*?)(?=\n\*\*|\n---|$)/);
        const pattern = patternMatch ? patternMatch[1].trim() : null;

        // Extract actionable
        const actionableMatch = body.match(/\*\*Actionable:\*\*\s*([\s\S]*?)(?=\n\*\*|\n---|$)/);
        const actionable = actionableMatch ? actionableMatch[1].trim() : null;

        insights.push({
          id: `insight-${++idCounter}`,
          domain: normalizeDomain(domain),
          title,
          priority: priority || 1,
          priorityEmoji,
          priorityColor: PRIORITY_COLOR[priority] || PRIORITY_COLOR[1],
          goalTag,
          pattern,
          actionable,
          content: body,
          type: 'structured',
        });
      }
    } else {
      // Forge-style synthesis entries — simpler format
      // These look like "## Topic — Date" sections with numbered findings
      const dateMatch = domain.match(/—\s*(\d{4}-\d{2}-\d{2})$/);
      const date = dateMatch ? dateMatch[1] : null;
      const title = domain.replace(/\s*—\s*\d{4}-\d{2}-\d{2}$/, '').trim();

      if (!title || title.length < 4) continue;

      // Extract goal/actionability line
      const goalLineMatch = sectionBody.match(/\*\*Goal:\*\*\s*([^|]+)/);
      const actionabilityMatch = sectionBody.match(/\*\*Actionability:\*\*\s*(\w+)/);
      const goalTag = goalLineMatch ? goalLineMatch[1].trim() : null;
      const actionability = actionabilityMatch ? actionabilityMatch[1].trim() : null;

      // Extract numbered findings (1. **Finding** — detail)
      const findings = [];
      const findingPattern = /^\d+\.\s+\*\*([^*]+)\*\*\s*[—–-]\s*(.+)$/gm;
      let m;
      while ((m = findingPattern.exec(sectionBody)) !== null) {
        findings.push({ headline: m[1].trim(), detail: m[2].trim() });
      }

      // Also try simpler numbered list format
      if (!findings.length) {
        const simplePattern = /^\d+\.\s+(.+)$/gm;
        while ((m = simplePattern.exec(sectionBody)) !== null) {
          findings.push({ headline: m[1].trim(), detail: '' });
        }
      }

      const domainGuess = guessDomain(goalTag, title);

      insights.push({
        id: `insight-${++idCounter}`,
        domain: domainGuess,
        title,
        priority: actionability === 'High' ? 3 : actionability === 'Medium' ? 2 : 1,
        priorityEmoji: PRIORITY_EMOJI[actionability === 'High' ? 3 : 2],
        priorityColor: PRIORITY_COLOR[actionability === 'High' ? 3 : 2],
        goalTag,
        actionability,
        date,
        findings,
        content: sectionBody.trim(),
        type: 'synthesis',
      });
    }
  }

  // Sort: structured first (by priority desc), then synthesis
  insights.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'structured' ? -1 : 1;
    return (b.priority || 0) - (a.priority || 0);
  });

  return insights;
}

function normalizeDomain(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('finance')) return 'Finance';
  if (lower.includes('health')) return 'Health';
  if (lower.includes('technical') || lower.includes('career')) return 'Career';
  if (lower.includes('shadow') || lower.includes('knowledge')) return 'Shadow';
  return 'Other';
}

function guessDomain(goalTag, title) {
  const combined = `${goalTag || ''} ${title}`.toLowerCase();
  if (combined.includes('financial') || combined.includes('finance') || combined.includes('salary') || combined.includes('budget') || combined.includes('wedding') || combined.includes('consulting') || combined.includes('income') || combined.includes('podcast') || combined.includes('freelance') || combined.includes('grant')) return 'Finance';
  if (combined.includes('health') || combined.includes('sleep') || combined.includes('exercise') || combined.includes('activity') || combined.includes('neat') || combined.includes('sedentary') || combined.includes('weekend warrior')) return 'Health';
  if (combined.includes('technical') || combined.includes('career') || combined.includes('hiring') || combined.includes('agentic') || combined.includes('engineer') || combined.includes('negotiation')) return 'Career';
  if (combined.includes('shadow') || combined.includes('build shadow') || combined.includes('photo') || combined.includes('vault') || combined.includes('prompt') || combined.includes('claude')) return 'Shadow';
  return 'Other';
}

// ── Connections parser ───────────────────────────────────────────────────────

function parseConnections(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const connections = [];
  let idCounter = 0;

  const sections = content.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const lines = section.split('\n');
    const titleRaw = lines[0].trim();
    if (titleRaw.startsWith('---') || titleRaw.toLowerCase().includes('data connections') || titleRaw.toLowerCase().includes('sources available')) continue;

    const title = titleRaw.replace(/^#+\s*/, '').trim();
    const body = lines.slice(1).join('\n').trim();

    // Skip empty sections
    if (!body || body === '_None yet._' || body.startsWith('_None')) continue;
    if (!title || title.length < 3) continue;

    const sourcesMatch = body.match(/\*\*Sources:\*\*\s*([^\n]+)/);
    const patternMatch = body.match(/\*\*Pattern:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/);
    const goalMatch = body.match(/\*\*Goal:\*\*\s*([^\n]+)/);

    const pattern = patternMatch ? patternMatch[1].trim() : body;
    const goalTag = goalMatch ? goalMatch[1].trim() : null;

    // Extract domain tags from title (e.g., "Health ↔ Finance")
    const domainParts = title.split(/[↔×]/u).map(p => p.trim().split(/[^a-zA-Z]/)[0]).filter(Boolean);

    connections.push({
      id: `connection-${++idCounter}`,
      title,
      domains: domainParts,
      sources: sourcesMatch ? sourcesMatch[1].trim() : null,
      pattern: pattern.replace(/\*\*Goal:\*\*.*$/s, '').trim(),
      goalTag,
    });
  }

  return connections;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const queue = parseQueue(path.join(VAULT, 'brain', 'research-queue.md'));
  const insights = parseInsights(path.join(VAULT, 'brain', 'insights.md'));
  const connections = parseConnections(path.join(VAULT, 'brain', 'connections.md'));

  const output = {
    generatedAt: new Date().toISOString(),
    queue,
    insights,
    connections,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  console.log(`Generated brain.json`);
  console.log(`  Queue: ${queue.pending} PENDING | ${queue.inProgress} IN_PROGRESS | ${queue.done} DONE`);
  console.log(`  Insights: ${insights.length} total`);
  console.log(`    ${insights.filter(i => i.type === 'structured').length} structured | ${insights.filter(i => i.type === 'synthesis').length} synthesis`);
  console.log(`    Domains: ${[...new Set(insights.map(i => i.domain))].join(', ')}`);
  console.log(`  Connections: ${connections.length} cross-domain patterns`);
  console.log(`  Output: ${OUTPUT}`);
}

main();
