(() => {
  'use strict';

  /**
   * Liquid Glass — comportamiento.
   *
   * Todo lo que el material necesita para verse ya está en el CSS. Esto añade
   * solo dos cosas, y las dos son opcionales: la detección de motor para la
   * refracción real, y el especular que sigue al cursor.
   *
   * El motor WebGL anterior vivía aquí al lado y ocupaba ~1.100 líneas. Se
   * eliminó entero. Lo que queda cabe en una pantalla.
   */

  window.MorphiqRecipes = window.MorphiqRecipes || {};

  /* ------------------------------------------------------------------ */
  /* Detección de refracción real                                        */
  /* ------------------------------------------------------------------ */
  /* Solo Chromium aplica url() dentro de backdrop-filter — WebKit #245510,
     abierto desde 2022. Y @supports (backdrop-filter: url(#x)) devuelve true en
     Firefox sin que funcione, así que la comprobación tiene que ser de motor,
     no de sintaxis. */
  function supportsBackdropUrl() {
    if (!CSS?.supports?.('backdrop-filter', 'blur(1px)')) return false;
    const brands = navigator.userAgentData?.brands;
    if (Array.isArray(brands)) {
      return brands.some(entry => /chromium/i.test(entry.brand));
    }
    const ua = navigator.userAgent;
    return /Chrome|Chromium|Edg/.test(ua) && !/Firefox/.test(ua);
  }

  document.documentElement.dataset.mqRefract = supportsBackdropUrl() ? 'on' : 'off';

  /* ------------------------------------------------------------------ */
  /* Especular que sigue al cursor                                       */
  /* ------------------------------------------------------------------ */
  /* Un solo módulo compartido, no copiado en cada componente. Escribe una
     custom property y deja que el CSS decida qué hacer con ella; sin JS el
     material se ve igual, solo sin este brillo. */

  const SPECULAR_SELECTOR = [
    '.ui-button', '.ui-card', '.top-nav-demo', '.sidebar-demo', '.tabs-demo',
    '.floating-dock', '.segmented-control', '.music-player', '.weather-widget',
    '.calendar', '.demo-modal', '.dropdown-menu'
  ].join(',');

  const bound = new WeakSet();
  let frame = 0;
  let pending = null;

  function paintCursor() {
    frame = 0;
    if (!pending) return;
    const { element, x, y } = pending;
    pending = null;
    element.style.setProperty(
      '--mq-cursor',
      `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px,` +
      ' rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0) 60%)'
    );
  }

  function bindSpecular(element) {
    if (bound.has(element)) return;
    bound.add(element);

    element.addEventListener('pointermove', event => {
      const rect = element.getBoundingClientRect();
      /* Los valores dirigidos por puntero se escriben dentro de un rAF, nunca
         en el handler: si no, cada movimiento del ratón fuerza un recálculo. */
      pending = { element, x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!frame) frame = requestAnimationFrame(paintCursor);
    }, { passive: true });

    element.addEventListener('pointerleave', () => {
      pending = null;
      element.style.removeProperty('--mq-cursor');
    }, { passive: true });
  }

  function bind(scope = document) {
    if (document.body.classList.contains('reduced-motion')) return;
    if (scope.matches?.(SPECULAR_SELECTOR)) bindSpecular(scope);
    scope.querySelectorAll?.(SPECULAR_SELECTOR).forEach(bindSpecular);
  }

  /* La API que consume app.js. Se conserva el nombre para no tocar el resto del
     laboratorio; lo que hay detrás ya no es un controlador de física. */
  class LiquidSpringController {
    bind(scope) { bind(scope); }
    bindElement(element) { bindSpecular(element); }
  }
  window.LiquidSpringController = LiquidSpringController;

  /* ------------------------------------------------------------------ */
  /* Receta                                                              */
  /* ------------------------------------------------------------------ */

  const variants = {
    conservative: {
      '--material-opacity': '.22',
      '--material-blur': '4px',
      '--material-specular': '.75',
      '--border-alpha': '.28',
      '--motion-duration': '200ms'
    },
    expressive: {
      '--material-opacity': '.28',
      '--material-blur': '7px',
      '--material-specular': '.88',
      '--border-alpha': '.36',
      '--motion-duration': '300ms'
    },
    experimental: {
      '--material-opacity': '.34',
      '--material-blur': '12px',
      '--material-specular': '1',
      '--border-alpha': '.46',
      '--motion-duration': '420ms'
    }
  };

  const mqTokens = [
    ['--mq-body', 'rgba(255,255,255,.25)', 'Tinte del overlay. Es la palanca del contraste: por debajo de .12 el texto claro deja de sostenerse sobre fondos claros.', 'alfa .10-.40'],
    ['--mq-lit', 'rgba(255,255,255,.75)', 'Filo especular del canto, arriba-izquierda.', 'color'],
    ['--mq-edge', 'rgba(255,255,255,.12)', 'Canto opuesto a la luz. En un campo se invierte con --mq-lit y el vidrio se ve por dentro.', 'color'],
    ['--mq-text', '#ffffff', 'Color de texto sobre el material.', 'color'],
    ['--mq-brd', 'rgba(255,255,255,.28)', 'Borde real. Es lo unico que sobrevive en forced-colors.', 'color'],
    ['--mq-ring', 'rgba(150,225,255,.9)', 'Anillo de foco.', 'color'],
    ['--mq-halo', 'rgba(2,8,18,.9)', 'Halo del texto cuando no tiene superficie propia. Se invierte con el tono.', 'color'],
    ['--mq-blur', '4px', 'Desenfoque del backdrop. Por encima de 14px el fondo deja de reconocerse y el vidrio lee como plastico.', '2-14px'],
    ['--mq-saturate', '120%', 'El desenfoque desatura por construccion — es una media ponderada. Esto lo compensa.', '100-180%'],
    ['--mq-brightness', '1.15', 'Levanta el vidrio sobre fondos oscuros. En tono claro baja a ~1.02.', '.95-1.3'],
    ['--mq-radius', '18px', 'Radio de esquina.', '8-999px'],
    ['--mq-shadow', '0 8px 24px -10px rgba(2,10,24,.55)', 'Sombra ambiente. La separacion la da el canto, no la sombra.', 'sombra']
  ];

  const classCode = `/* Auto-contenido: cada var() con fallback literal, cero :root.
   Tres capas mas contenido. El contenido nunca entra en la capa filtrada. */
.mq-liquid-glass {
  --mq-body: rgba(255, 255, 255, .25);
  --mq-lit: rgba(255, 255, 255, .75);
  --mq-edge: rgba(255, 255, 255, .12);
  --mq-text: #fff;
  --mq-blur: 4px;
  --mq-radius: 18px;

  position: relative;
  isolation: isolate;
  border: 0;
  border-radius: var(--mq-radius, 18px);
  background: transparent;
  color: var(--mq-text, #fff);
  box-shadow: 0 8px 24px -10px rgba(2, 10, 24, .55);
}

/* Capas 1 y 2: filtro del backdrop y tinte. */
.mq-liquid-glass::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  background: var(--mq-body, rgba(255, 255, 255, .25));
  backdrop-filter: blur(var(--mq-blur, 4px)) saturate(120%) brightness(1.15);
  -webkit-backdrop-filter: blur(var(--mq-blur, 4px)) saturate(120%) brightness(1.15);
}

/* Refraccion real: la turbulencia va DENTRO del backdrop-filter.
   Fuera, url() actua sobre los pixeles del propio elemento — y el elemento esta
   vacio, asi que no hace nada. Solo Chromium la aplica aqui. */
[data-mq-refract="on"] .mq-liquid-glass::before {
  backdrop-filter: url(#mq-glass-distortion) blur(var(--mq-blur, 4px)) saturate(120%) brightness(1.15);
}

/* Capa 3: filo especular. Un solo vector de luz. */
.mq-liquid-glass::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 1px 1px 1px var(--mq-lit, rgba(255, 255, 255, .75)),
    inset -1px -1px 1px var(--mq-edge, rgba(255, 255, 255, .12));
  background: var(--mq-cursor, none);
}

/* Capa 4: el contenido, siempre por encima. */
.mq-liquid-glass > * { position: relative; z-index: 2; }

@media (forced-colors: active) {
  .mq-liquid-glass { border: 2px solid CanvasText; background: Canvas; color: CanvasText; }
  .mq-liquid-glass::before,
  .mq-liquid-glass::after { display: none; }
}`;

  const behaviorCode = `/* El material no necesita JS para verse. Esto solo anade el especular que
   sigue al cursor, y se degrada a nada si no se ejecuta. */
export function attachLiquidGlass(element) {
  let frame = 0;
  let pending = null;

  const paint = () => {
    frame = 0;
    if (!pending) return;
    const { x, y } = pending;
    pending = null;
    element.style.setProperty('--mq-cursor',
      \`radial-gradient(circle at \${x}px \${y}px,
        rgba(255,255,255,.15) 0%, rgba(255,255,255,.05) 30%, rgba(255,255,255,0) 60%)\`);
  };

  element.addEventListener('pointermove', event => {
    const rect = element.getBoundingClientRect();
    // Se escribe dentro de un rAF, nunca en el handler.
    pending = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });

  element.addEventListener('pointerleave', () => {
    pending = null;
    element.style.removeProperty('--mq-cursor');
  }, { passive: true });
}`;

  const shaderCode = `<!-- La turbulencia va en el documento una sola vez.
     baseFrequency y scale hay que calibrarlos MIRANDO el damero: los valores
     publicados (0.008 / 77) estan pensados para un filter decorativo sobre un
     div vacio; dentro del backdrop-filter distorsionan mucho mas. -->
<svg width="0" height="0" aria-hidden="true">
  <filter id="mq-glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="turbulence" baseFrequency="0.006" numOctaves="2" seed="7" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="28"
                       xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>`;

  window.MorphiqRecipes['liquid-glass'] = {
    name: 'Liquid Glass',
    description: 'Vidrio esmerilado con tinte, filo especular y refracción del fondo. Tres capas de CSS, sin lienzo propio.',
    variants,
    mqTokens,
    classCode,
    behaviorCode,
    shaderCode,
    exampleCode: `<button class="mq-liquid-glass">Explorar material</button>

<article class="mq-liquid-glass" style="--mq-radius:26px; --mq-blur:6px">
  <h3>Superficie grande</h3>
  <p>Más desenfoque que un control: una superficie grande
     tapa más fondo y necesita separarlo mejor.</p>
</article>`,
    dependencies: 'Sin dependencias. La refracción real necesita Chromium; el resto funciona en cualquier navegador con backdrop-filter.',
    notes: 'Track y thumb son cada uno su propia pila de vidrio. Un control con parte móvil son dos vidrios, no uno.'
  };
})();
