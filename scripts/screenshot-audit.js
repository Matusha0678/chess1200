const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3001';
const BEFORE_DIR = path.join(__dirname, '../docs/design-shots/before');
const AFTER_DIR = path.join(__dirname, '../docs/design-shots/after');

fs.mkdirSync(BEFORE_DIR, { recursive: true });
fs.mkdirSync(AFTER_DIR, { recursive: true });

const PAGES = [
  { name: 'today',          path: '/' },
  { name: 'openings',       path: '/openings' },
  { name: 'courses',        path: '/courses' },
  { name: 'traps',          path: '/traps' },
  { name: 'plans',          path: '/plans' },
  { name: 'mistakes',       path: '/mistakes' },
  { name: 'threats',        path: '/threats' },
  { name: 'endgames',       path: '/endgames' },
  { name: 'sac',            path: '/sac' },
  { name: 'guess-opening',  path: '/guess-opening' },
  { name: 'play',           path: '/play' },
  { name: 'games',          path: '/games' },
  { name: 'masters',        path: '/masters' },
  { name: 'evaluate',       path: '/evaluate' },
];

const THEMES = [
  { id: 'soft-dark',  name: 'soft-dark' },
  { id: 'soft-light', name: 'soft-light' },
];

const SIZES = [
  { w: 1440, h: 900,  suffix: 'desktop' },
  { w: 390,  h: 844,  suffix: 'mobile'  },
];

async function setTheme(page, themeId) {
  await page.evaluate((id) => {
    const settings = JSON.parse(localStorage.getItem('chess1200-board-settings') || '{}');
    settings.siteThemeId = id;
    localStorage.setItem('chess1200-board-settings', JSON.stringify(settings));
  }, themeId);
  await page.reload({ waitUntil: 'networkidle' });
}

(async () => {
  const browser = await chromium.launch();

  for (const theme of THEMES) {
    for (const size of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
      const page = await ctx.newPage();

      // Set theme via home page
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await setTheme(page, theme.id);

      for (const pg of PAGES) {
        try {
          await page.goto(BASE + pg.path, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForTimeout(1500);
          const fname = `${pg.name}--${theme.name}--${size.suffix}.png`;
          await page.screenshot({ path: path.join(BEFORE_DIR, fname), fullPage: false });
          console.log('✓', fname);
        } catch (e) {
          console.error('✗', pg.name, theme.name, size.suffix, e.message.slice(0, 60));
        }
      }

      await ctx.close();
    }
  }

  await browser.close();
  console.log('\nDone — screenshots in', BEFORE_DIR);
})();
