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

// --- HELPERS ---
function getSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with hyphens
    .replace(/(^-|-$)+/g, ""); // remove leading/trailing hyphens
}

function getCleanName(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getTags(slug) {
  return [...new Set(
    slug
      .toLowerCase()
      .split('-')
      .filter(w => w.length > 2)
  )];
}

// Validación ultraestricta: exige que TODAS las palabras significativas del término de búsqueda estén presentes
function verifyTitleSimilarity(searchTerm, foundTitle) {
  const stopwords = new Set([
    'del', 'con', 'para', 'una', 'und', 'grs', 'tipo', 'paq', 'unds', 'unidad', 'bulto', 'bultos', 
    'superior', 'premium', 'todo', 'uso', 'corta', 'larga', 'leudante', 'fina', 'finas', 'extra', 
    '100gr', '200gr', '400gr', '500gr', '900gr', '1kg', '1lt', '2lt', '1l', '2l', '1.5l', '600m', 
    '150g', '250g', '500g', '900g', '120g', '125g', '50g', '80g', '45g', '828ml', '200ml', '50ml', 
    '120gr', '1.9l', '180ml', '240g', '156g', '150g', '145g', '269ml', '190g', '198g', '300g'
  ]);

  const clean = (str) => str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  const searchWords = clean(searchTerm);
  const foundWords = clean(foundTitle);

  if (searchWords.length === 0) return false;

  // REGLA ULTRAESTRICTA: TODAS las palabras significativas del nombre buscado deben existir en el título encontrado.
  // Si buscamos "ARROZ MARY SUPERIOR" -> principales: ["arroz", "mary"] -> El candidato DEBE contener tanto "arroz" como "mary".
  const allMatch = searchWords.every(word => {
    // Permite coincidencia parcial para plurales/variaciones de palabras de al menos 4 caracteres (ej: "galleta" en "galletas")
    return foundWords.some(fw => fw.includes(word) || word.includes(fw));
  });

  return allMatch;
}

async function harvestSingleProductImage(page, productName) {
  const q = encodeURIComponent(productName);
  const stores = [
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

  for (const store of stores) {
    try {
      await page.goto(store.url, { timeout: 12000 });
      if (store.name === 'TuZona') {
        try { await page.waitForSelector(store.selector, { timeout: 3000 }); } catch (e) {}
      }

      const items = await page.evaluate((selector) => {
        const images = Array.from(document.querySelectorAll(selector));
        return images.map(img => {
          let title = img.alt || img.title || '';
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
      }, store.selector);

      // Buscar el primer item que cumpla la validación estricta
      for (const item of items) {
        if (verifyTitleSimilarity(productName, item.title)) {
          return item;
        }
      }
    } catch (err) {
      // Ignorar errores
    }
  }
  return null;
}

// --- MAIN RUNNER ---
async function run() {
  const jsonPath = "c:\\Users\\luigg\\Desktop\\pisu_starter\\projects\\precios al dia\\precios al dia rebranding\\preciosaldia-bodega\\inventario_extraido.json";
  const backupPath = "c:\\Users\\luigg\\Desktop\\pisu_starter\\projects\\precios al dia\\precios al dia rebranding\\preciosaldia-bodega\\backup_inventario_importable.json";
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Error: JSON file not found at ${jsonPath}`);
    process.exit(1);
  }

  // --- RE-INICIALIZACIÓN LIMPIA ---
  console.log("♻️ Re-inicializando backup limpio desde inventario_extraido.json...");
  const extracted_products = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const mapeo_categorias = {
    "VIVERES": "Víveres",
    "VARIOS": "Varios",
    "CHARCUTERIA": "Charcutería",
    "FRUTAS_VERDURAS": "Frutas y Verduras"
  };

  const products_idb = [];
  for (let idx = 0; idx < extracted_products.length; idx++) {
    const p = extracted_products[idx];
    const raw_cat = (p.categoria || 'VARIOS').toUpperCase();
    const category = mapeo_categorias[raw_cat] || raw_cat.charAt(0).toUpperCase() + raw_cat.slice(1).toLowerCase();
    const barcode = p.codigo || '';
    const prod_id = barcode ? `prod_${barcode}` : `prod_auto_1783729914_${idx}`;

    products_idb.push({
      id: prod_id,
      name: (p.nombre || 'Sin Nombre').trim(),
      priceUsd: parseFloat(p.precio_unitario_usd || 0),
      priceUsdt: parseFloat(p.precio_unitario_usd || 0),
      costUsd: parseFloat(p.costo_unitario_usd || 0),
      stock: parseFloat(p.cant_bulto || 0),
      lowStockAlert: 5,
      category: category,
      barcode: barcode,
      unit: "und",
      image: ""
    });
  }

  const glup = products_idb.find(p => p.name === "GLUP COLA 2L");
  if (glup) {
    glup.image = "https://sodgzkablshladvbtnes.supabase.co/storage/v1/object/public/product-images/images/glup-cola-2l.jpg";
  }

  const backupData = {
    timestamp: "2026-07-10T23:55:00.000Z",
    version: "2.0",
    appName: "TasasAlDia_Bodegas",
    data: {
      idb: {
        bodega_products_v1: products_idb,
        my_categories_v1: ["Víveres", "Varios", "Charcutería", "Frutas y Verduras"]
      },
      ls: {
        business_name: "Mi Negocio",
        printer_paper_width: "58",
        label_currency_mode: "mixto"
      }
    }
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log("✅ Backup re-inicializado de forma limpia.");

  const pendingProducts = products_idb.filter(p => !p.image || p.image === "");
  console.log(`📋 Total products in backup: ${products_idb.length}`);
  console.log(`🔍 Products pending image: ${pendingProducts.length}`);

  const outputDir = path.join(__dirname, '..', 'product-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("🌐 Launching browser for image harvesting...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  let scrapedCount = 0;

  for (let i = 0; i < pendingProducts.length; i++) {
    const product = pendingProducts[i];
    console.log(`\n[${i + 1}/${pendingProducts.length}] Searching image for: "${product.name}"...`);

    const harvested = await harvestSingleProductImage(page, product.name);
    
    if (harvested) {
      console.log(`   ✅ Matched image candidate: "${harvested.title}"`);
      const slug = getSlug(product.name);
      
      try {
        const imgRes = await fetch(harvested.src);
        if (!imgRes.ok) throw new Error("Fetch failed");

        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        let fileExt = contentType.split('/')[1] || 'jpg';
        if (fileExt === 'jpeg') fileExt = 'jpg';

        const fileName = `${slug}.${fileExt}`;
        const localPath = path.join(outputDir, fileName);
        fs.writeFileSync(localPath, buffer);

        const uploadPath = `images/${fileName}`;
        const { error: uploadErr } = await supabase.storage
          .from('product-images')
          .upload(uploadPath, buffer, {
            contentType,
            upsert: true
          });

        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(uploadPath);

        const cleanName = getCleanName(slug);
        const tags = getTags(slug);
        await supabase
          .from('product_images_catalog')
          .upsert({
            id: slug,
            name: cleanName,
            image_url: publicUrl,
            tags: tags
          });

        product.image = publicUrl;
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');

        console.log(`   💾 Success! Image linked and uploaded: ${publicUrl}`);
        scrapedCount++;
      } catch (err) {
        console.error(`   ❌ Failed to download/upload image:`, err.message);
      }
    } else {
      console.log(`   ❌ No exact or similar image found. Skipped.`);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  await browser.close();
  console.log(`\n🏁 Done! Successfully scraped and linked ${scrapedCount} correct images to backup.`);
}

run();
