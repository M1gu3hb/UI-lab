(() => {
  window.MorphiqRecipes = window.MorphiqRecipes || {};

  const variants = {
    conservative: {
      '--material-bg': 'rgba(17,30,55,.26)',
      '--material-border': 'rgba(255,255,255,.28)',
      '--material-highlight': 'rgba(255,255,255,.24)',
      '--material-shadow': 'rgba(3,9,20,.24)',
      '--material-radius': '18px',
      '--material-depth': '14px',
      '--material-texture': '0',
      '--material-blur': '18px',
      '--material-refraction': '0',
      '--material-specular': '.42',
      '--material-roughness': '.28',
      '--motion-stiffness': '260',
      '--motion-damping': '28',
      '--motion-duration': '180ms'
    },
    expressive: {
      '--material-bg': 'rgba(17,30,55,.20)',
      '--material-border': 'rgba(255,255,255,.40)',
      '--material-highlight': 'rgba(255,255,255,.30)',
      '--material-shadow': 'rgba(3,9,20,.30)',
      '--material-radius': '20px',
      '--material-depth': '18px',
      '--material-texture': '0',
      '--material-blur': '24px',
      '--material-refraction': '0',
      '--material-specular': '.50',
      '--material-roughness': '.22',
      '--motion-stiffness': '250',
      '--motion-damping': '27',
      '--motion-duration': '190ms'
    },
    experimental: {
      '--material-bg': 'rgba(17,30,55,.15)',
      '--material-border': 'rgba(255,255,255,.50)',
      '--material-highlight': 'rgba(255,255,255,.36)',
      '--material-shadow': 'rgba(3,9,20,.34)',
      '--material-radius': '23px',
      '--material-depth': '22px',
      '--material-texture': '0',
      '--material-blur': '30px',
      '--material-refraction': '0',
      '--material-specular': '.58',
      '--material-roughness': '.18',
      '--motion-stiffness': '230',
      '--motion-damping': '26',
      '--motion-duration': '210ms'
    }
  };

  const classCode = `.glass-control {
  color: #f8fcff;
  background:
    linear-gradient(135deg, rgba(255,255,255,.16), transparent 44%),
    rgba(255,255,255, calc(var(--material-opacity) + .08));
  border: 1px solid rgba(255,255,255, var(--border-alpha));
  box-shadow:
    0 9px 22px rgba(2,8,18,.2),
    inset 0 1px rgba(255,255,255,.25);
  backdrop-filter: blur(var(--material-blur)) saturate(140%);
  transition: transform 160ms ease, border-color 160ms ease;
}

.glass-control:hover { transform: translateY(-2px); }
.glass-control:active { transform: translateY(1px) scale(.99); }`;

  const behaviorCode = `export function attachGlassInteraction(element) {
  // Glassmorphism permanece geométricamente estable.
  // Solo cambia elevación, borde y luminosidad.
  element.addEventListener('pointerdown', () => element.classList.add('is-pressed'));
  const release = () => element.classList.remove('is-pressed');
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
}`;

  window.MorphiqRecipes.glass = {
    name: 'Glassmorphism',
    description: 'Lámina esmerilada estática sobre un fondo informativo; sin elasticidad ni deformación.',
    variants,
    classCode,
    behaviorCode,
    shaderCode: '// No requiere shader. Usa backdrop-filter, translucidez jerárquica, borde fino y reflejo interior.',
    exampleCode: `<button class="ui-button ui-button--primary glass-control">Continuar</button>`,
    dependencies: 'Sin dependencias externas. backdrop-filter mejora progresivamente donde está disponible.',
    notes: 'Los controles pequeños son más opacos que superficies grandes. Evita anidar vidrio sin una razón jerárquica.'
  };
})();
