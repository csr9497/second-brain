# Modal grande de tarea con planificador — diseño

## Objetivo

El modal de tarea, para crear y para editar, pasa a ser **grande y de dos paneles**:
- **A la izquierda**, el formulario de siempre.
- **A la derecha**, un **planificador** con pestañas **Calendario** y **Gantt** para colocar la tarea y sus pasos sobre los días.

Al marcar un rango, las fechas y la **duración** de la tarea o del paso se calculan solas. Ambos paneles editan el mismo estado, y nada se guarda hasta pulsar **Guardar**.

## Decisiones

- **Qué se coloca:** fichas "Colocando: Tarea · Paso 1 · …", con la Tarea por defecto. Cada paso del formulario tiene además un botón 📍 que lo selecciona.
- **Al colocar un rango:**
  - En la **tarea**, el inicio es el primer día y el deadline el último.
  - En un **paso**, el inicio es el primer día y los días se calculan como último − primero + 1.
- **Calendario del planificador:**
  - Un mes con `‹ ›`. Muestra el rango de la tarea como franja, los pasos como barras (rojas si quedan fuera de plazo) y el deadline con una marca.
  - **Ratón:** pulsar y arrastrar del primer al último día, con vista previa; al soltar, se aplica.
  - **Táctil, teclado (Enter) o un clic sin arrastrar:** dos toques. El primero fija el inicio y avisa "elige el último día". Tocar dos veces el mismo día marca un solo día, y Esc cancela sin cerrar el modal.
- **Gantt del planificador:**
  - Una fila para la tarea y otra por paso, incluidos los pasos sin programar (fila vacía).
  - Las barras usan el `Barra` del Gantt. Mover la tarea mueve también sus pasos, y el borde estira. La lógica es la de `shared/domain/gantt.ts`, aplicada sobre una tarea virtual creada desde el formulario.
  - En el fondo de una fila: con ratón, arrastrar coloca un rango; un toque o un clic funciona en dos toques.
  - La ventana de días queda fija mientras se arrastra una barra.
- **Atajo nuevo:** en el panel del día del Calendario principal, el botón **"＋ Tarea este día"** abre el modal con inicio = deadline = ese día.
- **Diseño responsivo:** `Modal` acepta un ancho; el de tarea es `max-w-[1120px]`. Desde `lg:` hay dos columnas, con el formulario de hasta 420 px y el planificador fijo arriba (sticky). En pantallas menores, el planificador va debajo del formulario.

## Unidades

- **Dominio** (`shared/domain/pasos.ts`): `rangoSeleccion(a, b)` devuelve `{ inicio, fin, dias }`, ordenado e inclusivo. Lleva tests.
- **`apps/web/src/lib/pasosBorrador.ts`** reúne:
  - `StepDraft`, `diasDe` y `programacion`, que se mueven desde `TaskModal`;
  - `TareaPlan` (`{ startDate, deadline }`, donde `''` significa sin fecha);
  - `comoTask(tarea, steps)`: una tarea virtual cuyos pasos usan como id su índice;
  - `desdeBorrador(tarea, steps, draft)`;
  - `colocar(tarea, steps, activo, inicio, fin)`.
- **Componentes:**
  - `components/planner/PlanificadorTarea.tsx`: pestañas, fichas y ayuda.
  - `CalendarioPlan.tsx`.
  - `GanttPlan.tsx`.

## Pruebas

- **vitest:** `rangoSeleccion` ordena los días, incluye los dos extremos, y un mismo día dura 1.
- **Chrome:**
  - Arrastrar la tarea en el calendario: cambian el inicio y el deadline del formulario.
  - Colocar un paso con dos toques: cambian su fecha y sus días.
  - Esc cancela el primer toque y el modal sigue abierto.
  - En el Gantt, estirar un paso: cambian sus días; mover la tarea: se mueven sus pasos.
  - Colocar un paso sin programar en su fila vacía.
  - Guardar y comprobar que persiste.
  - "＋ Tarea este día" abre el modal ya colocado en ese día.
  - Ancho de 375 px y que no haya errores en consola.
