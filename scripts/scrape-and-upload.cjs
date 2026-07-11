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

// Mapeos específicos de búsqueda con espacios simples
function getSearchQuery(productName) {
  let q = productName.toUpperCase();
  q = q.replace(/\s+/g, ' ').trim();

  const customMappings = {
    'TRIFOGON': 'trifogon',
    'TOM GUAYABANA': 'dulce tom',
    'TOM PLATANO': 'dulce tom',
    'ALISOFT PAPEL': 'alisoft',
    'EURO': 'papel euro',
    'BAMBOO 4 ROLLO': 'bamboo',
    'BAMBOO UNIDA': 'bamboo',
    'LA PAMPA': 'pampa',
    'AURORA SOYA': 'aurora',
    'DOÑA TITA VINAGRE': 'dona tita',
    'CAPRI SALSA': 'capri',
    'KETCHUP': 'ketchup',
    'PAZCUM SALSA': 'pazcum',
    'SARDINES OIL': 'sardinas',
    'TWISTI': 'twisti',
    'MARGARINA ATUN': 'margarina',
    'DIABLITO UNDER': 'diablito',
    'BLANCA FLOR LEUDANTE': 'blanca flor',
    'BLANCA FLOR TODO': 'blanca flor',
    'KONFIT AZUCAR': 'konfit',
    'RONCO CORTA PLUMA 500 GR': 'ronco',
    'MARY PASTA PLUMA 500 GR': 'mary',
    'SAN SIMON LECHE 400GR': 'san simon',
    'ARROZ MARY SUPERIOR': 'arroz mary',
    'ARROZ MARY PREMIUM': 'arroz mary',
    'DOÑA BELEN': 'dona belen',
    'PRIMOR PASTA LARGA': 'primor',
    'MARY PASTA LARGA PREMIUM 500G': 'mary pasta',
    'SAL PROSANCA': 'prosanca',
    'CAFÉ LA PROTECTORA 100GR': 'protectora',
    'CAFÉ LA PROTECTORA 200GR': 'protectora',
    'ALIVE DETERGENTE POLVO 400GR': 'alive',
    'AVENA 400GR GRAVENCA': 'gravenca',
    'JUMBY RIKO': 'jumby',
    'BUEN ARROZ 900GR': 'buen arroz',
    'HARINA BUDARE': 'budare',
    'HARINA MARY 900G': 'harina mary',
    'WYNCON BUZZY': 'buzzy',
    'JABON ANITA': 'anita',
    'LA LLAVES JABON': 'llaves',
    'BON BON SURTIDO': 'bon bon',
    'CARAMELO CAFÉ': 'caramelo cafe',
    'TOALLAS WANITA': 'wanita',
    'PRESTOBALBA DORCO AZUL , ROSADA': 'dorco',
    'GALLETAS MARIA ALIVAL': 'galletas maria',
    'MIMLOT JABON': 'mimlot',
    'MAVESA MARGARINA MANTEQUILLA': 'margarina mavesa',
    'JUSTY DURAZNO 400L': 'justy',
    'JUSTY MANZANA 400L': 'justy',
    'GLUP COLA 2L': 'glup',
    'GLUP SABORES 1L': 'glup',
    'GLUP COLA 400L': 'glup',
    'CIGARRO CONSUL PAQ': 'consul',
    'CIGARRO VICEBOY PAQ': 'viceboy',
    'CHEESKING 50G': 'cheeseking',
    'CREMA ALIDENT AZUL': 'alident',
    'SUAVITETWL 180ML': 'suavitel',
    'AGUA COLL 1.5L': 'agua coll',
    'AGUA COLL 600M': 'agua coll',
    'GALLETA COCO RANCH': 'coco ranch',
    'GALLETA ANIMALITOS': 'animalitos',
    'GALLETA SODA': 'galleta soda',
    'GALLETA CLUB SOCIAL': 'club social',
    'LECHE DOBON 120G': 'dobon',
    'PALITO DANIBISK': 'danibisk',
    'FLIPS 120GR CHOCO': 'flips',
    'FLIPS 120GR DULCE': 'flips',
    'TIP TOP CHOCO': 'tip top',
    'GALLETA INDEPENDENCIA': 'independencia',
    'GALLETA DANINBISK': 'danibisk',
    'OREO TUBO': 'oreo',
    'RAQUETY PICANTE': 'raquety',
    'CHEESE TRIS 4G': 'cheese tris',
    'CHISKESITOS 45G': 'chiskesitos',
    'TOSTON TOM 80G': 'toston tom',
    'ESPONJA AMARILLA': 'esponja',
    'HUEVOS TIPO A und': 'huevos',
    'MANTEQUILLA NELLY 250G': 'nelly',
    'MAYONESAMAVESA 500G': 'mayonesa mavesa',
    'MAYONES MAVESA 175G': 'mayonesa mavesa',
    'DESIFENTANTE 1LT': 'desinfectante'
  };

  if (customMappings[q]) {
    return customMappings[q];
  }

  let words = q.split(' ');
  const noise = ['UND', 'UNIDA', 'LOTE', 'PAQ', 'PAQUE', 'PAQUETE', 'GR', 'GRS', 'KG', '1KG', '400GR', '500GR', '900G', '175G', '250G', '180ML', '200ML', '1LT', '1.5L', '2L', '1L', '400L', '600M'];
  words = words.filter(w => !noise.includes(w) && w.length > 1);

  return words.length > 0 ? words[0].toLowerCase() : q.toLowerCase();
}

// Validación de similitud
function verifyTitleSimilarity(searchTerm, foundTitle) {
  const stopwords = new Set([
    'del', 'con', 'para', 'una', 'und', 'grs', 'tipo', 'paq', 'unds', 'unidad', 'bulto', 'bultos', 
    'superior', 'premium', 'todo', 'uso', 'corta', 'larga', 'leudante', 'fina', 'finas', 'extra', 
    '100gr', '200gr', '400gr', '500gr', '900gr', '1kg', '1lt', '2lt', '1l', '2l', '1.5l', '600m', 
    '150g', '250g', '500g', '900g', '120g', '125g', '50g', '80g', '45g', '828ml', '200ml', '50ml', 
    '120gr', '1.9l', '180ml', '240g', '156g', '150g', '145g', '269ml', '190g', '198g', '300g', 'viveres',
    'comida', 'alimento', 'venezuela', 'supermercado'
  ]);

  const clean = (str) => str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  const searchWords = clean(searchTerm);
  const foundWords = clean(foundTitle);

  if (searchWords.length === 0) return false;

  const matches = searchWords.filter(word => {
    return foundWords.some(fw => fw.includes(word) || word.includes(fw));
  });

  const ratio = matches.length / searchWords.length;
  return ratio >= 0.6;
}

// --- SCRAPER 2.0 CASCADING SEARCH WITH CONTEXT ISOLATION & OPTIMIZED LOAD ---
async function harvestSingleProductImage(browser, productName) {
  const searchQuery = getSearchQuery(productName);
  const q = encodeURIComponent(searchQuery);
  const stores = [
    {
      url: `https://instamarketca.com/?s=${q}&post_type=product`,
      selector: '.box-image img, img.wp-post-image, .attachment-woocommerce_thumbnail',
      name: 'InstaMarket',
      isWoo: true
    },
    {
      url: `https://quemantequilla.online/?s=${q}&post_type=product`,
      selector: '.box-image img, img.wp-post-image, .attachment-woocommerce_thumbnail, .product-image img',
      name: 'QueMantequilla',
      isWoo: true
    },
    {
      url: `https://despensallena.com/?s=${q}&post_type=product`,
      selector: '.box-image img, img.wp-post-image, .attachment-woocommerce_thumbnail, .product-image img',
      name: 'DespensaLlena',
      isWoo: true
    },
    {
      url: `https://supermercados-paotrolado.com/?s=${q}&post_type=product`,
      selector: '.box-image img, img.wp-post-image, .attachment-woocommerce_thumbnail, .product-image img',
      name: 'PaOtroLado',
      isWoo: true
    },
    {
      url: `https://tuzonamarket.com/carabobo/buscar?q=${q}`,
      selector: '.item-img img',
      name: 'TuZona',
      isWoo: false
    }
  ];

  for (const store of stores) {
    console.log(`     🔍 Buscando en ${store.name} con query: "${searchQuery}"...`);
    
    // Crear contexto y página dedicada para evitar contagio de cookies, redirecciones o bloqueos
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // OPTIMIZACIÓN CRÍTICA: Bloquear hojas de estilo, fuentes y analíticas para acelerar radicalmente la carga
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['stylesheet', 'font', 'media'].includes(type) || route.request().url().includes('google-analytics') || route.request().url().includes('facebook')) {
        route.abort();
      } else {
        route.continue();
      }
    });

    try {
      // Reducimos el timeout de navegación a 6 segundos para no perder tiempo en tiendas lentas
      await page.goto(store.url, { timeout: 6000, waitUntil: 'domcontentloaded' });
      if (store.name === 'TuZona') {
        try { await page.waitForSelector(store.selector, { timeout: 2500 }); } catch (e) {}
      }

      const items = await page.evaluate((storeInfo) => {
        const images = Array.from(document.querySelectorAll(storeInfo.selector));
        return images.map(img => {
          let title = img.alt || img.title || '';
          
          if (storeInfo.isWoo && (!title || title.length < 5 || title.toLowerCase().includes('imagen'))) {
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
          return { src: img.src || img.getAttribute('src') || img.getAttribute('data-src') || '', title: title.trim() };
        }).filter(item => item.src && item.src.startsWith('http') && item.title.length > 3);
      }, { selector: store.selector, isWoo: store.isWoo });

      // Buscar el primer item que cumpla la validación estricta
      for (const item of items) {
        if (verifyTitleSimilarity(productName, item.title)) {
          console.log(`     🎯 ¡Coincidencia encontrada en ${store.name}!: "${item.title}"`);
          await page.close();
          await context.close();
          return item;
        }
      }
    } catch (err) {
      // Registrar silenciosamente fallo de esta tienda y avanzar
    } finally {
      try {
        await page.close();
        await context.close();
      } catch (e) {}
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

  // Conservar imagenes de catalogo conocidas correctas (como Glup Cola 2L)
  const glup = products_idb.find(p => p.name === "GLUP COLA 2L");
  if (glup) {
    glup.image = "https://sodgzkablshladvbtnes.supabase.co/storage/v1/object/public/product-images/images/glup-cola-2l.jpg";
  }

  const backupData = {
    timestamp: "2026-07-11T03:30:00.000Z",
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
  console.log("✅ Backup base de datos re-inicializado.");

  const pendingProducts = products_idb.filter(p => !p.image || p.image === "");
  console.log(`📋 Total productos en el inventario: ${products_idb.length}`);
  console.log(`🔍 Productos pendientes de imagen: ${pendingProducts.length}`);

  const outputDir = path.join(__dirname, '..', 'product-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("🌐 Lanzando navegador Chromium para recolección de fotos...");
  const browser = await chromium.launch({ headless: true });
  let scrapedCount = 0;

  for (let i = 0; i < pendingProducts.length; i++) {
    const product = pendingProducts[i];
    console.log(`\n[${i + 1}/${pendingProducts.length}] Buscando foto para: "${product.name}"...`);

    const harvested = await harvestSingleProductImage(browser, product.name);
    
    if (harvested) {
      console.log(`   ✅ Candidato seleccionado: "${harvested.title}"`);
      const slug = getSlug(product.name);
      
      try {
        const imgRes = await fetch(harvested.src);
        if (!imgRes.ok) throw new Error("Fetch falló al descargar la imagen");

        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        let fileExt = contentType.split('/')[1] || 'jpg';
        if (fileExt === 'jpeg') fileExt = 'jpg';
        if (fileExt.includes(';')) fileExt = fileExt.split(';')[0];

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

        console.log(`   💾 ¡Imagen subida y enlazada correctamente!: ${publicUrl}`);
        scrapedCount++;
      } catch (err) {
        console.error(`   ❌ Error al descargar o subir imagen al almacenamiento:`, err.message);
      }
    } else {
      console.log(`   ❌ No se encontró coincidencia válida. Saltando.`);
    }

    await new Promise(r => setTimeout(r, 800));
  }

  await browser.close();
  console.log(`\n🏁 ¡Completado! Se recolectaron y enlazaron ${scrapedCount} fotos correctas en el backup.`);
}

run();
