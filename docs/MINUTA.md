# Minuta

Último commit registrado: fc9a459 (2026-10-08)

## Pendientes
### En curso
- [ ] Fusionar PR #3 (`feat/movil-resumen` → `main`) con interfaz móvil y vista Resumen
### Siguiente
- [ ] Spec y plan: app nativa con Live Activities (Capacitor + extensión Swift + APNs, requiere cuenta Apple Developer)
- [ ] Fase 6: offline básico, nudge de proyectos/deadlines, Resumen navegar a meses anteriores y tendencia
### Backlog
- [ ] Fase W: borrados con confirmación (nivel 3) en WebMCP
- [ ] Fase W: proponer pasos en el planificador desde un agente
- [ ] Fase W: servidor MCP (variantes B y C de `docs/MCP.md`)

## Realizado
### 2026-10-08
- Fase 5 en producción: PR #1 (WebMCP) y PR #2 (avisos + PWA) fusionados y publicados en Pages; migración `recordatorios`, Edge Function desplegada, Vault configurado, cron activo (respuesta 200), prueba en iPhone OK
- Interfaz móvil en código (PR #3 abierto, no en producción): arreglo responsive del calendario; burbujas de hábitos en Hoy con título «Hábitos»; vista Resumen (semana + mes con mapa de calor); botón Crear + (fila de pestañas en escritorio, flotante en móvil) con modal para elegir qué crear; detalle de paso en el Gantt (PasoModal); revisiones de código aplicadas (936da0c, ea68309, 25fe3b0, 05c5c2d, 8f405d6, da0ae85, 33781d4, 39bd656, fc9a459)
- Diseño de Live Activities hecho en lienzo, Variante A elegida
### 2026-10-07
- Fase 5 completada en código (rama `feat/alertas-pwa`): spec y plan de PWA + avisos; migración `recordatorios` con suscripciones por dispositivo, horas por franja (hasta 23:45), enviados y tabla de `recordatorios_por_enviar()` con 17 tests pgTAP (0cd2f41…851c9a0); Edge Function `recordatorios` con Web Push, aviso de prueba, manejo de franjas múltiples y solo clic en ventanas de la app (ed369cc…ee353f8); PWA instalable con service worker propio, precache e íconos; modal de Avisos con activación, horas por franja, prueba y dispositivos; docs (ALERTAS.md, PRD, ROADMAP, CLAUDE.md); revisiones de código aplicadas (61d6b95, 0a86e06, 43695ba, 52b4173)
- Agente `minuta` y esta minuta
### 2026-10-06
- Modal de tarea grande con planificador (calendario y Gantt), nombre editable, secciones colapsables y crear pasos seleccionando días (7f7e76f…c18240c)
- Confirmaciones propias sin `window.confirm` y guardia de navegación asíncrona (521262d)
- Calendario mensual con barras continuas y creación de tareas desde un rango (b767458…de955b4)
- Gantt de solo lectura y modo edición con guardado atómico (`aplicar_plan`) (3992797…7b285e2)
- Pasos programados con fecha y duración en días, encadenar y fuera de plazo (cd02619…b26a735)
- Hábitos: CRUD, periodos de vigencia, turnos (y/o) y racha por turnos (8a8c9ab…6f919f8)
### 2026-10-05
- Ambiente dev en Supabase nube y modos de Vite (d390814)
- Color por proyecto y Select con dots (Radix) en los modales (165abbc…8b89417)
### 2026-10-02
- Base de la app sobre Supabase + GitHub Pages, fases 0–4 (b866e37)
