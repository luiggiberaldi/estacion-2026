const { createClient } = require('@supabase/supabase-js');
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
      .filter(w => w.length > 2) // only tags longer than 2 characters
  )];
}

// --- MAIN UPLOADER ---
async function run() {
  console.log("🚀 Starting Bulk Image Uploader to Supabase...");

  const outputDir = path.join(__dirname, '..', 'product-images');
  if (!fs.existsSync(outputDir)) {
    console.error(`❌ Error: product-images directory does not exist at ${outputDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(outputDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  });

  console.log(`📋 Found ${files.length} local images to process.`);

  // 1. Fetch all existing catalog IDs to prevent redundant uploads (paginated)
  console.log("📡 Checking existing items in Supabase catalog...");
  let existingRecords = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('product_images_catalog')
      .select('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) {
      console.error("❌ Failed to query existing catalog records:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    existingRecords = existingRecords.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  const existingIds = new Set(existingRecords.map(r => r.id));
  console.log(`📦 Catalog database currently has ${existingIds.size} records.`);

  // Filter files that need to be uploaded
  const filesToUpload = files.filter(file => {
    const slug = path.basename(file, path.extname(file));
    return !existingIds.has(slug);
  });

  console.log(`🚀 ${filesToUpload.length} new images need to be uploaded.`);

  if (filesToUpload.length === 0) {
    console.log("🏁 All images are already uploaded and cataloged!");
    process.exit(0);
  }

  // 2. Ensure Storage Bucket exists and is public
  const { data: bucket, error: bucketError } = await supabase.storage.getBucket('product-images');
  if (bucketError) {
    console.log("📦 Creating public bucket 'product-images'...");
    await supabase.storage.createBucket('product-images', { public: true });
  }

  let count = 0;
  // Process in sequential loop with console progress updates
  for (const file of filesToUpload) {
    count++;
    const ext = path.extname(file).toLowerCase();
    const slug = path.basename(file, ext);
    const cleanName = getCleanName(slug);
    const tags = getTags(slug);
    const filePath = path.join(outputDir, file);

    console.log(`[${count}/${filesToUpload.length}] Processing "${cleanName}"...`);

    try {
      const buffer = fs.readFileSync(filePath);
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const uploadPath = `images/${file}`;

      // Upload file to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(uploadPath, buffer, {
          contentType,
          upsert: true
        });

      if (uploadErr) throw uploadErr;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(uploadPath);

      // Save to database catalog
      const { error: dbErr } = await supabase
        .from('product_images_catalog')
        .insert({
          id: slug,
          name: cleanName,
          image_url: publicUrl,
          tags: tags
        });

      if (dbErr) throw dbErr;

      console.log(`   ✅ Uploaded and cataloged successfully!`);
    } catch (err) {
      console.error(`   ❌ Failed to process:`, err.message);
    }
  }

  console.log(`\n🏁 Uploading completed! Successfully uploaded ${count} new images.`);
}

run();
