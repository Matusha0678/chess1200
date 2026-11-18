#!/usr/bin/env node
/**
 * Playwright audit: opens every page, collects console errors, React warnings,
 * failed requests (excluding Supabase), and page crashes.
 *
 * Usage: node scripts/audit-pages.mjs [baseUrl]
 * Default baseUrl: http://localhost:3001
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3001';

const PAGES = [
  // Main nav pages
  '/',
  '/openings',
  '/courses',
  '/traps',
  '/plans',
  '/mistakes',
  '/threats',
  '/endgames',
  '/sac',
  '/guess-opening',
  '/play',
  '/games',
  '/repertoire',
  '/masters',
  // Demo modes
  '/sac?demo=works',
  '/sac?demo=fails',
  '/threats?demo=fork',
  '/repertoire?demo=1',
  '/play?demo=1',
  '/endgames?demo=1',
  // New pages (when available)
  '/stats?demo=1',
  '/convert?demo=1',
  '/tactics?demo=1',
  '/blind?demo=1',
];

// Supabase host — skip 4xx/5xx from here (no DB in CI)
const SUPABASE_RE = /supabase\.co|supabase\.io/;
// Known external resources we don't control
const EXTERNAL_RE = /lichess\.org|fontawesome|googleapis|gstatic/;

async function auditPage(page, url) {
  const issues = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      issues.push({ kind: 'console-error', text: msg.text() });
    } else if (msg.type() === 'warning' && (
      msg.text().includes('Warning:') || msg.text().includes('Each child') || msg.text().includes('key')
    )) {
      issues.push({ kind: 'react-warning', text: msg.text().slice(0, 200) });
    }
  });

  page.on('pageerror', err => {
    issues.push({ kind: 'page-error', text: err.message.slice(0, 300) });
  });

  page.on('requestfailed', req => {
    const u = req.url();
    if (SUPABASE_RE.test(u) || EXTERNAL_RE.test(u)) return;
    issues.push({ kind: 'request-failed', text: `${req.method()} ${u} — ${req.failure()?.errorText}` });
  });

  page.on('response', resp => {
    const u = resp.url();
    if (SUPABASE_RE.test(u) || EXTERNAL_RE.test(u)) return;
    if (resp.status() >= 500) {
      issues.push({ kind: 'http-500', text: `${resp.status()} ${u}` });
    }
  });

  try {
    await page.goto(`${BASE}${url}`, { timeout: 15000, waitUntil: 'networkidle' });
    await page.waitForTimeout(1000); // allow React to settle
  } catch (e) {
    issues.push({ kind: 'nav-error', text: String(e).slice(0, 200) });
  }

  return issues;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 950 } });

  let totalIssues = 0;
  const summary = [];

  for (const url of PAGES) {
    const page = await context.newPage();
    const issues = await auditPage(page, url);
    await page.close();

    if (issues.length > 0) {
      totalIssues += issues.length;
      summary.push({ url, issues });
      console.log(`\n❌ ${url} — ${issues.length} issue(s):`);
      for (const iss of issues) {
        console.log(`   [${iss.kind}] ${iss.text}`);
      }
    } else {
      console.log(`✓ ${url}`);
    }
  }

  await browser.close();

  console.log(`\n${'─'.repeat(60)}`);
  if (totalIssues === 0) {
    console.log('✅ Всё чисто — 0 ошибок на всех страницах');
  } else {
    console.log(`⚠️  Итого: ${totalIssues} ошибок на ${summary.length} страницах`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
