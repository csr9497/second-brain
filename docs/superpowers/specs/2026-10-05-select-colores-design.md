# Selects con dot de color — diseño

Entregable 2, pieza 1 de 6. Es la base de color que después usan el calendario y el Gantt.

## Objetivo

Cada select de la app muestra un dot del color de cada opción, tanto en el valor elegido como en la lista desplegada. Los proyectos tienen un color propio que se elige en su modal.

## Paleta

Hay 8 claves fijas, en español y sin tildes como el resto de los enums: `azul | verde | ambar | rojo | violeta | rosa | cian | gris`.

- La base guarda **la clave**, nunca el hex.
- Cada clave es un token CSS `--c-<clave>` en `apps/web/src/index.css`, con un valor para tema oscuro y otro para claro, igual que los tokens actuales.
- `azul`, `verde`, `ambar` y `rojo` toman los valores de `--accent`, `--good`, `--warn` y `--hot`, para que los colores de prioridad y estado no cambien de tono respecto a hoy.
- Cada token se expone a Tailwind en `@theme inline` como `--color-c-<clave>`.

## Datos

Migración `projects_color`:

```sql
alter table public.projects
  add column color text not null default 'azul'
  check (color in ('azul','verde','ambar','rojo','violeta','rosa','cian','gris'));
```

- Los proyectos existentes quedan en `azul`.
- `seed.sql` asigna a cada uno de sus 3 proyectos un color distinto.
- En `packages/shared`:
  - `paletteColor = z.enum([...])`.
  - `projectFields` gana `color: paletteColor`, sin `.default()` (regla de los `*Fields`).
  - `createProjectInput` lo pone por defecto en `'azul'`.
  - El tipo `Project` incluye `color`.
- `lib/api.ts` lee y escribe `color`.

## Colores de los enums

Viven en `packages/shared/src/colors.ts` como mapas `Record<Enum, PaletteColor>`:

| Enum | Mapa |
|---|---|
| `priority` | alta → rojo, media → ambar, baja → gris |
| `taskStatus` | por_hacer → gris, en_curso → azul, hecha → verde |
| `projectStatus` | idea → violeta, en_curso → azul, en_pausa → ambar, completado → verde, archivado → gris |
| `taskType` | Estudio → azul, Trabajo → ambar, Tesis → violeta, Personal → verde, Revisión → cian |
| `habitSlot` | manana → ambar, tarde → rojo, noche → violeta |

Al tiparlos como `Record`, TypeScript obliga a asignar color a cualquier valor nuevo de un enum.

## Componentes (`apps/web/src/components/ui/`)

- **`Select.tsx`**:
  - Envuelve `@radix-ui/react-select` (dependencia nueva).
  - Props: `value`, `onChange(value)`, `options: { value: string; label: string; color?: PaletteColor }[]`, `placeholder?`, `aria-label?`.
  - El trigger usa la clase `.input` actual. Muestra el dot y la etiqueta del valor elegido, más un chevron.
  - La lista se renderiza en un portal sobre `bg-surface` con borde `line`, y marca la opción elegida con ✓.
  - Las opciones sin `color` no llevan dot.
  - Radix no admite `value=""` en un item. Para las opciones vacías ("— Ninguno —" en proyecto, "—" en tipo), `Select` usa internamente un valor centinela `__none__` y lo traduce a `''` en `onChange`.
- **`Dot.tsx`**: un círculo de 8 px con `bg-c-<color>`. Lo reutilizan `Select`, `ColorPicker` y, más adelante, el calendario y el Gantt.
- **`ColorPicker.tsx`**: un radiogroup con los 8 círculos. El elegido lleva un anillo `accent`. Las flechas cambian la selección.

## Dónde se usa

- `TaskModal`: tipo, prioridad, proyecto (con el color de cada proyecto) y estado.
- `ProjectModal`: estado, prioridad y el nuevo `ColorPicker`.
- No queda ningún `<select>` nativo en `apps/web/src`.
- Fuera de alcance: las listas (`Tasks`, `Projects`) no cambian en esta pieza.

## Pruebas

- **vitest (`packages/shared`)**: cada mapa de `colors.ts` cubre todas las opciones de su enum y solo usa claves de `paletteColor`. `createProjectInput` aplica `'azul'` cuando falta `color`, y `updateProjectInput` no lo pisa si no se envía.
- **pgTAP**: el insert de un proyecto con `color = 'fucsia'` falla por el CHECK, y un proyecto sin `color` queda en `azul`.
- **Manual en `pnpm dev`**: abrir los dos modales y comprobar el teclado (flechas, Enter, Esc, búsqueda al teclear), los dots en el trigger y en la lista, los temas claro y oscuro, y el ancho de móvil.

## Despliegue

- La migración se aplica en local (`pnpm db:reset`), luego en dev (`pnpm db:push:dev`) y, al publicar el entregable, en producción (`supabase db push`).
- La migración debe llegar a producción **antes** que el frontend nuevo. Sin la columna, crear o editar un proyecto falla porque `api.ts` escribe `color`. Al leer no hay problema, porque `select('*')` simplemente no lo trae, pero el mapeo de `api.ts` debe usar `'azul'` si llega vacío.
