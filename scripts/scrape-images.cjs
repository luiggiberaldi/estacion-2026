const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION: Load Env Variables ---
const envPath = path.join(__dirname, '..', '.env.local');
let supabaseUrl = "";
let supabaseKey = "";

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  if (keyMatch) supabaseKey = keyMatch[1].trim();
}

if (!supabaseUrl || !supabaseKey) {
  console.error(`❌ Error: Supabase credentials could not be loaded from ${envPath}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- SEARCH KEYWORDS TO HARVEST ALL PRODUCTS ---
const keywords = [
  'harina', 'arroz', 'aceite', 'pasta', 'salsa', 'refresco', 'mayonesa', 
  'queso', 'jamon', 'detergente', 'jabon', 'shampoo', 'galleta', 'leche', 
  'mantequilla', 'cafe', 'azucar', 'sal', 'atun', 'granos', 'caraotas', 
  'jugo', 'desodorante', 'crema dental', 'papel higienico', 'cloro', 
  'desinfectante', 'lavaplatos', 'toddy', 'chocolate', 'cereales', 'chicha',
  'maltin', 'malta'
];

// --- HELPERS ---
function getSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with hyphens
    .replace(/(^-|-$)+/g, ""); // remove leading/trailing hyphens
}

// --- SCRAPER LOGIC FOR BATCH HARVESTING ---
async function harvestImagesFromPage(page, storeUrl, imgSelector, storeName) {
  try {
    await page.goto(storeUrl, { timeout: 15000 });
    
    if (imgSelector === '.item-img img') {
      // For TuZona, wait for selector
      try { await page.waitForSelector(imgSelector, { timeout: 5000 }); } catch(e) {}
    }

    const items = await page.evaluate((selector) => {
      const images = Array.from(document.querySelectorAll(selector));
      return images.map(img => {
        let title = img.alt || img.title || '';
        
        // Climb DOM tree to find containing card text if title attributes are empty
        if (!title || title.length < 5 || title.toLowerCase().includes('imagen')) {
          let current = img;
          for (let k = 0; k < 5; k++) {
            if (!current.parentElement) break;
            current = current.parentElement;
            if (current.innerText && current.innerText.length > 10) {
              const lines = current.innerText.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 3 && !l.includes('$') && !l.includes('Bs') && !l.includes('%') && !l.toLowerCase().includes('agregar'));
              if (lines.length > 0) {
                title = lines[0];
                break;
              }
            }
          }
        }
        return { src: img.src, title: title.trim() };
      }).filter(item => item.src && item.src.startsWith('http') && item.title.length > 3);
    }, imgSelector);

    return items;
  } catch (e) {
    console.warn(`⚠️ [Harvest] Failed to load ${storeName} url: ${storeUrl} (${e.message})`);
    return [];
  }
}

// --- MAIN RUNNER ---
async function run() {
  console.log("🚀 Starting Bulk Product Image Harvester...");

  // Setup output folder
  const outputDir = path.join(__dirname, '..', 'product-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Created dedicated local images directory: ${outputDir}`);
  }

  // Initialize browser
  console.log("🌐 Launching Playwright Chromium instance...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  let totalDownloaded = 0;
  const processedUrls = new Set();

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    console.log(`\n🔍 [Keyword ${i + 1}/${keywords.length}] Processing term: "${kw.toUpperCase()}"...`);
    const q = encodeURIComponent(kw);

    const storeQueries = [
      {
        url: `https://instamarketca.com/?s=${q}&post_type=product`,
        selector: '.box-image img',
        name: 'InstaMarket'
      },
      {
        url: `https://tuzonamarket.com/carabobo/buscar?q=${q}`,
        selector: '.item-img img',
        name: 'TuZona'
      }
    ];

    for (const queryConfig of storeQueries) {
      console.log(`   📡 Harvesting from ${queryConfig.name}...`);
      const items = await harvestImagesFromPage(page, queryConfig.url, queryConfig.selector, queryConfig.name);
      console.log(`   Found ${items.length} product images on page.`);

      for (const item of items) {
        if (processedUrls.has(item.src)) continue;
        processedUrls.add(item.src);

        const slug = getSlug(item.title);
        
        // Skip if image already exists locally under any extension
        const extensions = ['jpg', 'jpeg', 'png', 'webp'];
        const existsLocally = extensions.some(ext => fs.existsSync(path.join(outputDir, `${slug}.${ext}`)));
        if (existsLocally) continue;

        try {
          const imgRes = await fetch(item.src);
          if (!imgRes.ok) continue;

          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          let fileExt = contentType.split('/')[1] || 'jpg';
          if (fileExt === 'jpeg') fileExt = 'jpg';

          const localPath = path.join(outputDir, `${slug}.${fileExt}`);
          fs.writeFileSync(localPath, buffer);
          console.log(`      💾 Saved: "${item.title}" -> product-images/${slug}.${fileExt}`);
          totalDownloaded++;
        } catch (err) {
          // Silent fail for individual image download
        }
      }
    }

    // Delay between keywords to avoid rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }

  await browser.close();
  console.log(`\n🏁 Harvesting completed successfully!`);
  console.log(`🎉 Total new images scraped & saved to product-images/: ${totalDownloaded}`);
}

run();
