import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const assetsDir = path.resolve(distDir, 'assets');

const MAX_GZIP_SHELL_BYTES = 150 * 1024; // 150 KB

if (!fs.existsSync(distDir) || !fs.existsSync(assetsDir)) {
  console.error('Error: dist/assets folder not found. Run `npm run build` first.');
  process.exit(1);
}

// Find index.html to identify initial scripts
const indexHtmlPath = path.resolve(distDir, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Match <script ... src="/assets/xxx.js"> or src="assets/xxx.js"
const scriptMatches = [...indexHtml.matchAll(/src=["']\/?assets\/([^"']+\.js)["']/g)];
const initialJsFiles = scriptMatches.map((m) => m[1]);

console.log('\n--- BUNDLE SIZE AUDIT (performance.md) ---');
console.log(`Max initial shell JS budget: 150 KB gzip (${MAX_GZIP_SHELL_BYTES} bytes)\n`);

let totalRaw = 0;
let totalGzip = 0;

const files = fs.readdirSync(assetsDir);
for (const file of files) {
  const filePath = path.join(assetsDir, file);
  const stat = fs.statSync(filePath);
  const content = fs.readFileSync(filePath);
  const gzipSize = zlib.gzipSync(content).length;

  const isInitial = initialJsFiles.includes(file) || file.endsWith('.js');
  if (file.endsWith('.js')) {
    totalRaw += stat.size;
    totalGzip += gzipSize;
  }

  const rawKb = (stat.size / 1024).toFixed(2);
  const gzipKb = (gzipSize / 1024).toFixed(2);
  const tag = isInitial ? '[INITIAL]' : '[LAZY]   ';

  console.log(
    `${tag} ${file.padEnd(35)} Raw: ${rawKb.padStart(7)} KB | Gzip: ${gzipKb.padStart(6)} KB`
  );
}

const totalRawKb = (totalRaw / 1024).toFixed(2);
const totalGzipKb = (totalGzip / 1024).toFixed(2);

console.log('\n------------------------------------------');
console.log(`Total Initial JS: Raw ${totalRawKb} KB | Gzip ${totalGzipKb} KB`);
console.log(`Budget Limit    : 150.00 KB gzip`);

if (totalGzip > MAX_GZIP_SHELL_BYTES) {
  console.error(
    `\n❌ FAILED: Initial JS bundle exceeded budget by ${(totalGzip - MAX_GZIP_SHELL_BYTES) / 1024} KB`
  );
  process.exit(1);
} else {
  console.log(
    `\n✅ PASSED: Initial JS bundle is within budget! (${((totalGzip / MAX_GZIP_SHELL_BYTES) * 100).toFixed(1)}% of budget)`
  );
}
