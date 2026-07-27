(() => {
  'use strict';

  /**
   * Motor de lentes de Morphiq Material Lab.
   *
   * PROBLEMA QUE RESUELVE
   * El shader anterior (scripts/liquid-renderer.js) nunca refractó la página:
   * su función scene() era un degradado procedural escrito en GLSL que
   * casualmente se parecía al fondo. Refractaba una escena inventada. Además
   * vivía en un único canvas dentro del Material Playground, así que los ~40
   * componentes de la galería no recibían un solo pixel de óptica real.
   *
   * ARQUITECTURA
   *   1. El fondo se dibuja una vez en un canvas 2D (scripts/backdrops.js).
   *   2. Ese bitmap se sube como textura a un único contexto WebGL compartido,
   *      fuera del DOM, del tamaño del viewport.
   *   3. Cada elemento registrado se dibuja como un quad con forma de caja
   *      redondeada. El fragment shader muestrea la textura del fondo con un
   *      desplazamiento que depende del campo de espesor del vidrio.
   *   4. Cada elemento tiene su propio <canvas> hijo, y por frame se copia su
   *      región desde el canvas GL compartido.
   *
   * COSTO
   *   Un contexto, un programa, N draw calls de quads pequeños. El fill-rate es
   *   la suma de las áreas de vidrio, no N pantallas. Los rects se leen en una
   *   sola pasada por frame — todas las lecturas antes de cualquier escritura —
   *   para no provocar layout thrashing. El bucle se detiene solo cuando nada
   *   se mueve.
   *
   * LIMITACIÓN, DECLARADA
   *   El vidrio refracta la capa de fondo, no DOM arbitrario detrás. Capturar
   *   DOM exigiría html2canvas y rompería la regla de cero dependencias. Es la
   *   misma limitación que tiene cualquier implementación real de este efecto.
   */

  const VERTEX = `
    attribute vec2 a_unit;
    uniform vec2 u_viewport;
    uniform vec4 u_rect;      /* x, y, width, height en px de pantalla */
    uniform float u_pad;
    varying vec2 v_local;     /* px relativos al centro del rect */
    varying vec2 v_screen;    /* px de pantalla */

    void main() {
      vec2 extent = u_rect.zw * 0.5 + u_pad;
      vec2 center = u_rect.xy + u_rect.zw * 0.5;
      v_local = a_unit * extent;
      v_screen = center + v_local;
      vec2 clip = (v_screen / u_viewport) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    }
  `;

  const FRAGMENT = `
    precision highp float;

    varying vec2 v_local;
    varying vec2 v_screen;

    uniform sampler2D u_backdrop;
    uniform sampler2D u_blurred;
    uniform float u_frost;      /* 0 = nitido, 1 = totalmente esmerilado */
    uniform vec2 u_viewport;
    uniform vec2 u_half;        /* medio tamaño del rect, sin padding */
    uniform float u_radius;
    uniform float u_thickness;  /* grosor del canto en px */
    uniform float u_refraction;
    uniform float u_dispersion;
    uniform float u_specular;
    uniform float u_blur;
    uniform float u_lightAngle;
    uniform float u_lightIntensity;
    uniform vec4 u_body;        /* tinte propio del vidrio, RGBA */
    uniform vec3 u_lit;         /* color del highlight superior */
    uniform float u_pressure;
    uniform float u_caustic;
    uniform float u_iri;        /* irisación cromática del canto */
    uniform vec4 u_impact;      /* x, y locales · edad en s · fuerza */
    uniform float u_flat;       /* 1.0 = lámina rígida (glass), 0.0 = líquido */

    /* Distancia con signo a una caja redondeada. Negativa dentro. */
    float sdRoundBox(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
    }

    /* El esmerilado no se calcula por fragmento.
       Antes esto era un disco de Poisson de 8 tomas, y con la dispersion
       cromatica subia a 27 tomas por pixel de vidrio: con la galeria llena eran
       cientos de millones de muestras por frame y el laboratorio caia a 2 fps.
       Ahora el fondo se pre-desenfoca una sola vez por cambio de fondo o de
       token, en el canvas 2D, y el shader solo interpola entre la version
       nitida y la difusa. De 27 tomas a 2. */
    vec3 sampleGlass(vec2 screen, float frost) {
      vec2 uv = clamp(screen / u_viewport, 0.0, 1.0);
      vec3 sharp = texture2D(u_backdrop, uv).rgb;
      if (frost < 0.02) return sharp;
      return mix(sharp, texture2D(u_blurred, uv).rgb, clamp(frost, 0.0, 1.0));
    }

    void main() {
      vec2 p = v_local;

      /* Presión: el material se comprime y el canto se ensancha. Más vidrio en
         el camino óptico significa más distorsión — no es un truco de brillo. */
      float thickness = u_thickness * (1.0 + u_pressure * 0.85);
      float sd = sdRoundBox(p, u_half, u_radius);

      /* Tensión superficial: el impacto deforma el campo de espesor. La onda se
         lee como deformación del material, no como un halo que se expande. */
      float wave = 0.0;
      if (u_impact.w > 0.001 && u_flat < 0.5) {
        float age = u_impact.z;
        float front = age * 620.0;
        float ring = length(p - u_impact.xy) - front;
        float packet = exp(-ring * ring / (2.0 * 46.0 * 46.0));
        wave = sin(ring * 0.055) * packet * u_impact.w * exp(-age * 3.1);
      }

      /* Perfil de espesor: 0 en el perímetro, 1 hacia dentro del canto. El
         bisel es un cuarto de círculo, que es lo que hace que la luz entre por
         arriba, viaje por el canto y salga por abajo. */
      float inside = clamp(-sd / max(thickness, 0.5), 0.0, 1.0);
      float bevel = 1.0 - inside;

      /* Normal del canto: gradiente del SDF por diferencias finitas. */
      vec2 epsilon = vec2(1.0, 0.0);
      vec2 gradient = normalize(vec2(
        sdRoundBox(p + epsilon.xy, u_half, u_radius) - sdRoundBox(p - epsilon.xy, u_half, u_radius),
        sdRoundBox(p + epsilon.yx, u_half, u_radius) - sdRoundBox(p - epsilon.yx, u_half, u_radius)
      ) + vec2(0.0001));

      /* LA CLAVE: la distorsión es máxima en el perímetro y ~0 en el centro.
         Un vidrio con espesor es una lente; una capa translúcida no lo es. */
      float lensWeight = pow(bevel, 2.2) + abs(wave) * 1.4;
      vec2 offset = gradient * lensWeight * thickness * u_refraction * 2.4
                  + gradient * wave * 26.0;

      /* El canto esmerila menos que el centro: ahi el vidrio es mas delgado en
         el eje de vision y la imagen se conserva mas limpia. */
      float frost = u_frost * mix(1.0, 0.4, bevel);
      vec3 center = sampleGlass(v_screen + offset, frost);

      /* Dispersión cromática: solo en el canto y en la dirección de la normal,
         nunca como un aura RGB alrededor de todo el control. */
      float chroma = u_dispersion * lensWeight * thickness * 0.9;
      vec3 refracted = center;
      if (chroma > 0.35) {
        refracted = vec3(
          sampleGlass(v_screen + offset + gradient * chroma, frost).r,
          center.g,
          sampleGlass(v_screen + offset - gradient * chroma, frost).b
        );
      }

      /* El vidrio lleva tinte propio: nunca pide prestada su legibilidad al
         fondo. Es lo que sostiene el gate de contraste 4.5:1. */
      vec3 color = mix(refracted, u_body.rgb, u_body.a);

      /* Specular: banda estrecha en el canto orientado hacia la luz. Depende
         del ángulo de luz y de la curvatura, no de la posición del cursor. */
      vec2 lightDirection = vec2(cos(u_lightAngle), sin(u_lightAngle));
      float facing = dot(gradient, -lightDirection);
      float band = pow(max(facing, 0.0), 2.6) * smoothstep(0.0, 0.85, bevel) * (1.0 - inside);
      float rim = pow(max(-facing, 0.0), 6.0) * pow(bevel, 2.0) * 0.4;
      float fresnel = pow(bevel, 3.4);

      color += u_lit * band * u_specular * u_lightIntensity * 0.78;
      color += vec3(1.0) * rim * u_specular * u_lightIntensity * 0.55;
      color += u_lit * fresnel * 0.10;

      /* Irisación: el canto separa el color, dirigida por la normal. */
      float iridescence = pow(bevel, 2.8) * u_iri;
      color += vec3(
        sin(gradient.x * 3.1 + u_lightAngle) * 0.5 + 0.5,
        sin(gradient.y * 3.1 + u_lightAngle + 2.1) * 0.5 + 0.5,
        sin((gradient.x + gradient.y) * 3.1 + u_lightAngle + 4.2) * 0.5 + 0.5
      ) * iridescence * 0.5;

      /* Un cuerpo de vidrio con espesor concentra luz debajo de sí. La cáustica
         vende el grosor mejor que cualquier highlight. */
      float outside = max(sd, 0.0);
      float away = clamp(dot(normalize(p + vec2(0.0001)), -lightDirection), 0.0, 1.0);
      float pool = exp(-outside / (9.0 + thickness * 3.2));
      float caustic = pool * u_caustic * (0.22 + away * 0.78) * 0.55;
      /* Sombra de contacto: corta, dura y pegada al borde. Es lo que apoya el
         objeto en la página en vez de dejarlo flotando. */
      float contact = exp(-outside / 2.6) * 0.30;

      float alpha = 1.0 - smoothstep(-0.9, 0.9, sd);
      float outerAlpha = (1.0 - alpha) * clamp(caustic + contact, 0.0, 1.0);

      vec3 outerColor = mix(vec3(0.0), u_lit, clamp(caustic * 1.4, 0.0, 1.0));
      vec3 finalColor = mix(outerColor, color, alpha);
      float finalAlpha = clamp(alpha + outerAlpha, 0.0, 1.0);

      gl_FragColor = vec4(finalColor * finalAlpha, finalAlpha);
    }
  `;

  const UNIFORM_NAMES = [
    'u_viewport', 'u_rect', 'u_pad', 'u_backdrop', 'u_half', 'u_radius', 'u_thickness',
    'u_refraction', 'u_dispersion', 'u_specular', 'u_frost', 'u_blurred', 'u_lightAngle', 'u_lightIntensity',
    'u_body', 'u_lit', 'u_pressure', 'u_caustic', 'u_iri', 'u_impact', 'u_flat'
  ];

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`LensEngine shader: ${log}`);
    }
    return shader;
  }

  /** Convierte cualquier color CSS a [r, g, b, a] en 0..1 usando el propio motor del navegador. */
  const colorProbe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  function parseColor(value, fallback = [1, 1, 1, 1]) {
    const key = String(value || '').trim();
    if (!key) return fallback;
    if (colorCache.has(key)) return colorCache.get(key);
    colorProbe.clearRect(0, 0, 1, 1);
    colorProbe.fillStyle = '#000';
    colorProbe.fillStyle = key;
    if (colorProbe.fillStyle === '#000' && !/^#0{3,8}$|black/i.test(key)) {
      colorCache.set(key, fallback);
      return fallback;
    }
    colorProbe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorProbe.getImageData(0, 0, 1, 1).data;
    const parsed = [r / 255, g / 255, b / 255, a / 255];
    colorCache.set(key, parsed);
    return parsed;
  }

  function number(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  class LensEngine {
    constructor() {
      this.lenses = new Map();
      this.dpr = 1;
      this.renderScale = 0.62;
      this.scale = 1;
      this.epoch = 0;
      /* Presupuesto de frame adaptativo.
         El coste del motor es fill-rate puro, y el fill-rate disponible varía
         dos ordenes de magnitud entre una GPU discreta y un rasterizador por
         software. En vez de fijar una calidad y soltar frames donde no cabe, el
         motor mide su propio coste y ajusta la resolucion de render. Con GPU se
         queda arriba; sin ella baja sola en vez de arrastrar la pagina. */
      this.frameBudget = 17;
      this.frameCost = 0;
      this.sinceAdjust = 0;
      this.lastFrame = 0;
      this.width = 0;
      this.height = 0;
      this.running = false;
      this.enabled = false;
      this.backdropName = 'aurora';
      this.backdropDirty = true;
      this.tokens = {};

      /* Canvas del fondo: vive en el DOM y es lo que el usuario ve. */
      this.backdrop = document.createElement('canvas');
      this.backdrop.id = 'mqBackdrop';
      this.backdrop.setAttribute('aria-hidden', 'true');

      /* Version pre-desenfocada del mismo bitmap, a media resolucion. */
      this.blurred = document.createElement('canvas');
      this.blurRadius = -1;

      /* Espejo 2D del canvas GL.
         Copiar desde un canvas WebGL a un canvas 2D fuerza una sincronizacion
         GPU->CPU. Hacerlo una vez por elemento eran ~40 sincronizaciones por
         frame. Con un espejo intermedio se paga una sola, y los recortes por
         elemento pasan a ser copias 2D->2D baratas. */
      this.mirror = document.createElement('canvas');
      this.mirrorCtx = null;

      /* Canvas GL compartido: fuera del DOM, solo fuente de píxeles. */
      this.glCanvas = document.createElement('canvas');
      this.gl = null;
      this.program = null;
      this.uniforms = {};
      this.texture = null;
      this.blurTexture = null;

      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const lens = this.lenses.get(entry.target);
          if (lens) lens.visible = entry.isIntersecting;
        }
        this.touch();
      }, { rootMargin: '96px' });

      this.onResize = () => { this.resize(); this.backdropDirty = true; this.touch(); };
      window.addEventListener('resize', this.onResize, { passive: true });
      window.addEventListener('scroll', () => this.touch(), { passive: true });
    }

    mount(container = document.body) {
      if (!this.backdrop.isConnected) container.prepend(this.backdrop);
      this.resize();
      return this.initGL();
    }

    initGL() {
      if (this.gl) return true;
      try {
        const gl = this.glCanvas.getContext('webgl', {
          alpha: true,
          antialias: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance'
        });
        if (!gl) return false;

        const program = gl.createProgram();
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program));
        }

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 1, -1, -1, 1,
          -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);
        const attribute = gl.getAttribLocation(program, 'a_unit');
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

        const makeTexture = () => {
          const texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          return texture;
        };
        this.texture = makeTexture();
        this.blurTexture = makeTexture();

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(program);

        this.gl = gl;
        this.program = program;
        for (const name of UNIFORM_NAMES) {
          this.uniforms[name] = gl.getUniformLocation(program, name);
        }
        return true;
      } catch (error) {
        console.warn('LensEngine: WebGL no disponible, el laboratorio usa el nivel CSS.', error);
        this.gl = null;
        return false;
      }
    }

    get supported() {
      return Boolean(this.gl);
    }

    resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      /* Techo de DPR: por encima de 2 el coste de fill-rate no compra nitidez visible. */
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (width === this.width && height === this.height && dpr === this.dpr) return;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.scale = dpr * this.renderScale;
      /* El fondo se ve directamente: va a resolución completa.
         La óptica se escala: va a resolución reducida. */
      this.backdrop.width = Math.max(1, Math.round(width * dpr));
      this.backdrop.height = Math.max(1, Math.round(height * dpr));
      this.blurred.width = Math.max(1, Math.round(width * 0.5));
      this.blurred.height = Math.max(1, Math.round(height * 0.5));
      this.blurRadius = -1;
      this.glCanvas.width = Math.max(1, Math.round(width * this.scale));
      this.glCanvas.height = Math.max(1, Math.round(height * this.scale));
      this.mirror.width = this.glCanvas.width;
      this.mirror.height = this.glCanvas.height;
      this.mirrorCtx = this.mirror.getContext('2d', { alpha: true });
      this.gl?.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
      this.backdropDirty = true;
    }

    setBackdrop(name) {
      this.backdropName = name;
      this.backdropDirty = true;
      this.touch();
    }

    setEnabled(enabled) {
      this.enabled = enabled && this.supported;
      document.documentElement.dataset.mqLens = this.enabled ? 'on' : 'off';
      for (const lens of this.lenses.values()) {
        lens.canvas.style.display = this.enabled ? '' : 'none';
      }
      this.touch();
    }

    drawBackdrop() {
      const gl = this.gl;
      if (this.backdropDirty) {
        this.backdropDirty = false;
        this.blurRadius = -1;
        window.MorphiqBackdrops?.draw(this.backdrop, this.backdropName, this.backdrop.width, this.backdrop.height);
        if (gl) {
          gl.bindTexture(gl.TEXTURE_2D, this.texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.backdrop);
        }
      }

      /* El esmerilado se regenera solo cuando cambia el fondo o el token de
         blur, no por frame. ctx.filter esta acelerado en Chromium. */
      const radius = Math.max(0, Math.min(48, this.tokens.blur ?? 14));
      if (Math.abs(radius - this.blurRadius) < 0.5) return;
      this.blurRadius = radius;
      const ctx = this.blurred.getContext('2d');
      ctx.save();
      ctx.filter = `blur(${(radius * 0.5).toFixed(2)}px)`;
      ctx.clearRect(0, 0, this.blurred.width, this.blurred.height);
      ctx.drawImage(this.backdrop, 0, 0, this.blurred.width, this.blurred.height);
      ctx.restore();
      if (!gl) return;
      gl.bindTexture(gl.TEXTURE_2D, this.blurTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.blurred);
    }

    register(element) {
      if (this.lenses.has(element)) return;
      const canvas = document.createElement('canvas');
      canvas.className = 'mq-lens';
      canvas.setAttribute('aria-hidden', 'true');
      if (!this.enabled) canvas.style.display = 'none';
      element.prepend(canvas);
      const lens = {
        element,
        canvas,
        ctx: canvas.getContext('2d'),
        visible: true,
        width: 0,
        height: 0,
        style: null,
        styleEpoch: -1,
        geometry: '',
        shown: null,
        impact: { x: 0, y: 0, time: -10, strength: 0 }
      };
      /* Los estados que cambian tokens --mq-* son transiciones discretas, no
         continuas: basta con marcar la lente sucia cuando ocurren. */
      const invalidate = () => { lens.styleEpoch = -1; this.touch(); };
      for (const type of ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup', 'focusin', 'focusout']) {
        element.addEventListener(type, invalidate, { passive: true });
      }
      this.lenses.set(element, lens);
      this.observer.observe(element);
      this.touch();
    }

    unregister(element) {
      const lens = this.lenses.get(element);
      if (!lens) return;
      this.observer.unobserve(element);
      lens.canvas.remove();
      this.lenses.delete(element);
    }

    /** Limpia lentes cuyo elemento ya no está en el documento (la galería se re-renderiza entera). */
    prune() {
      for (const [element] of this.lenses) {
        if (!element.isConnected) this.unregister(element);
      }
    }

    impact(element, clientX, clientY, strength = 1) {
      const lens = this.lenses.get(element);
      if (!lens) return;
      const rect = element.getBoundingClientRect();
      lens.impact = {
        x: (clientX - rect.left - rect.width / 2) * this.scale,
        y: (clientY - rect.top - rect.height / 2) * this.scale,
        time: performance.now(),
        strength
      };
      this.touch();
    }

    /** Fuerza la relectura de estilos de todas las lentes. */
    invalidate() {
      this.epoch += 1;
      this.touch();
    }

    readTokens() {
      const styles = getComputedStyle(document.documentElement);
      const read = (token, fallback) => number(styles.getPropertyValue(token), fallback);
      this.tokens = {
        lightAngle: (read('--light-angle', 315) - 90) * Math.PI / 180,
        lightIntensity: read('--light-intensity', 0.72),
        refraction: read('--material-refraction', 0.32),
        dispersion: read('--material-dispersion', 0.08),
        specular: read('--material-specular', 0.64),
        blur: read('--material-blur', 14)
      };
    }

    touch() {
      if (this.running || !this.enabled) return;
      this.running = true;
      requestAnimationFrame(time => this.frame(time));
    }

    /** Ajusta la resolución de render para sostener el presupuesto de frame.
        Se mide el delta real entre frames, no el tiempo de la función: WebGL
        encola comandos y la rasterización ocurre después de que frame() haya
        devuelto, así que un cronómetro dentro de la función marca cero justo
        cuando la GPU está saturada. */
    adapt(cost) {
      this.frameCost = this.frameCost ? this.frameCost * 0.82 + cost * 0.18 : cost;
      this.sinceAdjust += 1;
      if (this.sinceAdjust < 24) return;
      const tooSlow = this.frameCost > this.frameBudget && this.renderScale > 0.34;
      const roomToSpare = this.frameCost < this.frameBudget * 0.45 && this.renderScale < 0.62;
      if (!tooSlow && !roomToSpare) return;
      this.sinceAdjust = 0;
      this.renderScale = Math.max(0.34, Math.min(0.62, this.renderScale * (tooSlow ? 0.82 : 1.12)));
      const dpr = this.dpr;
      this.scale = dpr * this.renderScale;
      this.glCanvas.width = Math.max(1, Math.round(this.width * this.scale));
      this.glCanvas.height = Math.max(1, Math.round(this.height * this.scale));
      this.mirror.width = this.glCanvas.width;
      this.mirror.height = this.glCanvas.height;
      this.mirrorCtx = this.mirror.getContext('2d', { alpha: true });
      this.gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
      document.documentElement.dataset.mqLensScale = this.renderScale.toFixed(2);
    }

    frame(time) {
      this.running = false;
      if (!this.enabled || !this.gl) return;

      this.readTokens();
      this.drawBackdrop();

      /* Fase de lectura: todos los rects y tokens de una vez. Ninguna escritura
         puede colarse aquí o el navegador recalcula layout N veces por frame. */
      const jobs = [];
      for (const lens of this.lenses.values()) {
        if (!lens.visible || !lens.element.isConnected) continue;
        const rect = lens.element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        if (rect.bottom < -120 || rect.top > this.height + 120) continue;
        if (lens.styleEpoch !== this.epoch || !lens.style) {
          const computed = getComputedStyle(lens.element);
          lens.style = {
            radius: number(computed.borderTopLeftRadius, 12),
            thickness: number(computed.getPropertyValue('--mq-thick'), 3),
            flat: number(computed.getPropertyValue('--mq-flat'), 0),
            body: parseColor(computed.getPropertyValue('--mq-body'), [0.08, 0.16, 0.26, 0.24]),
            lit: parseColor(computed.getPropertyValue('--mq-lit'), [1, 1, 1, 1]),
            caustic: number(computed.getPropertyValue('--mq-caustic'), 0.5),
            iri: number(computed.getPropertyValue('--mq-iri'), 0.12),
            blurScale: number(computed.getPropertyValue('--mq-blur-scale'), 1)
          };
          lens.styleEpoch = this.epoch;
        }
        /* La presión la escribe el controlador de spring en el style inline, así
           que se lee sin pasar por getComputedStyle. */
        const pressure = number(lens.element.style.getPropertyValue('--liquid-pressure'), 0);
        jobs.push({ lens, rect, style: lens.style, pressure });
      }

      const gl = this.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const dpr = this.scale;
      const pad = Math.round(34 * dpr);
      let alive = false;

      gl.uniform2f(this.uniforms.u_viewport, this.glCanvas.width, this.glCanvas.height);
      gl.uniform1i(this.uniforms.u_backdrop, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(this.uniforms.u_blurred, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.blurTexture);
      gl.uniform1f(this.uniforms.u_pad, pad);
      gl.uniform1f(this.uniforms.u_lightAngle, this.tokens.lightAngle);
      gl.uniform1f(this.uniforms.u_lightIntensity, this.tokens.lightIntensity);

      for (const { lens, rect, style, pressure } of jobs) {
        const radius = style.radius * dpr;
        const thickness = style.thickness * dpr;
        const { flat, body, lit, caustic, iri, blurScale } = style;

        const age = (time - lens.impact.time) / 1000;
        const decayed = age < 1.4 ? lens.impact.strength : 0;
        if (decayed > 0.001 || pressure > 0.002) alive = true;

        gl.uniform4f(this.uniforms.u_rect, rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr);
        gl.uniform2f(this.uniforms.u_half, rect.width * dpr * 0.5, rect.height * dpr * 0.5);
        gl.uniform1f(this.uniforms.u_radius, Math.min(radius, Math.min(rect.width, rect.height) * dpr * 0.5));
        gl.uniform1f(this.uniforms.u_thickness, Math.max(thickness, 1));
        gl.uniform1f(this.uniforms.u_refraction, this.tokens.refraction);
        gl.uniform1f(this.uniforms.u_dispersion, this.tokens.dispersion);
        gl.uniform1f(this.uniforms.u_specular, this.tokens.specular);
        gl.uniform1f(this.uniforms.u_frost, Math.min(1, (this.tokens.blur / 26) * blurScale));
        gl.uniform4f(this.uniforms.u_body, body[0], body[1], body[2], body[3]);
        gl.uniform3f(this.uniforms.u_lit, lit[0], lit[1], lit[2]);
        gl.uniform1f(this.uniforms.u_pressure, pressure);
        gl.uniform1f(this.uniforms.u_caustic, caustic);
        gl.uniform1f(this.uniforms.u_iri, iri);
        gl.uniform1f(this.uniforms.u_flat, flat);
        gl.uniform4f(this.uniforms.u_impact, lens.impact.x, lens.impact.y, age, decayed);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        lens.job = { rect, pad };
      }

      gl.flush();

      /* Una sola transferencia desde la GPU. */
      if (this.mirrorCtx) {
        this.mirrorCtx.clearRect(0, 0, this.mirror.width, this.mirror.height);
        this.mirrorCtx.drawImage(this.glCanvas, 0, 0);
      }
      const source = this.mirrorCtx ? this.mirror : this.glCanvas;

      /* Cada canvas es una capa de composición. Dejar 80 en el DOM cuesta cada
         frame aunque no se redibujen, así que los que quedan fuera de pantalla
         se sacan del árbol de composición en vez de solo dejar de pintarse. */
      const active = new Set(jobs.map(job => job.lens));
      for (const lens of this.lenses.values()) {
        const shown = active.has(lens);
        if (lens.shown === shown) continue;
        lens.shown = shown;
        lens.canvas.style.display = shown ? '' : 'none';
      }

      /* Fase de escritura: recorte por elemento desde el espejo. */
      for (const { lens, rect } of jobs) {
        const width = Math.max(1, Math.round((rect.width + pad * 2 / dpr) * dpr));
        const height = Math.max(1, Math.round((rect.height + pad * 2 / dpr) * dpr));
        if (lens.width !== width || lens.height !== height) {
          lens.canvas.width = width;
          lens.canvas.height = height;
          lens.width = width;
          lens.height = height;
        }
        /* El canvas es un elemento reemplazado: con inset en los cuatro lados
           no se estira, se queda en su tamaño intrínseco (el bitmap, que está
           en px de dispositivo). Hay que darle dimensiones CSS explícitas o
           aparece al doble de tamaño y desplazado. */
        /* Escribir la geometría cada frame invalidaba el layout, y la fase de
           lectura del frame siguiente lo recalculaba entero: un read/write
           thrash a través de frames que costaba más que todo el trabajo de GPU
           junto. Solo se escribe cuando cambia de verdad. */
        const offset = pad / dpr;
        const geometry = `${offset}|${rect.width}|${rect.height}`;
        if (lens.geometry !== geometry) {
          lens.geometry = geometry;
          lens.canvas.style.left = `${-offset}px`;
          lens.canvas.style.top = `${-offset}px`;
          lens.canvas.style.width = `${rect.width + offset * 2}px`;
          lens.canvas.style.height = `${rect.height + offset * 2}px`;
        }
        lens.ctx.clearRect(0, 0, width, height);
        lens.ctx.drawImage(
          source,
          Math.round(rect.left * dpr - pad), Math.round(rect.top * dpr - pad), width, height,
          0, 0, width, height
        );
      }

      if (alive) {
        if (this.lastFrame) this.adapt(time - this.lastFrame);
        this.lastFrame = time;
        this.touch();
      } else {
        this.lastFrame = 0;
      }
    }
  }

  window.MorphiqLensEngine = LensEngine;
  /* El Recipe Inspector muestra este shader en la pestaña "Shader". */
  window.MorphiqLensShader = { vertexSource: VERTEX, fragmentSource: FRAGMENT };
})();
