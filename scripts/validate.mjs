/**
 * Morphiq Material Lab — validador de estado.
 *
 * Este validador NO afirma nada sobre la implementación interna de un motor
 * concreto (esa fue la razón por la que el anterior quedó obsoleto). Valida
 * tres cosas estables:
 *
 *   1. Estructura   — los archivos declarados en el manifiesto existen y el
 *                     HTML los referencia de verdad.
 *   2. Sintaxis     — todo JS/MJS pasa `node --check`.
 *   3. Invariantes  — las reglas no negociables de la sección 8 del brief que
 *                     se pueden comprobar estáticamente, aplicadas por material
 *                     según su estado.
 *
 * El manifiesto es un trinquete: un material empieza en `pending`, pasa a
 * `legacy` cuando existe pero su receta todavía no está cocinada, y a
 * `shipped` cuando su round se aprueba. Los invariantes estrictos solo se
 * exigen a los materiales `shipped`, de modo que la barra sube round a round
 * y nunca baja.
 */

import { access, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/* ------------------------------------------------------------------ */
/* Manifiesto de materiales                                            */
/* ------------------------------------------------------------------ */

/**
 * status:
 *   'shipped' — receta aprobada. Se le exigen TODOS los invariantes.
 *   'legacy'  — el archivo existe pero la receta es la vieja, sin cocinar.
 *               Solo se exige que exista y esté cableado.
 *   'pending' — todavía no existe. Solo se reporta.
 */
const MATERIALS = [
  { slug: 'clay',         label: 'Claymorphism',  status: 'pending', css: 'styles/clay.css',         js: null },
  { slug: 'glass',        label: 'Glassmorphism', status: 'legacy',  css: 'styles/glass.css',        js: 'scripts/glass.js' },
  { slug: 'skeuo',        label: 'Skeuomorphism', status: 'legacy',  css: 'styles/skeuo.css',        js: 'scripts/skeuo.js' },
  { slug: 'adaptive',     label: 'Polymorphism',  status: 'pending', css: 'styles/adaptive.css',     js: null },
  { slug: 'liquid-glass', label: 'Liquid Glass',  status: 'legacy',  css: 'styles/liquid-glass.css', js: 'scripts/liquid-glass.js' }
];

/** Archivos de infraestructura del laboratorio, no recetas de material. */
const SHELL_FILES = [
  'index.html',
  'styles/base.css',
  'scripts/app.js',
  'scripts/liquid-renderer.js',
  'scripts/build.mjs',
  'scripts/validate.mjs'
];

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Quita los comentarios de bloque para que los invariantes no salten por texto en prosa. */
function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

async function collectScripts(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await collectScripts(path)));
    else if (/\.m?js$/.test(entry.name)) found.push(path);
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* 1. Estructura                                                       */
/* ------------------------------------------------------------------ */

for (const file of SHELL_FILES) {
  check(await exists(file), `Falta un archivo de infraestructura: ${file}`);
}

const active = MATERIALS.filter(material => material.status !== 'pending');

for (const material of active) {
  check(await exists(material.css), `[${material.slug}] falta la hoja de material: ${material.css}`);
  if (material.js) {
    check(await exists(material.js), `[${material.slug}] falta el comportamiento: ${material.js}`);
  }
}

for (const material of MATERIALS.filter(entry => entry.status === 'pending')) {
  notes.push(`pendiente · ${material.slug} (${material.label}) — todavía no tiene receta en el laboratorio.`);
}

/* El bootstrap base64 quedó eliminado en la Fase 0; que no vuelva. */
check(!(await exists('bootstrap')), 'El directorio bootstrap/ volvió a aparecer: el repo debe contener archivos fuente planos.');
check(!(await exists('scripts/restore-build.mjs')), 'scripts/restore-build.mjs volvió a aparecer: el build ya no reconstruye ningún archivo.');

/* ------------------------------------------------------------------ */
/* 2. Sintaxis JS                                                      */
/* ------------------------------------------------------------------ */

for (const file of await collectScripts('scripts')) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  check(result.status === 0, `${file} no pasa la validación de sintaxis:\n${result.stderr}`);
}

/* ------------------------------------------------------------------ */
/* 3. Cableado real del HTML                                           */
/* ------------------------------------------------------------------ */

const html = await readFile('index.html', 'utf8');

check(html.includes('styles/base.css'), 'index.html no enlaza styles/base.css.');

for (const material of active) {
  check(html.includes(material.css), `[${material.slug}] index.html no enlaza ${material.css}.`);
  if (material.js) {
    check(html.includes(material.js), `[${material.slug}] index.html no carga ${material.js}.`);
  }
}

/* Toda referencia local del HTML debe existir en disco: nada de 404 silenciosos. */
const referenced = [...html.matchAll(/(?:src|href)="((?:styles|scripts)\/[^"]+)"/g)].map(match => match[1]);
for (const path of new Set(referenced)) {
  check(await exists(path), `index.html referencia ${path}, que no existe en disco.`);
}

/* Los scripts de build no se publican. */
check(!html.includes('scripts/build.mjs'), 'index.html no debe cargar scripts/build.mjs.');
check(!html.includes('scripts/validate.mjs'), 'index.html no debe cargar scripts/validate.mjs.');

/* ------------------------------------------------------------------ */
/* 4. Invariantes de material (solo para recetas `shipped`)            */
/* ------------------------------------------------------------------ */

for (const material of MATERIALS.filter(entry => entry.status === 'shipped')) {
  const css = stripCssComments(await readFile(material.css, 'utf8'));

  // Auto-contención: la receta no puede depender de una hoja global.
  const rootSelectors = css.match(/(^|[\s,{}])(:root)\b/g) ?? [];
  check(
    rootSelectors.length === 0,
    `[${material.slug}] usa :root (${rootSelectors.length} veces). Una receta auto-contenida no puede depender de una hoja global.`
  );

  // Cada var() con fallback literal: pegar la receta en un HTML vacío debe verse igual.
  const bareVars = [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(match => match[1]);
  check(
    bareVars.length === 0,
    `[${material.slug}] tiene ${bareVars.length} var() sin fallback literal: ${[...new Set(bareVars)].slice(0, 6).join(', ')}${bareVars.length > 6 ? '…' : ''}`
  );

  // forced-colors: sin este bloque el material desaparece en alto contraste.
  check(
    css.includes('forced-colors'),
    `[${material.slug}] no declara un bloque @media (forced-colors: active). Las sombras y los backdrop-filter desaparecen ahí.`
  );

  // reduced-motion: el material debe seguir siendo reconocible en estático.
  check(
    css.includes('prefers-reduced-motion'),
    `[${material.slug}] no declara un bloque @media (prefers-reduced-motion: reduce).`
  );

  // Foco visible, y su equivalente capturable en screenshots.
  check(
    css.includes(':focus-visible'),
    `[${material.slug}] no define un estado :focus-visible.`
  );
  check(
    css.includes('data-focus'),
    `[${material.slug}] no define el equivalente [data-focus="true"] que permite capturar el foco en screenshots.`
  );
}

/* Métrica informativa sobre los materiales todavía sin cocinar. */
for (const material of MATERIALS.filter(entry => entry.status === 'legacy')) {
  const css = stripCssComments(await readFile(material.css, 'utf8'));
  const bare = [...css.matchAll(/var\(\s*--[\w-]+\s*\)/g)].length;
  const roots = (css.match(/(^|[\s,{}])(:root)\b/g) ?? []).length;
  notes.push(`legacy · ${material.slug} — ${bare} var() sin fallback, ${roots} usos de :root. Se exigirá al pasar a shipped.`);
}

/* ------------------------------------------------------------------ */
/* Salida                                                              */
/* ------------------------------------------------------------------ */

for (const note of notes) console.log(`  · ${note}`);

if (failures.length) {
  console.error(`\n${failures.length} problema(s) de validación:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

const shipped = MATERIALS.filter(entry => entry.status === 'shipped').length;
console.log(`\nValidación OK — ${MATERIALS.length} materiales en el manifiesto (${shipped} shipped, ${active.length - shipped} legacy, ${MATERIALS.length - active.length} pending).`);
