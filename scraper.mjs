import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'https://lms.inclusive.tralalere.com';
const LOGIN_URL = `${BASE}/login`;
const BOUSSOLE_URL = `${BASE}/boussole`;

const CATEGORIES = [
  { id: 'diagnostic', path: '/boussole/explore/4687' },
  { id: 'competences-psychosociales', path: '/boussole/explore/4711' },
  { id: 'difficulte-observee', path: '/boussole/explore/4686' },
  { id: 'question-organisationnelle', path: '/boussole/explore/4709' },
  { id: 'adaptations-pedagogiques', path: '/boussole/explore/4710' },
];

async function login(page) {
  await page.goto(LOGIN_URL);
  await page.waitForTimeout(3000);
  // Dismiss screen resolution dialog if present
  const okBtn = page.locator('button:has-text("OK")');
  if (await okBtn.isVisible().catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(500);
  }
  await page.fill('[formcontrolname="login"]', 'Tralalere_enseignant');
  await page.fill('[formcontrolname="password"]', 'Tralalere1');
  await page.click('[data-e2e="login-form-submit"]');
  await page.waitForURL('**/boussole**', { timeout: 15000 });
  console.log('✓ Logged in');
}

async function scrapeCategory(page, cat) {
  console.log(`\n--- Scraping category: ${cat.path} ---`);
  await page.goto(`${BASE}${cat.path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('app-compass-card', { timeout: 10000 });

  // Scroll to load all cards
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(300);
  }

  const categoryData = await page.evaluate(() => {
    const header = document.querySelector('.compass-themes__header');
    const title = header?.querySelector('h2')?.textContent?.trim() || '';
    const desc = header?.querySelector('p')?.textContent?.trim() || '';

    const cards = document.querySelectorAll('app-compass-card');
    const situations = [];
    cards.forEach(card => {
      const t = card.querySelector('.app-compass-card__title, h3, h4')?.textContent?.trim() || '';
      const d = card.querySelector('.app-compass-card__description, p')?.textContent?.trim() || '';
      const link = card.querySelector('a[href*="/themes/"]');
      const path = link ? link.pathname : '';
      if (t) situations.push({ title: t, description: d, path });
    });
    return { title, description: desc, situations };
  });

  console.log(`  Category: ${categoryData.title}`);
  console.log(`  Found ${categoryData.situations.length} situations`);
  return categoryData;
}

async function scrapeSituationResources(page, situationPath) {
  const url = `${BASE}${situationPath}`;
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for content to load
  await page.waitForTimeout(2000);

  // Scroll to load all content
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(300);
  }

  const data = await page.evaluate(() => {
    const cards = document.querySelectorAll('app-compass-card');
    const resources = [];

    cards.forEach(card => {
      // Type from colored header (h3)
      const type = card.querySelector('.app-compass-card__header h3')?.textContent?.trim() || '';
      // Real title from body (h4)
      const title = card.querySelector('.app-compass-card__body h4')?.textContent?.trim() || '';
      // Description and aide from body paragraphs
      const bodyDiv = card.querySelector('.app-compass-card__body div');
      const paragraphs = bodyDiv ? Array.from(bodyDiv.querySelectorAll('p')) : [];

      let desc = '';
      let aide = '';
      let afterAide = false;
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        if (text.includes("Qu'attend-on de cette aide")) {
          afterAide = true;
          continue;
        }
        if (afterAide) {
          aide = text;
          afterAide = false;
        } else if (!desc && text) {
          desc = text;
        }
      }

      // URL from footer button/link
      const link = card.querySelector('a[href]');
      const href = link ? link.pathname : '';

      if (title || type) resources.push({ titre: title || type, type, description: desc, aide_attendue: aide, url: href });
    });

    return { resources };
  });

  return data;
}

async function scrapeCollections(page) {
  console.log('\n--- Scraping collections partenaires ---');
  await page.goto(`${BASE}/further/ressources-partenaires-inclusive`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Scroll to load all
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(300);
  }

  const collections = await page.evaluate(() => {
    const cards = document.querySelectorAll('app-compass-card, mat-card, [class*="card"], [class*="collection"]');
    const results = [];
    cards.forEach(card => {
      const title = card.querySelector('h2, h3, h4, .mat-card-title, [class*="title"], strong')?.textContent?.trim() || '';
      const desc = card.querySelector('p, .mat-card-content, [class*="desc"]')?.textContent?.trim() || '';
      const link = card.querySelector('a[href]');
      const href = link ? (link.pathname || link.href) : '';
      if (title && title.length > 2) results.push({ title, description: desc, url: href });
    });
    return results;
  });

  console.log(`  Found ${collections.length} collections`);
  return collections;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  await login(page);

  const knowledgeBase = { categories: [], collections: [] };

  // Scrape each category
  for (const cat of CATEGORIES) {
    const catData = await scrapeCategory(page, cat);

    const categoryEntry = {
      id: cat.id,
      title: catData.title,
      description: catData.description,
      situations: []
    };

    // Scrape each situation's resource page
    for (const sit of catData.situations) {
      console.log(`    → Scraping: ${sit.title.substring(0, 60)}...`);
      const resData = await scrapeSituationResources(page, sit.path);

      categoryEntry.situations.push({
        title: sit.title,
        description: sit.description,
        url: `${BASE}${sit.path}`,
        ressources: resData.resources
      });
    }

    knowledgeBase.categories.push(categoryEntry);
  }

  // Scrape collections
  knowledgeBase.collections = await scrapeCollections(page);

  // Save
  writeFileSync('knowledge_base_raw.json', JSON.stringify(knowledgeBase, null, 2), 'utf-8');
  console.log('\n✓ Saved knowledge_base_raw.json');

  // Stats
  let totalSituations = 0;
  let totalResources = 0;
  knowledgeBase.categories.forEach(c => {
    totalSituations += c.situations.length;
    c.situations.forEach(s => totalResources += s.ressources.length);
  });
  console.log(`\nStats:`);
  console.log(`  Categories: ${knowledgeBase.categories.length}`);
  console.log(`  Situations: ${totalSituations}`);
  console.log(`  Resources: ${totalResources}`);
  console.log(`  Collections: ${knowledgeBase.collections.length}`);

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
