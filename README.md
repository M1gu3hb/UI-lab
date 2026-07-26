# Morphiq Material Lab

Cocina de recetas de material para [Morphiq UI](https://github.com/M1gu3hb/Morphiq-UI).
Aquí se diseñan, se comparan y se aprueban las recetas; **aquí no se inyecta nada** en el producto.

Morphiq UI es intocable desde este repositorio.

## Los 5 materiales

| slug           | nombre               | estado en el lab |
| -------------- | -------------------- | ---------------- |
| `clay`         | Claymorphism         | pendiente        |
| `glass`        | Glassmorphism        | legacy           |
| `skeuo`        | Skeuomorphism        | legacy           |
| `adaptive`     | Polymorphism         | pendiente        |
| `liquid-glass` | Liquid Glass         | legacy           |

`legacy` = el material existe pero su receta todavía no se ha cocinado en un round.
El estado real vive en el manifiesto `MATERIALS` de `scripts/validate.mjs`, que es
lo que el build verifica.

## Arquitectura

Vanilla HTML/CSS/JS, cero dependencias de runtime — una receta tiene que poder
viajar a React sin arrastrar un paquete.

```
index.html                 laboratorio completo (inspector, galería, compare)
styles/base.css            chrome del laboratorio
styles/<material>.css      recetas de material
scripts/app.js             estado, galería, compare, recipe inspector
scripts/liquid-renderer.js motor WebGL
scripts/<material>.js      comportamiento por material
scripts/validate.mjs       gates de calidad automatizables
scripts/build.mjs          copia verificada a dist/
```

## Desarrollo

```bash
npm run validate   # gates de calidad
npm run build      # validate + dist/
npm run preview    # sirve dist/ en :4173
```

Vercel publica exclusivamente `dist/`. GitHub es la fuente de verdad.

## Contrato de material

Las recetas usan el vocabulario del producto para que el trasplante sea copiar-pegar:
`--mq-body`, `--mq-lit`, `--mq-edge`, `--mq-text`, `--mq-brd`, `--mq-ring`.
Los controles globales del inspector (`--light-angle`, `--material-depth`, …) son las
perillas del laboratorio; cuando una receta se aprueba, sus valores se congelan en
los `--mq-*` del componente.

Regla de auto-contención: cada `var()` con fallback literal, cero `:root`, cero
dependencia de hoja global.

## Reportes

Cada round deja su reporte en `docs/reports/`.
