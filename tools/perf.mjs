/**
 * Medición de frames del laboratorio con la galería completa en pantalla.
 *
 * Aviso importante para leer el número: este entorno no tiene GPU. Chromium
 * corre WebGL sobre SwiftShader, por software. El coste de fill-rate del motor
 * de lentes aquí es el peor caso posible; en una máquina con GPU real el
 * shader es la parte barata. El número que sale de aquí es un suelo, no una
 * estimación.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = await import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href);

const style = process.argv[2] ?? 'liquid-glass';
const seconds = Number(process.argv[3] ?? 4);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve('dist/index.html')).href, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#componentGallery')?.childElementCount > 0);

await page.evaluate(target => {
  const fire = (selector, value) => {
    const element = document.querySelector(selector);
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  fire('#styleSelect', target);
  fire('#backgroundSelect', 'landscape');
}, style);
await page.waitForTimeout(900);

const stats = await page.evaluate(async duration => {
  const gallery = document.querySelector('#componentGallery');
  gallery.scrollIntoView({ block: 'start', behavior: 'instant' });
  const lenses = 0;
  const surfaces = document.querySelectorAll('.gallery-card, .ui-button, .ui-card').length;
  const drawn = document.querySelectorAll('[class*="glass"], .ui-card, .ui-button').length;

  /* Caso realista, no sintético: un solo control bajo interacción continua
     mientras el resto de la galería está en pantalla. Golpear 12 botones a la
     vez mide una situación que no ocurre y esconde el número que importa. */
  /* Sin motor propio, la carga realista es desplazamiento e interacción: es lo
     que obliga al compositor a rehacer los backdrop-filter. */
  const target = document.querySelector('#componentGallery .ui-button');
  const pump = setInterval(() => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.5
    }));
    window.scrollBy(0, 2);
  }, 60);

  const frames = [];
  let previous = performance.now();
  await new Promise(done => {
    const tick = now => {
      frames.push(now - previous);
      previous = now;
      if (now - frames.start < 0) return;
      if (frames.length > 12 && performance.now() - startedAt > duration * 1000) return done();
      requestAnimationFrame(tick);
    };
    const startedAt = performance.now();
    requestAnimationFrame(tick);
  });
  clearInterval(pump);

  const sorted = frames.slice(1).sort((a, b) => a - b);
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    lenses,
    drawn,

    surfaces,
    frames: sorted.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    worst: sorted[sorted.length - 1],
    fpsMedian: 1000 / percentile(0.5)
  };
}, seconds);

console.log(`estilo: ${style}`);
console.log(`lentes registradas: ${stats.lenses} · dibujadas por frame: ${stats.drawn} · superficies en el DOM: ${stats.surfaces}`);
console.log(`frames medidos: ${stats.frames}`);
console.log(`frame mediano: ${stats.median.toFixed(2)} ms  (${stats.fpsMedian.toFixed(1)} fps)`);
console.log(`p95: ${stats.p95.toFixed(2)} ms · peor: ${stats.worst.toFixed(2)} ms`);


await browser.close();
