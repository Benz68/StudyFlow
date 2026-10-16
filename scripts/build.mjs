import { readdir, mkdir, copyFile, readFile } from 'node:fs/promises';
import { resolve, dirname, extname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const assets = ['index.html', 'manifest.json', 'sw.js'];
const extensions = new Set(['.mjs', '.css', '.svg', '.png', '.webp']);

async function collect(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(join(directory, entry.name), relative);
    else if (entry.isFile() && extensions.has(extname(entry.name))) assets.push(relative);
  }
}

await collect(join(root, 'src/studyflow'), 'src/studyflow');
const inventory = new Set(assets);
for (const required of ['bootstrap.mjs', 'app.mjs', 'styles.css']) {
  if (!inventory.has(`src/studyflow/${required}`)) throw new Error(`Missing app entry: ${required}`);
}
async function checkOutput(directory, prefix = '') {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory() && assets.some(asset => asset.startsWith(`${relative}/`))) {
      await checkOutput(join(directory, entry.name), relative);
    } else if (!entry.isFile() || !inventory.has(relative)) {
      throw new Error(`Unexpected dist content: ${relative}. Move it out before building; no files were deleted.`);
    }
  }
}
await checkOutput(output);
JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
for (const asset of assets.filter(file => /\.(mjs|js)$/.test(file))) {
  const checked = spawnSync(process.execPath, ['--check', join(root, asset)], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(checked.stderr || `Syntax check failed: ${asset}`);
  const source = await readFile(join(root, asset), 'utf8');
  const imports = /\b(?:import|export)\s+(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(imports)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) throw new Error(`Nonlocal module import in ${asset}: ${specifier}`);
    const dependency = posix.normalize(posix.join(posix.dirname(asset), specifier));
    if (!inventory.has(dependency)) throw new Error(`Missing module imported by ${asset}: ${specifier}`);
  }
}
for (const asset of assets) {
  const destination = join(output, asset);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, asset), destination);
}
console.log(`Validated and copied ${assets.length} app assets to dist.`);
