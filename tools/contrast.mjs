/**
 * Auditoría de contraste WCAG del gate de la sección 7.
 *
 * Compone el tinte del material sobre blanco y sobre negro y mide el peor caso
 * contra el color de texto real. El vidrio nunca puede pedirle legibilidad al
 * fondo: si una receta solo pasa sobre oscuro, no pasa.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = await import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href);

const style = process.argv[2] ?? 'liquid-glass';

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
await page.goto(pathToFileURL(resolve('dist/index.html')).href, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#componentGallery')?.childElementCount > 0);
await page.evaluate(target => {
  const element = document.querySelector('#styleSelect');
  element.value = target;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}, style);
await page.waitForTimeout(700);

const rows = await page.evaluate(() => {
  const parse = value => {
    const parts = String(value).match(/-?[\d.]+/g);
    if (!parts) return null;
    const [r, g, b, a = 1] = parts.map(Number);
    return { r, g, b, a };
  };
  const luminance = ({ r, g, b }) => {
    const channel = value => {
      const scaled = value / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const over = (layer, base) => layer && layer.a
    ? { r: layer.r * layer.a + base.r * (1 - layer.a),
        g: layer.g * layer.a + base.g * (1 - layer.a),
        b: layer.b * layer.a + base.b * (1 - layer.a), a: 1 }
    : base;
  const ratio = (a, b) => {
    const high = Math.max(luminance(a), luminance(b));
    const low = Math.min(luminance(a), luminance(b));
    return (high + 0.05) / (low + 0.05);
  };

  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const targets = [
    ['button primary', '.ui-button--primary'],
    ['button secondary', '.ui-button--secondary'],
    ['button tertiary', '.ui-button--tertiary'],
    ['button danger', '.ui-button--danger'],
    ['button disabled', '.ui-button[disabled]'],
    ['input', '.field input'],
    ['card titulo', '.ui-card h5'],
    ['card cuerpo', '.ui-card p'],
    ['gallery titulo', '.gallery-card h4']
  ];

  return targets.map(([label, selector]) => {
    const element = document.querySelector(`#componentGallery ${selector}`) || document.querySelector(selector);
    if (!element) return { label, missing: true };
    const styles = getComputedStyle(element);
    const text = parse(styles.color);
    /* El tinte efectivo: el fondo propio del elemento mas el --mq-body que pinta
       el shader, que es lo que de verdad hay bajo el texto. */
    const tint = parse(styles.getPropertyValue('--mq-body')) || parse(styles.backgroundColor);
    if (!text) return { label, missing: true };
    return {
      label,
      onWhite: +ratio(text, over(tint, white)).toFixed(2),
      onBlack: +ratio(text, over(tint, black)).toFixed(2)
    };
  });
});

let failed = 0;
console.log(`material: ${style}\n`);
console.log('control              sobre blanco   sobre negro   peor    AA');
for (const row of rows) {
  if (row.missing) { console.log(`${row.label.padEnd(20)} (no encontrado)`); continue; }
  const worst = Math.min(row.onWhite, row.onBlack);
  const pass = worst >= 4.5;
  if (!pass) failed += 1;
  console.log(
    `${row.label.padEnd(20)} ${String(row.onWhite).padStart(9)}   ${String(row.onBlack).padStart(10)}   ${String(worst).padStart(5)}   ${pass ? 'OK' : 'FALLA'}`
  );
}
console.log(`\n${failed} de ${rows.filter(r => !r.missing).length} controles por debajo de 4.5:1`);
await browser.close();
process.exitCode = failed ? 1 : 0;
