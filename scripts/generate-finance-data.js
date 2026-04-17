#!/usr/bin/env node
/**
 * generate-finance-data.js
 * Reads vault/finance/balances.md + vault/finance/{YYYY-MM}/transactions.md
 * Outputs src/assets/data/finance.json for the dashboard finance tab.
 *
 * Usage:
 *   node scripts/generate-finance-data.js
 */

const fs = require('fs');
const path = require('path');

const SHADOW_ROOT = path.resolve(__dirname, '..', '..');
const FINANCE_DIR = path.join(SHADOW_ROOT, 'vault', 'finance');
const BALANCES_FILE = path.join(FINANCE_DIR, 'balances.md');
const OUTPUT = path.join(__dirname, '..', 'src', 'assets', 'data', 'finance.json');

// ── Merchant → category remap ────────────────────────────────────────────────

const MERCHANT_MAP = {
  'anytime fitness': 'fitness',
  'sprouts': 'food',
  'starbucks': 'food',
  'pickle factory': 'food',
  'village pickle': 'food',
  'bamboo garden': 'food',
  'raising cane': 'food',
  'old south smokehouse': 'food',
  'instacart': 'food',
  'ic instacart': 'food',
  'chewy': 'pet',
  'laz parking': 'transport',
  'uber': 'transport',
  'baltimore gas': 'utilities',
  'friendship wine': 'food',
  'dollar tree': 'shopping',
  'best buy': 'shopping',
  'amazon': 'shopping',
  'apple': 'shopping',
};

// ── Balance parsing ──────────────────────────────────────────────────────────

function parseBalances(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn('balances.md not found at', filePath);
    return { lastUpdated: null, balances: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Extract "Last updated:" timestamp
  let lastUpdated = null;
  for (const line of lines) {
    const match = line.match(/^Last updated:\s*(.+)$/i);
    if (match) {
      lastUpdated = match[1].trim();
      break;
    }
  }

  // Parse markdown table
  const balances = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('| Institution')) { inTable = true; continue; }
    if (trimmed.startsWith('|---')) { continue; }
    if (!inTable || !trimmed.startsWith('|')) { if (inTable && trimmed !== '') break; continue; }

    const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 5) continue;

    const [institution, account, type, currentRaw, availableRaw] = cols;

    const current = parseAmount(currentRaw);
    const available = availableRaw === '—' || availableRaw === '-' ? null : parseAmount(availableRaw);

    balances.push({
      institution: institution.trim(),
      displayName: buildDisplayName(account.trim(), type.trim()),
      type: type.trim().toLowerCase(),
      current,
      available,
    });
  }

  return { lastUpdated, balances };
}

function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,]/g, '').trim();
  if (cleaned === '—' || cleaned === '-' || cleaned === '') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function buildDisplayName(account, type) {
  const typeLower = type.toLowerCase();

  // Extract last 4 digits from account name
  const digitMatch = account.match(/(\d{4})\s*$/);
  const last4 = digitMatch ? digitMatch[1] : null;

  if (typeLower === 'checking' && last4) {
    return `Checking (...${last4})`;
  }
  if (typeLower === 'savings' && last4) {
    return `Savings (...${last4})`;
  }
  if (typeLower === 'credit card') {
    // Clean up account name: title-case each word
    const cleaned = account
      .replace(/\s+Card$/i, '')   // remove trailing "Card"
      .replace(/\s+\d{4}$/, '')   // remove trailing digits
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    return cleaned;
  }

  return account;
}

// ── Transaction parsing ──────────────────────────────────────────────────────

function findTransactionFiles() {
  // Manually glob: read all subdirectories of vault/finance/
  const entries = fs.readdirSync(FINANCE_DIR, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const txFile = path.join(FINANCE_DIR, entry.name, 'transactions.md');
      if (fs.existsSync(txFile)) {
        files.push(txFile);
      }
    }
  }

  return files.sort();
}

function parseTransactionFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const transactions = [];

  const txPattern = /^(\d{4}-\d{2}-\d{2})\s*\|\s*\$?([\d,.]+)\s*\|\s*([^|]+)\s*\|\s*(.+)$/;

  for (const line of lines) {
    const match = line.trim().match(txPattern);
    if (!match) continue;

    const [, date, amountRaw, categoryRaw, descriptionRaw] = match;
    const amount = parseFloat(amountRaw.replace(/,/g, ''));
    const category = categoryRaw.trim().toLowerCase();
    const description = descriptionRaw.trim();

    // Remap category if "other"
    const finalCategory = remapCategory(category, description);

    transactions.push({
      date,
      amount: isNaN(amount) ? 0 : amount,
      category: finalCategory,
      description,
    });
  }

  return transactions;
}

function remapCategory(category, description) {
  if (category !== 'other') return category;

  const descLower = description.toLowerCase();
  for (const [merchant, mappedCategory] of Object.entries(MERCHANT_MAP)) {
    if (descLower.includes(merchant)) {
      return mappedCategory;
    }
  }

  return category;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Parse balances
  const { lastUpdated, balances } = parseBalances(BALANCES_FILE);

  // Parse all transactions
  const txFiles = findTransactionFiles();
  let allTransactions = [];

  for (const file of txFiles) {
    const txns = parseTransactionFile(file);
    allTransactions = allTransactions.concat(txns);
  }

  // Sort by date descending
  allTransactions.sort((a, b) => b.date.localeCompare(a.date));

  // Count remapped categories
  const categoryCount = {};
  for (const tx of allTransactions) {
    categoryCount[tx.category] = (categoryCount[tx.category] || 0) + 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    lastUpdated,
    balances,
    transactions: allTransactions,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  const totalBalance = balances.reduce((sum, b) => sum + (b.current || 0), 0);
  console.log(`Generated finance.json: ${balances.length} accounts, ${allTransactions.length} transactions`);
  console.log(`  Last updated: ${lastUpdated || 'unknown'}`);
  console.log(`  Accounts: ${balances.map(b => b.displayName).join(', ')}`);
  console.log(`  Total balance: $${totalBalance.toFixed(2)}`);
  console.log(`  Transaction files: ${txFiles.length} months`);
  console.log(`  Categories: ${Object.entries(categoryCount).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  console.log(`  Output: ${OUTPUT}`);
}

main();
