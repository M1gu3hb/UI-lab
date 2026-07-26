(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const root = document.documentElement;
  const body = document.body;

  const labMeta = {
    skeuomorphism: {
      title: 'Skeuomorphism Lab',
      description: 'Objetos físicos, luz coherente, recorrido mecánico y materiales reconocibles.',
      note: 'Presiona: el control pierde elevación y entra en su alojamiento.'
    },
    glassmorphism: {
      title: 'Glassmorphism Lab',
      description: 'Láminas esmeriladas estáticas, jerarquía de opacidad y fondo visible.',
      note: 'El vidrio se eleva apenas; no se estira ni deforma.'
    },
    'liquid-glass': {
      title: 'Liquid Glass Lab',
      description: 'Óptica dinámica, refracción, ripple, tensión superficial y spring amortiguada.',
      note: 'Presiona y arrastra: la superficie se comprime, estira y recupera.'
    }
  };

  const state = {
    style: 'skeuomorphism',
    variant: 'conservative',
    component: 'button',
    interactionState: 'rest',
    background: 'aurora',
    quality: 'full',
    codeTab: 'css-vars',
    view: 'lab',
    viewport: 'wide'
  };

  let liquidRenderer = null;
  let liquidController = null;
  let galleryAudioTimer = null;

  const tokenControlMap = {
    '--light-angle': { input: 'lightDirection', output: value => `${value}°`, css: value => `${value}deg` },
    '--light-intensity': { input: 'lightIntensity', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--material-depth': { input: 'elevation', output: value => value, css: value => `${value}px` },
    '--material-opacity': { input: 'opacity', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--material-blur': { input: 'blur', output: value => `${value}px`, css: value => `${value}px` },
    '--border-alpha': { input: 'borderAlpha', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--material-roughness': { input: 'roughness', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--material-specular': { input: 'specular', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--material-refraction': { input: 'refraction', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--material-dispersion': { input: 'dispersion', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--ripple-intensity': { input: 'ripple', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--ripple-brightness': { input: 'waveBrightness', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--ripple-count': { input: 'waveCount', output: value => `${Math.round(Number(value))}`, css: value => String(Math.round(Number(value))) },
    '--motion-elasticity': { input: 'elasticity', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--motion-stiffness': { input: 'stiffness', output: value => value, css: value => String(value) },
    '--motion-damping': { input: 'damping', output: value => value, css: value => String(value) },
    '--stretch-limit': { input: 'stretch', output: value => `${value}%`, css: value => String(Number(value) / 100) },
    '--motion-intensity': { input: 'motion', output: value => `${value}%`, css: value => String(Number(value) / 100) }
  };

  const componentNames = {
    button: 'Button', switch: 'Switch', slider: 'Slider', input: 'Input', card: 'Card', navigation: 'Navigation', music: 'Music player'
  };

  function materialClasses(extra = '') {
    const liquid = state.style === 'liquid-glass' ? ' liquid-elastic liquid-surface liquid-reactive' : '';
    const surface = state.style === 'skeuomorphism' ? ' skeuo-surface' : state.style === 'glassmorphism' ? ' glass-surface' : '';
    return `${extra}${liquid}${surface}`.trim();
  }

  function galleryCardClass(extra = '') {
    return `gallery-card${state.style === 'liquid-glass' ? ' liquid-elastic liquid-reactive' : ''}${extra ? ` ${extra}` : ''}`;
  }

  function buttonMarkup(label = 'Confirmar', variant = 'primary', attrs = '') {
    const liquid = state.style === 'liquid-glass' ? ' liquid-elastic' : '';
    return `<button class="ui-button ui-button--${variant} material-control${liquid}" ${attrs}>${label}</button>`;
  }

  function switchMarkup(checked = true, label = 'Activar') {
    const liquid = state.style === 'liquid-glass' ? ' liquid-elastic' : '';
    return `<div class="demo-row"><button class="switch-control material-control${liquid}" role="switch" aria-checked="${checked}" aria-label="${label}"><span class="switch-thumb"></span></button><span>${label}</span></div>`;
  }

  function sliderMarkup(value = 58, label = 'Intensidad') {
    const liquid = state.style === 'liquid-glass' ? ' liquid-elastic' : '';
    return `<div class="demo-stack"><span class="sr-only">${label}</span><div class="custom-slider material-control${liquid}" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" style="--value:${value}%"><div class="slider-track"><span class="slider-fill"></span><span class="slider-thumb"></span></div></div><output>${value}%</output></div>`;
  }

  function inputMarkup() {
    return `<label class="field"><span>Correo</span><input class="material-control" type="email" placeholder="nombre@ejemplo.com" autocomplete="email" /></label>`;
  }

  function cardMarkup() {
    return `<article class="ui-card ${materialClasses('stat-card')}" tabindex="0"><p>Conversión</p><strong>8.42%</strong><svg class="mini-chart" viewBox="0 0 200 70" role="img" aria-label="Tendencia ascendente"><path d="M3 60 C24 52, 35 57, 52 42 S84 53, 103 30 S137 38, 157 17 S183 24, 197 8" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".78"/></svg></article>`;
  }

  function navigationMarkup() {
    return `<nav class="floating-dock ${materialClasses('')}" aria-label="Navegación de demostración"><button class="is-active" aria-label="Inicio">⌂</button><button aria-label="Buscar">⌕</button><button aria-label="Crear">＋</button><button aria-label="Favoritos">♡</button></nav>`;
  }

  function musicMarkup() {
    return `<section class="music-player ${materialClasses('')}" aria-label="Reproductor de música"><div class="album-art" aria-hidden="true"></div><div class="player-meta"><strong>Midnight Material</strong><small>Morphiq Lab</small><div class="player-controls"><button class="player-toggle${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}" aria-label="Reproducir" aria-pressed="false">▶</button><div class="player-progress" aria-label="Progreso"><span></span></div><small class="player-time">1:14</small></div></div></section>`;
  }

  function featuredMarkup(type) {
    switch (type) {
      case 'switch': return switchMarkup(true, 'Energía');
      case 'slider': return sliderMarkup(64, 'Nivel de material');
      case 'input': return `<div style="width:min(360px,100%)">${inputMarkup()}</div>`;
      case 'card': return `<div style="width:min(340px,100%)">${cardMarkup()}</div>`;
      case 'navigation': return navigationMarkup();
      case 'music': return musicMarkup();
      case 'button':
      default: return buttonMarkup('Explorar material', 'primary', 'data-demo-action="featured"');
    }
  }

  function stateMarkup(label, className = '') {
    const attrs = label === 'Disabled' ? 'disabled' : '';
    const forcedClass = className ? ` ${className}` : '';
    if (state.component === 'switch') return `<button class="switch-control material-control${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}${forcedClass}" role="switch" aria-checked="${label === 'Active'}" aria-label="Switch ${label}" ${attrs}><span class="switch-thumb"></span></button>`;
    if (state.component === 'slider') return `<div class="custom-slider material-control${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}${forcedClass}" role="slider" tabindex="${attrs ? '-1' : '0'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="55" aria-disabled="${Boolean(attrs)}" style="--value:55%"><div class="slider-track"><span class="slider-fill"></span><span class="slider-thumb"></span></div></div>`;
    if (state.component === 'input') return `<label class="field"><input class="material-control${forcedClass}" placeholder="${label}" ${attrs}></label>`;
    if (state.component === 'card') return `<article class="ui-card ${materialClasses(forcedClass)}" tabindex="${attrs ? '-1' : '0'}"><strong>${label}</strong><p>Superficie del estado.</p></article>`;
    return `<button class="ui-button ui-button--primary material-control${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}${forcedClass}" ${attrs}>${label}</button>`;
  }

  function renderFeatured() {
    const target = $('#featuredComponent');
    target.innerHTML = featuredMarkup(state.component);
    applyForcedState(target);
    attachInteractions(target);
  }

  function renderStates() {
    const states = [
      ['Rest', ''], ['Hover', 'is-hover'], ['Focus', 'is-focus'], ['Pressed', 'is-pressed'], ['Disabled', 'is-disabled']
    ];
    $('#stateStrip').innerHTML = states.map(([label, className]) => `<div class="state-demo"><span>${label}</span><div>${stateMarkup(label === 'Rest' ? componentNames[state.component] : label, className)}</div></div>`).join('');
    attachInteractions($('#stateStrip'));
    const focus = $('.is-focus', $('#stateStrip'));
    if (focus) focus.style.boxShadow = 'var(--focus-ring)';
    const hover = $('.is-hover', $('#stateStrip'));
    if (hover) hover.style.filter = 'brightness(1.06)';
  }

  const gallerySections = {
    actions: () => `
      <article class="${galleryCardClass('wide')}" data-category="actions"><h4>Actions · botones y grupos</h4><div class="demo-row">
        ${buttonMarkup('Primary','primary','data-demo-action="toast-success"')}
        ${buttonMarkup('Secondary','secondary','data-demo-action="toast-info"')}
        ${buttonMarkup('Tertiary','tertiary','data-demo-action="toast-info"')}
        <button class="ui-button ui-button--secondary ui-icon-button material-control${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}" aria-label="Acción de icono" data-demo-action="toast-info">✦</button>
        <button class="ui-button ui-button--primary ui-fab material-control${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}" aria-label="Crear" data-demo-action="toast-success">＋</button>
        ${buttonMarkup('Eliminar','danger','data-demo-action="toast-error"')}
        <div class="button-group" role="group" aria-label="Alineación">${buttonMarkup('Izq','secondary')}${buttonMarkup('Centro','secondary')}${buttonMarkup('Der','secondary')}</div>
      </div></article>
      <article class="${galleryCardClass()}" data-category="actions"><h4>Segmented control</h4>
        <div class="segmented-control ${materialClasses('')}" role="group" aria-label="Densidad"><span class="segmented-indicator"></span><button aria-pressed="true">Compacta</button><button aria-pressed="false">Cómoda</button><button aria-pressed="false">Amplia</button></div>
      </article>`,
    inputs: () => `
      <article class="${galleryCardClass()}" data-category="inputs"><h4>Text, search y password</h4><div class="demo-stack">
        <label class="field"><span>Nombre</span><input class="material-control" type="text" placeholder="Escribe algo…"></label>
        <label class="field"><span>Buscar</span><input class="material-control" type="search" placeholder="Buscar materiales…"></label>
        <label class="field"><span>Contraseña</span><span class="input-wrap"><input class="material-control password-input" type="password" value="material"><button class="password-toggle" type="button" aria-label="Mostrar contraseña">◉</button></span></label>
      </div></article>
      <article class="${galleryCardClass()}" data-category="inputs"><h4>Textarea, select y dropdown</h4><div class="demo-stack">
        <label class="field"><span>Notas</span><textarea class="material-control" placeholder="Observaciones de la receta"></textarea></label>
        <label class="field"><span>Material</span><select class="material-control"><option>Plástico mate</option><option>Metal cepillado</option><option>Cerámica</option></select></label>
        <div class="demo-dropdown"><button class="ui-button ui-button--secondary dropdown-trigger${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}" aria-expanded="false">Dropdown abierto ▾</button><div class="dropdown-menu ${materialClasses('')}" role="menu"><button role="menuitem">Conservadora</button><button role="menuitem">Expresiva</button><button role="menuitem">Experimental</button></div></div>
      </div></article>
      <article class="${galleryCardClass()}" data-category="inputs"><h4>Selection controls</h4><div class="demo-stack">
        <label class="check-row"><input type="checkbox" checked> Checkbox</label>
        <div role="radiogroup" aria-label="Perfil"><label class="radio-row"><input type="radio" name="profile" checked> Producto</label><label class="radio-row"><input type="radio" name="profile"> Editorial</label></div>
        ${switchMarkup(true,'Switch')}
        ${buttonMarkup('Toggle button','secondary','aria-pressed="false" class="toggle-button"')}
      </div></article>
      <article class="${galleryCardClass()}" data-category="inputs"><h4>Slider y range slider</h4><div class="demo-stack">
        ${sliderMarkup(58,'Volumen')}
        <label class="field"><span>Rango 25–75</span><div class="range-slider"><input class="range-min" type="range" min="0" max="100" value="25" aria-label="Valor mínimo"><input class="range-max" type="range" min="0" max="100" value="75" aria-label="Valor máximo"></div><output class="range-output">25 – 75</output></label>
      </div></article>
      <article class="${galleryCardClass()}" data-category="inputs"><h4>Rotary dial</h4><div class="knob-wrap"><div class="knob-scale"></div><div class="knob material-control${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}" role="slider" tabindex="0" aria-label="Ganancia" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62" style="--knob-angle:43deg"></div><output>62</output></div></article>`,
    navigation: () => `
      <article class="${galleryCardClass('wide')}" data-category="navigation"><h4>Top navigation</h4><div class="top-nav-demo ${materialClasses('')}" aria-label="Top navigation"><strong>Morphiq</strong><nav><button class="is-active">Inicio</button><button>Materiales</button><button>Pruebas</button></nav>${buttonMarkup('Perfil','secondary')}</div></article>
      <article class="${galleryCardClass()}" data-category="navigation"><h4>Sidebar</h4><nav class="sidebar-demo ${materialClasses('')}" aria-label="Sidebar"><button class="is-active">◈ Overview</button><button>◌ Componentes</button><button>⌁ Tokens</button><button>⚙ Ajustes</button></nav></article>
      <article class="${galleryCardClass()}" data-category="navigation"><h4>Tabs y breadcrumbs</h4><div class="demo-stack"><div class="tabs-demo ${materialClasses('')}" role="tablist"><button class="is-active" role="tab" aria-selected="true">Diseño</button><button role="tab" aria-selected="false">Motion</button><button role="tab" aria-selected="false">Código</button></div><nav class="breadcrumbs" aria-label="Breadcrumbs"><a href="#">Lab</a><span>›</span><a href="#">Materiales</a><span>›</span><span aria-current="page">Botón</span></nav></div></article>
      <article class="${galleryCardClass()}" data-category="navigation"><h4>Dock, pagination y steps</h4><div class="demo-stack">${navigationMarkup()}<nav class="pagination" aria-label="Paginación"><button>‹</button><button class="is-active" aria-current="page">1</button><button>2</button><button>3</button><button>›</button></nav><div class="step-indicator" aria-label="Paso 2 de 4"><span class="is-done">✓</span><i></i><span class="is-done">2</span><i></i><span>3</span><i></i><span>4</span></div></div></article>`,
    surfaces: () => `
      <article class="${galleryCardClass()}" data-category="surfaces"><h4>Basic y content card</h4><div class="demo-stack"><article class="ui-card ${materialClasses('')}"><h5>Basic card</h5><p>Superficie con jerarquía clara.</p></article><article class="ui-card content-card ${materialClasses('')}"><div class="card-media"></div><div><h5>Material study</h5><p>Curvatura, luz y movimiento.</p></div></article></div></article>
      <article class="${galleryCardClass()}" data-category="surfaces"><h4>Profile y statistics</h4><div class="demo-stack"><article class="ui-card profile-card ${materialClasses('')}"><div class="avatar"></div><h5>Camila Torres</h5><p>Creative technologist</p></article>${cardMarkup()}</div></article>
      <article class="${galleryCardClass()}" data-category="surfaces"><h4>Media card</h4><article class="ui-card media-card ${materialClasses('')}" tabindex="0"><h5>Optical Field</h5><p>Refracción contenida para preservar datos.</p></article></article>
      <article class="${galleryCardClass()}" data-category="surfaces"><h4>Overlay, modal y tooltip</h4><div class="demo-stack"><div class="ui-card overlay-panel ${materialClasses('')}"><span>Overlay panel</span></div><button class="ui-button ui-button--secondary open-demo-modal${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}">Abrir modal</button><dialog class="demo-modal ui-card ${materialClasses('')}"><h5>Recipe checkpoint</h5><p>Este modal usa una superficie más opaca.</p><form method="dialog"><button class="ui-button ui-button--primary">Cerrar</button></form></dialog><span class="demo-tooltip"><button class="ui-button ui-button--tertiary">Tooltip</button><span class="tooltip-bubble ${materialClasses('')}" role="tooltip">Información contextual</span></span></div></article>`,
    feedback: () => `
      <article class="${galleryCardClass()}" data-category="feedback"><h4>Toasts y alerta</h4><div class="demo-stack"><button class="ui-button ui-button--secondary show-success-toast${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}">Mostrar éxito</button><button class="ui-button ui-button--secondary show-error-toast${state.style === 'liquid-glass' ? ' liquid-elastic' : ''}">Mostrar error</button><div class="alert alert--warning ${materialClasses('')}" role="alert"><span>⚠</span><div><strong>Revisa el contraste</strong><p>El fondo actual exige más opacidad.</p></div></div></div></article>
      <article class="${galleryCardClass()}" data-category="feedback"><h4>Notification item</h4><div class="notification-item ${materialClasses('')}" tabindex="0"><span>● Nueva variante guardada</span><small>ahora</small></div></article>
      <article class="${galleryCardClass()}" data-category="feedback"><h4>Progress, circular y gauge</h4><div class="demo-stack"><div class="progress-track"><div class="progress-fill"></div></div><div class="demo-row"><div class="circular-progress" aria-label="72 por ciento"></div><div class="gauge" aria-label="Medidor en 68"></div></div></div></article>`,
    rich: () => `
      <article class="${galleryCardClass('wide')}" data-category="rich"><h4>Music player</h4>${musicMarkup()}</article>
      <article class="${galleryCardClass()}" data-category="rich"><h4>Weather widget</h4><section class="weather-widget ${materialClasses('')}" aria-label="Clima"><div class="weather-main"><div><small>Tulum</small><strong>28°</strong><p>Parcialmente nublado</p></div><span class="weather-icon">🌤</span></div><div class="weather-days"><span>Lun<br>27°</span><span>Mar<br>29°</span><span>Mié<br>28°</span><span>Jue<br>26°</span></div></section></article>
      <article class="${galleryCardClass()}" data-category="rich"><h4>Calendar</h4><section class="calendar ${materialClasses('')}"><strong>Julio 2026</strong><div class="calendar-grid">${Array.from({length:35},(_,i)=> i<3 ? '<span></span>' : `<button ${i===26?'class="is-selected" aria-current="date"':''}>${i-2}</button>`).join('')}</div></section></article>
      <article class="${galleryCardClass('wide')}" data-category="rich"><h4>Mini chart y dashboard statistics</h4><div class="dashboard-stats"><article class="ui-card ${materialClasses('')}"><p>Usuarios</p><strong>12.8K</strong><svg class="mini-chart" viewBox="0 0 200 70"><path d="M2 56 L28 45 L52 49 L78 29 L103 36 L126 18 L153 25 L198 7" fill="none" stroke="currentColor" stroke-width="4"/></svg></article><article class="ui-card ${materialClasses('')}"><p>Conversión</p><strong>8.4%</strong><svg class="mini-chart" viewBox="0 0 200 70"><path d="M2 48 C28 64 44 23 70 37 S110 58 132 30 S170 30 198 11" fill="none" stroke="currentColor" stroke-width="4"/></svg></article><article class="ui-card ${materialClasses('')}"><p>Sesiones</p><strong>2,482</strong><svg class="mini-chart" viewBox="0 0 200 70"><path d="M2 62 L34 51 L61 53 L92 43 L120 20 L151 29 L198 5" fill="none" stroke="currentColor" stroke-width="4"/></svg></article></div></article>
      <article class="${galleryCardClass()}" data-category="rich"><h4>Quick actions</h4><div class="quick-actions">${['＋','⌕','⇧','♡'].map((icon,i)=>`<button class="${state.style === 'liquid-glass'?'liquid-elastic':''}" aria-label="Acción ${i+1}" data-demo-action="toast-info">${icon}</button>`).join('')}</div></article>
      <article class="${galleryCardClass()}" data-category="rich"><h4>Map placeholder</h4><div class="map-placeholder" aria-label="Mapa interactivo"><div class="map-marker" role="button" tabindex="0" aria-label="Mover marcador"></div></div></article>
      <article class="${galleryCardClass()}" data-category="rich"><h4>Upload / drop zone</h4><div class="drop-zone" tabindex="0"><div><strong>Suelta un archivo</strong><p>o pulsa para seleccionar</p><input type="file" hidden></div></div></article>
      <article class="${galleryCardClass()}" data-category="rich"><h4>Task list</h4><div class="task-list">${['Probar luz a 315°','Validar focus visible','Comparar damping'].map((task,i)=>`<label class="task-item ${materialClasses('')}"><input type="checkbox" ${i===0?'checked':''}><span>${task}</span></label>`).join('')}</div></article>`
  };

  function renderGallery() {
    const gallery = $('#componentGallery');
    gallery.innerHTML = Object.values(gallerySections).map(section => section()).join('');
    filterGallery();
    attachInteractions(gallery);
  }

  function filterGallery() {
    const filter = $('#galleryFilter').value;
    $$('.gallery-card', $('#componentGallery')).forEach(card => {
      card.hidden = filter !== 'all' && card.dataset.category !== filter;
    });
  }

  function attachInteractions(scope = document) {
    bindActionButtons(scope);
    bindSwitches(scope);
    bindSegmented(scope);
    bindDropdowns(scope);
    bindPassword(scope);
    bindSliders(scope);
    bindRanges(scope);
    bindKnobs(scope);
    bindTabsAndNav(scope);
    bindModals(scope);
    bindToasts(scope);
    bindMusic(scope);
    bindCalendar(scope);
    bindMap(scope);
    bindDropZones(scope);
    bindTasks(scope);
    bindToggleButtons(scope);
    if (state.style === 'liquid-glass') liquidController?.bind(scope);
  }

  function bindActionButtons(scope) {
    $$('[data-demo-action]', scope).forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        const type = button.dataset.demoAction;
        if (type === 'toast-error') showToast('error', 'Acción destructiva simulada', 'El laboratorio no modifica datos reales.');
        else if (type === 'toast-success') showToast('success', 'Interacción completada', 'El control respondió a input real.');
        else showToast('info', 'Estado activado', 'La microinteracción se ejecutó correctamente.');
      });
    });
  }

  function bindSwitches(scope) {
    $$('.switch-control', scope).forEach(control => {
      if (control.dataset.bound) return;
      control.dataset.bound = 'true';
      let dragging = false;
      let dragged = false;
      let startX = 0;
      let suppressClick = false;

      const setChecked = checked => {
        if (control.disabled || control.getAttribute('aria-disabled') === 'true') return;
        control.setAttribute('aria-checked', String(Boolean(checked)));
      };
      const toggle = () => setChecked(control.getAttribute('aria-checked') !== 'true');

      control.addEventListener('click', event => {
        if (suppressClick) {
          event.preventDefault();
          suppressClick = false;
          return;
        }
        toggle();
      });
      control.addEventListener('keydown', event => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); setChecked(false); }
        if (event.key === 'ArrowRight') { event.preventDefault(); setChecked(true); }
      });
      control.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        dragging = true;
        dragged = false;
        startX = event.clientX;
        try { control.setPointerCapture?.(event.pointerId); } catch (error) {}
      });
      control.addEventListener('pointermove', event => {
        if (!dragging) return;
        if (Math.abs(event.clientX - startX) > 4) dragged = true;
        const rect = control.getBoundingClientRect();
        setChecked(event.clientX > rect.left + rect.width / 2);
      });
      const end = () => {
        if (!dragging) return;
        dragging = false;
        if (dragged) suppressClick = true;
      };
      control.addEventListener('pointerup', end);
      control.addEventListener('pointercancel', end);
      control.addEventListener('lostpointercapture', end);
    });
  }

  function bindSegmented(scope) {
    $$('.segmented-control', scope).forEach(group => {
      if (group.dataset.bound) return;
      group.dataset.bound = 'true';
      const buttons = $$('button', group);
      const indicator = $('.segmented-indicator', group);
      const select = index => {
        buttons.forEach((button, current) => button.setAttribute('aria-pressed', String(current === index)));
        if (indicator) indicator.style.transform = `translateX(${index * 100}%)`;
      };
      buttons.forEach((button, index) => button.addEventListener('click', () => select(index)));
    });
  }

  function bindDropdowns(scope) {
    $$('.demo-dropdown', scope).forEach(dropdown => {
      if (dropdown.dataset.bound) return;
      dropdown.dataset.bound = 'true';
      const trigger = $('.dropdown-trigger', dropdown);
      const menu = $('.dropdown-menu', dropdown);
      const close = () => { menu.classList.remove('is-open'); trigger.setAttribute('aria-expanded','false'); };
      trigger.addEventListener('click', event => {
        event.stopPropagation();
        const opening = !menu.classList.contains('is-open');
        $$('.dropdown-menu.is-open').forEach(open => open.classList.remove('is-open'));
        menu.classList.toggle('is-open', opening);
        trigger.setAttribute('aria-expanded', String(opening));
        if (opening) $('button', menu)?.focus();
      });
      $$('button', menu).forEach(option => option.addEventListener('click', () => { trigger.firstChild.textContent = `${option.textContent} `; close(); }));
      dropdown.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); trigger.focus(); } });
    });
    if (!document.body.dataset.dropdownOutsideBound) {
      document.body.dataset.dropdownOutsideBound = 'true';
      document.addEventListener('click', event => {
        $$('.demo-dropdown').forEach(dropdown => { if (!dropdown.contains(event.target)) { $('.dropdown-menu', dropdown)?.classList.remove('is-open'); $('.dropdown-trigger', dropdown)?.setAttribute('aria-expanded','false'); } });
      });
    }
  }

  function bindPassword(scope) {
    $$('.password-toggle', scope).forEach(toggle => {
      if (toggle.dataset.bound) return;
      toggle.dataset.bound = 'true';
      toggle.addEventListener('click', () => {
        const input = toggle.closest('.input-wrap').querySelector('input');
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        toggle.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      });
    });
  }

  function updateCustomSlider(slider, clientX) {
    const rect = slider.getBoundingClientRect();
    const value = Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 100);
    slider.style.setProperty('--value', `${value}%`);
    slider.setAttribute('aria-valuenow', String(value));
    const output = slider.parentElement.querySelector('output');
    if (output) output.textContent = `${value}%`;
  }

  function bindSliders(scope) {
    $$('.custom-slider', scope).forEach(slider => {
      if (slider.dataset.bound) return;
      slider.dataset.bound = 'true';
      let dragging = false;
      slider.addEventListener('pointerdown', event => {
        if (slider.getAttribute('aria-disabled') === 'true') return;
        event.preventDefault();
        dragging = true;
        slider.classList.add('is-dragging');
        try { slider.setPointerCapture?.(event.pointerId); } catch (error) {}
        updateCustomSlider(slider, event.clientX);
      });
      slider.addEventListener('pointermove', event => { if (dragging) updateCustomSlider(slider, event.clientX); });
      const end = () => { dragging = false; slider.classList.remove('is-dragging'); };
      slider.addEventListener('pointerup', end);
      slider.addEventListener('pointercancel', end);
      slider.addEventListener('keydown', event => {
        const now = Number(slider.getAttribute('aria-valuenow')) || 0;
        const step = event.shiftKey ? 10 : 1;
        let next = now;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= step;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += step;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = 100;
        else return;
        event.preventDefault();
        next = Math.min(100, Math.max(0, next));
        slider.style.setProperty('--value', `${next}%`);
        slider.setAttribute('aria-valuenow', String(next));
        const output = slider.parentElement.querySelector('output');
        if (output) output.textContent = `${next}%`;
      });
    });
  }

  function bindRanges(scope) {
    $$('.range-slider', scope).forEach(range => {
      if (range.dataset.bound) return;
      range.dataset.bound = 'true';
      const min = $('.range-min', range);
      const max = $('.range-max', range);
      const output = range.parentElement.querySelector('.range-output');
      const update = event => {
        if (Number(min.value) > Number(max.value)) {
          if (event.target === min) min.value = max.value;
          else max.value = min.value;
        }
        output.textContent = `${min.value} – ${max.value}`;
      };
      min.addEventListener('input', update);
      max.addEventListener('input', update);
    });
  }

  function bindKnobs(scope) {
    $$('.knob', scope).forEach(knob => {
      if (knob.dataset.bound) return;
      knob.dataset.bound = 'true';
      let dragging = false;
      let startY = 0;
      let startValue = Number(knob.getAttribute('aria-valuenow')) || 50;
      const setValue = value => {
        const next = Math.min(100, Math.max(0, Math.round(value)));
        knob.setAttribute('aria-valuenow', String(next));
        knob.style.setProperty('--knob-angle', `${-135 + next * 2.7}deg`);
        const output = knob.parentElement.querySelector('output');
        if (output) output.textContent = next;
      };
      knob.addEventListener('pointerdown', event => {
        event.preventDefault();
        dragging = true; startY = event.clientY; startValue = Number(knob.getAttribute('aria-valuenow')) || 0;
        try { knob.setPointerCapture?.(event.pointerId); } catch (error) {}
      });
      knob.addEventListener('pointermove', event => { if (dragging) setValue(startValue + (startY - event.clientY) * .6); });
      const end = () => { dragging = false; };
      knob.addEventListener('pointerup', end);
      knob.addEventListener('pointercancel', end);
      knob.addEventListener('wheel', event => { event.preventDefault(); setValue((Number(knob.getAttribute('aria-valuenow')) || 0) - Math.sign(event.deltaY) * 2); }, { passive:false });
      knob.addEventListener('keydown', event => {
        let value = Number(knob.getAttribute('aria-valuenow')) || 0;
        if (event.key === 'ArrowUp' || event.key === 'ArrowRight') value += event.shiftKey ? 10 : 1;
        else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') value -= event.shiftKey ? 10 : 1;
        else if (event.key === 'Home') value = 0;
        else if (event.key === 'End') value = 100;
        else return;
        event.preventDefault(); setValue(value);
      });
    });
  }

  function bindTabsAndNav(scope) {
    $$('.tabs-demo', scope).forEach(tabs => {
      if (tabs.dataset.bound) return; tabs.dataset.bound = 'true';
      $$('button', tabs).forEach(button => button.addEventListener('click', () => {
        $$('button', tabs).forEach(item => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-selected', String(item === button)); });
      }));
    });
    $$('.sidebar-demo, .floating-dock, .pagination, .top-nav-demo nav', scope).forEach(nav => {
      if (nav.dataset.bound) return; nav.dataset.bound = 'true';
      $$('button', nav).forEach(button => button.addEventListener('click', () => {
        $$('button', nav).forEach(item => item.classList.toggle('is-active', item === button));
      }));
    });
  }

  function bindModals(scope) {
    $$('.open-demo-modal', scope).forEach(button => {
      if (button.dataset.bound) return; button.dataset.bound = 'true';
      button.addEventListener('click', () => button.parentElement.querySelector('dialog')?.showModal());
    });
  }

  function bindToasts(scope) {
    $$('.show-success-toast', scope).forEach(button => { if (!button.dataset.bound) { button.dataset.bound='true'; button.addEventListener('click',()=>showToast('success','Receta guardada','Los tokens se conservaron en esta sesión.')); } });
    $$('.show-error-toast', scope).forEach(button => { if (!button.dataset.bound) { button.dataset.bound='true'; button.addEventListener('click',()=>showToast('error','Contraste insuficiente','Aumenta opacidad o reduce el detalle del fondo.')); } });
  }

  function bindMusic(scope) {
    $$('.music-player', scope).forEach(player => {
      if (player.dataset.bound) return; player.dataset.bound = 'true';
      const toggle = $('.player-toggle', player);
      const progress = $('.player-progress span', player);
      const time = $('.player-time', player);
      let value = 34;
      let playing = false;
      let timer = null;
      const stop = () => { if (timer) clearInterval(timer); timer = null; };
      toggle.addEventListener('click', () => {
        playing = !playing;
        toggle.textContent = playing ? 'Ⅱ' : '▶';
        toggle.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
        toggle.setAttribute('aria-pressed', String(playing));
        stop();
        if (playing) timer = setInterval(() => { value = (value + .6) % 100; progress.style.width = `${value}%`; const seconds = Math.round(value * 2.2); time.textContent = `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; }, 120);
      });
      player.addEventListener('DOMNodeRemoved', stop, { once:true });
    });
  }

  function bindCalendar(scope) {
    $$('.calendar-grid', scope).forEach(calendar => {
      if (calendar.dataset.bound) return; calendar.dataset.bound = 'true';
      $$('button', calendar).forEach(day => day.addEventListener('click', () => {
        $$('button', calendar).forEach(item => { item.classList.toggle('is-selected', item === day); item.removeAttribute('aria-current'); });
        day.setAttribute('aria-current','date');
      }));
    });
  }

  function bindMap(scope) {
    $$('.map-marker', scope).forEach(marker => {
      if (marker.dataset.bound) return; marker.dataset.bound='true';
      let dragging = false;
      const move = event => {
        const map = marker.parentElement;
        const rect = map.getBoundingClientRect();
        marker.style.left = `${Math.min(100,Math.max(0,(event.clientX-rect.left)/rect.width*100))}%`;
        marker.style.top = `${Math.min(100,Math.max(10,(event.clientY-rect.top)/rect.height*100))}%`;
      };
      marker.addEventListener('pointerdown', event => { event.preventDefault(); dragging=true; try { marker.setPointerCapture?.(event.pointerId); } catch (error) {} move(event); });
      marker.addEventListener('pointermove', event => { if (dragging) move(event); });
      marker.addEventListener('pointerup',()=>dragging=false);
      marker.addEventListener('pointercancel',()=>dragging=false);
      marker.addEventListener('keydown', event => {
        const left = Number.parseFloat(marker.style.left || '50');
        const top = Number.parseFloat(marker.style.top || '50');
        if (event.key === 'ArrowLeft') marker.style.left = `${Math.max(0,left-2)}%`;
        else if (event.key === 'ArrowRight') marker.style.left = `${Math.min(100,left+2)}%`;
        else if (event.key === 'ArrowUp') marker.style.top = `${Math.max(10,top-2)}%`;
        else if (event.key === 'ArrowDown') marker.style.top = `${Math.min(100,top+2)}%`;
        else return;
        event.preventDefault();
      });
    });
  }

  function bindDropZones(scope) {
    $$('.drop-zone', scope).forEach(zone => {
      if (zone.dataset.bound) return; zone.dataset.bound='true';
      const input = $('input[type="file"]', zone);
      const setFile = file => { $('strong', zone).textContent = file ? file.name : 'Suelta un archivo'; if (file) showToast('success','Archivo recibido',`${file.name} listo para la prueba visual.`); };
      zone.addEventListener('click',()=>input.click());
      zone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}});
      zone.addEventListener('dragover',event=>{event.preventDefault();zone.classList.add('is-over');});
      zone.addEventListener('dragleave',()=>zone.classList.remove('is-over'));
      zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('is-over');setFile(event.dataTransfer.files[0]);});
      input.addEventListener('change',()=>setFile(input.files[0]));
    });
  }

  function bindTasks(scope) {
    $$('.task-item input', scope).forEach(input => {
      if (input.dataset.bound) return; input.dataset.bound='true';
      const update = () => input.closest('.task-item').classList.toggle('is-done', input.checked);
      input.addEventListener('change', update); update();
    });
  }

  function bindToggleButtons(scope) {
    $$('.toggle-button', scope).forEach(button => {
      if (button.dataset.bound) return; button.dataset.bound='true';
      button.addEventListener('click',()=>button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true')));
    });
  }

  function showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `system-toast system-toast--${type}${state.style === 'liquid-glass' ? ' liquid-elastic liquid-surface' : ''}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
    toast.innerHTML = `<strong aria-hidden="true">${icon}</strong><div><strong>${title}</strong><div>${message}</div></div><button aria-label="Cerrar notificación">×</button>`;
    $('#toastRegion').append(toast);
    $('button', toast).addEventListener('click',()=>toast.remove());
    if (state.style === 'liquid-glass') liquidController?.bindElement(toast);
    setTimeout(()=>toast.isConnected && toast.remove(), 5200);
  }

  function applyForcedState(scope) {
    const target = scope.firstElementChild?.matches('div') && scope.firstElementChild.childElementCount === 1 ? scope.firstElementChild.firstElementChild : scope.firstElementChild;
    if (!target) return;
    target.classList.toggle('is-pressed', state.interactionState === 'pressed');
    target.toggleAttribute('disabled', state.interactionState === 'disabled' && ['BUTTON','INPUT','SELECT','TEXTAREA'].includes(target.tagName));
    target.setAttribute('aria-disabled', String(state.interactionState === 'disabled'));
    if (state.interactionState === 'focus') target.style.boxShadow = 'var(--focus-ring)';
    if (state.interactionState === 'hover') target.style.filter = 'brightness(1.07)';
  }

  function setStyle(nextStyle, { applyPreset = true } = {}) {
    if (!labMeta[nextStyle]) return;
    state.style = nextStyle;
    root.dataset.style = nextStyle;
    $('#styleSelect').value = nextStyle;
    $('#labHeading').textContent = labMeta[nextStyle].title;
    $('#labDescription').textContent = labMeta[nextStyle].description;
    $('#stageNote').textContent = labMeta[nextStyle].note;
    $('#materialStage').className = `material-stage stage-${nextStyle}`;
    $$('[data-style-switch]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.styleSwitch === nextStyle)));
    if (applyPreset) applyVariant(state.variant);
    renderFeatured();
    renderStates();
    renderGallery();
    renderRecipe();
    renderCompare();
    liquidRenderer?.touch();
  }

  function applyVariant(variant) {
    state.variant = variant;
    root.dataset.variant = variant;
    $('#variantSelect').value = variant;
    const recipe = window.MorphiqRecipes[state.style];
    const values = recipe?.variants?.[variant];
    if (values) {
      Object.entries(values).forEach(([token,value]) => root.style.setProperty(token,value));
      syncControlsFromCss();
    }
    renderRecipe();
    liquidController?.refreshOptics?.();
    liquidRenderer?.touch();
  }

  function syncControlsFromCss() {
    const styles = getComputedStyle(root);
    Object.entries(tokenControlMap).forEach(([token, config]) => {
      const input = $(`#${config.input}`);
      let value = styles.getPropertyValue(token).trim();
      if (!value) return;
      if (token === '--light-angle') value = Number.parseFloat(value);
      else if (['--material-depth','--material-blur'].includes(token)) value = Number.parseFloat(value);
      else if (['--motion-stiffness','--motion-damping','--ripple-count'].includes(token)) value = Number.parseFloat(value);
      else value = Number.parseFloat(value) * 100;
      if (Number.isFinite(value)) {
        input.value = String(Math.round(value * 100) / 100);
        const output = document.querySelector(`output[for="${input.id}"]`);
        if (output) output.textContent = config.output(input.value);
      }
    });
    $('#miniLight').value = $('#lightDirection').value;
    $('#miniMotion').value = $('#motion').value;
    $('#miniStiffness').value = $('#stiffness').value;
  }

  function setBackground(background) {
    state.background = background;
    body.dataset.background = background;
    $('#backgroundSelect').value = background;
    $('#miniBackground').value = ['aurora','sunset','night','light'].includes(background) ? background : 'aurora';
    updateContrastEstimate();
  }

  function setAccent(hex) {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#6ae4ff';
    const number = Number.parseInt(normalized.slice(1), 16);
    const rgb = `${(number>>16)&255}, ${(number>>8)&255}, ${number&255}`;
    root.style.setProperty('--accent', normalized);
    root.style.setProperty('--accent-rgb', rgb);
    $('#accentColor').value = normalized;
    liquidRenderer?.setAccent(normalized);
    renderRecipe();
  }

  function setQuality(quality) {
    state.quality = quality;
    root.dataset.quality = quality;
    $('#qualitySelect').value = quality;
    $('#qualityBadge').textContent = quality[0].toUpperCase() + quality.slice(1);
    liquidRenderer?.setQuality(quality);
    liquidController?.refreshOptics?.();
    renderRecipe();
  }

  function setReducedMotion(enabled) {
    body.classList.toggle('reduced-motion', enabled);
    $('#reducedMotion').checked = enabled;
    liquidRenderer?.touch();
  }

  function setViewport(viewport) {
    state.viewport = viewport;
    $('#previewShell').dataset.viewport = viewport;
    $('#viewportSelect').value = viewport;
  }

  function renderRecipe() {
    const recipe = window.MorphiqRecipes[state.style];
    if (!recipe) return;
    const computed = getComputedStyle(root);
    const tokens = [
      '--material-bg','--material-border','--material-highlight','--material-shadow','--material-radius','--material-depth','--material-texture','--material-blur','--material-refraction','--material-dispersion','--material-specular','--material-roughness','--ripple-intensity','--ripple-brightness','--ripple-count','--motion-stiffness','--motion-damping','--motion-duration'
    ];
    $('#tokenList').innerHTML = tokens.map(token => `<div><dt>${token}</dt><dd>${computed.getPropertyValue(token).trim() || recipe.variants[state.variant]?.[token] || '—'}</dd></div>`).join('');
    const vars = tokens.map(token => `  ${token}: ${computed.getPropertyValue(token).trim() || recipe.variants[state.variant]?.[token] || 'initial'};`).join('\n');
    const code = {
      'css-vars': `:root {\n${vars}\n}`,
      'css-class': recipe.classCode,
      behavior: recipe.behaviorCode,
      shader: typeof recipe.shaderCode === 'function' ? recipe.shaderCode() : recipe.shaderCode,
      example: recipe.exampleCode
    };
    $('#recipeCode').textContent = code[state.codeTab] || code['css-vars'];
    $('#dependencyNote').textContent = recipe.dependencies;
  }

  function renderCompare() {
    const type = $('#compareSelect').value;
    const items = [
      ['skeuomorphism','Skeuomorphic','Mecánica, alojamiento, grosor y recorrido físico.'],
      ['glassmorphism','Glassmorphic','Lámina esmerilada estable con jerarquía de translucidez.'],
      ['liquid-glass','Liquid Glass','Materia óptica elástica con refracción y ripple.']
    ];
    $('#compareGrid').innerHTML = items.map(([style,title,note]) => {
      const oldStyle = state.style;
      state.style = style;
      const markup = featuredMarkup(type);
      state.style = oldStyle;
      return `<article class="compare-card" data-style-scope="${style}"><header class="compare-card__header"><h3>${title}</h3><p>${window.MorphiqRecipes[style].description}</p></header><div class="compare-card__stage">${markup}</div><div class="compare-card__notes">${note}</div></article>`;
    }).join('');
    attachCompareInteractions($('#compareGrid'));
  }

  function attachCompareInteractions(scope) {
    // Bind generic interactions without relying on the selected lab style.
    bindSwitches(scope); bindSliders(scope); bindMusic(scope); bindTabsAndNav(scope); bindActionButtons(scope);
    $$('[data-style-scope="liquid-glass"] .ui-button, [data-style-scope="liquid-glass"] .switch-control, [data-style-scope="liquid-glass"] .custom-slider, [data-style-scope="liquid-glass"] .ui-card, [data-style-scope="liquid-glass"] .music-player, [data-style-scope="liquid-glass"] .floating-dock', scope).forEach(el => {
      el.classList.add('liquid-elastic','liquid-surface');
      if (el.matches('.ui-card, .music-player, .floating-dock')) el.classList.add('liquid-reactive');
    });
    liquidController?.bind(scope);
  }

  function updateContrastEstimate() {
    const base = state.background === 'light' ? 5.8 : state.background === 'abstract' ? 6.1 : 7.2;
    const opacity = Number($('#opacity').value) / 100;
    const score = Math.max(3.1, Math.min(12, base + opacity * 4 - (state.style === 'liquid-glass' ? .4 : 0)));
    $('#contrastValue').textContent = `${score.toFixed(1)}:1`;
  }

  function resetAll() {
    state.variant = 'conservative';
    state.component = 'button';
    state.interactionState = 'rest';
    $('#componentSelect').value = 'button';
    $('#stateSelect').value = 'rest';
    setAccent('#6ae4ff');
    setBackground('aurora');
    setQuality('full');
    setReducedMotion(false);
    setViewport('wide');
    applyVariant('conservative');
    renderFeatured(); renderStates(); renderGallery(); renderCompare();
    showToast('success','Valores restablecidos','La receta volvió a su preset conservador.');
  }

  function copyText(text, label = 'Código copiado') {
    navigator.clipboard?.writeText(text).then(() => showToast('success',label,'Listo para pegar.')).catch(() => {
      const area = document.createElement('textarea'); area.value = text; area.style.position='fixed'; area.style.opacity='0'; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); showToast('success',label,'Listo para pegar.');
    });
  }

  function bindGlobalControls() {
    $('#styleSelect').addEventListener('change',event=>setStyle(event.target.value));
    $('#variantSelect').addEventListener('change',event=>applyVariant(event.target.value));
    $('#componentSelect').addEventListener('change',event=>{state.component=event.target.value;renderFeatured();renderStates();});
    $('#stateSelect').addEventListener('change',event=>{state.interactionState=event.target.value;renderFeatured();});
    $('#backgroundSelect').addEventListener('change',event=>setBackground(event.target.value));
    $('#accentColor').addEventListener('input',event=>setAccent(event.target.value));
    $('#qualitySelect').addEventListener('change',event=>setQuality(event.target.value));
    $('#reducedMotion').addEventListener('change',event=>setReducedMotion(event.target.checked));
    $('#viewportSelect').addEventListener('change',event=>setViewport(event.target.value));
    $('#galleryFilter').addEventListener('change',filterGallery);
    $('#compareSelect').addEventListener('change',renderCompare);
    $('#resetAll').addEventListener('click',resetAll);

    Object.entries(tokenControlMap).forEach(([token, config]) => {
      const input = $(`#${config.input}`);
      input.addEventListener('input', () => {
        root.style.setProperty(token, config.css(input.value));
        const output = document.querySelector(`output[for="${input.id}"]`);
        if (output) output.textContent = config.output(input.value);
        if (input.id === 'lightDirection') $('#miniLight').value = input.value;
        if (input.id === 'motion') $('#miniMotion').value = input.value;
        if (input.id === 'stiffness') $('#miniStiffness').value = input.value;
        renderRecipe(); updateContrastEstimate(); liquidController?.refreshOptics?.(); liquidRenderer?.touch();
      });
    });

    $('#miniLight').addEventListener('input',event=>{ $('#lightDirection').value=event.target.value; $('#lightDirection').dispatchEvent(new Event('input')); });
    $('#miniMotion').addEventListener('input',event=>{ $('#motion').value=event.target.value; $('#motion').dispatchEvent(new Event('input')); });
    $('#miniStiffness').addEventListener('input',event=>{ $('#stiffness').value=event.target.value; $('#stiffness').dispatchEvent(new Event('input')); });
    $('#miniBackground').addEventListener('change',event=>setBackground(event.target.value));

    $$('[data-style-switch]').forEach(button=>button.addEventListener('click',()=>setStyle(button.dataset.styleSwitch)));
    $$('.view-tab').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
    $$('.code-tabs button').forEach(button=>button.addEventListener('click',()=>{
      state.codeTab=button.dataset.codeTab; $$('.code-tabs button').forEach(item=>item.classList.toggle('is-active',item===button)); renderRecipe();
    }));
    $('#copyRecipe').addEventListener('click',()=>copyText($('#recipeCode').textContent,'Bloque copiado'));
    $('#copyAllTokens').addEventListener('click',()=>{state.codeTab='css-vars';renderRecipe();copyText($('#recipeCode').textContent,'Tokens copiados');});
    $('#forceFocus').addEventListener('change',event=>$('#previewShell').classList.toggle('force-focus',event.target.checked));
    $('#grayscaleMode').addEventListener('change',event=>$('#previewShell').classList.toggle('grayscale',event.target.checked));

    $('#toggleInspector').addEventListener('click',()=>{
      const inspector=$('#inspector');
      if(matchMedia('(max-width:820px)').matches) inspector.classList.toggle('is-open');
      else inspector.classList.toggle('is-collapsed');
    });

    document.addEventListener('selectstart', event => {
      if (root.dataset.style !== 'skeuomorphism') return;
      if (!event.target.closest('.material-stage, .state-strip, .component-gallery, .compare-card__stage')) return;
      if (event.target.closest('input, textarea, select, pre, code, [contenteditable="true"]')) return;
      event.preventDefault();
    });
  }

  function setView(view) {
    state.view = view;
    const lab = $('#labView'); const compare = $('#compareView');
    lab.hidden = view !== 'lab'; compare.hidden = view !== 'compare';
    lab.classList.toggle('is-active',view==='lab'); compare.classList.toggle('is-active',view==='compare');
    $$('.view-tab').forEach(button=>{button.classList.toggle('is-active',button.dataset.view===view);button.setAttribute('aria-pressed',String(button.dataset.view===view));});
    if(view==='compare') renderCompare();
  }

  function setupCommandPalette() {
    const dialog = $('#commandDialog');
    const commands = [
      ...Object.keys(labMeta).map(style=>({label:`Cambiar a ${labMeta[style].title}`,group:'Estilo',run:()=>setStyle(style)})),
      ...['aurora','night','sunset','tropical','landscape','abstract','light'].map(bg=>({label:`Fondo: ${bg}`,group:'Fondo',run:()=>setBackground(bg)})),
      ...Object.entries(componentNames).map(([key,label])=>({label:`Componente: ${label}`,group:'Componente',run:()=>{state.component=key;$('#componentSelect').value=key;renderFeatured();renderStates();}})),
      {label:'Abrir Compare',group:'Vista',run:()=>setView('compare')},
      {label:'Restablecer receta',group:'Sistema',run:resetAll}
    ];
    const render = query => {
      const normalized=query.trim().toLowerCase();
      const filtered=commands.filter(command=>command.label.toLowerCase().includes(normalized)).slice(0,14);
      $('#commandList').innerHTML=filtered.map((command,index)=>`<button type="button" class="command-item" role="option" data-index="${commands.indexOf(command)}"><span>${command.label}</span><small>${command.group}</small></button>`).join('') || '<p style="padding:12px;color:var(--muted)">Sin resultados.</p>';
      $$('.command-item').forEach(button=>button.addEventListener('click',()=>{commands[Number(button.dataset.index)].run();dialog.close();}));
    };
    $('#openCommand').addEventListener('click',()=>{dialog.showModal();$('#commandInput').value='';render('');setTimeout(()=>$('#commandInput').focus(),0);});
    $('#commandInput').addEventListener('input',event=>render(event.target.value));
    document.addEventListener('keydown',event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();dialog.open?dialog.close():$('#openCommand').click();}
    });
    render('');
  }

  function initLiquid() {
    const canvas = $('#liquidCanvas');
    liquidRenderer = new window.LiquidRenderer(canvas);
    liquidController = new window.LiquidSpringController(liquidRenderer);
    $('#materialStage').addEventListener('pointermove',event=>{ if (state.style === 'liquid-glass') liquidRenderer.pointerMove(event.clientX,event.clientY); },{passive:true});
    $('#materialStage').addEventListener('pointerdown',event=>{ if (state.style === 'liquid-glass') liquidRenderer.addRipple(event.clientX,event.clientY,1); });
  }

  function init() {
    initLiquid();
    bindGlobalControls();
    setupCommandPalette();
    setAccent('#6ae4ff');
    setBackground('aurora');
    setQuality('full');
    applyVariant('conservative');
    setStyle('skeuomorphism',{applyPreset:false});
    setViewport('wide');
    updateContrastEstimate();

    const media = matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) setReducedMotion(true);
    media.addEventListener?.('change',event=>setReducedMotion(event.matches));
  }

  document.addEventListener('DOMContentLoaded', init, { once:true });
})();
