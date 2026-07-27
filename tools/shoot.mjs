/**
 * Arnés de capturas del laboratorio.
 *
 * No es parte del runtime ni del build: vive en tools/ y usa el Playwright del
 * entorno, no una dependencia del proyecto. Sirve para el gate de la sección 8
 * del brief — "no entregues nada que no hayas visto renderizado".
 *
 *   node tools/shoot.mjs --out docs/reports/liquid-glass/shots
 *   node tools/shoot.mjs --styles glass,liquid-glass --scenes compare --backgrounds light
 *   node tools/shoot.mjs --scenes states --styles skeuo
 *
 * Escenas:
 *   lab      · vista completa del laboratorio
 *   stage    · solo el Material Playground
 *   states   · la tira rest/hover/focus/pressed/disabled
 *   gallery  · la galería de componentes completa
 *   compare  · la vista Compare (todos los materiales lado a lado)
 *   text     · tipografía y estado disabled sobre el material
 */

import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

/* Playwright no es dependencia del proyecto: se resuelve local o global. */
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href);
  }
}

const { chromium } = await loadPlaywright();

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map(chunk => chunk.trim().split(/\s+/))
    .map(([key, ...rest]) => [key, rest.join(' ')])
);

const OUT = args.out ?? 'shots';
const STYLES = (args.styles ?? 'skeuo,glass,liquid-glass').split(',').filter(Boolean);
const SCENES = (args.scenes ?? 'lab,stage,states,gallery').split(',').filter(Boolean);
const BACKGROUNDS = (args.backgrounds ?? 'aurora,light').split(',').filter(Boolean);
const COMPONENTS = (args.components ?? 'button').split(',').filter(Boolean);
const QUALITY = args.quality ?? 'full';
const WIDTH = Number(args.width ?? 1600);
const HEIGHT = Number(args.height ?? 1100);
const SETTLE = Number(args.settle ?? 700);
/* Escala 1 por defecto: las capturas del reporte viven en el repo y a 2x pesan
   cuatro veces mas sin decir nada nuevo sobre el material. */
const SCALE = Number(args.dsf ?? 1);
const PAGE_URL = pathToFileURL(resolve(args.page ?? 'dist/index.html')).href;

const SCENE_TARGETS = {
  lab: null,
  stage: '#materialStage',
  states: '#stateStrip',
  gallery: '#componentGallery',
  compare: '#compareGrid',
  text: '#componentGallery'
};

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE });

page.on('pageerror', error => console.error(`  ! pageerror: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error') console.error(`  ! console: ${message.text()}`);
});

await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#componentGallery')?.childElementCount > 0);

async function apply({ style, background, component, quality, view }) {
  await page.evaluate(async config => {
    const fire = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element || element.value === undefined) return;
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (config.view) document.querySelector(`.view-tab[data-view="${config.view}"]`)?.click();
    fire('#styleSelect', config.style);
    fire('#qualitySelect', config.quality);
    fire('#backgroundSelect', config.background);
    fire('#componentSelect', config.component);
    fire('#compareSelect', config.component);
  }, { style, background, component, quality, view });
  await page.waitForTimeout(SETTLE);
}

const shots = [];

for (const style of STYLES) {
  for (const background of BACKGROUNDS) {
    for (const component of COMPONENTS) {
      for (const scene of SCENES) {
        const view = scene === 'compare' ? 'compare' : 'lab';
        await apply({ style, background, component, quality: QUALITY, view });

        const name = [scene, style, background, COMPONENTS.length > 1 ? component : null]
          .filter(Boolean).join('_');
        const path = `${OUT}/${name}.png`;
        const selector = SCENE_TARGETS[scene];

        if (selector) {
          /* Recorte manual en vez de locator.screenshot(): los materiales vivos
             (spring, ripple) nunca quedan "estables" y la comprobación de
             actionability de Playwright expira esperándolos. */
          const clip = await page.evaluate(target => {
            const element = document.querySelector(target);
            if (!element) return null;
            element.scrollIntoView({ block: 'center', behavior: 'instant' });
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x: Math.max(0, x), y: Math.max(0, y), width, height };
          }, selector);
          if (!clip || clip.width < 1 || clip.height < 1) {
            console.error(`  ! ${scene}: ${selector} no es capturable, se omite`);
            continue;
          }
          await page.waitForTimeout(220);
          await page.screenshot({ path, clip });
        } else {
          await page.screenshot({ path });
        }
        shots.push(path);
        console.log(`  · ${path}`);
      }
    }
  }
}

await browser.close();
console.log(`\n${shots.length} capturas en ${OUT}/`);
