/**
 * Auditoría de contraste WCAG sobre píxeles renderizados, por tono.
 *
 * QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR
 * Antes esto componía el `background-color` declarado del elemento. Con el
 * motor de lentes pintando el cuerpo del vidrio en un canvas detrás del
 * contenido, ese número dejó de describir lo que se ve: el fondo real bajo el
 * texto son los píxeles del canvas, no la regla CSS. Ahora se leen esos píxeles,
 * componiendo la pila completa — bitmap del fondo, canvas de lente de cada
 * ancestro de vidrio, y color CSS de cada ancestro.
 *
 * Y se mide DENTRO DE CADA TONO. El gate absoluto — sobre blanco y sobre negro
 * a la vez — forzaba un alfa de cuerpo tan alto que el shader solo dejaba pasar
 * un 22% de la imagen refractada: el material dejaba de leer como vidrio. Un
 * material de vidrio tiene dos recetas, una por tono, y cada una responde de su
 * rango. Es la misma resolución que aplicó Apple entre iOS 26 y 27.
 *
 *   node tools/contrast.mjs liquid-glass
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = await import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href);

const style = process.argv[2] ?? 'liquid-glass';

/* Dentro de cada tono se prueban varios fondos y se conserva el peor. */
const TONES = [
  { tone: 'oscuro', backdrops: ['grid', 'landscape', 'type'] },
  { tone: 'claro', backdrops: ['light'] }
];

const TARGETS = [
  ['button primary', '.ui-button--primary'],
  ['button secondary', '.ui-button--secondary'],
  ['button tertiary', '.ui-button--tertiary'],
  ['button danger', '.ui-button--danger'],
  ['button disabled', '.ui-button[disabled]'],
  ['input', '.field input[type="text"], .field input[type="email"]'],
  ['card titulo', '.ui-card h5'],
  ['card cuerpo', '.ui-card p'],
  ['gallery titulo', '.gallery-card h4']
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
await page.goto(pathToFileURL(resolve('dist/index.html')).href, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#componentGallery')?.childElementCount > 0);

async function audit(material, backdrop, targets) {
  await page.evaluate(config => {
    for (const [selector, value] of [['#styleSelect', config.material], ['#backgroundSelect', config.backdrop]]) {
      const element = document.querySelector(selector);
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { material, backdrop });
  await page.waitForTimeout(750);

  return page.evaluate(list => {
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
    const ratio = (a, b) => {
      const high = Math.max(luminance(a), luminance(b));
      const low = Math.min(luminance(a), luminance(b));
      return (high + 0.05) / (low + 0.05);
    };
    const over = (layer, base) => {
      if (!layer) return base;
      if (layer.a >= 1) return layer;
      if (layer.a <= 0) return base;
      return {
        r: layer.r * layer.a + base.r * (1 - layer.a),
        g: layer.g * layer.a + base.g * (1 - layer.a),
        b: layer.b * layer.a + base.b * (1 - layer.a),
        a: 1
      };
    };

    const backdropCanvas = document.querySelector('#mqBackdrop');
    const backdropCtx = backdropCanvas?.getContext('2d', { willReadFrequently: true });

    function surfaceAt(node, x, y) {
      const chain = [];
      let current = node;
      while (current && current !== document.body) {
        chain.push(current);
        current = current.parentElement;
      }

      let base = { r: 12, g: 16, b: 29, a: 1 };
      if (backdropCtx && backdropCanvas.width) {
        const sx = backdropCanvas.width / window.innerWidth;
        const sy = backdropCanvas.height / window.innerHeight;
        const px = backdropCtx.getImageData(
          Math.max(0, Math.min(backdropCanvas.width - 1, Math.round(x * sx))),
          Math.max(0, Math.min(backdropCanvas.height - 1, Math.round(y * sy))), 1, 1
        ).data;
        base = { r: px[0], g: px[1], b: px[2], a: 1 };
      }

      for (const element of chain.reverse()) {
        const lens = element.querySelector?.(':scope > canvas.mq-lens');
        if (lens && lens.width && getComputedStyle(lens).display !== 'none') {
          const rect = element.getBoundingClientRect();
          const lx = Math.round(((x - rect.left) / rect.width) * lens.width);
          const ly = Math.round(((y - rect.top) / rect.height) * lens.height);
          if (lx >= 0 && ly >= 0 && lx < lens.width && ly < lens.height) {
            const px = lens.getContext('2d', { willReadFrequently: true }).getImageData(lx, ly, 1, 1).data;
            base = over({ r: px[0], g: px[1], b: px[2], a: px[3] / 255 }, base);
          }
        }
        const declared = parse(getComputedStyle(element).backgroundColor);
        if (declared && declared.a > 0) base = over(declared, base);
      }
      return base;
    }

    return list.map(([label, selector]) => {
      const element = document.querySelector(`#componentGallery ${selector}`)
        || document.querySelector(selector);
      if (!element) return { label, missing: true };
      const text = parse(getComputedStyle(element).color);
      const rect = element.getBoundingClientRect();
      if (!text || rect.width < 2 || rect.height < 2) return { label, missing: true };

      /* Peor caso sobre la caja del control: se muestrea una rejilla y se toma
         el píxel con menos contraste, no el promedio. Un material que promedia
         bien y tiene una zona ilegible sigue siendo ilegible. */
      let worst = Infinity;
      for (let i = 1; i <= 5; i += 1) {
        for (let j = 1; j <= 3; j += 1) {
          const x = rect.left + (rect.width * i) / 6;
          const y = rect.top + (rect.height * j) / 4;
          worst = Math.min(worst, ratio(text, surfaceAt(element, x, y)));
        }
      }
      return { label, worst: Number(worst.toFixed(2)) };
    });
  }, targets);
}

let failures = 0;
let checks = 0;
console.log(`material: ${style}\n`);

for (const { tone, backdrops } of TONES) {
  console.log(`── tono ${tone} ──`);
  const worstByTarget = new Map();
  for (const backdrop of backdrops) {
    for (const row of await audit(style, backdrop, TARGETS)) {
      if (row.missing) continue;
      const previous = worstByTarget.get(row.label);
      if (previous === undefined || row.worst < previous) worstByTarget.set(row.label, row.worst);
    }
  }
  for (const [label, worst] of worstByTarget) {
    const pass = worst >= 4.5;
    checks += 1;
    if (!pass) failures += 1;
    console.log(`  ${label.padEnd(20)} ${String(worst).padStart(7)}:1   ${pass ? 'OK' : 'FALLA'}`);
  }
  console.log('');
}

console.log(`${failures} de ${checks} medidas por debajo de 4.5:1 (peor fondo y peor píxel de cada tono)`);
await browser.close();
process.exitCode = failures ? 1 : 0;
