# Confirmaciones propias, calendario legible, modal compacto y crear desde rangos — diseño

Responde a las observaciones de Cesar sobre el modal grande de tarea.

## 1. Confirmaciones propias

- **`confirmar(opciones): Promise<boolean>`** junto con `<ConfirmHost />`, montado una vez en `App`, en `components/ui/Confirmar.tsx`:
  - Es un `role="alertdialog"` con título, mensaje opcional y dos botones. Por defecto dicen "Seguir editando" (con el foco inicial) y "Descartar" (en rojo).
  - Esc o un clic en el fondo equivalen a cancelar. Esc se captura en la fase de captura con `preventDefault`, de modo que el modal de debajo no se cierra.
  - Se apila por encima de los modales (`z-[70]`).
- **Sustituye a todos los `window.confirm`:**
  - descartar cambios en el modal de tarea (Esc, fondo, ✕ y Cancelar);
  - Descartar y Salir en el Gantt;
  - la guardia de navegación.
- **La guardia de navegación pasa a ser asíncrona:**
  - `puedeSalir(): Promise<boolean>`.
  - Los enlaces de la navegación hacen `preventDefault` y navegan solo si se confirma.
  - El botón "Salir" (cerrar sesión) espera la confirmación.
- **Cerrar o recargar la pestaña** sigue mostrando el aviso nativo de `beforeunload`. El navegador no permite personalizarlo.

## 2. Vista Calendario legible

- Cada `CalendarDay` gana `items: ItemDia[]`, calculados en `buildCalendar`:
  - **`tarea`:** una tarea con inicio y deadline (inicio ≤ deadline) ocupa su rango. Una tarea con solo inicio ocupa ese día.
  - **`paso`:** cada paso programado ocupa su rango y su título es `↳ <paso>`.
  - **`vence`:** una tarea con solo deadline, o con inicio posterior a su deadline, aparece en su deadline.
  - **Campos:** `key`, `tipo`, `titulo`, `tarea`, `inicio` (es el primer día del item), `fin` (es el último) y `etiqueta`. `etiqueta` vale `inicio` o "es lunes", de modo que el título se repite al empezar cada semana.
  - **Orden por día:** por fecha de inicio del item, luego por tipo (tarea, paso, vence) y luego por `key`. Así las barras que continúan quedan aproximadamente alineadas.
- **Celda:**
  - Hasta 3 items y luego "+n".
  - Las barras de tarea son macizas, con el color del proyecto y bordes redondeados solo en el inicio y el fin.
  - Las de paso son más finas y en tono claro.
  - `vence` se muestra como "⚑ Título", en rojo si está vencida.
  - En móvil (`< sm`) desaparece el texto y quedan las barras y los puntos.
- **Leyenda** sobre la rejilla: ▬ tarea · ▭ paso · ⚑ vence · ◔ hábitos.

## 3. Modal de tarea compacto

- **Orden del panel izquierdo:**
  1. Título, Descripción, Fecha de inicio y Deadline, y Notas.
  2. Un colapsable **"Detalles"** con Tipo, Prioridad, Proyecto y Estado (este último solo al editar). Cerrado, su resumen muestra la prioridad, el proyecto (o "sin proyecto") y, al editar, el estado.
  3. Al final, un colapsable **"Pasos"**. Su resumen es "N pasos · M programados". Está abierto si la tarea ya tenía pasos y cerrado si es nueva.
- Los colapsables son `<details>`/`<summary>` con el estilo de la app.

## 4. Crear una tarea desde las vistas

- **Calendario:**
  - Un botón **"＋ Nueva tarea"** en la cabecera.
  - Para marcar un rango: con ratón, pulsar y arrastrar sobre los días; con Shift+clic, desde el día seleccionado hasta el clicado.
  - En táctil: en el panel del día, el botón **"↔ Marcar rango desde este día"** hace que el siguiente toque fije el fin.
  - Con un rango marcado, las celdas se resaltan y aparece la barra **"＋ Tarea del 7 al 10 oct · ✕"**. Esc o ✕ limpian la selección.
  - Un clic simple sigue seleccionando el día para el panel, que mantiene "＋ Tarea este día".
- **Gantt:**
  - **"＋ Nueva tarea"** en la cabecera.
  - Una fila final **"＋ Nueva tarea"** en la que se marca un rango: con ratón arrastrando, o con dos toques. Usa el mismo componente `Pista` que el planificador, extraído a `components/gantt/Pista.tsx`.
  - Al marcarlo aparece "＋ Tarea del …" en la barra de herramientas.
  - Fuera del modo edición.
- **Al abrir el modal desde un rango:** inicio = primer día y deadline = último día. Si el último día ya pasó, el deadline queda vacío.

## Pruebas

- **vitest:** `items`:
  - una tarea con rango que cruza una semana se etiqueta en su primer día y en el lunes;
  - una tarea con solo deadline aparece como `vence`;
  - un paso es un item `paso`;
  - el orden de los items.
- **Chrome:**
  - los tres diálogos propios (Esc cancela sin cerrar el modal);
  - los títulos en las celdas y la leyenda;
  - los colapsables y sus resúmenes;
  - arrastrar un rango en el Calendario y en la fila del Gantt, y que el modal se abra colocado;
  - Shift+clic y "Marcar rango";
  - el ancho de 375 px y que no haya errores en consola.
