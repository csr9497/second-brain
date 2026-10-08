# Móvil, burbujas, Resumen, Crear + y detalle de paso: diseño

Este diseño responde al feedback de Cesar después de usar la app en el iPhone. Son cuatro bloques independientes que se entregan en este orden.

## 1. Responsive en iPhone (bug)

- **Síntoma:** a 390 px la página es más ancha que la pantalla. En el Calendario se corta la columna Dom y el panel del día; en el Gantt se corta el borde derecho.
- **Causa:** algún hijo del contenedor no se encoge. Se encuentra midiendo en Chromium a 390×844 (`document.documentElement.scrollWidth > innerWidth`) y se corrige donde nace, sin `overflow-x: hidden` global que lo tape.
- **Calendario en el teléfono:**
  - la rejilla ocupa todo el ancho con sus 7 columnas visibles;
  - el panel del día va debajo, a todo el ancho;
  - sus filas miden al menos 44 px de alto, para tocarlas cómodamente.
- **Criterio de hecho:** en Hoy, Calendario, Gantt y Resumen, a 390 px, `scrollWidth === innerWidth`. El Gantt puede desplazarse de lado dentro de su propia caja, pero la página no.

## 2. Hoy: burbujas y título «Hábitos»

- El título de la sección pasa de «Hábitos de hoy» a «Hábitos».
- Se mantienen el bloque de progreso (anillo, racha) y las pestañas Mañana / Tarde / Noche.
- **Burbujas:** cada ficha de la franja es una burbuja de 48 px con la inicial del hábito y el nombre debajo (con «…» si es largo).
  - Pendiente: borde gris sin relleno.
  - Hecha: rellena con `--good` y un ✓.
  - Al tocarla se marca o desmarca, con la misma mutación y el mismo cambio optimista de hoy.
  - **Las marcadas se quedan** (rellenas). En Hoy no desaparecen, a diferencia de la Live Activity.
  - Si se hizo en otra franja («hecho por la tarde»), se ve como un punto en la burbuja y se lee en su `aria-label`.
- **Semanales:** también son burbujas, con un anillo de progreso alrededor (hechas / meta) y el texto `1/7` bajo el nombre. Al cumplir la meta, el anillo se ve completo en `--good`.
- Son `<button>` con `aria-pressed` y un `aria-label` con nombre, estado y franja.

## 3. Navegación: Resumen y Crear +

- **Pestañas:** `VISTAS` gana `resumen` (`#/resumen`, «📈 Resumen»).
  - En el teléfono las pestañas son más compactas (menos padding).
  - Si no caben, el `<nav>` se desplaza de lado dentro de sí mismo, sin mover la página.
- **Vista Resumen:** reemplaza al modal `ReviewModal`. El estado `{ kind: 'revision' }` desaparece del `ModalState`.
  - Arriba, un selector Semana | Mes (`role="tablist"`).
  - **Semana:** el contenido actual del modal (pestañas Proyectos y Hábitos, la nota y «Archivar semana»), sin cambios de lógica.
  - **Mes:** las mismas pestañas Proyectos y Hábitos, calculadas sobre el mes en curso.
    - Solo cuentan los días transcurridos, como en la semana.
    - Encima va un **mapa de calor** del mes: una cuadrícula de lunes a domingo con un cuadro por día, coloreado según el % de hábitos de ese día (vacío / bajo / medio / alto / 100 %). Los días futuros salen sin color y cada cuadro lleva `aria-label` con fecha y %.
    - El mes no se archiva: no hay cambios en la base de datos.
- **Lógica en `@sb/shared`:**
  - `buildWeeklyReport` se generaliza a `buildReport(input, { start, end }, archived)` para calcular cualquier rango, y `buildWeeklyReport` queda como envoltorio.
  - `buildMonthlyReport(input)` devuelve el reporte del mes más `dias: { fecha, pct | null, futuro }[]` para el mapa. Reutiliza la misma lógica de vigencia y turnos que el calendario.
  - Lleva tests.
- **Crear +:**
  - En pantallas `sm` y mayores, un botón «＋ Crear» en la fila de pestañas, pegado a la derecha (`ml-auto`).
  - En el teléfono, un botón flotante redondo de 56 px abajo a la derecha (`fixed`, respetando `env(safe-area-inset-bottom)`), con `aria-label="Crear"`.
  - Al tocarlo se abre `CrearModal` con cuatro opciones grandes: Tarea, Captura, Hábito y Proyecto. Cada una abre su modal de siempre (`tarea`, `idea`, `habito`, `proyecto`).
  - El modal de hábito abierto desde Crear, al cerrarse, vuelve a la vista y no a «Gestionar hábitos». Para eso `ModalState` `habito` gana `volver?: boolean`.
  - Desaparecen los tres botones de acción de la cabecera de Hoy.
  - El FAB no tapa el último contenido: la página reserva espacio abajo en el teléfono.

## 4. Gantt: detalle de un paso

- Fuera del modo edición, tocar la barra o el nombre de un paso abre `PasoModal`.
  - Hoy, ese toque abre la tarea; con el cambio, la tarea se sigue abriendo desde su propia fila.
- **Contenido del modal:**
  - el nombre del paso;
  - la tarea y el proyecto, con su color;
  - el rango de fechas (`rangoPaso`) o el tiempo estimado (`duracion_min`);
  - el estado (pendiente o hecho);
  - la etiqueta «Fuera de plazo» si `fueraDePlazo`.
- **Acciones:**
  - **Marcar hecho / Desmarcar:** usa `api.toggleStep`; el trigger de la base sincroniza el estado de la tarea. Invalida `['gantt']`, `['today']` y `['calendar']`.
  - **Abrir tarea:** cierra este modal y abre el `TaskModal` de la tarea.
- En modo edición la barra sigue moviéndose y estirándose; no abre nada.

## Fuera de alcance

- Navegar a semanas o meses anteriores en Resumen.
- Archivar el mes.
- Editar el paso desde `PasoModal`.
- Las Live Activities, que tendrán su propio spec.
