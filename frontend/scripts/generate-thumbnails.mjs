// Regenerates public/module-thumbnails/<type>.png for one or more catalog
// module types, headless — no manual clicking, no chat-tool screenshot
// round-trips. Pairs with app/dev-thumb-export/page.tsx (?types=a,b,c).
//
// Usage (from frontend/, with the Next dev server already running):
//   node scripts/generate-thumbnails.mjs <type1> <type2> ...
//   node scripts/generate-thumbnails.mjs --base http://localhost:3123 <type1>
//
// Requires @playwright/test (already a devDependency) and its Chromium
// browser binary — first run only: `npx playwright install chromium`.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let base = "http://localhost:3123";
const baseIdx = args.indexOf("--base");
if (baseIdx !== -1) {
  base = args[baseIdx + 1];
  args.splice(baseIdx, 2);
}
const types = args;

if (types.length === 0) {
  console.error("Usage: node scripts/generate-thumbnails.mjs <type1> <type2> ... [--base http://localhost:3123]");
  process.exit(1);
}

const outDir = path.join(__dirname, "..", "public", "module-thumbnails");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 288 * types.length + 40, height: 260 } });

const url = `${base}/dev-thumb-export?types=${types.map(encodeURIComponent).join(",")}`;
console.log(`Loading ${url}`);
await page.goto(url, { waitUntil: "networkidle" });

for (const type of types) {
  try {
    await page.waitForSelector(`[data-thumb-slot="${type}"][data-ready="true"] canvas`, { timeout: 20000 });
    const canvas = await page.$(`[data-thumb-slot="${type}"] canvas`);
    const outPath = path.join(outDir, `${type}.png`);
    await canvas.screenshot({ path: outPath });
    console.log(`✓ ${type} -> ${path.relative(process.cwd(), outPath)}`);
  } catch (err) {
    console.error(`✗ ${type} failed: ${err.message}`);
  }
}

await browser.close();
