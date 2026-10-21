const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

// Exact vector SVG corresponding to the user's uploaded ApexSovereign stealth delta logo
// Optimized for both large screens and ultra-crisp 16x16 / 32x32 browser tab rendering
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <!-- Cyan & Electric Blue Neon Seam Gradients -->
    <linearGradient id="apexCyanLine" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#CFFAFE" />
      <stop offset="25%" stop-color="#38BDF8" />
      <stop offset="65%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>

    <linearGradient id="apexSpineBeam" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="25%" stop-color="#A5F3FC" />
      <stop offset="60%" stop-color="#22D3EE" />
      <stop offset="100%" stop-color="#0891B2" />
    </linearGradient>

    <!-- Metallic Obsidian Dark Shaded Facets (Left Side) -->
    <linearGradient id="facetObsidianDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="50%" stop-color="#090E17" />
      <stop offset="100%" stop-color="#020408" />
    </linearGradient>

    <linearGradient id="facetObsidianMid" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="60%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#060A12" />
    </linearGradient>

    <!-- Specular Highlight & Sheen Facets (Right Side) -->
    <linearGradient id="facetSpecularUpper" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0A1E38" />
      <stop offset="40%" stop-color="#1E426D" />
      <stop offset="75%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#BAE6FD" />
    </linearGradient>

    <linearGradient id="facetSpecularLower" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.95" />
      <stop offset="35%" stop-color="#163456" />
      <stop offset="80%" stop-color="#0B1526" />
      <stop offset="100%" stop-color="#040810" />
    </linearGradient>

    <!-- Lower Keel Diamond Facets -->
    <linearGradient id="facetKeelLeft" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0C1524" />
      <stop offset="70%" stop-color="#050912" />
      <stop offset="100%" stop-color="#020408" />
    </linearGradient>

    <linearGradient id="facetKeelRight" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#25517E" />
      <stop offset="50%" stop-color="#0E233E" />
      <stop offset="100%" stop-color="#060E1A" />
    </linearGradient>
  </defs>

  <!-- Background Base Silhouette with Outer Cyan Bevel Edge -->
  <polygon
    points="100,10 184,170 128,138 100,180 72,138 16,170"
    fill="url(#facetObsidianDark)"
    stroke="url(#apexCyanLine)"
    stroke-width="5"
    stroke-linejoin="round"
  />

  <!-- 1. Outer Left Wing Upper Facet -->
  <polygon
    points="100,10 16,170 78,114"
    fill="url(#facetObsidianDark)"
    stroke="#0284C7"
    stroke-width="1.2"
    stroke-opacity="0.9"
    stroke-linejoin="round"
  />

  <!-- 2. Outer Left Wing Lower Facet -->
  <polygon
    points="78,114 16,170 72,138"
    fill="url(#facetObsidianMid)"
    stroke="#06B6D4"
    stroke-width="1.5"
    stroke-linejoin="round"
  />

  <!-- 3. Central-Left Dorsal Facet -->
  <polygon
    points="100,10 78,114 100,114"
    fill="url(#facetObsidianMid)"
    stroke="#00E5FF"
    stroke-width="1.8"
    stroke-linejoin="round"
  />

  <!-- 4. Central-Right Dorsal Facet (Bright Specular) -->
  <polygon
    points="100,10 100,114 122,114"
    fill="url(#facetSpecularUpper)"
    stroke="#67E8F9"
    stroke-width="1.8"
    stroke-linejoin="round"
  />

  <!-- 5. Outer Right Wing Upper Facet (Metallic Sheen) -->
  <polygon
    points="100,10 122,114 184,170"
    fill="url(#facetSpecularLower)"
    stroke="#38BDF8"
    stroke-width="1.5"
    stroke-linejoin="round"
  />

  <!-- 6. Outer Right Wing Lower Facet -->
  <polygon
    points="122,114 128,138 184,170"
    fill="url(#facetObsidianMid)"
    stroke="#06B6D4"
    stroke-width="1.5"
    stroke-linejoin="round"
  />

  <!-- 7. Bottom Keel Left Facet -->
  <polygon
    points="100,114 72,138 100,180"
    fill="url(#facetKeelLeft)"
    stroke="#0891B2"
    stroke-width="1.5"
    stroke-linejoin="round"
  />

  <!-- 8. Bottom Keel Right Facet (Specular) -->
  <polygon
    points="100,114 100,180 128,138"
    fill="url(#facetKeelRight)"
    stroke="#38BDF8"
    stroke-width="1.5"
    stroke-linejoin="round"
  />

  <!-- 9. Central Vertical Illuminated Spine Beam (Ridge from Apex to Keel) -->
  <line
    x1="100"
    y1="10"
    x2="100"
    y2="180"
    stroke="url(#apexSpineBeam)"
    stroke-width="3"
    stroke-linecap="round"
  />

  <!-- 10. Horizontal Ridge Line at Mid-Apex (78,114 to 122,114) -->
  <line
    x1="78"
    y1="114"
    x2="122"
    y2="114"
    stroke="#67E8F9"
    stroke-width="2"
    stroke-linecap="round"
  />

  <!-- 11. Center Diamond Spark Core at (100,114) -->
  <polygon
    points="100,108 104,114 100,120 96,114"
    fill="#FFFFFF"
    stroke="#67E8F9"
    stroke-width="1"
  />

  <!-- 12. Outer Perimeter Crisp Highlight Stroke -->
  <polyline
    points="16,170 100,10 184,170"
    fill="none"
    stroke="#A5F3FC"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

async function run() {
  const publicDir = path.join(__dirname, '..', 'public');
  const svgPath = path.join(publicDir, 'favicon.svg');
  
  // 1. Write the clean SVG to public/favicon.svg
  fs.writeFileSync(svgPath, svgContent, 'utf8');
  console.log('Written clean SVG to public/favicon.svg');

  const svgBuffer = Buffer.from(svgContent);

  // 2. Generate crisp PNG icons with sharp
  const targets = [
    { name: 'logo.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-16x16.png', size: 16 },
  ];

  for (const t of targets) {
    const outPath = path.join(publicDir, t.name);
    await sharp(svgBuffer)
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(outPath);
    console.log(`Generated ${t.name} (${t.size}x${t.size})`);
  }

  // 3. Generate genuine multi-resolution Windows ICO file using ImageMagick
  execSync(
    `convert "${path.join(publicDir, 'favicon-32x32.png')}" -define icon:auto-resize=64,48,32,16 "${path.join(publicDir, 'favicon.ico')}"`
  );
  console.log('Generated genuine multi-size favicon.ico');

  // 4. Output the Base64 data URI of the 32x32 icon for direct inline embedding
  const b64 = fs.readFileSync(path.join(publicDir, 'favicon-32x32.png')).toString('base64');
  const dataUri = `data:image/png;base64,${b64}`;
  
  const b64Path = path.join(__dirname, '..', 'src', 'logoBase64.ts');
  fs.writeFileSync(
    b64Path,
    `// Auto-generated base64 icon data URI to bypass browser tab caching completely\nexport const APEX_TAB_FAVICON_DATA_URI = ${JSON.stringify(dataUri)};\n`,
    'utf8'
  );
  console.log('Generated src/logoBase64.ts');
}

run().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
