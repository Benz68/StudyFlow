import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.STUDYFLOW_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = resolve(process.env.STUDYFLOW_SCREENSHOTS || 'scripts/screenshots');
await mkdir(output, { recursive: true });
const failures = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.clock.install({ time: new Date('2026-09-30T08:00:00+03:00') });
    await page.goto('http://127.0.0.1:4173');
    await page.locator('#main h1').waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
    await page.screenshot({ path: resolve(output, `empty-${viewport.width}.png`), fullPage: true });
    await page.locator('[data-action="demo"]').click();
    await page.locator('.demo-banner').waitFor();
    await page.screenshot({ path: resolve(output, `demo-${viewport.width}.png`), fullPage: true });
    assert.ok(await page.locator('.session-card').count() > 0, 'Demo has scheduled work');
    await page.locator('[data-action="exit-demo"]').click();
    await page.locator('[data-action="add"]:visible').first().click();
    await page.locator('#title').fill('תרגול למבחן');
    await page.locator('#minutes').fill('120');
    await page.locator('#deadline').fill('2026-09-30');
    await page.locator('#add-form button[type="submit"]').click();
    await page.locator('.session-card').first().waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('studyflow.fresh.v1')));
    assert.equal(stored.tasks.length, 1);
    assert.equal(stored.tasks[0].title, 'תרגול למבחן');
    await page.locator('[data-action="complete-session"]').first().click();
    const completed = await page.evaluate(() => JSON.parse(localStorage.getItem('studyflow.fresh.v1')));
    assert.ok(completed.tasks[0].completedMinutes > 0);
    assert.ok(completed.tasks[0].completionLog?.length > 0, 'Completion counts against capacity');
    await page.reload();
    await page.locator('#main h1').waitFor();
    assert.ok(await page.locator('.session-card').count() > 0, 'Remaining work survives reload');
    await page.locator('[data-action="settings"]').first().click();
    await page.locator('#settings-form').waitFor();
    assert.ok(await page.locator('#sheet').evaluate(element => element.open));
    await page.keyboard.press('Escape');
    await page.locator('[data-action="pro"]:visible').first().click();
    await page.getByText('בפיתוח · עדיין לא זמין לרכישה').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await context.close();
    console.log(`Browser flows passed at ${viewport.width}px.`);
  }
  assert.deepEqual(failures, [], 'No uncaught browser errors');
} finally {
  await browser.close();
}
