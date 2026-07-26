/**
 * Build estático del laboratorio: copia fuente → dist/ y verifica que todo lo
 * que el HTML referencia haya llegado al output. No transforma nada; el
 * laboratorio es HTML/CSS/JS vanilla a propósito.
 */

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const output = 'dist';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp('index.html', `${output}/index.html`);
await cp('styles', `${output}/styles`, { recursive: true });
await cp('scripts', `${output}/scripts`, {
  recursive: true,
  filter: source => !source.endsWith('build.mjs') && !source.endsWith('validate.mjs')
});

/* Todo lo que el HTML publicado referencia tiene que existir en dist/. */
const html = await readFile(`${output}/index.html`, 'utf8');
const referenced = new Set([...html.matchAll(/(?:src|href)="((?:styles|scripts)\/[^"]+)"/g)].map(match => match[1]));
for (const path of referenced) {
  try {
    await access(`${output}/${path}`);
  } catch {
    throw new Error(`El HTML publicado referencia ${path}, que no llegó a ${output}/.`);
  }
}

await writeFile(`${output}/build.json`, JSON.stringify({
  app: 'Morphiq Material Lab',
  version,
  assets: [...referenced].sort(),
  builtAt: new Date().toISOString()
}, null, 2));

console.log(`Build estático en ${output}/ — ${referenced.size} assets verificados.`);
