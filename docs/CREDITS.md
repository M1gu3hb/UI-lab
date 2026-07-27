# Créditos

## snipzy.dev — colección Liquid Glass

La receta `liquid-glass` de este laboratorio parte de la arquitectura de tres
capas publicada por [snipzy.dev](https://snipzy.dev) en su colección de snippets
Liquid Glass: `CRD004`, `BTN003`, `DRP001`, `FRM001`, `ICO001`, `NAV002`,
`SRH002`, `SBR001`, `LDR003`, `TGL001`.

Sus términos (§3.2) permiten uso y modificación en proyectos comerciales;
la atribución se agradece pero no es obligatoria. Queda prohibido reempaquetar
la colección y redistribuirla como propia — no es el caso aquí: se toma la
arquitectura, no los archivos.

### Qué se tomó y qué se cambió

Tomado: la separación en capas (filtro del backdrop, tinte, filo especular,
contenido), el juego de tokens (`--bg-color`, `--highlight`, `--text`) y la idea
de que el contenido nunca entre en la capa filtrada.

Cambiado, y por qué:

- **La turbulencia va dentro del `backdrop-filter`.** En la versión publicada,
  `filter: url(#glass-distortion)` se aplica a un `<div>` vacío, y `filter`
  opera sobre los píxeles del propio elemento: la turbulencia no llega al fondo
  y es, tal cual, decoración. Movida al `backdrop-filter` sí dobla el fondo.
  Solo Chromium la aplica ahí (WebKit #245510, abierto desde 2022), así que hay
  detección de motor y tres niveles de calidad.
- **`baseFrequency` y `scale` recalibrados** de `0.008 / 77` a `0.006 / 28`. Los
  originales están calibrados para un filtro decorativo; dentro del
  `backdrop-filter` distorsionan mucho más.
- **Las capas 1 y 2 se funden en `::before`.** Estaban separadas porque
  `filter: url()` sobre la capa habría teñido también el overlay; con la
  turbulencia en el `backdrop-filter` esa razón desaparece, y usar
  pseudo-elementos evita añadir tres `<div>` a cada componente de la galería.
- **Del JS solo se conserva el especular que sigue al cursor**, como un único
  módulo compartido. El resto del JS de los snippets es código muerto conocido:
  `querySelector('filter feDisplacementMap')` devuelve `null` porque el `<svg>`
  es hermano del componente y no descendiente; varios `mouseleave` resetean un
  `scale` que nada había modificado.
