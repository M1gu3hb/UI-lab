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

  /** Grano fino: rompe el banding y da a la refracción un detalle de alta frecuencia. */
  function grain(ctx, width, height, amount = 0.045, seed = 7) {
    /* Con fillRect por celda esto eran ~1.7M llamadas a 2x DPR y bloqueaba el
       hilo principal varios segundos: la textura llegaba a la GPU a medio
       pintar. Una sola pasada de ImageData hace lo mismo en milisegundos. */
    const random = seeded(seed);
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const strength = amount * 255;
    for (let index = 0; index < data.length; index += 4) {
      const noise = (random() - 0.5) * 2 * strength;
      data[index] = Math.max(0, Math.min(255, data[index] + noise));
      data[index + 1] = Math.max(0, Math.min(255, data[index + 1] + noise));
      data[index + 2] = Math.max(0, Math.min(255, data[index + 2] + noise));
    }
    ctx.putImageData(image, 0, 0);
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

      /* Reflejo del sol: bandas horizontales discretas, no un degradado. */
      const glints = seeded(31);
      for (let i = 0; i < 90; i += 1) {
        const y = horizon + glints() * (height - horizon);
        const spread = (y - horizon) / (height - horizon);
        const w = width * (0.02 + spread * 0.14) * (0.4 + glints());
        ctx.fillStyle = `rgba(255,214,158,${(0.34 * (1 - spread * 0.75)).toFixed(3)})`;
        ctx.fillRect(sunX - w / 2 + (glints() - 0.5) * width * 0.10 * spread, y, w, 1.6 + spread * 2.4);
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

      ctx.strokeStyle = 'rgba(120,220,255,.5)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        ctx.strokeRect(width * (0.55 + i * 0.06), height * (0.1 + i * 0.11), width * 0.3, height * 0.1);
      }
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
