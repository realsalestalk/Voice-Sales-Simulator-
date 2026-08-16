/**
 * Verification harness.
 *
 * Proves the three claims the whole architecture rests on:
 *   1. Three.js is absent from the entry chunk (the LCP rule).
 *   2. All three render tiers produce a usable page.
 *   3. Full text content is present with JavaScript disabled (crawlability).
 *
 * Run: pnpm verify
 */

import { spawn } from 'node:child_process';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'sites/flagship/dist');
const shotDir = join(root, 'artifacts/screenshots');
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function checkEntryChunk() {
  console.log('\n[1/3] Bundle composition');
  const assets = await readdir(join(distDir, 'assets'));
  const entry = assets.find((f) => /^index-.*\.js$/.test(f));
  if (!entry) return record('entry chunk exists', false, 'no index-*.js found');

  const source = await readFile(join(distDir, 'assets', entry), 'utf8');
  const bytes = Buffer.byteLength(source);

  // Three ships a recognizable revision banner; its absence is our signal.
  const hasThree = /REVISION\s*=\s*["']\d+/.test(source) || source.includes('WebGLRenderer');
  record('Three.js absent from entry chunk', !hasThree, `${entry} (${(bytes / 1024).toFixed(1)} KB raw)`);

  const threeChunk = assets.find((f) => /^three-.*\.js$/.test(f));
  record('Three.js isolated in its own lazy chunk', Boolean(threeChunk), threeChunk ?? 'missing');
}

async function checkNoScriptContent(browser) {
  console.log('\n[2/3] Crawlability (JavaScript disabled)');
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const h1 = (await page.locator('h1').first().innerText()).trim();
  record('H1 present without JS', h1.length > 0, JSON.stringify(h1.slice(0, 48) + '…'));

  const bodyText = await page.locator('main').innerText();
  record('Body copy present without JS', bodyText.length > 800, `${bodyText.length} chars`);

  const ld = await page.locator('script[type="application/ld+json"]').innerText();
  const parsed = JSON.parse(ld);
  record('LocalBusiness JSON-LD parses', parsed['@type'] === 'ProfessionalService', parsed['@type']);

  const phone = await page.locator('a[href^="tel:"]').count();
  record('Click-to-call link present', phone > 0, `${phone} tel: links`);

  await ctx.close();
}

async function shootTiers(browser) {
  console.log('\n[3/3] Render tiers');
  await mkdir(shotDir, { recursive: true });

  const cases = [
    { tier: 1, label: 'static', viewport: { width: 390, height: 844 }, mobile: true },
    { tier: 2, label: 'standard', viewport: { width: 1440, height: 900 }, mobile: false },
    { tier: 3, label: 'full', viewport: { width: 1440, height: 900 }, mobile: false },
  ];

  for (const c of cases) {
    const ctx = await browser.newContext({
      viewport: c.viewport,
      deviceScaleFactor: 1,
      isMobile: c.mobile,
      hasTouch: c.mobile,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(`${BASE}/?tier=${c.tier}`, { waitUntil: 'load' });
    // Let the cross-fade and first frames settle.
    await page.waitForTimeout(2500);

    const readout = await page.locator('#tier-readout').innerText();
    record(`tier ${c.tier} (${c.label}) reports correctly`, readout.includes(`Tier ${c.tier}`), readout);
    record(`tier ${c.tier} renders without console errors`, errors.length === 0, errors[0] ?? 'clean');

    // On Tier 2/3 the canvas must actually be live, not stuck behind the poster.
    if (c.tier > 1) {
      const live = await page.locator('#stage-canvas').evaluate((el) => el.classList.contains('is-live'));
      record(`tier ${c.tier} canvas went live`, live, live ? 'is-live' : 'poster never handed off');
    }

    await page.screenshot({ path: join(shotDir, `tier-${c.tier}-${c.label}-hero.png`) });
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.6));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(shotDir, `tier-${c.tier}-${c.label}-scrolled.png`) });

    await ctx.close();
  }
}

async function waitForServer(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  await checkEntryChunk();

  const server = spawn('pnpm', ['--filter', '@northline/flagship', 'preview'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  });

  try {
    if (!(await waitForServer())) throw new Error('preview server never came up');

    const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium',
      args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
    });

    await checkNoScriptContent(browser);
    await shootTiers(browser);
    await browser.close();
  } finally {
    try {
      process.kill(-server.pid);
    } catch {
      /* already gone */
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`Screenshots: ${shotDir}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
