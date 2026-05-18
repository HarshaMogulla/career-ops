#!/usr/bin/env node

/**
 * normalize-pipeline.mjs — Keep data/pipeline.md tidy.
 *
 *   1. Renames Spanish section headers to English: Pendientes → Pending,
 *      Procesadas → Processed.
 *   2. Re-groups all entries under date subheadings (### YYYY-MM-DD),
 *      using data/scan-history.tsv to look up each URL's first_seen date.
 *      Items not in scan-history are bucketed under "unknown date".
 *
 * Idempotent — safe to run multiple times. Run by both scan-daily.mjs and
 * scan-agility.mjs after each scan, plus available as a manual fix:
 *
 *   node normalize-pipeline.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const PIPELINE_PATH = 'data/pipeline.md';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';

function loadDateMap() {
  const map = new Map();
  if (!existsSync(SCAN_HISTORY_PATH)) return map;
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1);
  for (const line of lines) {
    const cols = line.split('\t');
    const url = cols[0]?.trim();
    const firstSeen = cols[1]?.trim();
    if (url && firstSeen && !map.has(url)) {
      map.set(url, firstSeen);
      const stripped = url.replace(/\/$/, '');
      if (stripped !== url) map.set(stripped, firstSeen);
    }
  }
  return map;
}

function parsePipeline(text) {
  const items = [];
  let currentSection = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (/^##\s+(Pendientes|Pending)\b/i.test(line)) { currentSection = 'pending'; continue; }
    if (/^##\s+(Procesadas|Processed)\b/i.test(line)) { currentSection = 'processed'; continue; }
    if (/^###\s/.test(line)) continue;
    if (/^-\s/.test(line) && currentSection) {
      const urlMatch = line.match(/https?:\/\/[^\s|)]+/);
      const url = urlMatch ? urlMatch[0].replace(/[).,;]+$/, '') : null;
      items.push({ section: currentSection, line, url });
    }
  }
  return items;
}

function build(items, dateMap) {
  for (const item of items) {
    if (item.url && dateMap.has(item.url)) {
      item.date = dateMap.get(item.url);
    } else if (item.url && dateMap.has(item.url.replace(/\/$/, ''))) {
      item.date = dateMap.get(item.url.replace(/\/$/, ''));
    } else {
      item.date = 'unknown date';
    }
  }

  let output = '';
  for (const [section, header] of [['pending', 'Pending'], ['processed', 'Processed']]) {
    output += `## ${header}\n\n`;
    const sectionItems = items.filter(i => i.section === section);
    const groupKeys = [...new Set(sectionItems.map(i => i.date))].sort((a, b) => {
      if (a === 'unknown date') return 1;
      if (b === 'unknown date') return -1;
      return b.localeCompare(a);
    });
    for (const date of groupKeys) {
      output += `### ${date}\n\n`;
      for (const item of sectionItems.filter(i => i.date === date)) {
        output += item.line + '\n';
      }
      output += '\n';
    }
  }
  return output;
}

const text = readFileSync(PIPELINE_PATH, 'utf-8');
const items = parsePipeline(text);
const dateMap = loadDateMap();
const result = build(items, dateMap);
writeFileSync(PIPELINE_PATH, result, 'utf-8');
const pending = items.filter(i => i.section === 'pending').length;
const processed = items.filter(i => i.section === 'processed').length;
console.log(`✅ pipeline.md normalized: ${pending} pending, ${processed} processed, grouped by date`);
