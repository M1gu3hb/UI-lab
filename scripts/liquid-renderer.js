(() => {
  'use strict';

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;
    varying vec2 v_uv;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_pointer;
    uniform vec2 u_pointerVelocity;
    uniform vec4 u_rippleA;
    uniform vec4 u_rippleB;
    uniform vec4 u_rippleC;
    uniform vec4 u_rippleD;
    uniform float u_refraction;
    uniform float u_dispersion;
    uniform float u_intensity;
    uniform float u_specular;
    uniform float u_roughness;
    uniform float u_rippleIntensity;
    uniform float u_waveBrightness;
    uniform float u_waveCount;
    uniform float u_waveDamping;
    uniform float u_lightAngle;
    uniform float u_lightIntensity;
    uniform vec3 u_accent;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    float rippleHeight(vec2 uv, vec4 data) {
      float age = u_time - data.z;
      float alive = step(0.0, age)
        * (1.0 - smoothstep(2.15, 2.75, age))
        * step(0.001, data.w);
      if (alive <= 0.0) return 0.0;

      float aspect = u_resolution.x / max(u_resolution.y, 1.0);
      vec2 delta = vec2((uv.x - data.x) * aspect, uv.y - data.y);
      float distanceFromImpact = length(delta);
      float speed = mix(0.24, 0.37, clamp(u_refraction, 0.0, 1.0));
      float frontRadius = age * speed;
      float packetWidth = mix(0.014, 0.030, clamp(u_roughness, 0.0, 1.0));
      float damping = exp(-age * mix(1.00, 2.55, clamp(u_waveDamping, 0.0, 1.0)));
      float height = 0.0;

      for (int i = 0; i < 6; i += 1) {
        float index = float(i);
        float enabled = 1.0 - step(u_waveCount, index + 0.5);
        float echoRadius = max(0.0, frontRadius - index * mix(0.045, 0.062, u_roughness));
        float signedDistance = (distanceFromImpact - echoRadius) / packetWidth;
        float packet = exp(-signedDistance * signedDistance * 0.72);
        float crestAndTrough = sin(signedDistance * 2.35) * packet;
        height += crestAndTrough * pow(0.61, index) * enabled;
      }

      return height * data.w * u_rippleIntensity * damping * alive * 0.024;
    }

    float waveField(vec2 uv) {
      return rippleHeight(uv, u_rippleA)
        + rippleHeight(uv, u_rippleB)
        + rippleHeight(uv, u_rippleC)
        + rippleHeight(uv, u_rippleD);
    }

    vec3 scene(vec2 uv) {
      vec3 baseA = vec3(0.012, 0.052, 0.090);
      vec3 baseB = vec3(0.075, 0.045, 0.205);
      float glowA = exp(-distance(uv, vec2(0.24, 0.61)) * 3.2);
      float glowB = exp(-distance(uv, vec2(0.78, 0.31)) * 3.7);
      float broad = noise(uv * 2.7 + vec2(u_time * 0.007, -u_time * 0.005));
      return mix(baseA, baseB, smoothstep(0.0, 1.0, uv.y))
        + u_accent * glowA * 0.25
        + vec3(0.46, 0.10, 0.78) * glowB * 0.17
        + (broad - 0.5) * 0.022;
    }

    void main() {
      vec2 uv = v_uv;
      float aspect = u_resolution.x / max(u_resolution.y, 1.0);
      vec2 aspectUV = vec2((uv.x - 0.5) * aspect + 0.5, uv.y);
      vec2 aspectPointer = vec2((u_pointer.x - 0.5) * aspect + 0.5, u_pointer.y);

      vec2 texel = 1.35 / max(u_resolution, vec2(1.0));
      float centerHeight = waveField(uv);
      float heightLeft = waveField(uv - vec2(texel.x, 0.0));
      float heightRight = waveField(uv + vec2(texel.x, 0.0));
      float heightDown = waveField(uv - vec2(0.0, texel.y));
      float heightUp = waveField(uv + vec2(0.0, texel.y));
      vec2 waveGradient = vec2(
        (heightRight - heightLeft) / max(texel.x * 2.0, 0.00001),
        (heightUp - heightDown) / max(texel.y * 2.0, 0.00001)
      );
      float waveCurvature = clamp(
        abs(heightLeft + heightRight + heightDown + heightUp - centerHeight * 4.0) * 720.0,
        0.0,
        1.0
      );
      float waveEnergy = clamp(length(waveGradient) * 0.58, 0.0, 1.0);

      vec2 pointerDelta = aspectUV - aspectPointer;
      float pointerDistance = length(pointerDelta);
      float velocityEnergy = clamp(length(u_pointerVelocity) * 5.2, 0.0, 1.0);
      float bulge = exp(-pointerDistance * (9.5 - velocityEnergy * 2.0))
        * (0.11 + velocityEnergy * 0.18)
        * u_intensity;
      vec2 pointerNormal = normalize(pointerDelta + vec2(0.0001)) * bulge;
      vec2 velocityWake = -u_pointerVelocity * exp(-pointerDistance * 6.5) * 0.22;
      float lowNoise = noise(uv * 3.6 + vec2(u_time * 0.015, -u_time * 0.011)) - 0.5;
      vec2 roughNormal = vec2(lowNoise, -lowNoise) * u_roughness * 0.055;

      vec2 normalXY = pointerNormal + waveGradient * 0.034 + velocityWake + roughNormal;
      float slope = clamp(length(normalXY) * 2.8, 0.0, 1.0);
      vec2 offset = normalXY * u_refraction * (0.027 + waveEnergy * 0.018);

      float chroma = u_dispersion * (0.0035 + slope * 0.010 + waveEnergy * 0.006);
      vec3 center = scene(uv + offset);
      float red = scene(uv + offset + normalXY * chroma).r;
      float blue = scene(uv + offset - normalXY * chroma).b;
      vec3 color = vec3(red, center.g, blue);

      vec2 lightDirection = normalize(vec2(cos(u_lightAngle), sin(u_lightAngle)));
      vec3 surfaceNormal = normalize(vec3(-normalXY * 3.15, 1.0));
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);
      vec3 lightDirection3D = normalize(vec3(lightDirection, 0.72));
      vec3 halfVector = normalize(lightDirection3D + viewDirection);
      float diffuse = max(dot(surfaceNormal, lightDirection3D), 0.0);
      float specularPower = mix(118.0, 16.0, clamp(u_roughness, 0.0, 1.0));
      float specularLobe = pow(max(dot(surfaceNormal, halfVector), 0.0), specularPower);
      float fresnel = pow(1.0 - clamp(dot(surfaceNormal, viewDirection), 0.0, 1.0), 5.0);
      float waveSpecular = specularLobe
        * u_specular
        * u_lightIntensity
        * mix(0.10, 0.62, u_waveBrightness)
        * mix(0.38, 1.0, waveEnergy);
      float caustic = waveCurvature
        * max(diffuse, 0.0)
        * u_refraction
        * u_waveBrightness
        * 0.11;

      color += vec3(1.0) * waveSpecular;
      color += vec3(1.0) * specularLobe * u_specular * u_lightIntensity * 0.10 * (1.0 - waveEnergy);
      color += mix(u_accent, vec3(1.0), 0.72) * caustic;
      color += u_accent * fresnel * (0.035 + u_refraction * 0.055);
      color += vec3(1.0) * diffuse * 0.020 * u_specular * u_lightIntensity;

      float alpha = 0.235 + bulge * 0.055 + fresnel * 0.055 + waveEnergy * 0.018;
      gl_FragColor = vec4(color, clamp(alpha, 0.18, 0.42));
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${log}`);
    }
    return shader;
  }

  function createProgram(gl) {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader link error: ${log}`);
    }
    return program;
  }

  function hexToRgb(hex) {
    const normalized = hex.replace('#', '').trim();
    const value = normalized.length === 3
      ? normalized.split('').map(character => character + character).join('')
      : normalized.padEnd(6, '0').slice(0, 6);
    const number = Number.parseInt(value, 16);
    return [
      ((number >> 16) & 255) / 255,
      ((number >> 8) & 255) / 255,
      (number & 255) / 255
    ];
  }

  function readNumber(styles, token, fallback) {
    const value = Number.parseFloat(styles.getPropertyValue(token));
    return Number.isFinite(value) ? value : fallback;
  }

  class LiquidRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = null;
      this.ctx2d = null;
      this.program = null;
      this.running = false;
      this.visible = true;
      this.pointer = { x: 0.5, y: 0.5 };
      this.pointerVelocity = { x: 0, y: 0 };
      this.lastPointerSample = { x: 0.5, y: 0.5, time: performance.now() };
      this.ripples = Array.from({ length: 4 }, () => ({ x: 0.5, y: 0.5, time: -100, strength: 0 }));
      this.rippleIndex = 0;
      this.startTime = performance.now();
      this.lastInteraction = performance.now();
      this.quality = 'full';
      this.accent = '#6ae4ff';
      this.observer = null;
      this.resizeObserver = null;
      this.init();
    }

    init() {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries.some(entry => entry.isIntersecting);
        if (this.visible) this.requestFrame();
      }, { threshold: 0.01 });
      this.observer.observe(this.canvas);
      this.setQuality(document.documentElement.dataset.quality || 'full');
    }

    initWebGL() {
      try {
        const gl = this.canvas.getContext('webgl', {
          alpha: true,
          antialias: false,
          premultipliedAlpha: true,
          powerPreference: 'high-performance'
        });
        if (!gl) return false;
        const program = createProgram(gl);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 1, -1, -1, 1,
          -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.gl = gl;
        this.program = program;
        this.uniforms = {
          resolution: gl.getUniformLocation(program, 'u_resolution'),
          time: gl.getUniformLocation(program, 'u_time'),
          pointer: gl.getUniformLocation(program, 'u_pointer'),
          pointerVelocity: gl.getUniformLocation(program, 'u_pointerVelocity'),
          rippleA: gl.getUniformLocation(program, 'u_rippleA'),
          rippleB: gl.getUniformLocation(program, 'u_rippleB'),
          rippleC: gl.getUniformLocation(program, 'u_rippleC'),
          rippleD: gl.getUniformLocation(program, 'u_rippleD'),
          refraction: gl.getUniformLocation(program, 'u_refraction'),
          dispersion: gl.getUniformLocation(program, 'u_dispersion'),
          intensity: gl.getUniformLocation(program, 'u_intensity'),
          specular: gl.getUniformLocation(program, 'u_specular'),
          roughness: gl.getUniformLocation(program, 'u_roughness'),
          rippleIntensity: gl.getUniformLocation(program, 'u_rippleIntensity'),
          waveBrightness: gl.getUniformLocation(program, 'u_waveBrightness'),
          waveCount: gl.getUniformLocation(program, 'u_waveCount'),
          waveDamping: gl.getUniformLocation(program, 'u_waveDamping'),
          lightAngle: gl.getUniformLocation(program, 'u_lightAngle'),
          lightIntensity: gl.getUniformLocation(program, 'u_lightIntensity'),
          accent: gl.getUniformLocation(program, 'u_accent')
        };
        return true;
      } catch (error) {
        console.warn('LiquidRenderer: WebGL no disponible; usando degradación.', error);
        return false;
      }
    }

    setQuality(quality) {
      this.quality = quality;
      this.gl = null;
      this.ctx2d = null;
      this.program = null;
      if (quality === 'full' && this.initWebGL()) {
        this.canvas.dataset.renderer = 'webgl';
      } else if (quality === 'full' || quality === 'balanced') {
        this.ctx2d = this.canvas.getContext('2d', { alpha: true });
        this.canvas.dataset.renderer = 'canvas';
      } else {
        this.canvas.dataset.renderer = 'css';
        const context = this.canvas.getContext('2d');
        context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.resize();
      this.touch();
    }

    setAccent(hex) {
      this.accent = hex;
      this.touch();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const mobile = matchMedia('(max-width: 700px)').matches;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.75);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      if (this.gl) this.gl.viewport(0, 0, width, height);
      this.touch();
    }

    pointerMove(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nextX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const nextY = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const now = performance.now();
      const dt = Math.max(8, now - this.lastPointerSample.time);
      const smoothing = 0.34;
      const velocityX = (nextX - this.lastPointerSample.x) / dt;
      const velocityY = (nextY - this.lastPointerSample.y) / dt;
      this.pointerVelocity.x += (velocityX - this.pointerVelocity.x) * smoothing;
      this.pointerVelocity.y += (velocityY - this.pointerVelocity.y) * smoothing;
      this.pointer.x = nextX;
      this.pointer.y = nextY;
      this.lastPointerSample = { x: nextX, y: nextY, time: now };
      this.touch();
    }

    addRipple(clientX, clientY, strength = 1) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ripple = this.ripples[this.rippleIndex];
      ripple.x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      ripple.y = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      ripple.time = (performance.now() - this.startTime) / 1000;
      ripple.strength = Math.min(1.45, Math.max(0, strength));
      this.rippleIndex = (this.rippleIndex + 1) % this.ripples.length;
      this.touch();
    }

    touch() {
      this.lastInteraction = performance.now();
      this.requestFrame();
    }

    requestFrame() {
      if (this.running || !this.visible || this.quality === 'fallback') return;
      this.running = true;
      requestAnimationFrame(time => this.frame(time));
    }

    frame(time) {
      this.running = false;
      if (!this.visible) return;
      this.pointerVelocity.x *= 0.91;
      this.pointerVelocity.y *= 0.91;
      const active = time - this.lastInteraction < 2850
        || Math.abs(this.pointerVelocity.x) + Math.abs(this.pointerVelocity.y) > 0.00002;
      if (this.gl && this.program) this.drawWebGL(time);
      else if (this.ctx2d) this.drawCanvas(time);
      if (active && !document.body.classList.contains('reduced-motion')) this.requestFrame();
    }

    drawWebGL(time) {
      const gl = this.gl;
      gl.useProgram(this.program);
      const elapsed = (time - this.startTime) / 1000;
      const styles = getComputedStyle(document.documentElement);
      const refraction = readNumber(styles, '--material-refraction', 0.32);
      const dispersion = readNumber(styles, '--material-dispersion', 0.08);
      const intensity = readNumber(styles, '--motion-intensity', 0.7);
      const specular = readNumber(styles, '--material-specular', 0.64);
      const roughness = readNumber(styles, '--material-roughness', 0.2);
      const rippleIntensity = readNumber(styles, '--ripple-intensity', 0.48);
      const waveBrightness = readNumber(styles, '--ripple-brightness', 0.20);
      const waveCount = Math.max(1, Math.min(6, Math.round(readNumber(styles, '--ripple-count', 2))));
      const damping = readNumber(styles, '--motion-damping', 24);
      const waveDamping = Math.max(0, Math.min(1, (damping - 8) / 40));
      const lightAngle = readNumber(styles, '--light-angle', 315) * Math.PI / 180;
      const lightIntensity = readNumber(styles, '--light-intensity', 0.72);
      const accent = hexToRgb(this.accent);
      const uniforms = [this.uniforms.rippleA, this.uniforms.rippleB, this.uniforms.rippleC, this.uniforms.rippleD];

      gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uniforms.time, elapsed);
      gl.uniform2f(this.uniforms.pointer, this.pointer.x, this.pointer.y);
      gl.uniform2f(this.uniforms.pointerVelocity, this.pointerVelocity.x * 1000, this.pointerVelocity.y * 1000);
      this.ripples.forEach((ripple, index) => {
        gl.uniform4f(uniforms[index], ripple.x, ripple.y, ripple.time, ripple.strength);
      });
      gl.uniform1f(this.uniforms.refraction, refraction);
      gl.uniform1f(this.uniforms.dispersion, dispersion);
      gl.uniform1f(this.uniforms.intensity, intensity);
      gl.uniform1f(this.uniforms.specular, specular);
      gl.uniform1f(this.uniforms.roughness, roughness);
      gl.uniform1f(this.uniforms.rippleIntensity, rippleIntensity);
      gl.uniform1f(this.uniforms.waveBrightness, waveBrightness);
      gl.uniform1f(this.uniforms.waveCount, waveCount);
      gl.uniform1f(this.uniforms.waveDamping, waveDamping);
      gl.uniform1f(this.uniforms.lightAngle, lightAngle);
      gl.uniform1f(this.uniforms.lightIntensity, lightIntensity);
      gl.uniform3f(this.uniforms.accent, accent[0], accent[1], accent[2]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    drawCanvas(time) {
      const ctx = this.ctx2d;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const elapsed = (time - this.startTime) / 1000;
      const styles = getComputedStyle(document.documentElement);
      const refraction = readNumber(styles, '--material-refraction', 0.32);
      const rippleIntensity = readNumber(styles, '--ripple-intensity', 0.48);
      const brightness = readNumber(styles, '--ripple-brightness', 0.20);
      const waveCount = Math.max(1, Math.min(6, Math.round(readNumber(styles, '--ripple-count', 2))));
      const damping = readNumber(styles, '--motion-damping', 24);
      const roughness = readNumber(styles, '--material-roughness', 0.2);
      const accent = hexToRgb(this.accent).map(value => Math.round(value * 255));

      ctx.clearRect(0, 0, width, height);
      this.ripples.forEach(ripple => {
        const age = elapsed - ripple.time;
        if (age < 0 || age > 2.75 || ripple.strength <= 0) return;
        const minDimension = Math.min(width, height);
        const speed = minDimension * (0.24 + refraction * 0.13);
        const frontRadius = age * speed;
        const decay = Math.exp(-age * (0.92 + Math.max(0, Math.min(1, (damping - 8) / 40)) * 1.55));
        const baseAlpha = decay * ripple.strength * rippleIntensity;
        const x = ripple.x * width;
        const y = (1 - ripple.y) * height;
        const spacing = minDimension * (0.043 + roughness * 0.016);

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        for (let ring = 0; ring < waveCount; ring += 1) {
          const radius = frontRadius - ring * spacing;
          if (radius <= 0) continue;
          const falloff = Math.pow(0.61, ring);
          const line = Math.max(0.75, (2.4 + roughness * 2.2) * (1 - age / 2.75));
          const shadowAlpha = baseAlpha * falloff * (0.055 + brightness * 0.085);
          const highlightAlpha = baseAlpha * falloff * (0.030 + brightness * 0.155);

          ctx.beginPath();
          ctx.arc(x + 0.8, y + 1.2, radius + line * 0.75, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0,10,22,${shadowAlpha})`;
          ctx.lineWidth = line * 1.7;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x - 0.45, y - 0.65, Math.max(0, radius - line * 0.35), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${highlightAlpha})`;
          ctx.lineWidth = line;
          ctx.stroke();

          if (brightness > 0.04) {
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0, radius - line * 1.1), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${accent.join(',')},${highlightAlpha * 0.32})`;
            ctx.lineWidth = Math.max(0.6, line * 0.55);
            ctx.stroke();
          }
        }
        ctx.restore();
      });
    }

    destroy() {
      this.observer?.disconnect();
      this.resizeObserver?.disconnect();
    }
  }

  window.LiquidRenderer = LiquidRenderer;
  window.MorphiqLiquidShader = { vertexSource, fragmentSource };
})();
