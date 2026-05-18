#!/usr/bin/env node

/**
 * scan-daily.mjs — daily wrapper around scan.mjs with macOS notifications.
 *
 * Why a wrapper instead of editing scan.mjs directly?
 * scan.mjs is system-layer (auto-updatable per DATA_CONTRACT.md), so adding
 * notifications inside it would get clobbered by `node update-system.mjs apply`.
 * This wrapper is user-layer and stable across upgrades.
 *
 * Designed to be invoked by a macOS LaunchAgent for daily scheduled runs.
 * Run manually via `node scan-daily.mjs` or `npm run scan:daily`.
 */
import { spawnSync, execSync } from 'child_process';

const result = spawnSync('node', ['scan.mjs'], { encoding: 'utf-8' });
process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

// Normalize pipeline.md: English headers + date subheadings
spawnSync('node', ['normalize-pipeline.mjs'], { encoding: 'utf-8', stdio: 'inherit' });

const addedMatch = result.stdout.match(/New offers added:\s+(\d+)/);
const added = addedMatch ? parseInt(addedMatch[1], 10) : 0;

if (added > 0 && process.platform === 'darwin') {
  const newOffersBlock = result.stdout.split('New offers:')[1] || '';
  const titles = [];
  for (const line of newOffersBlock.split('\n')) {
    const m = line.match(/^\s*\+\s+([^|]+?)\s*\|\s*([^|]+?)(?:\s*\||\s*$)/);
    if (m) titles.push(`${m[1].trim()}: ${m[2].trim()}`);
  }
  const titleText = `career-ops scan — ${added} new match${added > 1 ? 'es' : ''}`;
  const body = (titles.slice(0, 3).join(' • ') || 'See pipeline.md').slice(0, 240);
  try {
    execSync(`osascript -e 'display notification "${body.replace(/"/g, '\\"')}" with title "${titleText.replace(/"/g, '\\"')}"'`);
  } catch { /* notifications are best-effort */ }
}

process.exit(result.status || 0);
