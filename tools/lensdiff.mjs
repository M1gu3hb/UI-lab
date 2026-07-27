/**
 * Métrica de lensing: ¿la refracción mueve píxeles, y dónde?
 *
 * Renderiza el mismo control con --material-refraction a 0 y a 1, resta las dos
 * imágenes y reporta la diferencia por zonas. Todo lo que no sea refracción se
 * cancela en la resta, así que lo que quede es la señal del material.
 *
 * El criterio de aceptación del bloque 3: la diferencia media en el INTERIOR
 * del control tiene que superar ~8/255. Un anillo de 1-2 px en el perímetro
 * significa que el desplazamiento vive solo en el filo — buen canto, pero no es
 * una lente.
 *
 *   node tools/lensdiff.mjs                    # botón, card y knob
 *   node tools/lensdiff.mjs liquid-glass grid
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = await import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href);

const material = process.argv[2] ?? 'liquid-glass';
const backdrop = process.argv[3] ?? 'grid';

/* Se mide sobre el canvas de la lente, no sobre una captura de página: son los
   píxeles que el shader produce, sin composición ni PNG de por medio. */
const TARGETS = [
  ['boton', '#featuredComponent .ui-button', 'button'],
  ['card', '#featuredComponent .ui-card', 'card'],
  ['knob', '#componentGallery .knob', null],
  ['switch', '#componentGallery .switch-control', null]
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
await page.goto(pathToFileURL(resolve('dist/index.html')).href, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#componentGallery')?.childElementCount > 0);

await page.evaluate(config => {
  for (const [selector, value] of [['#styleSelect', config.material], ['#backgroundSelect', config.backdrop]]) {
    const element = document.querySelector(selector);
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, { material, backdrop });
await page.waitForTimeout(700);

console.log(`material: ${material} · fondo: ${backdrop}\n`);
console.log('control     interior medio   interior max   filo medio   bisel px   veredicto');

let failures = 0;

for (const [label, selector, component] of TARGETS) {
  if (component) {
    await page.evaluate(value => {
      const element = document.querySelector('#componentSelect');
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, component);
    await page.waitForTimeout(450);
  }

  const result = await page.evaluate(async target => {
    const element = document.querySelector(target);
    if (!element) return null;
    /* El motor descarta lo que está fuera del viewport, así que un control de la
       galería sin desplazar mide cero por construcción, no por falta de lente. */
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise(done => setTimeout(done, 260));
    const canvas = element.querySelector(':scope > canvas.mq-lens');
    if (!canvas || !canvas.width) return null;

    const engine = window.MorphiqLensEngineInstance;
    const root = document.documentElement;

    const grab = async refraction => {
      root.style.setProperty('--material-refraction', String(refraction));
      engine.invalidate();
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      engine.frame(performance.now());
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice();
    };

    const low = await grab(0);
    const high = await grab(1);
    root.style.removeProperty('--material-refraction');

    const width = canvas.width;
    const height = canvas.height;
    /* "Interior" = a más de un 18% del lado corto desde el borde. Fuera de esa
       banda vive el canto; dentro debería estar la lente. */
    const margin = Math.max(3, Math.round(Math.min(width, height) * 0.18));
    let innerSum = 0, innerCount = 0, innerMax = 0;
    let edgeSum = 0, edgeCount = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const diff = (Math.abs(low[i] - high[i]) + Math.abs(low[i + 1] - high[i + 1]) + Math.abs(low[i + 2] - high[i + 2])) / 3;
        const inner = x >= margin && y >= margin && x < width - margin && y < height - margin;
        if (inner) {
          innerSum += diff; innerCount += 1;
          if (diff > innerMax) innerMax = diff;
        } else {
          edgeSum += diff; edgeCount += 1;
        }
      }
    }

    const lens = engine.lenses.get(element);
    return {
      innerMean: innerSum / Math.max(innerCount, 1),
      innerMax,
      edgeMean: edgeSum / Math.max(edgeCount, 1),
      size: [width, height],
      bevelCss: lens ? lens.lastBevelCss ?? null : null
    };
  }, selector);

  if (!result) {
    console.log(`${label.padEnd(11)} (sin lente)`);
    continue;
  }
  const pass = result.innerMean >= 8;
  if (!pass) failures += 1;
  console.log(
    `${label.padEnd(11)} ${result.innerMean.toFixed(2).padStart(13)}   ` +
    `${String(Math.round(result.innerMax)).padStart(12)}   ` +
    `${result.edgeMean.toFixed(2).padStart(10)}   ` +
    `${String(result.bevelCss ?? '?').padStart(8)}   ${pass ? 'OK' : 'FALLA'}`
  );
}

console.log(`\n${failures} control(es) con lensing por debajo del umbral de 8/255 en el interior`);
await browser.close();
process.exitCode = failures ? 1 : 0;
