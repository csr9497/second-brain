import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { todayISO } from '@sb/shared';
import { esquemaJson, HERRAMIENTAS, validarEntrada, type NombreHerramienta } from '@sb/shared/herramientas';
import { ejecutores, type PuenteUI } from './ejecutar';

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const texto = (datos: object, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify({ hoy: todayISO(), tz: tz(), ...datos }) }], isError });

/** Token del origin trial (producción); en local se usa el flag de Chrome. Debe estar antes de usar la API. */
function activarOriginTrial() {
  const token = import.meta.env.VITE_WEBMCP_OT_TOKEN;
  if (!token || document.querySelector('meta[http-equiv="origin-trial"]')) return;
  const meta = document.createElement('meta');
  meta.httpEquiv = 'origin-trial';
  meta.content = token;
  document.head.append(meta);
}

async function ejecutar(nombre: NombreHerramienta, args: unknown, qc: QueryClient, ui: PuenteUI) {
  const v = validarEntrada(nombre, args);
  if (!v.ok) return texto({ error: v.error }, true);
  try {
    const datos = await (ejecutores(ui)[nombre] as (a: unknown) => Promise<object>)(v.datos);
    // Lo escrito por un agente aparece en la pantalla sin recargar
    if (HERRAMIENTAS[nombre].nivel > 0) void qc.invalidateQueries();
    return texto(datos);
  } catch (e) {
    return texto({ error: e instanceof Error ? e.message : String(e) }, true);
  }
}

/**
 * Registra el catálogo en WebMCP (`document.modelContext`) si el navegador lo soporta.
 * Devuelve la función que las desregistra (al cerrar sesión), o null si no hay WebMCP.
 */
export function registrarHerramientas(qc: QueryClient, ui: PuenteUI): (() => void) | null {
  activarOriginTrial();
  const mc = document.modelContext;
  if (!mc) return null;
  const ctrl = new AbortController();
  for (const def of Object.values(HERRAMIENTAS)) {
    const nombre = def.name as NombreHerramienta;
    Promise.resolve(
      mc.registerTool(
        {
          name: nombre,
          description: def.description,
          inputSchema: esquemaJson(def),
          // Todas devuelven texto escrito por el usuario (títulos, notas, ideas). Las de interfaz cambian la pantalla.
          annotations: { readOnlyHint: def.nivel === 0 && !def.interfaz, untrustedContentHint: true },
          execute: (args) => ejecutar(nombre, args, qc, ui),
        },
        { signal: ctrl.signal },
      ),
    ).catch((e) => console.warn(`WebMCP: no se pudo registrar ${nombre}`, e));
  }
  return () => ctrl.abort();
}

/** Herramientas disponibles mientras haya sesión (Home montado). `ui` puede cambiar en cada render. */
export function useWebMcp(ui: PuenteUI) {
  const qc = useQueryClient();
  const ref = useRef(ui);
  ref.current = ui;
  useEffect(
    () =>
      registrarHerramientas(qc, {
        abrirTarea: (t) => ref.current.abrirTarea(t),
        nuevaTarea: (i) => ref.current.nuevaTarea(i),
        irA: (v) => ref.current.irA(v),
      }) ?? undefined,
    [qc],
  );
}
