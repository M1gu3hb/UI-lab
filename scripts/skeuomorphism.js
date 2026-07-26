(() => {
  window.MorphiqRecipes = window.MorphiqRecipes || {};

  const variants = {
    conservative: {
      '--material-bg': '#d9d6cf',
      '--material-border': 'rgba(45,43,39,.24)',
      '--material-highlight': 'rgba(255,255,255,.94)',
      '--material-shadow': 'rgba(49,42,33,.34)',
      '--material-radius': '13px',
      '--material-depth': '16px',
      '--material-texture': '.045',
      '--material-blur': '0px',
      '--material-refraction': '0',
      '--material-specular': '.64',
      '--material-roughness': '.42',
      '--motion-stiffness': '330',
      '--motion-damping': '30',
      '--motion-duration': '160ms'
    },
    expressive: {
      '--material-bg': '#d1ccc1',
      '--material-border': 'rgba(45,43,39,.30)',
      '--material-highlight': 'rgba(255,255,255,.98)',
      '--material-shadow': 'rgba(49,42,33,.42)',
      '--material-radius': '12px',
      '--material-depth': '20px',
      '--material-texture': '.08',
      '--material-blur': '0px',
      '--material-refraction': '0',
      '--material-specular': '.72',
      '--material-roughness': '.58',
      '--motion-stiffness': '360',
      '--motion-damping': '31',
      '--motion-duration': '150ms'
    },
    experimental: {
      '--material-bg': '#c7c0b4',
      '--material-border': 'rgba(45,43,39,.38)',
      '--material-highlight': 'rgba(255,255,255,1)',
      '--material-shadow': 'rgba(49,42,33,.50)',
      '--material-radius': '10px',
      '--material-depth': '25px',
      '--material-texture': '.13',
      '--material-blur': '0px',
      '--material-refraction': '0',
      '--material-specular': '.82',
      '--material-roughness': '.66',
      '--motion-stiffness': '400',
      '--motion-damping': '34',
      '--motion-duration': '140ms'
    }
  };

  const classCode = `.skeuo-control {
  position: relative;
  color: #292a2c;
  background:
    linear-gradient(var(--light-angle), rgba(255,255,255,.86), transparent 42%),
    linear-gradient(#eeeae1, #c9c4b9);
  border: 1px solid rgba(61,57,50,.42);
  box-shadow:
    0 calc(var(--material-depth) * .28) calc(var(--material-depth) * .55) rgba(54,48,39,.32),
    0 2px 0 #aaa499,
    inset 0 1px 0 var(--material-highlight),
    inset 0 -2px 2px rgba(70,61,49,.18);
  transition: transform 90ms ease, box-shadow 90ms ease;
}

.skeuo-control:active {
  transform: translateY(3px);
  box-shadow:
    0 1px 1px rgba(54,48,39,.2),
    inset 0 3px 5px rgba(54,48,39,.3),
    inset 0 -1px rgba(255,255,255,.5);
}`;

  const behaviorCode = `export function attachMechanicalPress(element) {
  const release = () => element.classList.remove('is-pressed');
  element.addEventListener('pointerdown', event => {
    element.setPointerCapture?.(event.pointerId);
    element.classList.add('is-pressed');
  });
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
}`;

  window.MorphiqRecipes.skeuomorphism = {
    name: 'Skeuomorphism',
    description: 'Mecánica física, textura sutil, cavidades y una fuente de luz coherente.',
    variants,
    classCode,
    behaviorCode,
    shaderCode: '// No requiere shader. La receta depende de geometría, gradientes, textura procedural y estados mecánicos.',
    exampleCode: `<button class="ui-button ui-button--primary skeuo-control">Confirmar</button>`,
    dependencies: 'Sin dependencias externas.',
    notes: 'La cara, el bisel y la sombra deben corresponder con la elevación. Evita reutilizar una sombra universal.'
  };
})();
