# UI Lab

Repositorio fuente personal de **Morphiq Material Lab**.

## Arquitectura

- `bootstrap/part-*.txt`: archivo fuente verificado, dividido para conservar íntegros los 18 archivos originales del laboratorio.
- `scripts/restore-build.mjs`: reconstruye el archivo sin dependencias externas, valida el proyecto original y genera `dist/`.
- `vercel.json`: configura a Vercel para ejecutar `npm run build` y publicar únicamente `dist/`.

## Validación local

```bash
npm run build
```

El build debe confirmar `Material Engine 2.1.0`, reconstruir 18 archivos y producir HTML, CSS y JavaScript estáticos reales dentro de `dist/`.

## Regla de despliegue

GitHub es la fuente de verdad. Vercel se utiliza únicamente para compilar y desplegar este repositorio.
