(() => {
  'use strict';

  window.MorphiqRecipes = window.MorphiqRecipes || {};

  const variants = {
    conservative: {
      '--material-bg': 'rgba(22,42,66,.20)',
      '--material-border': 'rgba(255,255,255,.40)',
      '--material-highlight': 'rgba(255,255,255,.58)',
      '--material-shadow': 'rgba(0,5,18,.34)',
      '--material-radius': '20px',
      '--material-depth': '17px',
      '--material-texture': '.01',
      '--material-blur': '14px',
      '--material-refraction': '.24',
      '--material-dispersion': '.04',
      '--material-specular': '.58',
      '--material-roughness': '.18',
      '--ripple-intensity': '.32',
      '--ripple-brightness': '.14',
      '--ripple-count': '1',
      '--motion-elasticity': '.46',
      '--motion-stiffness': '310',
      '--motion-damping': '29',
      '--stretch-limit': '.08',
      '--motion-duration': '220ms'
    },
    expressive: {
      '--material-bg': 'rgba(18,39,65,.17)',
      '--material-border': 'rgba(255,255,255,.48)',
      '--material-highlight': 'rgba(255,255,255,.70)',
      '--material-shadow': 'rgba(0,5,18,.40)',
      '--material-radius': '23px',
      '--material-depth': '22px',
      '--material-texture': '.02',
      '--material-blur': '17px',
      '--material-refraction': '.44',
      '--material-dispersion': '.09',
      '--material-specular': '.74',
      '--material-roughness': '.12',
      '--ripple-intensity': '.50',
      '--ripple-brightness': '.22',
      '--ripple-count': '2',
      '--motion-elasticity': '.68',
      '--motion-stiffness': '255',
      '--motion-damping': '23',
      '--stretch-limit': '.16',
      '--motion-duration': '280ms'
    },
    experimental: {
      '--material-bg': 'rgba(16,35,60,.14)',
      '--material-border': 'rgba(255,255,255,.58)',
      '--material-highlight': 'rgba(255,255,255,.84)',
      '--material-shadow': 'rgba(0,5,18,.48)',
      '--material-radius': '29px',
      '--material-depth': '28px',
      '--material-texture': '.03',
      '--material-blur': '19px',
      '--material-refraction': '.66',
      '--material-dispersion': '.16',
      '--material-specular': '.88',
      '--material-roughness': '.07',
      '--ripple-intensity': '.68',
      '--ripple-brightness': '.34',
      '--ripple-count': '3',
      '--motion-elasticity': '.84',
      '--motion-stiffness': '215',
      '--motion-damping': '18',
      '--stretch-limit': '.24',
      '--motion-duration': '340ms'
    }
  };

  /* Contrato --mq-*: lo que se congela en el componente al inyectar en Morphiq
     UI. Cada token documenta qué hace y en qué rango tiene sentido, porque un
     token sin rango es un número mágico que la siguiente persona no se atreve
     a tocar. */
  const mqTokens = [
    ['--mq-body', 'rgba(12,29,50,.76)', 'Cuerpo del vidrio: color y cuanto tine lo refractado. El alfa es el gate de contraste: por debajo de .66 el texto claro cae de 4.5:1 sobre fondo blanco.', 'alfa .66-.88'],
    ['--mq-lit', '#cfeeff', 'Color del highlight del canto orientado a la luz.', 'color'],
    ['--mq-edge', 'rgba(3,12,26,.62)', 'Canto inferior y profundidad al presionar.', 'color'],
    ['--mq-text', '#f2fbff', 'Color de texto sobre el material.', 'color'],
    ['--mq-brd', 'rgba(196,232,255,.44)', 'Borde real. Es lo unico que sobrevive en forced-colors.', 'color'],
    ['--mq-ring', 'rgba(120,224,255,.85)', 'Anillo de foco.', 'color'],
    ['--mq-thick', '3.4px', 'Grosor del canto. Es el token que mas define el material: por debajo de 2px deja de leer como vidrio.', '1.5-7px'],
    ['--mq-iri', '.16', 'Irisacion cromatica del canto. Por encima de .25 el material se vuelve jabon.', '0-.4'],
    ['--mq-caustic', '.62', 'Charco de luz proyectado bajo el cuerpo. Vende el espesor mas que cualquier highlight.', '0-1'],
    ['--mq-flat', '0', '0 = liquido deformable, 1 = lamina rigida. Es el token que separa liquid-glass de glass.', '0 o 1'],
    ['--mq-blur-scale', '.55', 'Multiplica el desenfoque global. El vidrio dobla mas de lo que difumina.', '.3-2'],
    ['--mq-radius', '18px', 'Radio de esquina de la superficie.', '8-999px']
  ];

  const classCode = `/* Auto-contenido: cada var() con fallback literal, cero :root.
   Pegado en un HTML vacio se ve igual. */
.mq-liquid-glass {
  --mq-body: rgba(12, 29, 50, .76);
  --mq-lit: #cfeeff;
  --mq-edge: rgba(3, 12, 26, .62);
  --mq-text: #f2fbff;
  --mq-brd: rgba(196, 232, 255, .44);
  --mq-ring: rgba(120, 224, 255, .85);
  --mq-thick: 3.4px;
  --mq-iri: .16;
  --mq-caustic: .62;
  --mq-flat: 0;

  position: relative;
  isolation: isolate;              /* contiene el canvas de la lente */
  border: 1px solid var(--mq-brd, rgba(196, 232, 255, .44));
  border-radius: var(--mq-radius, 18px);
  color: var(--mq-text, #f2fbff);
  background: var(--mq-body, rgba(12, 29, 50, .76));
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, .22) inset,
    0 -1px 0 0 var(--mq-edge, rgba(3, 12, 26, .62)) inset,
    0 12px 30px -12px rgba(2, 10, 24, .72);
}

/* Sin WebGL el canto se construye con gradientes: sigue habiendo espesor,
   luz direccional y bisel. */
.mq-liquid-glass::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(var(--light-angle, 315deg),
      rgba(255,255,255,.62) 0,
      rgba(255,255,255,.06) calc(var(--mq-thick, 3.4px) * 1.6),
      transparent calc(var(--mq-thick, 3.4px) * 3.4)),
    linear-gradient(calc(var(--light-angle, 315deg) + 180deg),
      rgba(150,220,255,.34) 0,
      transparent calc(var(--mq-thick, 3.4px) * 2.6));
  backdrop-filter: blur(10px) saturate(150%);
}

/* Al presionar entra mas vidrio en el camino optico. */
.mq-liquid-glass:active { --mq-thick: 5.6px; --mq-caustic: .28; }

.mq-liquid-glass:focus-visible,
.mq-liquid-glass[data-focus="true"] {
  outline: 2px solid var(--mq-ring, rgba(120, 224, 255, .85));
  outline-offset: 2px;
}

@media (forced-colors: active) {
  .mq-liquid-glass {
    border: 2px solid CanvasText;
    background: Canvas;
    color: CanvasText;
    box-shadow: none;
    backdrop-filter: none;
  }
}`;

  const behaviorCode = `/* El motor de lentes registra la superficie y le inyecta un <canvas> hijo con
   z-index -1. El texto nunca entra en la capa distorsionada: por eso no hay
   halos sobre el contenido. */
import { LensEngine } from './lens-engine.js';

const engine = new LensEngine();
engine.mount(document.body);
engine.setBackdrop('landscape');
engine.setEnabled(true);

export function attachLiquidGlass(element) {
  engine.register(element);

  element.addEventListener('pointerdown', event => {
    // Tension superficial: el impacto deforma el campo de espesor del shader,
    // no dibuja un halo que se expande.
    engine.impact(element, event.clientX, event.clientY, 1);
    element.style.setProperty('--liquid-pressure', '1');
  });

  const release = () => element.style.setProperty('--liquid-pressure', '0');
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
}`;

  const shaderCode = () => window.MorphiqLensShader?.fragmentSource || '// Shader no disponible.';

  window.MorphiqRecipes['liquid-glass'] = {
    name: 'Liquid Glass',
    description: 'Superficie óptica dinámica con campo de altura, normales derivadas, refracción, tensión y recuperación amortiguada.',
    variants,
    mqTokens,
    classCode,
    behaviorCode,
    get shaderCode() { return shaderCode(); },
    exampleCode: `<button class="mq-liquid-glass">Explorar material</button>

<article class="mq-liquid-glass" style="--mq-thick:4.6px; --mq-body:rgba(11,26,45,.62)">
  <h3>Superficie grande</h3>
  <p>Mas cuerpo que un control: el texto de 14px no puede
     pedirle legibilidad al fondo.</p>
</article>`,
    dependencies: 'Sin dependencias externas. Full usa WebGL nativo; Balanced usa Canvas/SVG; Fallback conserva spring y óptica CSS.',
    notes: 'Las ondas deforman un campo de altura y producen refracción, reflejo especular y cáusticas suaves. El brillo y la cantidad de frentes se controlan por separado.'
  };

  const INTERACTIVE_SELECTOR = [
    'button', 'input', 'select', 'textarea', 'a[href]',
    '[role="button"]', '[role="switch"]', '[role="slider"]',
    '[role="tab"]', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  /* Caché de tokens por frame.
     readRootNumber hacía un getComputedStyle por token, por elemento y por
     frame: con 40 componentes animándose eso son cientos de recálculos de
     estilo por frame y era el techo real de rendimiento del laboratorio.
     Ahora se lee una vez por frame y se comparte. */
  let tokenCache = null;
  let tokenFrame = -1;

  function readRootNumber(token, fallback) {
    const now = window.__mqFrameId ?? 0;
    if (tokenFrame !== now || !tokenCache) {
      tokenCache = getComputedStyle(document.documentElement);
      tokenFrame = now;
    }
    const value = Number.parseFloat(tokenCache.getPropertyValue(token));
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  class LiquidSpringController {
    constructor(renderer) {
      this.renderer = renderer;
      this.states = new WeakMap();
      this.boundElastic = new WeakSet();
      this.boundReactive = new WeakSet();
      window.MorphiqLiquidControllerInstance = this;
      this.refreshOptics();
    }

    bind(root = document) {
      if (root.matches?.('.liquid-elastic')) this.bindElement(root);
      if (root.matches?.('.liquid-reactive')) this.bindReactive(root);
      root.querySelectorAll?.('.liquid-elastic').forEach(element => this.bindElement(element));
      root.querySelectorAll?.('.liquid-reactive').forEach(element => this.bindReactive(element));
      this.refreshOptics();
    }

    bindElement(element) {
      if (this.boundElastic.has(element)) return;
      this.boundElastic.add(element);
      const state = this.ensureState(element);
      const profile = this.profileFor(element);

      const updatePointer = event => {
        const point = this.localPoint(element, event.clientX, event.clientY);
        state.originX = point.x;
        state.originY = point.y;
        element.style.setProperty('--px', `${point.x * 100}%`);
        element.style.setProperty('--py', `${point.y * 100}%`);
        this.renderer?.pointerMove(event.clientX, event.clientY);
      };

      element.addEventListener('pointerenter', event => {
        updatePointer(event);
        state.targetProximity = profile.hover;
        this.start(element, state);
      }, { passive: true });

      element.addEventListener('pointermove', event => {
        updatePointer(event);
        const point = this.localPoint(element, event.clientX, event.clientY);
        state.targetTiltX = (0.5 - point.y) * profile.tilt;
        state.targetTiltY = (point.x - 0.5) * profile.tilt;
        state.targetProximity = profile.hover;

        if (state.active && !document.body.classList.contains('reduced-motion')) {
          const rect = element.getBoundingClientRect();
          const dx = event.clientX - (rect.left + rect.width / 2);
          const dy = event.clientY - (rect.top + rect.height / 2);
          const stretchLimit = readRootNumber('--stretch-limit', 0.12) * profile.stretch;
          const elasticity = readRootNumber('--motion-elasticity', 0.56);
          const motion = readRootNumber('--motion-intensity', 0.7);
          state.tx = clamp(dx * profile.dragX * motion, -rect.width * stretchLimit, rect.width * stretchLimit);
          state.ty = clamp(dy * profile.dragY * motion, -rect.height * stretchLimit, rect.height * stretchLimit);
          const horizontalPull = Math.abs(dx) / Math.max(rect.width, 1);
          const verticalPull = Math.abs(dy) / Math.max(rect.height, 1);
          state.targetScaleX = 1 + clamp(horizontalPull * 0.13 * elasticity, 0, stretchLimit);
          state.targetScaleY = 1 - clamp(profile.pressYLoss + verticalPull * 0.04, 0, stretchLimit * 0.7);
          state.targetVelocity = clamp((Math.abs(state.vx) + Math.abs(state.vy)) / 120, 0, 1);
        }
        this.start(element, state);
      }, { passive: true });

      element.addEventListener('pointerleave', () => {
        if (state.active) return;
        state.targetTiltX = 0;
        state.targetTiltY = 0;
        state.targetProximity = 0;
        this.start(element, state);
      }, { passive: true });

      element.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        const nearestElastic = event.target.closest?.('.liquid-elastic');
        if (nearestElastic !== element) return;
        if (element.matches('[aria-disabled="true"], :disabled')) return;
        event.preventDefault();
        updatePointer(event);
        state.active = true;
        state.pointerId = event.pointerId;
        try { element.setPointerCapture?.(event.pointerId); } catch (error) {}
        element.classList.add('is-liquid-pressed');
        element.style.setProperty('--press', '1');
        state.targetPressure = 1;
        state.targetScaleX = document.body.classList.contains('reduced-motion') ? 1 : profile.pressX;
        state.targetScaleY = document.body.classList.contains('reduced-motion') ? 0.995 : profile.pressY;
        state.targetProximity = 1;
        this.renderer?.addRipple(event.clientX, event.clientY, this.rippleStrength());
        this.spawnWave(element, event.clientX, event.clientY, 1, 'control');
        this.start(element, state);
      });

      const release = event => {
        if (!state.active) return;
        state.active = false;
        state.pointerId = null;
        state.tx = 0;
        state.ty = 0;
        state.targetScaleX = 1;
        state.targetScaleY = 1;
        state.targetTiltX = 0;
        state.targetTiltY = 0;
        state.targetPressure = 0;
        state.targetVelocity = 0;
        element.classList.remove('is-liquid-pressed');
        element.style.setProperty('--press', '0');
        if (Number.isFinite(event?.clientX)) {
          this.renderer?.addRipple(event.clientX, event.clientY, this.rippleStrength() * 0.74);
          this.spawnWave(element, event.clientX, event.clientY, 0.72, 'release');
        }
        this.start(element, state);
      };

      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('lostpointercapture', release);

      element.addEventListener('keydown', event => {
        if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return;
        const rect = element.getBoundingClientRect();
        element.style.setProperty('--px', '50%');
        element.style.setProperty('--py', '50%');
        state.targetPressure = 0.9;
        state.targetScaleX = profile.pressX;
        state.targetScaleY = profile.pressY;
        state.targetProximity = 1;
        this.spawnWave(element, rect.left + rect.width / 2, rect.top + rect.height / 2, 0.8, 'keyboard');
        this.start(element, state);
      });

      element.addEventListener('keyup', event => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        const rect = element.getBoundingClientRect();
        state.targetPressure = 0;
        state.targetScaleX = 1;
        state.targetScaleY = 1;
        this.renderer?.addRipple(rect.left + rect.width / 2, rect.top + rect.height / 2, this.rippleStrength());
        this.start(element, state);
      });
    }

    bindReactive(element) {
      if (this.boundReactive.has(element)) return;
      this.boundReactive.add(element);
      const state = this.ensureState(element);

      element.addEventListener('pointermove', event => {
        const depth = this.reactiveDepth(event.target, element);
        if (depth < 0) return;
        const point = this.localPoint(element, event.clientX, event.clientY);
        const decay = Math.pow(0.62, depth);
        element.style.setProperty('--px', `${point.x * 100}%`);
        element.style.setProperty('--py', `${point.y * 100}%`);
        state.targetProximity = (0.40 + readRootNumber('--motion-intensity', 0.7) * 0.48) * decay;
        const profile = this.profileFor(element);
        state.targetTiltX = (0.5 - point.y) * profile.tilt * decay;
        state.targetTiltY = (point.x - 0.5) * profile.tilt * decay;
        this.start(element, state);
      }, { passive: true });

      element.addEventListener('pointerleave', event => {
        if (element.contains(event.relatedTarget)) return;
        state.targetProximity = 0;
        state.targetTiltX = 0;
        state.targetTiltY = 0;
        this.start(element, state);
      }, { passive: true });

      element.addEventListener('pointerdown', event => {
        const depth = this.reactiveDepth(event.target, element);
        if (depth < 0) return;
        const nearestElastic = event.target.closest?.('.liquid-elastic');
        if (nearestElastic === element) return;
        const interactive = event.target.closest?.(INTERACTIVE_SELECTOR);
        const nearestReactive = event.target.closest?.('.liquid-reactive');
        if (!interactive && nearestReactive !== element) return;
        const strength = 0.84 * Math.pow(0.58, depth);
        this.surfaceImpulse(element, event.clientX, event.clientY, strength);
      }, true);

      element.addEventListener('focusin', event => {
        if (!event.target.matches?.(INTERACTIVE_SELECTOR)) return;
        const rect = event.target.getBoundingClientRect();
        this.surfaceImpulse(
          element,
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          0.36 * Math.pow(0.65, this.reactiveDepth(event.target, element))
        );
      });

      element.addEventListener('liquid-impact', event => {
        const detail = event.detail || {};
        if (!Number.isFinite(detail.clientX) || !Number.isFinite(detail.clientY)) return;
        this.surfaceImpulse(element, detail.clientX, detail.clientY, detail.strength || 0.65);
      });
    }

    ensureState(element) {
      let state = this.states.get(element);
      if (state) return state;
      state = {
        x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
        scaleX: 1, scaleY: 1, scaleVX: 0, scaleVY: 0,
        targetScaleX: 1, targetScaleY: 1,
        tiltX: 0, tiltY: 0, tiltVX: 0, tiltVY: 0,
        targetTiltX: 0, targetTiltY: 0,
        pressure: 0, pressureV: 0, targetPressure: 0,
        proximity: 0, proximityV: 0, targetProximity: 0,
        velocity: 0, velocityV: 0, targetVelocity: 0,
        active: false, running: false, last: 0,
        pointerId: null, originX: 0.5, originY: 0.5,
        resetTimer: null
      };
      this.states.set(element, state);
      return state;
    }

    profileFor(element) {
      if (element.matches('.ui-button, .quick-actions button, .player-controls button, .icon-plain')) {
        return { pressX: 1.055, pressY: 0.88, pressYLoss: 0.07, dragX: 0.34, dragY: 0.22, stretch: 1, tilt: 4.2, hover: 0.72 };
      }
      if (element.matches('.switch-control')) {
        return { pressX: 1.035, pressY: 0.92, pressYLoss: 0.045, dragX: 0.18, dragY: 0.10, stretch: 0.65, tilt: 2.2, hover: 0.62 };
      }
      if (element.matches('.custom-slider, .knob')) {
        return { pressX: 1.018, pressY: 0.95, pressYLoss: 0.025, dragX: 0.10, dragY: 0.08, stretch: 0.45, tilt: 2.0, hover: 0.58 };
      }
      if (element.matches('.floating-dock, .segmented-control, .tabs-demo, .top-nav-demo, .sidebar-demo')) {
        return { pressX: 1.018, pressY: 0.975, pressYLoss: 0.018, dragX: 0.04, dragY: 0.03, stretch: 0.30, tilt: 1.7, hover: 0.48 };
      }
      return { pressX: 1.012, pressY: 0.988, pressYLoss: 0.012, dragX: 0.025, dragY: 0.02, stretch: 0.22, tilt: 1.45, hover: 0.42 };
    }

    localPoint(element, clientX, clientY) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0.5, y: 0.5 };
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp((clientY - rect.top) / rect.height, 0, 1)
      };
    }

    reactiveDepth(target, surface) {
      const nearest = target.closest?.('.liquid-reactive');
      if (!nearest || !surface.contains(nearest)) return -1;
      let depth = 0;
      let current = nearest;
      while (current && current !== surface) {
        current = current.parentElement?.closest('.liquid-reactive');
        depth += 1;
      }
      return current === surface ? depth : -1;
    }

    rippleStrength() {
      return readRootNumber('--ripple-intensity', 0.55);
    }

    surfaceImpulse(element, clientX, clientY, strength = 0.7) {
      if (document.body.classList.contains('reduced-motion')) strength *= 0.22;
      const state = this.ensureState(element);
      const point = this.localPoint(element, clientX, clientY);
      const rect = element.getBoundingClientRect();
      const elasticity = readRootNumber('--motion-elasticity', 0.56);
      const stretch = readRootNumber('--stretch-limit', 0.12);
      const motion = readRootNumber('--motion-intensity', 0.7);
      const refraction = readRootNumber('--material-refraction', 0.32);
      const effective = clamp(strength * (0.72 + elasticity * 0.28) * (0.70 + motion * 0.30), 0.08, 1.2);
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);

      element.style.setProperty('--px', `${point.x * 100}%`);
      element.style.setProperty('--py', `${point.y * 100}%`);
      element.style.setProperty('--liquid-impact', String(effective));
      state.originX = point.x;
      state.originY = point.y;
      state.targetPressure = clamp(effective * (0.52 + refraction * 0.28), 0, 0.86);
      state.targetProximity = clamp(0.5 + effective * 0.42, 0, 1);
      state.tx = clamp(dx * 0.018 * effective, -rect.width * stretch * 0.08, rect.width * stretch * 0.08);
      state.ty = clamp(dy * 0.015 * effective, -rect.height * stretch * 0.08, rect.height * stretch * 0.08);
      state.targetScaleX = 1 + stretch * 0.055 * effective;
      state.targetScaleY = 1 - stretch * 0.045 * effective;
      state.targetTiltX = (0.5 - point.y) * 1.4 * effective;
      state.targetTiltY = (point.x - 0.5) * 1.4 * effective;
      state.targetVelocity = effective;

      this.renderer?.addRipple(clientX, clientY, this.rippleStrength() * effective);
      this.spawnWave(element, clientX, clientY, effective, 'surface');
      clearTimeout(state.resetTimer);
      state.resetTimer = setTimeout(() => {
        state.tx = 0;
        state.ty = 0;
        state.targetScaleX = 1;
        state.targetScaleY = 1;
        state.targetTiltX = 0;
        state.targetTiltY = 0;
        state.targetPressure = 0;
        state.targetVelocity = 0;
        element.style.setProperty('--liquid-impact', '0');
        this.start(element, state);
      }, 150 + effective * 95);
      this.start(element, state);
    }

    spawnWave(element, clientX, clientY, strength = 1, kind = 'surface') {
      if (document.body.classList.contains('reduced-motion')) return;
      /* Con el motor de lentes activo la onda es deformación del campo de
         espesor dentro del shader. Superponerle además estos halos DOM es
         justo el movimiento decorativo que el material no debe tener. */
      if (document.documentElement.dataset.mqLens === 'on') {
        window.MorphiqLensEngineInstance?.impact(element, clientX, clientY, strength);
        return;
      }
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ripple = readRootNumber('--ripple-intensity', 0.48);
      const brightness = readRootNumber('--ripple-brightness', 0.20);
      const count = Math.max(1, Math.min(6, Math.round(readRootNumber('--ripple-count', 2))));
      const elasticity = readRootNumber('--motion-elasticity', 0.56);
      const damping = readRootNumber('--motion-damping', 24);
      const refraction = readRootNumber('--material-refraction', 0.32);
      const duration = Math.round(clamp(540 + elasticity * 390 + (32 - damping) * 7, 470, 1080));
      const size = clamp(24 + Math.min(rect.width, rect.height) * 0.10, 26, 70);
      const scale = clamp(5.4 + refraction * 4.6 + strength * 1.8, 5.8, 11.5);

      for (let ring = 0; ring < count; ring += 1) {
        const wave = document.createElement('span');
        wave.className = `liquid-wave liquid-wave--${kind}`;
        wave.setAttribute('aria-hidden', 'true');
        wave.style.left = `${clientX - rect.left}px`;
        wave.style.top = `${clientY - rect.top}px`;
        wave.style.setProperty('--wave-strength', String(clamp(strength * ripple * Math.pow(0.62, ring), 0.06, 1.0)));
        wave.style.setProperty('--wave-brightness', String(clamp(brightness, 0, 1)));
        wave.style.setProperty('--wave-size', `${size}px`);
        wave.style.setProperty('--wave-scale', String(scale + ring * 0.72));
        wave.style.setProperty('--wave-duration', `${duration + ring * 45}ms`);
        wave.style.setProperty('--wave-delay', `${ring * 34}ms`);
        wave.style.setProperty('--wave-ring-index', String(ring));
        element.append(wave);
        wave.addEventListener('animationend', () => wave.remove(), { once: true });
      }
    }

    start(element, state) {
      if (state.running) return;
      state.running = true;
      state.last = performance.now();
      requestAnimationFrame(time => this.frame(element, state, time));
    }

    frame(element, state, time) {
      const dt = Math.min((time - state.last) / 1000, 0.032);
      state.last = time;
      window.__mqFrameId = time;
      const stiffness = readRootNumber('--motion-stiffness', 260);
      const damping = readRootNumber('--motion-damping', 24);
      const motion = readRootNumber('--motion-intensity', 0.7);
      const elasticity = readRootNumber('--motion-elasticity', 0.56);

      const integrate = (value, velocity, target, stiffFactor = 1, dampFactor = 1) => {
        const acceleration = stiffness * stiffFactor * (target - value) - damping * dampFactor * velocity;
        const nextVelocity = velocity + acceleration * dt;
        const nextValue = value + nextVelocity * dt;
        return [nextValue, nextVelocity];
      };

      [state.x, state.vx] = integrate(state.x, state.vx, state.tx * motion, 1, 1);
      [state.y, state.vy] = integrate(state.y, state.vy, state.ty * motion, 1, 1);
      [state.scaleX, state.scaleVX] = integrate(state.scaleX, state.scaleVX, state.targetScaleX, 0.58 + elasticity * 0.18, 0.92);
      [state.scaleY, state.scaleVY] = integrate(state.scaleY, state.scaleVY, state.targetScaleY, 0.58 + elasticity * 0.18, 0.92);
      [state.tiltX, state.tiltVX] = integrate(state.tiltX, state.tiltVX, state.targetTiltX, 0.48, 1.15);
      [state.tiltY, state.tiltVY] = integrate(state.tiltY, state.tiltVY, state.targetTiltY, 0.48, 1.15);
      [state.pressure, state.pressureV] = integrate(state.pressure, state.pressureV, state.targetPressure, 0.72, 0.92);
      [state.proximity, state.proximityV] = integrate(state.proximity, state.proximityV, state.targetProximity, 0.46, 1.2);
      [state.velocity, state.velocityV] = integrate(state.velocity, state.velocityV, state.targetVelocity, 0.38, 1.3);

      element.style.setProperty('--liquid-x', `${state.x.toFixed(3)}px`);
      element.style.setProperty('--liquid-y', `${state.y.toFixed(3)}px`);
      element.style.setProperty('--liquid-scale-x', state.scaleX.toFixed(4));
      element.style.setProperty('--liquid-scale-y', state.scaleY.toFixed(4));
      element.style.setProperty('--liquid-tilt-x', `${state.tiltX.toFixed(3)}deg`);
      element.style.setProperty('--liquid-tilt-y', `${state.tiltY.toFixed(3)}deg`);
      element.style.setProperty('--liquid-pressure', state.pressure.toFixed(4));
      element.style.setProperty('--liquid-proximity', state.proximity.toFixed(4));
      element.style.setProperty('--liquid-velocity', state.velocity.toFixed(4));

      const energy = Math.abs(state.vx) + Math.abs(state.vy)
        + Math.abs(state.scaleVX) + Math.abs(state.scaleVY)
        + Math.abs(state.tiltVX) + Math.abs(state.tiltVY)
        + Math.abs(state.pressureV) + Math.abs(state.proximityV)
        + Math.abs(state.velocityV);
      const displacement = Math.abs(state.tx - state.x) + Math.abs(state.ty - state.y)
        + Math.abs(state.targetScaleX - state.scaleX) + Math.abs(state.targetScaleY - state.scaleY)
        + Math.abs(state.targetTiltX - state.tiltX) + Math.abs(state.targetTiltY - state.tiltY)
        + Math.abs(state.targetPressure - state.pressure) + Math.abs(state.targetProximity - state.proximity)
        + Math.abs(state.targetVelocity - state.velocity);

      if (state.active || energy > 0.025 || displacement > 0.0015) {
        requestAnimationFrame(next => this.frame(element, state, next));
      } else {
        state.running = false;
      }
    }

    refreshOptics() {
      const displacement = document.querySelector('#liquidDisplace feDisplacementMap');
      const turbulence = document.querySelector('#liquidDisplace feTurbulence');
      if (!displacement || !turbulence) return;
      const refraction = readRootNumber('--material-refraction', 0.32);
      const roughness = readRootNumber('--material-roughness', 0.18);
      displacement.setAttribute('scale', String(Math.round(3 + refraction * 17)));
      turbulence.setAttribute('baseFrequency', `${(0.008 + roughness * 0.020).toFixed(3)} ${(0.018 + roughness * 0.026).toFixed(3)}`);
    }
  }

  window.LiquidSpringController = LiquidSpringController;
})();
