#!/usr/bin/env node

/**
 * scan-agility.mjs — AgilityConnect (Agility Partners) daily scanner
 *
 * AgilityConnect is a React SPA with no public JSON API and stale Google
 * indexing, so the standard scan.mjs can't see it. This scanner:
 *   1. Pulls the public sitemap.xml (zero-token, fresh source of truth)
 *   2. Filters job URLs to those modified within --days (default 14)
 *   3. Uses Playwright to render each page and read the actual job title
 *   4. Applies portals.yml title_filter + location_filter
 *   5. Dedups against scan-history.tsv, applications.md, pipeline.md
 *   6. Appends matches to pipeline.md "Pendientes"
 *
 * Usage:
 *   node scan-agility.mjs                 # default: last 14 days
 *   node scan-agility.mjs --days 7        # last 7 days only
 *   node scan-agility.mjs --dry-run       # preview, write nothing
 *   node scan-agility.mjs --max 30        # cap browser fetches
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

const SITEMAP_URL = 'https://agilityconnect.io/sitemap.xml';
const PORTAL_NAME = 'AgilityConnect';
const COMPANY_NAME = 'Agility Partners';
const PAGE_TIMEOUT_MS = 15_000;
const NETWORK_IDLE_MS = 1500;

mkdirSync('data', { recursive: true });

// ── Sitemap ─────────────────────────────────────────────────────────

async function fetchSitemap() {
  const res = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 career-ops-scanner' },
  });
  if (!res.ok) throw new Error(`Sitemap fetch failed: HTTP ${res.status}`);
  return await res.text();
}

function parseSitemap(xml) {
  const entries = [];
  const re = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1].trim();
    const lastmod = m[2]?.trim() || null;
    if (/\/jobs\/\d+\/?$/.test(url)) {
      entries.push({ url, lastmod });
    }
  }
  return entries;
}

// ── Filters (shared shape with scan.mjs) ────────────────────────────

function buildTitleFilter(tf) {
  const positive = (tf?.positive || []).map(k => k.toLowerCase());
  const negative = (tf?.negative || []).map(k => k.toLowerCase());
  return (title) => {
    const lower = (title || '').toLowerCase();
    const hasPos = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNeg = negative.some(k => lower.includes(k));
    return hasPos && !hasNeg;
  };
}

function buildLocationFilter(lf) {
  if (!lf || !lf.require_us) return () => true;
  const exclude = (lf.exclude || []).map(k => k.toLowerCase());
  return (location) => {
    if (!location) return true;
    const lower = location.toLowerCase();
    return !exclude.some(k => lower.includes(k));
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    for (const m of readFileSync(PIPELINE_PATH, 'utf-8').matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }
  if (existsSync(APPLICATIONS_PATH)) {
    for (const m of readFileSync(APPLICATIONS_PATH, 'utf-8').matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }
  return seen;
}

// ── Playwright extraction ───────────────────────────────────────────

async function extractTitleAndLocation(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    // Wait for SPA to render — try multiple signals
    try {
      await page.waitForSelector('h1, h2, [class*="title"], [class*="Title"]', { timeout: NETWORK_IDLE_MS });
    } catch { /* fall through to body scrape */ }

    const data = await page.evaluate(() => {
      const grab = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim() : '';
      };
      // Prefer most-prominent heading
      const title = grab('h1') || grab('h2') || grab('[class*="job-title"]') || grab('[class*="JobTitle"]');
      // Location often follows the title in a small element
      const bodyText = document.body.innerText.slice(0, 3000);
      // Heuristic: capture lines that look like locations (contain "," + state OR "Remote")
      const locMatch = bodyText.match(/(?:Location|Onsite|Hybrid|Remote)[^\n]{0,100}/i)
        || bodyText.match(/\b[A-Z][a-zA-Z]+,\s+[A-Z]{2}\b/);
      return { title, location: locMatch ? locMatch[0] : '' };
    });
    return data;
  } finally {
    await page.close();
    await ctx.close();
  }
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  // Append under both Spanish and English markers — normalize-pipeline.mjs
  // collapses to English afterward, so we just need to land somewhere parseable.
  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  let marker = '## Pending';
  let idx = text.indexOf(marker);
  if (idx === -1) {
    marker = '## Pendientes';
    idx = text.indexOf(marker);
  }
  if (idx === -1) {
    const procIdx = Math.max(text.indexOf('## Processed'), text.indexOf('## Procesadas'));
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `## Pending\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const next = text.indexOf('\n## ', afterMarker);
    const insertAt = next === -1 ? text.length : next;
    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(rows, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = rows.map(r =>
    `${r.url}\t${date}\t${PORTAL_NAME}\t${r.title || ''}\t${COMPANY_NAME}\t${r.status}`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysArg = args.indexOf('--days');
  const days = daysArg !== -1 ? parseInt(args[daysArg + 1], 10) : 14;
  const maxArg = args.indexOf('--max');
  const max = maxArg !== -1 ? parseInt(args[maxArg + 1], 10) : 50;

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found.');
    process.exit(1);
  }

  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = buildTitleFilter(config.title_filter);
  const locationFilter = buildLocationFilter(config.location_filter);

  console.log(`AgilityConnect Scan — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Window: last ${days} days, max ${max} pages, dry-run=${dryRun}`);

  // 1. Sitemap → recent job URLs
  const xml = await fetchSitemap();
  const all = parseSitemap(xml);
  const cutoff = new Date(Date.now() - days * 86400_000);
  const recent = all
    .filter(e => e.lastmod && new Date(e.lastmod) >= cutoff)
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod))
    .slice(0, max);

  console.log(`Sitemap: ${all.length} job URLs total, ${recent.length} within window`);

  // 2. Dedup
  const seen = loadSeenUrls();
  const fresh = recent.filter(e => !seen.has(e.url) && !seen.has(e.url.replace(/\/$/, '')));
  console.log(`After dedup: ${fresh.length} new URLs to inspect`);

  if (fresh.length === 0) {
    console.log('Nothing new. Exiting.');
    return;
  }

  // 3. Render with Playwright (sequential — small site, polite)
  const browser = await chromium.launch({ headless: true });
  const inspected = [];
  try {
    for (const [i, e] of fresh.entries()) {
      const tag = `[${i + 1}/${fresh.length}] ${e.url}`;
      try {
        const { title, location } = await extractTitleAndLocation(browser, e.url);
        if (!title) {
          console.log(`${tag} — no title rendered, skipping`);
          inspected.push({ ...e, title: '', location: '', status: 'skipped_norender' });
          continue;
        }
        console.log(`${tag} → "${title}"${location ? ` @ ${location}` : ''}`);
        inspected.push({ ...e, title, location, status: 'inspected' });
      } catch (err) {
        console.log(`${tag} — error: ${err.message}`);
        inspected.push({ ...e, title: '', location: '', status: 'skipped_error' });
      }
    }
  } finally {
    await browser.close();
  }

  // 4. Filter by title + location
  const matches = [];
  const filtered = [];
  for (const r of inspected) {
    if (r.status !== 'inspected') continue;
    if (!titleFilter(r.title)) {
      filtered.push({ ...r, status: 'skipped_title' });
      continue;
    }
    if (!locationFilter(r.location)) {
      filtered.push({ ...r, status: 'skipped_location' });
      continue;
    }
    matches.push({ ...r, status: 'added', company: COMPANY_NAME });
  }

  // 5. Write
  const date = new Date().toISOString().slice(0, 10);
  if (!dryRun) {
    appendToPipeline(matches.map(m => ({ url: m.url, company: m.company, title: m.title })));
    appendToScanHistory([...matches, ...filtered, ...inspected.filter(r => r.status !== 'inspected')], date);
    // Normalize pipeline.md: English headers + date subheadings
    execSync('node normalize-pipeline.mjs', { stdio: 'inherit' });
  }

  // 6. Summary
  console.log('');
  console.log('━'.repeat(50));
  console.log(`AgilityConnect Scan — ${date}`);
  console.log('━'.repeat(50));
  console.log(`Sitemap entries:       ${all.length}`);
  console.log(`Within window:         ${recent.length}`);
  console.log(`After dedup:           ${fresh.length}`);
  console.log(`Inspected:             ${inspected.filter(r => r.status === 'inspected').length}`);
  console.log(`Filtered (title):      ${filtered.filter(r => r.status === 'skipped_title').length}`);
  console.log(`Filtered (location):   ${filtered.filter(r => r.status === 'skipped_location').length}`);
  console.log(`Render errors/skips:   ${inspected.filter(r => r.status !== 'inspected').length}`);
  console.log(`Matches added:         ${matches.length}`);
  if (matches.length > 0) {
    console.log('');
    for (const m of matches) console.log(`  + ${m.title} ${m.location ? `(${m.location})` : ''} → ${m.url}`);
  }
  if (dryRun) console.log('\n(dry run — nothing written)');

  // macOS notification on real runs with matches
  if (!dryRun && matches.length > 0 && process.platform === 'darwin') {
    const title = `AgilityConnect — ${matches.length} new match${matches.length > 1 ? 'es' : ''}`;
    const body = matches.map(m => m.title).slice(0, 3).join(' • ');
    try {
      execSync(`osascript -e 'display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"'`);
    } catch { /* notifications are best-effort */ }
  }
}

main().catch(err => {
  console.error('Scan failed:', err);
  process.exit(1);
});
