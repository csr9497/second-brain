# Minuta

Último commit registrado: 52b4173 (2026-10-07)

## Pendientes
### En curso
- [ ] Fusionar PR #1 (`feat/webmcp` → `main`) para publicar en Pages. Las migraciones ya están en producción.
- [ ] Fase 5: desplegar avisos (dev: `db:push:dev`, secrets, Edge Function, Vault; prod tras fusionar) e iterar con pruebas en navegador, escritorio e iPhone. Rama `feat/alertas-pwa`, sin PR todavía.
- [ ] Fase 6: offline básico para marcar hábitos y sincronizar (PWA instalable ya hecha en código).
### Siguiente
- [ ] Fase 6: nudge de proyectos sin avanzar y avisos de deadlines.
- [ ] Fase 6: métricas históricas (tendencia de hábitos y cumplimiento por mes).
### Backlog
- [ ] Fase W: borrados con confirmación (nivel 3) en WebMCP.
- [ ] Fase W: proponer pasos en el planificador desde un agente.
- [ ] Fase W: servidor MCP (variantes B y C de `docs/MCP.md`).

## Realizado
### 2026-10-07
- Fase 5 completada en código (rama `feat/alertas-pwa`, sin PR ni despliegue): spec y plan de PWA + avisos; migración `recordatorios` con suscripciones por dispositivo, horas por franja (hasta 23:45), enviados y tabla de `recordatorios_por_enviar()` con 17 tests pgTAP (0cd2f41…851c9a0); Edge Function `recordatorios` con Web Push, aviso de prueba, manejo de franjas múltiples y solo clic en ventanas de la app (ed369cc…ee353f8); PWA instalable con service worker propio, precache e íconos; modal de Avisos con activación, horas por franja, prueba y dispositivos; docs (ALERTAS.md, PRD, ROADMAP, CLAUDE.md); revisiones de código aplicadas (61d6b95, 0a86e06, 43695ba, 52b4173).
- Agente `minuta` y esta minuta.
- PR #1 abierto: WebMCP, pasos por tiempo, zoom y Hoy por tarea. Aún no está en producción.
### 2026-10-06
- Modal de tarea grande con planificador (calendario y Gantt), nombre editable, secciones colapsables y crear pasos seleccionando días (7f7e76f…c18240c).
- Confirmaciones propias sin `window.confirm` y guardia de navegación asíncrona (521262d).
- Calendario mensual con barras continuas y creación de tareas desde un rango (b767458…de955b4).
- Gantt de solo lectura y modo edición con guardado atómico (`aplicar_plan`) (3992797…7b285e2).
- Pasos programados con fecha y duración en días, encadenar y fuera de plazo (cd02619…b26a735).
- Hábitos: CRUD, periodos de vigencia, turnos (y/o) y racha por turnos (8a8c9ab…6f919f8).
### 2026-10-05
- Ambiente dev en Supabase nube y modos de Vite (d390814).
- Color por proyecto y Select con dots (Radix) en los modales (165abbc…8b89417).
### 2026-10-02
- Base de la app sobre Supabase + GitHub Pages, fases 0–4 (b866e37).
