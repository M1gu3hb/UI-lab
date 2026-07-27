(() => {
  'use strict';

  /**
   * Fondos del laboratorio, dibujados en un canvas 2D.
   *
   * Por qué canvas y no CSS: el vidrio no puede refractar un degradado plano.
   * Difuminar un color uniforme devuelve el mismo color uniforme, y por eso el
   * "vidrio" del laboratorio leía como tarjeta oscura translúcida. Estos fondos
   * traen estructura real — bordes duros, tipografía grande, alto contraste
   * local — para que la refracción tenga algo que doblar.
   *
   * Y hay una segunda razón, más importante: el motor de lentes necesita los
   * píxeles del fondo como textura. Si el fondo viviera en CSS habría que
   * escribirlo dos veces (una en CSS y otra en GLSL) y las dos versiones se
   * separarían. Aquí se dibuja una sola vez y el mismo bitmap alimenta la
   * pantalla y la óptica.
   *
   * Todos son deterministas: mismo tamaño y mismo nombre → mismo bitmap. Eso
   * hace que las capturas de los rounds sean comparables entre sí.
   */

  /* PRNG determinista: nada de Math.random, las capturas tienen que repetirse. */
  function seeded(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function linear(ctx, x0, y0, x1, y1, stops) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
  }

  function radial(ctx, x, y, r, stops) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
  }

  /** Micro-dither anti-banding. NO es el grano visible: ese va fuera de la textura.
   *
   * El ruido blanco no correlacionado píxel a píxel no es grano, es sal y
   * pimienta: se ve como puntos negros y blancos sueltos. Y estando dentro del
   * bitmap que muestrea el shader, la lente lo magnifica — cuanto mejor
   * funciona la refracción, más se notan los puntos.
   *
   * Aquí queda solo lo imprescindible para romper el banding de los degradados:
   * ruido correlacionado en celdas de 3px, interpolado bilinealmente al
   * escalar, y con una amplitud por debajo del umbral de visibilidad. El grano
   * que se ve es una capa SVG encima del canvas (#mqGrain), fuera del alcance
   * de la lente.
   */
  function grain(ctx, width, height, amount = 0.012, seed = 7) {
    const cell = 3;
    const smallWidth = Math.max(1, Math.ceil(width / cell));
    const smallHeight = Math.max(1, Math.ceil(height / cell));
    const small = document.createElement('canvas');
    small.width = smallWidth;
    small.height = smallHeight;
    const smallCtx = small.getContext('2d');
    const image = smallCtx.createImageData(smallWidth, smallHeight);
    const random = seeded(seed);
    const swing = Math.max(1, Math.round(Math.min(amount, 0.02) * 255));
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 128 + Math.round((random() - 0.5) * 2 * swing);
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    smallCtx.putImageData(image, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, width, height);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */

  const backdrops = {
    /** Aurora: cintas de luz con borde definido, no orbes difusos. */
    aurora(ctx, width, height) {
      ctx.fillStyle = linear(ctx, 0, 0, width * 0.3, height, [
        [0, '#04101f'], [0.55, '#071b3a'], [1, '#0d0c26']
      ]);
      ctx.fillRect(0, 0, width, height);

      const random = seeded(11);
      for (let band = 0; band < 7; band += 1) {
        const hue = 150 + band * 26;
        const x = width * (0.05 + band * 0.14);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.beginPath();
        ctx.moveTo(x, -height * 0.1);
        for (let step = 0; step <= 12; step += 1) {
          const t = step / 12;
          const sway = Math.sin(t * 3.1 + band) * width * 0.055;
          ctx.lineTo(x + sway + t * width * 0.06, t * height * 1.2 - height * 0.1);
        }
        ctx.lineWidth = width * (0.012 + random() * 0.03);
        ctx.strokeStyle = `hsla(${hue}, 92%, ${52 + band * 3}%, ${0.30 + random() * 0.26})`;
        ctx.stroke();
        ctx.restore();
      }

      /* Estrellas: puntos duros. Un blur sobre un punto duro se lee; sobre
         un degradado, no. Son el detalle que delata la refracción. */
      const stars = seeded(29);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 220; i += 1) {
        const x = stars() * width;
        const y = stars() * height * 0.75;
        const size = stars() > 0.94 ? 2.4 : 1.1;
        ctx.globalAlpha = 0.25 + stars() * 0.6;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;
      grain(ctx, width, height, 0.05, 3);
    },

    /** Paisaje sintético: horizonte duro, sol, agua con reflejo. */
    landscape(ctx, width, height) {
      const horizon = height * 0.56;
      ctx.fillStyle = linear(ctx, 0, 0, 0, horizon, [
        [0, '#1b3f7d'], [0.45, '#4a86c4'], [0.82, '#f0a878'], [1, '#ffd9a8']
      ]);
      ctx.fillRect(0, 0, width, horizon);

      const sunX = width * 0.72;
      const sunY = horizon * 0.62;
      ctx.fillStyle = radial(ctx, sunX, sunY, width * 0.30, [
        [0, 'rgba(255,244,214,1)'], [0.10, 'rgba(255,214,150,.92)'], [1, 'rgba(255,180,120,0)']
      ]);
      ctx.fillRect(0, 0, width, horizon);

      /* Cordilleras: bordes rectos y de alto contraste. */
      const ridges = [
        { y: horizon * 0.74, color: '#2f4a72', amplitude: 0.10, seed: 5 },
        { y: horizon * 0.86, color: '#22384f', amplitude: 0.07, seed: 12 }
      ];
      for (const ridge of ridges) {
        const random = seeded(ridge.seed);
        ctx.beginPath();
        ctx.moveTo(0, horizon);
        ctx.lineTo(0, ridge.y);
        for (let x = 0; x <= width; x += width / 14) {
          ctx.lineTo(x, ridge.y - random() * height * ridge.amplitude);
        }
        ctx.lineTo(width, horizon);
        ctx.closePath();
        ctx.fillStyle = ridge.color;
        ctx.fill();
      }

      ctx.fillStyle = linear(ctx, 0, horizon, 0, height, [
        [0, '#123044'], [0.5, '#0c2233'], [1, '#071823']
      ]);
      ctx.fillRect(0, horizon, width, height - horizon);

      /* Reflejo del sol.
         Antes esto eran 90 rectangulos agrupados en una columna estrecha bajo
         el sol: leian como un campo de rayas sueltas, no como un reflejo. El
         reflejo real se abre en abanico al alejarse de la fuente y se atenua
         rapido, asi que la dispersion horizontal crece con la distancia al
         horizonte y la longitud de cada destello con ella. */
      const glints = seeded(31);
      for (let i = 0; i < 150; i += 1) {
        const spread = Math.pow(glints(), 0.6);
        const y = horizon + spread * (height - horizon);
        const fan = width * (0.03 + spread * 0.34);
        const x = sunX + (glints() - 0.5) * fan * 2.0;
        const w = width * (0.012 + spread * 0.05) * (0.35 + glints() * 0.9);
        ctx.fillStyle = `rgba(255,216,164,${(0.30 * Math.pow(1 - spread, 1.6) + 0.03).toFixed(3)})`;
        ctx.fillRect(x - w / 2, y, w, 1.2 + spread * 1.6);
      }
      grain(ctx, width, height, 0.04, 9);
    },

    /** Tipografía enorme detrás: el test más duro de legibilidad para el vidrio. */
    type(ctx, width, height) {
      ctx.fillStyle = linear(ctx, 0, 0, width, height, [
        [0, '#12060b'], [0.5, '#2a0a1e'], [1, '#070a22']
      ]);
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = radial(ctx, width * 0.24, height * 0.2, width * 0.5, [
        [0, 'rgba(255,90,120,.55)'], [1, 'rgba(255,90,120,0)']
      ]);
      ctx.fillRect(0, 0, width, height);

      const lines = ['MATERIAL', 'REFRACTS', 'WHAT IS', 'BEHIND IT'];
      const size = height * 0.21;
      ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      lines.forEach((line, index) => {
        const y = height * 0.16 + index * size * 0.98;
        ctx.fillStyle = index % 2 ? 'rgba(255,255,255,.93)' : 'rgba(255,255,255,.14)';
        ctx.fillText(line, width * (index % 2 ? 0.08 : 0.14), y);
      });

      /* Los rectangulos cian que habia aqui se leian como UI suelta del
         laboratorio, no como fondo. Se sustituyen por reglas diagonales, que
         cumplen la misma funcion — dar al vidrio bordes duros que doblar — sin
         parecer un control perdido. */
      ctx.save();
      ctx.strokeStyle = 'rgba(150,205,255,.28)';
      ctx.lineWidth = 2;
      for (let i = -6; i < 22; i += 1) {
        ctx.beginPath();
        ctx.moveTo(width * i * 0.07, 0);
        ctx.lineTo(width * i * 0.07 + height * 0.55, height);
        ctx.stroke();
      }
      ctx.restore();
      grain(ctx, width, height, 0.035, 17);
    },

    /** Damero y barras: el patrón de calibración. Cualquier distorsión se ve. */
    grid(ctx, width, height) {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, width, height);
      const cell = Math.round(Math.min(width, height) / 14);
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          const on = ((x / cell) + (y / cell)) % 2 === 0;
          ctx.fillStyle = on ? '#f2f6ff' : '#0a0d14';
          ctx.fillRect(x, y, cell, cell);
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = linear(ctx, 0, 0, width, height, [
        [0, '#ff4d6d'], [0.35, '#ffd166'], [0.68, '#4dd6ff'], [1, '#8a5cff']
      ]);
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = i % 2 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.5)';
        ctx.fillRect(0, (height / 26) * i, width, 2);
      }
      grain(ctx, width, height, 0.03, 23);
    },

    night(ctx, width, height) {
      ctx.fillStyle = linear(ctx, 0, 0, width * 0.4, height, [
        [0, '#02030c'], [0.6, '#080f28'], [1, '#03050f']
      ]);
      ctx.fillRect(0, 0, width, height);
      const random = seeded(41);
      /* Ventanas de ciudad: rectángulos duros, muy pequeños y muy contrastados. */
      for (let building = 0; building < 22; building += 1) {
        const w = width * (0.03 + random() * 0.05);
        const h = height * (0.16 + random() * 0.42);
        const x = random() * width;
        const y = height - h;
        ctx.fillStyle = '#05070f';
        ctx.fillRect(x, y, w, h);
        for (let wy = y + 8; wy < height - 10; wy += 16) {
          for (let wx = x + 6; wx < x + w - 8; wx += 13) {
            if (random() > 0.62) continue;
            ctx.fillStyle = random() > 0.5 ? 'rgba(255,206,120,.92)' : 'rgba(150,214,255,.75)';
            ctx.fillRect(wx, wy, 6, 8);
          }
        }
      }
      ctx.fillStyle = radial(ctx, width * 0.78, height * 0.16, width * 0.34, [
        [0, 'rgba(90,120,255,.42)'], [1, 'rgba(90,120,255,0)']
      ]);
      ctx.fillRect(0, 0, width, height);
      grain(ctx, width, height, 0.05, 13);
    },

    sunset(ctx, width, height) {
      ctx.fillStyle = linear(ctx, 0, 0, 0, height, [
        [0, '#3b1054'], [0.34, '#a72b62'], [0.62, '#ff7043'], [0.85, '#ffc46b'], [1, '#2a1030']
      ]);
      ctx.fillRect(0, 0, width, height);
      const random = seeded(19);
      for (let cloud = 0; cloud < 16; cloud += 1) {
        const y = height * (0.12 + random() * 0.5);
        const w = width * (0.12 + random() * 0.34);
        ctx.fillStyle = `rgba(${cloud % 2 ? '90,25,60' : '255,205,150'},${(0.18 + random() * 0.42).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(random() * width, y, w, height * 0.018 + random() * height * 0.02, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = radial(ctx, width * 0.5, height * 0.72, width * 0.14, [
        [0, 'rgba(255,247,214,1)'], [0.5, 'rgba(255,190,110,.7)'], [1, 'rgba(255,150,90,0)']
      ]);
      ctx.fillRect(0, 0, width, height);
      grain(ctx, width, height, 0.04, 5);
    },

    tropical(ctx, width, height) {
      ctx.fillStyle = linear(ctx, 0, 0, width, height, [
        [0, '#03403c'], [0.5, '#046b63'], [1, '#012a3d']
      ]);
      ctx.fillRect(0, 0, width, height);
      const random = seeded(53);
      /* Hojas: formas con silueta definida, que es lo que se dobla al refractar. */
      for (let leaf = 0; leaf < 44; leaf += 1) {
        const x = random() * width;
        const y = random() * height;
        const size = width * (0.03 + random() * 0.08);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(random() * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.quadraticCurveTo(size * 0.62, 0, 0, size);
        ctx.quadraticCurveTo(-size * 0.62, 0, 0, -size);
        ctx.fillStyle = `hsla(${132 + random() * 46}, ${58 + random() * 30}%, ${26 + random() * 34}%, ${0.55 + random() * 0.4})`;
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = radial(ctx, width * 0.18, height * 0.12, width * 0.4, [
        [0, 'rgba(210,255,160,.4)'], [1, 'rgba(210,255,160,0)']
      ]);
      ctx.fillRect(0, 0, width, height);
      grain(ctx, width, height, 0.04, 61);
    },

    abstract(ctx, width, height) {
      ctx.fillStyle = '#08040f';
      ctx.fillRect(0, 0, width, height);
      const random = seeded(71);
      const palette = ['#ff2e63', '#ffd93d', '#3ddc97', '#4d96ff', '#b14aff', '#ff8c42'];
      for (let shape = 0; shape < 20; shape += 1) {
        ctx.fillStyle = palette[shape % palette.length];
        ctx.globalAlpha = 0.72 + random() * 0.28;
        const x = random() * width;
        const y = random() * height;
        const size = width * (0.06 + random() * 0.19);
        if (shape % 3 === 0) {
          ctx.beginPath();
          ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (shape % 3 === 1) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(random() * Math.PI);
          ctx.fillRect(-size / 2, -size / 6, size, size / 3);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.moveTo(x, y - size * 0.55);
          ctx.lineTo(x + size * 0.55, y + size * 0.45);
          ctx.lineTo(x - size * 0.55, y + size * 0.45);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      grain(ctx, width, height, 0.03, 83);
    },

    /** Modo claro: casi plano y muy luminoso. El caso difícil del vidrio. */
    light(ctx, width, height) {
      ctx.fillStyle = linear(ctx, 0, 0, width, height, [
        [0, '#fbfdff'], [0.45, '#eef3fb'], [1, '#e6ecf6']
      ]);
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = radial(ctx, width * 0.2, height * 0.12, width * 0.42, [
        [0, 'rgba(150,205,255,.55)'], [1, 'rgba(150,205,255,0)']
      ]);
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = radial(ctx, width * 0.86, height * 0.2, width * 0.34, [
        [0, 'rgba(255,190,215,.5)'], [1, 'rgba(255,190,215,0)']
      ]);
      ctx.fillRect(0, 0, width, height);

      /* Estructura mínima pero real: un vidrio sobre blanco liso no es vidrio. */
      const random = seeded(97);
      ctx.strokeStyle = 'rgba(20,40,80,.16)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const size = width * (0.05 + random() * 0.12);
        ctx.strokeRect(x, y, size, size * (0.4 + random() * 0.8));
      }
      ctx.font = `900 ${height * 0.17}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(20,40,80,.10)';
      ctx.fillText('LIGHT', width * 0.1, height * 0.44);
      ctx.fillText('SURFACE', width * 0.42, height * 0.82);
      grain(ctx, width, height, 0.025, 101);
    }
  };

  /** Fondos claros: el laboratorio invierte el color de texto sobre ellos. */
  const LIGHT_BACKDROPS = new Set(['light']);

  function draw(canvas, name, width, height) {
    const ctx = canvas.getContext('2d');
    const painter = backdrops[name] || backdrops.aurora;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    painter(ctx, width, height);
    ctx.restore();
  }

  window.MorphiqBackdrops = {
    draw,
    names: Object.keys(backdrops),
    isLight: name => LIGHT_BACKDROPS.has(name)
  };
})();
