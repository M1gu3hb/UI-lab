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
    uniform float u_lightAngle;
    uniform float u_lightIntensity;
    uniform vec4 u_body;        /* tinte propio del vidrio, RGBA */
    uniform vec3 u_lit;         /* color del highlight superior */
    uniform float u_pressure;
    uniform float u_caustic;
    uniform float u_iri;        /* irisación cromática del canto */
    uniform vec4 u_impact;      /* x, y locales · edad en s · fuerza */
    uniform float u_flat;       /* 1.0 = lámina rígida (glass), 0.0 = líquido */
    uniform float u_exp;        /* exponente de la superelipse: 2 = círculo, 4 = squircle */
    uniform float u_profile;    /* k del perfil de espesor: 2 = circular, 4 = squircle */
    uniform float u_dome;       /* curvatura de la cúpula sobre toda la superficie, 0–1 */

    /* ------------------------------------------------------------------
       Campo de la silueta: esquina superelíptica con gradiente analítico.

       POR QUÉ NO UNA CAJA REDONDEADA
       El gradiente de una caja redondeada es exactamente constante a lo largo
       de cada lado recto — (0,-1) arriba, (1,0) a la derecha — y en el punto
       de tangencia donde el arco encuentra el lado la curvatura salta de 1/r a
       0. Como la refracción se deriva de ese gradiente, el resultado era la
       tarjeta partida en cuatro figuras geométricas con costuras a 45° en las
       esquinas. No era una impresión: era la geometría.

       Una superelipse |x/r|^n + |y/r|^n = 1 con n > 2 tiene curvatura CERO en
       los puntos donde toca los ejes, así que empalma con el lado recto de
       forma C² y la costura desaparece. Es lo que Apple llama continuous
       corners.

       No hay SDF exacta en forma cerrada; se normaliza el campo implícito por
       su gradiente, que es exacto a primer orden en la frontera — y solo se
       usa dentro de unos pocos píxeles de ella.

       Devuelve vec3(distancia, normal.x, normal.y). La normal es analítica, no
       por diferencias finitas: además de ser más barata, es continua a través
       de la unión arco-recta, que es justo donde las diferencias finitas con
       epsilon de 1px producían el salto.
       ------------------------------------------------------------------ */
    vec3 squircleField(vec2 p, vec2 b, float r, float n) {
      vec2 s = sign(p + vec2(1e-6));
      float rr = max(r, 0.5);
      vec2 q = abs(p) - b + rr;
      vec2 c = max(q, 0.0);

      if (c.x > 0.0 || c.y > 0.0) {
        vec2 t = c / rr;
        vec2 tp = pow(max(t, vec2(1e-4)), vec2(n - 1.0));
        float F = tp.x * t.x + tp.y * t.y - 1.0;
        vec2 g = (n / rr) * tp;
        float len = max(length(g), 1e-6);
        return vec3(F / len, s * (g / len));
      }

      /* Interior liso: la normal apunta al borde más cercano. */
      float d = max(q.x, q.y) - rr;
      vec2 nrm = (q.x > q.y) ? vec2(s.x, 0.0) : vec2(0.0, s.y);
      return vec3(d, nrm);
    }

    /* Smootherstep: C², frente al C¹ de smoothstep. El salto de una derivada a
       la otra es exactamente lo que quita las costuras — si la segunda derivada
       del campo es continua, la curvatura no salta. */
    float smootherstep(float a, float b, float x) {
      float t = clamp((x - a) / (b - a), 0.0, 1.0);
      return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
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

      vec3 field = squircleField(p, u_half, u_radius, u_exp);
      float sd = field.x;
      vec2 gradient = field.yz;

      /* Curvatura de la silueta: cero en los lados rectos, máxima en el
         cuadrante de esquina. Un canto curvo concentra más luz que uno recto —
         es lo que hace que el highlight recorra el material en vez de quedarse
         como una barra uniforme de canto a canto. */
      float eps = 2.0;
      vec2 gx = squircleField(p + vec2(eps, 0.0), u_half, u_radius, u_exp).yz;
      vec2 gy = squircleField(p + vec2(0.0, eps), u_half, u_radius, u_exp).yz;
      float curvature = clamp((abs(gx.x - gradient.x) + abs(gy.y - gradient.y)) * 14.0, 0.0, 1.0);

      /* Tensión superficial. La onda deforma el CAMPO DE ESPESOR, no se suma al
         desplazamiento final. Sumarla al offset movía el fondo entero de un
         lado a otro, y sobre un fondo con estructura eso lee como temblor —
         que es exactamente lo que Miguel vio al pasar el mouse por las cards. */
      float wave = 0.0;
      if (u_impact.w > 0.001 && u_flat < 0.5) {
        float age = u_impact.z;
        float front = age * 560.0;
        float ring = length(p - u_impact.xy) - front;
        float packet = exp(-ring * ring / (2.0 * 52.0 * 52.0));
        wave = sin(ring * 0.045) * packet * u_impact.w * exp(-age * 3.4);
      }

      /* Profundidad normalizada dentro del bisel: 0 en el filo, 1 en el
         interior plano. La onda ensancha y adelgaza el bisel localmente, que es
         cómo se propaga la tensión en un líquido con espesor. */
      float bevelWidth = max(thickness * (1.0 + wave * 0.9), 0.5);
      float t = clamp(-sd / bevelWidth, 0.0, 1.0);

      /* Perfil de superficie squircle: h(t) = (1 - (1-t)^k)^(1/k), con k = 4.
         La rampa lineal anterior tenía una torcedura dura donde terminaba el
         bisel, y esa torcedura era la línea recta paralela a cada borde que se
         veía en las cards. Aquí la derivada se anula suavemente hacia el
         interior y es vertical en el filo, que es como se comporta el canto de
         un vidrio con espesor real. */
      /* k es un token, no una constante. k = 4 es el perfil de Apple, con un
         hombro muy marcado: toda la refracción vive en los primeros píxeles del
         canto. k = 2 es el bisel circular y reparte la lente por todo el canto,
         que es lo que hace que la distorsión se lea en una card grande. Entre
         medias hay un continuo, y esa es la perilla. */
      float k = max(u_profile, 1.2);
      float u = 1.0 - t;
      float uk = pow(max(u, 1e-4), k);
      float slope = pow(max(u, 1e-4), k - 1.0) * pow(max(1.0 - uk, 1e-4), 1.0 / k - 1.0);

      /* Componente horizontal de la normal de superficie. Satura en 1 en el
         filo y cae a 0 en el interior, sin meseta y sin discontinuidad: es la
         magnitud de refracción derivada de la superficie, no una potencia
         elegida a ojo. */
      float nx = (slope / sqrt(1.0 + slope * slope)) * mix(1.0, 1.22, curvature);
      /* Caída C² para los términos ópticos, más ancha que la refracción. */
      float edge = 1.0 - smootherstep(0.0, 1.0, t);
      float bevel = edge;
      float inside = t;

      /* SEGUNDO TÉRMINO: la cúpula.
         El bisel solo dobla dentro de su propio ancho, así que con un canto de
         15px sobre una card de 170px el 82% de la superficie quedaba
         ópticamente plano — medido: diferencia 0.00/255 entre refracción 0 y 1
         en el interior. Un panel de vidrio real no es una lámina plana con el
         borde biselado: es un casquete muy tendido sobre un cuerpo cilíndrico,
         y esa curvatura de radio enorme desplaza suavemente el fondo en TODA la
         superficie. Es lo que hace que el contenido de detrás "nade" al pasar
         bajo el vidrio, no solo que se comprima en el filo. */
      float reach = max(min(u_half.x, u_half.y), 1.0);

      /* La cúpula NO puede usar el gradiente del SDF.
         El gradiente de una caja apunta al borde más cercano, y cambia de eje
         al cruzar las diagonales: usarlo para la cúpula devolvía el interior a
         cuatro zonas de desplazamiento uniforme con costuras en X — el mismo
         artefacto del round anterior, por otra vía. La normal de un casquete es
         radial desde el centro, y eso es continuo en toda la superficie. */
      vec2 unit = p / max(u_half, vec2(1.0));
      float radial = min(length(unit), 1.0);
      vec2 domeDir = radial > 1e-4 ? unit / max(length(unit), 1e-4) : vec2(0.0);
      float domeMag = u_dome * smootherstep(0.0, 1.0, radial) * reach * 0.55;

      vec2 offset = (gradient * nx * thickness * 4.0 + domeDir * domeMag) * u_refraction;

      /* El canto esmerila menos que el centro: ahí el vidrio es más delgado en
         el eje de visión y la imagen se conserva más limpia. */
      float frost = u_frost * mix(1.0, 0.45, edge);
      vec3 center = sampleGlass(v_screen + offset, frost);

      /* Dispersión cromática: solo en el canto y en la dirección de la normal,
         nunca como un aura RGB alrededor de todo el control. */
      float chroma = u_dispersion * (nx * thickness * 1.1 + domeMag * 0.35);
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
      float band = pow(max(facing, 0.0), 2.2) * edge * mix(0.5, 1.0, curvature);
      float rim = pow(max(-facing, 0.0), 5.0) * edge * edge * 0.45;
      float fresnel = edge * edge * edge;

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

      float alpha = 1.0 - smootherstep(-1.0, 1.0, sd);
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
    'u_body', 'u_lit', 'u_pressure', 'u_caustic', 'u_iri', 'u_impact', 'u_flat', 'u_exp', 'u_profile', 'u_dome'
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

  /* Resuelve border-radius a píxeles reales.
     getComputedStyle devuelve los porcentajes SIN resolver: `.knob` usa
     border-radius: 50% y de ahí salía un radio de "50" leído como 50px sobre un
     control de 82px. El resultado era una esquina superelíptica sobre una caja
     cuadrada — un squircle donde el CSS pinta un círculo — con la costura en X
     que partía el knob en cuatro cuadrantes. */
  function resolveRadius(value, width, height) {
    const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 0;
    const axis = (token, extent) => {
      const parsed = Number.parseFloat(token);
      if (!Number.isFinite(parsed)) return 0;
      return token.includes('%') ? (parsed / 100) * extent : parsed;
    };
    const rx = axis(parts[0], width);
    const ry = axis(parts[1] ?? parts[0], height);
    return Math.min(rx, ry);
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
      this.mirror.id = 'mqLensUnder';
      this.mirror.setAttribute('aria-hidden', 'true');
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
      /* Va después del fondo y antes del contenido: z-index -1 contra el -2 del
         fondo. Aquí se ven la cáustica y la sombra de contacto de todas las
         lentes sin que ningún canvas invada la caja de su vecino. */
      if (!this.mirror.isConnected) this.backdrop.after(this.mirror);
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
      this.mirror.style.display = this.enabled ? '' : 'none';
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
        let rect = lens.element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        /* getBoundingClientRect de un elemento con transform devuelve su caja
           envolvente. El knob rota con --knob-angle, así que su rect crecía
           hasta 1.41x y la lente se dibujaba más grande que el control. Se usa
           la caja de layout, centrada donde el rect dice. */
        const layoutWidth = lens.element.offsetWidth || rect.width;
        const layoutHeight = lens.element.offsetHeight || rect.height;
        if (Math.abs(layoutWidth - rect.width) > 1 || Math.abs(layoutHeight - rect.height) > 1) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          rect = {
            left: cx - layoutWidth / 2, top: cy - layoutHeight / 2,
            width: layoutWidth, height: layoutHeight,
            right: cx + layoutWidth / 2, bottom: cy + layoutHeight / 2
          };
        }
        if (rect.bottom < -120 || rect.top > this.height + 120) continue;
        /* La capa compartida no hereda la opacidad del elemento, así que un
           tooltip con opacity:0 dejaba su vidrio flotando suelto en la página.
           checkVisibility mira opacidad y visibility además de display. */
        if (lens.element.checkVisibility && !lens.element.checkVisibility({
          opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true
        })) continue;
        if (lens.styleEpoch !== this.epoch || !lens.style) {
          const computed = getComputedStyle(lens.element);
          lens.style = {
            radius: resolveRadius(computed.borderTopLeftRadius, rect.width, rect.height),
            thickness: number(computed.getPropertyValue('--mq-thick'), 3),
            flat: number(computed.getPropertyValue('--mq-flat'), 0),
            body: parseColor(computed.getPropertyValue('--mq-body'), [0.08, 0.16, 0.26, 0.24]),
            lit: parseColor(computed.getPropertyValue('--mq-lit'), [1, 1, 1, 1]),
            caustic: number(computed.getPropertyValue('--mq-caustic'), 0.5),
            iri: number(computed.getPropertyValue('--mq-iri'), 0.12),
            blurScale: number(computed.getPropertyValue('--mq-blur-scale'), 1),
            thickScale: number(computed.getPropertyValue('--mq-thick-scale'), 1),
            profile: number(computed.getPropertyValue('--mq-profile'), 2.4),
            dome: number(computed.getPropertyValue('--mq-dome'), 0.4)
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
        /* Grosor acoplado al tamaño.
           Apple lo dice explícitamente: al crecer, un elemento de Liquid Glass
           "casts deeper, richer shadows, has more pronounced lensing and
           refraction effects". Y hay una razón práctica además de la física:
           con un bisel de 4px la refracción vive en 4px y no se lee. Una card
           de 300px necesita vidrio grueso para que el efecto exista; un botón
           de 44px con ese grosor se volvería una lupa. */
        /* --mq-thick es el suelo, no el valor. El espesor real se deriva de la
           geometría del control: un botón de 44px lleva ~9px de canto y una card
           de 170px lleva ~34px. Con un valor absoluto pequeño el canto era
           correcto ópticamente para un vidrio de 4px de espesor — y por eso
           invisible. El espesor es una decisión de diseño, no un detalle. */
        const shortSide = Math.min(rect.width, rect.height);
        const geometric = Math.min(34, Math.max(style.thickness, shortSide * 0.20));
        const thickness = geometric * style.thickScale * dpr;
        lens.lastBevelCss = Number((thickness / dpr).toFixed(1));
        const { flat, body, lit, caustic, iri, blurScale } = style;

        const age = (time - lens.impact.time) / 1000;
        const decayed = age < 1.4 ? lens.impact.strength : 0;
        if (decayed > 0.001 || pressure > 0.002) alive = true;

        gl.uniform4f(this.uniforms.u_rect, rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr);
        gl.uniform2f(this.uniforms.u_half, rect.width * dpr * 0.5, rect.height * dpr * 0.5);
        const maxRadius = Math.min(rect.width, rect.height) * dpr * 0.5;
        const clamped = Math.min(radius, maxRadius);
        /* Una píldora o un círculo tienen que seguir siendo circulares: la
           esquina superelíptica solo tiene sentido donde hay lado recto que
           empalmar. Si el radio llega a la mitad del lado corto, n = 2. */
        const exponent = clamped >= maxRadius - 1 ? 2.0 : 4.0;
        gl.uniform1f(this.uniforms.u_radius, clamped);
        gl.uniform1f(this.uniforms.u_exp, exponent);
        gl.uniform1f(this.uniforms.u_profile, style.profile);
        gl.uniform1f(this.uniforms.u_dome, style.dome);
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
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
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
        const geometry = `${rect.width}|${rect.height}`;
        if (lens.geometry !== geometry) {
          lens.geometry = geometry;
          lens.canvas.style.width = `${rect.width}px`;
          lens.canvas.style.height = `${rect.height}px`;
        }
        lens.ctx.clearRect(0, 0, width, height);
        lens.ctx.drawImage(
          source,
          Math.round(rect.left * dpr), Math.round(rect.top * dpr), width, height,
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
