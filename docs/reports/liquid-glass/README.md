# Round 1 — liquid-glass

Estado: **listo para revisión**. `liquid-glass` pasa a `shipped` en el manifiesto
de `scripts/validate.mjs`; `glass` y `skeuo` siguen en `legacy`.

---

## 1. El hallazgo que cambió el planteamiento del round

El motor anterior **nunca refractó la página**. `scripts/liquid-renderer.js:89`
definía una función `scene()` en GLSL:

```glsl
vec3 scene(vec2 uv) {
  vec3 baseA = vec3(0.012, 0.052, 0.090);
  vec3 baseB = vec3(0.075, 0.045, 0.205);
  ...
}
```

Un degradado procedural escrito a mano que casualmente se parecía al fondo CSS.
El shader refractaba esa escena inventada, no el fondo real. Por eso el "vidrio"
leía como tarjeta oscura translúcida: no había correspondencia óptica entre lo
que se veía detrás del control y lo que el control doblaba.

Consecuencia para la arquitectura: **mover el canvas del playground a la galería
no habría servido de nada**. Antes había que convertir el fondo en algo que un
shader pueda muestrear.

## 2. Segundo hallazgo: Compare nunca comparó nada

La vista Compare renderizaba tres tarjetas con `data-style-scope="skeuo|glass|
liquid-glass"`, pero las reglas de material estaban escritas contra
`html[data-style="…"]`:

| selector | especificidad |
| --- | --- |
| `html[data-style="skeuo"] .ui-button--primary` | (0, 2, 1) |
| `[data-style-scope="glass"] .ui-button` | (0, 2, 0) |

La regla del laboratorio gana siempre. Las tres columnas renderizaban el
material seleccionado en `<html>`. En la captura de baseline
(`shots/baseline-compare.png`) los tres botones son idénticos: la misma píldora
cian. Además las reglas `[data-style-scope]` eran un subconjunto mantenido a
mano — 11 a 13 reglas frente a las 81–134 de cada material — así que aunque la
especificidad hubiera funcionado, Compare habría mostrado una versión
empobrecida de cada receta.

La herramienta central del gate de aceptación llevaba toda su vida comparando
una sola receta consigo misma.

## 3. Qué cambió

### 3.1 El fondo pasa a ser un bitmap (`scripts/backdrops.js`)

Nueve fondos dibujados en un canvas 2D con estructura real: bordes duros,
estrellas de un pixel, tipografía de 200px, horizontes rectos, un damero de
calibración. Difuminar un color plano devuelve el mismo color plano — un vidrio
sobre un degradado uniforme nunca se va a ver como vidrio, y ese era el estado
anterior.

Se dibujan una sola vez y el mismo bitmap alimenta la pantalla y la óptica. Si
el fondo viviera en CSS habría que escribirlo dos veces (CSS y GLSL) y las dos
versiones se separarían.

Todos son deterministas — PRNG con semilla, cero `Math.random` — para que las
capturas de rounds distintos sean comparables.

### 3.2 Motor de lentes (`scripts/lens-engine.js`)

- Un único contexto WebGL, fuera del DOM, del tamaño del viewport.
- El bitmap del fondo sube como textura.
- Cada superficie registrada se dibuja como un quad con forma de caja
  redondeada; el fragment shader muestrea la textura del fondo con un
  desplazamiento derivado del campo de espesor del vidrio.
- Cada elemento lleva un `<canvas>` hijo en `z-index: -1` y por frame se copia
  su región desde un espejo del canvas GL.

Lo que el shader añade y antes no existía:

| propiedad | antes | ahora |
| --- | --- | --- |
| refracción | uniforme o inexistente | máxima en el perímetro, ~0 en el centro (lente) |
| canto | `1px solid rgba(255,255,255,…)` | bisel de cuarto de círculo, `--mq-thick` 1.5–7px |
| specular | `radial-gradient` centrado en `--px/--py` | banda derivada de `--light-angle` y la curvatura del canto |
| dispersión | aura RGB alrededor de todo | solo en el canto, en la dirección de la normal |
| cáustica | no existía | charco de luz proyectado al lado contrario a la luz |
| presión | escala del elemento | ensancha el canto: más vidrio en el camino óptico, más distorsión |
| onda | halos DOM que se expanden | deformación del campo de espesor dentro del shader |

### 3.3 Compare arreglado

El selector raíz de cada material pasa a ser `[data-mq-material="<slug>"]`, y ese
atributo vive en `<html>` en la vista Laboratorio o en cada tarjeta en Compare.
Al entrar en Compare, `app.js` **quita** el atributo de `<html>`, así que solo
matchean las reglas de cada tarjeta. Un único juego de reglas sirve a las dos
vistas: no hay subconjunto que mantener y Compare muestra el material completo.

### 3.4 El contraste ya se mide

`updateContrastEstimate` era una fórmula inventada:

```js
const score = Math.max(3.1, Math.min(12, base + opacity * 4 - (…)));
```

Devolvía un número plausible sin mirar un pixel. Ahora se calcula la
luminancia relativa WCAG del color de texto real contra el tinte del material
compuesto sobre blanco **y** sobre negro, y se reporta el peor caso. En un
laboratorio cuyo gate es "≥ 4.5:1 sobre los 5 materiales", un medidor falso es
peor que ninguno.

### 3.5 Recipe Inspector

Separa explícitamente los dos vocabularios: el contrato `--mq-*` que se congela
en el componente al inyectar, con qué hace y qué rango tiene cada token, y las
perillas globales del laboratorio (`--light-*`, `--material-*`) que sirven para
afinar. El bloque copiable ya no emite `:root`.

## 4. Bugs encontrados y corregidos

| # | bug | causa | efecto |
| --- | --- | --- | --- |
| 1 | óptica comprimida en horizontal, con una costura vertical dentro de cada control | `base.css` tenía `canvas { max-width: 100% }`; el bitmap de la lente es más ancho que el elemento porque incluye margen para cáustica y sombra de contacto | el canvas se recortaba de 260 a 190px |
| 2 | fondo por canvas invisible | `body` tenía `background` opaco y el canvas pinta en `z-index: -2` | el bitmap existía pero quedaba tapado |
| 3 | la textura llegaba a la GPU a medio pintar | `grain()` hacía ~1,7M `fillRect` a 2× DPR y bloqueaba el hilo principal varios segundos | se sustituyó por una pasada de `ImageData` |
| 4 | rectángulo fantasma con borde duro junto a cada superficie | la cáustica era una caja redondeada desplazada, y su meseta interior asomaba por un lado | se sustituyó por una caída suave desde la silueta |
| 5 | barra blanca de canto a canto en la parte superior de las tarjetas | la normal de una caja redondeada es constante a lo largo de cada lado recto; con `pow(facing, 5.0)` eso pinta una banda uniforme | se bajó el exponente y la ganancia |
| 6 | `half` es palabra reservada en GLSL ES 1.00 y una variable local `distance` sombreaba la built-in | — | el shader no compilaba |

El halo borroso que arrastraba el texto de los inputs desaparece por
construcción: el canvas de la lente no lleva `filter` ni `mix-blend-mode` — todo
el desenfoque ocurre dentro del shader, sobre la textura del fondo — y cada
superficie declara `isolation: isolate`, que contiene el hijo con `z-index: -1`.

## 5. Rendimiento

**Cómo leer estos números: este entorno no tiene GPU.** Chromium corre WebGL
sobre SwiftShader, por software. El coste de fill-rate del motor aquí es el peor
caso posible. Los números son un suelo, no una estimación de producción.

Medido con `node tools/perf.mjs`, viewport 1600×1100, 62 superficies en el DOM,
84 lentes registradas:

| etapa | frame mediano | fps |
| --- | --- | --- |
| primera versión funcionando | 483 ms | 2,1 |
| + guarda de dispersión y escala de render 0,62 | 117 ms | 8,6 |
| + fondo pre-desenfocado (2 tomas en vez de 27) | 66,6 ms | 15,0 |
| + espejo 2D (una sola sincronización GPU→CPU) | 50,0 ms | 20,0 |
| **control: misma página sin motor (`skeuo`)** | **16,7 ms** | **59,9** |

Desglose de una llamada a `frame()` con 18 lentes visibles: GL + readback +
recortes suman **0,16 ms**. El resto es rasterización diferida del shader, que
es exactamente lo que un rasterizador por software hace caro.

Las optimizaciones que valen la pena registrar:

- **El desenfoque no se calcula por fragmento.** Era un disco de Poisson de 8
  tomas, y con la dispersión cromática subía a 27 tomas por pixel de vidrio. El
  fondo se pre-desenfoca una vez por cambio de fondo o de token, en el canvas 2D
  con `ctx.filter`, y el shader interpola entre la versión nítida y la difusa.
- **Una sola transferencia GPU→CPU por frame** en vez de una por elemento.
- **`getComputedStyle` cacheado por lente**, invalidado por eventos discretos.
  La presión se lee del `style` inline, sin pasar por estilo computado.
- **La geometría del canvas solo se escribe cuando cambia**, para no invalidar
  layout cada frame y forzar un recálculo en la fase de lectura del siguiente.

**Calidad adaptativa.** El motor mide el delta real entre frames — no el tiempo
dentro de `frame()`, que marca cero justo cuando la GPU está saturada — y ajusta
su resolución de render entre 0,62 y 0,34. En el escenario con la galería
completa en pantalla y un control bajo interacción continua, aquí baja hasta el
suelo y aun así no sostiene 60 fps. Degrada en vez de soltar frames en silencio,
y en una máquina con GPU se queda arriba.

**Pendiente y honesto:** los 60 fps del gate no están verificados sobre hardware
real. Hay que medirlo en la máquina de Miguel antes de aprobar el round.

## 6. Gates

| gate | estado |
| --- | --- |
| contraste ≥ 4.5:1 | ✅ **9 de 9 controles pasan sobre blanco y sobre negro**, medido con `node tools/contrast.mjs`. Ver sección 6.1 |
| auto-contención | ✅ verificado por `validate.mjs`: 0 usos de `:root`, 0 `var()` sin fallback literal |
| `prefers-reduced-motion` | ✅ bloque declarado; el material conserva canto, bisel y cáustica en estático |
| `forced-colors` | ✅ bloque declarado; borde real de 2px que preserva los límites del control |
| foco visible | ✅ `:focus-visible` + `[data-focus="true"]` capturable |
| 60 fps con 40+ componentes | ⚠️ no verificado sobre GPU real — ver sección 5 |
| los 3 niveles de calidad | ✅ `fallback` y `balanced` tienen canto por gradientes y `backdrop-filter`; no son versiones rotas |
| cero artefactos | ✅ los seis de la sección 4 corregidos |
| sin dependencias de runtime | ✅ vanilla; Playwright solo en `tools/`, fuera del build |

### 6.1 El gate de contraste obligó a rediseñar el material

La primera versión aprobada visualmente **fallaba el gate en 7 de 9 controles**:

```
control              sobre blanco   sobre negro   peor    AA
button primary            1.49        11.17    1.49   FALLA
button tertiary           1.26        19.52    1.26   FALLA
input                     3.61        19.01    3.61   FALLA
```

Se veía precioso sobre fondo oscuro y era ilegible sobre blanco. Es exactamente
el fallo que el brief describe: el vidrio estaba pidiéndole la legibilidad al
fondo.

Subir el alfa de `--mq-body` de .30 a .76 arregla el número, pero a ese tinte el
botón empieza a leer como relleno sólido con canto brillante. **El gate y el
material entran en conflicto directo**, y merece la pena dejarlo escrito en vez
de disimularlo: para una sola receta de texto claro, el alfa que pasa sobre
blanco es tanto tinte que el vidrio deja de serlo.

La salida no es elegir una de las dos cosas: es que la receta conozca el tono,
igual que un vidrio real se ve oscuro contra el cielo y claro contra la sombra.
Sobre fondo claro el cuerpo se aclara (`rgba(250,253,255,.42)`) y el texto se
oscurece (`#0a1c2c`), y con eso el alfa baja a .42 sin perder contraste. En el
laboratorio el tono lo marca el fondo elegido; en Morphiq UI se mapea a
`prefers-color-scheme` o a `[data-theme]`.

Resultado: **0 de 9 por debajo de 4.5:1**, en los dos tonos.

**Decisión para Miguel:** la receta de tono oscuro conserva alfa .76 para pasar
el gate literal — medido también sobre blanco — aunque en la práctica nunca se
use sobre blanco. Si aceptas que el gate se mida dentro de cada tono, ese alfa
puede bajar a ~.45 y el vidrio oscuro gana bastante transparencia. Es la única
decisión de este round que no puedo tomar yo.

## 7. Qué queda pendiente

- Verificar 60 fps sobre hardware con GPU.
- Decidir si el gate de contraste se mide en absoluto (sobre blanco y negro) o
  dentro de cada tono — ver 6.1. Cambia bastante cuánto se ve a través del
  vidrio oscuro.
- El vidrio refracta la capa de fondo, no DOM arbitrario detrás. Capturar DOM
  exigiría `html2canvas` y rompería la regla de cero dependencias. Limitación
  declarada, no bug.
- Las variantes conservative / expressive / experimental todavía mueven las
  perillas globales; falta que muevan también `--mq-thick` y `--mq-iri`.
- Arquetipos de expansión (badge, chip, skeleton, spinner, separator, table row,
  audio player, avatar) heredan la superficie base pero no tienen ajuste propio.

## 8. Capturas

En `shots/`, por escena × fondo. Los fondos elegidos cubren los casos que
importan: `landscape` (fotográfico), `type` (tipografía enorme detrás, el test
duro de legibilidad), `grid` (damero de calibración, donde cualquier distorsión
se ve) y `light` (fondo claro y casi plano, el caso difícil del vidrio).

`shots/baseline-*.png` son el estado anterior al round, para comparar.
