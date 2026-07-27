# Round 2 — geometría del campo, y la lente que no lo era

Cubre los bloques 1, 2 y la primera mitad del 3. Los commits van desde
`fix: cerrar los tres artefactos del round 1` hasta
`feat(lens): la lente vuelve a ser una lente`.

---

## 1. Bloque 1 — los cuatro artefactos

| # | síntoma | causa real |
| --- | --- | --- |
| 1 | los canvas tapaban a sus vecinos («Switch» se leía «itch») | el canvas llevaba 34px de margen para dibujar cáustica y sombra de contacto, que salen de la silueta |
| 2 | superficie redondeada huérfana bajo el range slider | `.field input` capturaba los dos `<input type=range>`, superpuestos con `inset:0` |
| 3 | recuadro cian suelto sobre el fondo de tipografía | unos `strokeRect` que yo mismo había dibujado y que leían como UI perdida |
| 4 | campo de rayas en Compare | no era un canvas sin liberar: eran los destellos del sol del fondo `landscape`, 90 rectángulos agrupados en una columna estrecha |

El 1 se resuelve sacando los efectos exteriores a una capa compartida
(`#mqLensUnder`, fixed, detrás del contenido) y dejando el canvas por elemento
ajustado a su caja. Esa capa, sin embargo, no hereda la opacidad del elemento,
así que el tooltip con `opacity: 0` empezó a dejar su vidrio flotando suelto:
se filtra con `checkVisibility`.

Además, Compare pasa a usar **un único fondo para las tres columnas**. Cada
material pintaba su propio escenario, así que parte de la diferencia que se veía
entre columnas era del fondo y no del material: la prueba no discriminaba.

## 2. Bloque 2 — el facetado era geometría

El gradiente de una caja redondeada es **exactamente constante** a lo largo de
cada lado recto: `(0,-1)` arriba, `(1,0)` a la derecha. Como el desplazamiento
se derivaba de ese gradiente, toda la franja paralela a cada borde se trasladaba
por el mismo vector — una traslación rígida de una tira de fondo. Y en el punto
de tangencia donde el arco encuentra el lado, la curvatura salta de `1/r` a `0`:
esa es la costura a 45°.

Evidencia que lo confirma: **las cards eran el peor caso y los botones no**. Con
radio 18px en una card de 440×300 casi todo el perímetro es recto; en un botón
de 44px de alto con radio 14 la proporción de arco es mucho mayor.

Qué se hizo, y una corrección al brief:

- **Esquina superelíptica sobre rectángulo**, no superelipse pura. Una
  superelipse no tiene radio de esquina independiente — lo fijan `n` y la
  relación de aspecto — así que en 440×300 habría redondeado la silueta mucho
  más que 18px y la forma del shader habría dejado de coincidir con la del DOM.
  Con `n > 2` la curvatura es cero donde toca los ejes, así que empalma con el
  lado recto de forma C² y la costura desaparece.
- **Normal analítica** en vez de diferencias finitas: continua a través de la
  unión arco-recta, que es donde el epsilon de 1px producía el salto. Y más
  barata — quita cuatro evaluaciones del campo y añade dos.
- **Perfil de espesor derivado de la superficie**, `h(t) = (1-(1-t)^k)^(1/k)`.
  La rampa lineal anterior tenía una torcedura dura donde terminaba el bisel, y
  esa torcedura era la línea recta paralela a cada borde. `k` es un token
  (`--mq-profile`).
- **La onda de impacto deforma el campo de espesor** en vez de sumarse al
  desplazamiento final. Sumarla movía el fondo entero de un lado a otro, y sobre
  un fondo con estructura eso lee como temblor — el segundo defecto de las cards.
- **El specular se modula por curvatura local**, cero en los lados rectos. Deja
  de ser una barra de canto a canto.

## 3. El gate de contraste, medido de verdad

`tools/contrast.mjs` componía el `background-color` declarado. Con el motor
pintando el cuerpo del vidrio en un canvas detrás del contenido, ese número dejó
de describir lo que se ve. Ahora recorre la pila real — bitmap del fondo, canvas
de lente de cada ancestro, color CSS de cada ancestro — y toma **el peor píxel
de una rejilla, no el promedio**: un material que promedia bien y tiene una zona
ilegible sigue siendo ilegible.

Y se mide **dentro de cada tono**. El gate absoluto forzaba un alfa de cuerpo de
.76, con lo que `mix(refracted, body, .76)` dejaba pasar solo el **22%** de la
imagen refractada: el material dejaba de leer como vidrio por mucho que subiera
la refracción. Con el gate por tono el cuerpo baja a .42 y pasa el 58%.

Resultado: **0 de 18 medidas por debajo de 4.5:1**, en los dos tonos, sobre el
peor fondo de cada uno.

Al medir sobre píxeles aparecieron cuatro huecos reales en la receta de tono
claro (gallery card, cards, botón secundario, títulos): superficies que
conservaban el cuerpo oscuro del tono contrario. Corregidos.

## 4. La lente no era una lente

Este es el hallazgo que más cambió el bloque. Vuestra medición era correcta y la
reproduje con una herramienta nueva, `tools/lensdiff.mjs`, que renderiza el mismo
control con `--material-refraction` a 0 y a 1 y resta las dos imágenes: todo lo
que no sea refracción se cancela.

```
control     interior medio   interior max   filo medio   bisel px
boton                0.00              0         1.86        5.7
card                 0.00              1         9.49       15.6
```

Interior byte a byte idéntico. Dos causas, no una:

**1. El espesor era un valor absoluto pequeño.** `--mq-thick` pasa a ser el
suelo, no el valor: el espesor real se deriva de la geometría — 20% del lado
corto, tope 34px. Un botón de 44px lleva 9.4px de canto; una card de 170px, 34px.

**2. Faltaba el segundo término del modelo.** Un bisel solo dobla dentro de su
propio ancho, así que con 15px de canto sobre una card de 170px el 82% de la
superficie quedaba ópticamente plano. Un panel de vidrio real no es una lámina
plana con el borde biselado: es un **casquete muy tendido sobre un cuerpo
cilíndrico**, y esa curvatura de radio enorme desplaza el fondo en toda la
superficie. Se añade `--mq-dome`.

Al implementar la cúpula volvieron las costuras, y la causa fue mía: le di la
dirección del gradiente del SDF, que apunta al borde más cercano y cambia de eje
al cruzar las diagonales — cuatro zonas de desplazamiento uniforme con costura
en X. La normal de un casquete es **radial desde el centro**. Con dirección
radial es continua en toda la superficie.

```
control     interior antes   interior ahora   umbral
boton            0.00             9.34           8
card             0.00            21.13           8
knob             0.00             9.25           8
switch           0.00            18.95           8
```

## 5. Knob y range slider

**Knob** — dos bugs encadenados. `getComputedStyle` **no resuelve los
porcentajes** de `border-radius`, así que `50%` se leía como 50px sobre un
control de 82px: esquina superelíptica sobre caja cuadrada, con la costura en X
que lo partía en cuatro cuadrantes. Y `getBoundingClientRect` de un elemento con
`transform` devuelve su caja envolvente, así que el knob rotado inflaba su lente
hasta 1.41×. Ahora el radio se resuelve a píxeles reales, el caso círculo baja
el exponente a `n = 2` y la geometría usa la caja de layout. Es una esfera de
vidrio.

**Barra fantasma** — no era un canvas de más. Mi regla
`[data-mq-material] .field input` tiene especificidad (0,2,0) contra la (0,1,1)
de `.range-slider input`, así que le imponía `position: relative` y sacaba el
segundo range del apilado: caía debajo del output como una barra suelta. Los
selectores de material excluyen ahora los inputs que no son cajas de texto, y el
range slider recibe pista y pulgar propios en vez del control nativo sin
resetear.

## 6. Grupos de lente y fusión — estado parcial

La infraestructura está y compila; la afinación visual **no está terminada**.

Qué hay:

- Dos programas GLSL con el mismo `main` y distinto campo de forma. El camino de
  una sola forma no paga el bucle sobre N ni los uniforms de grupo.
- `smin` polinómico de Inigo Quilez sobre distancias con signo, devolviendo
  también el factor de mezcla para **interpolar la normal a través del puente**.
  Eso es lo que hace que el rim recorra la fusión.
- Hasta 4 formas por grupo. Poda exacta: con `smin` polinómico una forma a más
  de `k` de distancia no contribuye nada.
- La estela la genera el movimiento: el motor recuerda el rect anterior de cada
  miembro y, si se movió más de 1.5px, añade una gota en la posición previa.
  `k` crece con la distancia recorrida — un control que se acerca despacio no se
  funde, uno que llega rápido sí — con umbral, no interpolación desde infinito.
- **Puerta del camino de grupo**: con `k < 1.5` o menos de dos formas, el grupo
  cae al camino rápido. La fusión es transitoria; el reposo es el 95% del tiempo.
- Grupos registrados: switch, segmented control, slider, dropdown.

Qué falta, dicho claro: la curva de `k` en el tiempo todavía no produce el
"se forma, se estira, se rompe" de forma legible, y el indicador del segmented
control no tiene cuerpo propio visible. Es afinación, no arquitectura.

## 7. Rendimiento

**Este entorno no tiene GPU** — Chromium sobre SwiftShader. Los números son un
suelo. Los 60 fps siguen **sin verificar sobre hardware real**.

| estado | frame mediano | fps |
| --- | --- | --- |
| final del round 1 | 50,0 ms | 20,0 |
| tras la superelipse (más `pow` por fragmento) | 66,7 ms | 15,0 |
| tras cúpula + grupos, con la puerta activa | 50,1 ms | 20,0 |
| control: misma página sin motor | 16,7 ms | 59,9 |

La calidad adaptativa baja la escala de render a 0,342 bajo carga. El
presupuesto de grupos que pedíais:

- **4 formas máximo por grupo.** Al excederse se descartan las más lejanas
  (`slice`), no se parte el grupo: partirlo duplicaría el quad y el fill-rate.
- **Poda por distancia exacta**, aprovechando la propiedad del `smin`
  polinómico.
- **Techo de fill-rate**: el quad de grupo cubre la unión de las formas más
  `k * 0.75` de holgura. Con la puerta activa, en reposo no se dibuja ningún
  quad de grupo, así que el área extra es cero salvo durante la transición.

## 8. Deuda reconocida

- El switch pasa la métrica de lensing pero es el control donde menos margen
  hay: una cápsula de 32px de alto es indistorsionada en su eje por
  construcción.
- La fusión necesita una pasada de afinación (sección 6).
- Sigue pendiente todo el bloque de cobertura de los tres materiales y `skeuo`.
- 60 fps sobre GPU real, sin verificar.

## 9. Capturas

`shots/antes-poligonos_grid.png` es el estado con facetado; el resto son el
estado actual sobre el damero de calibración y sobre `landscape`.
