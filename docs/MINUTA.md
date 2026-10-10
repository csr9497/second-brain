# Minuta

Último commit registrado: 5052d64 (2026-10-10)

## Pendientes
### En curso
- [ ] Duración de la tarea: probar en el navegador y en el iPhone (instalar desde Xcode)
- [ ] Probar en el iPhone: color «enviando» y fallo al tocar la card, hábitos de la noche pasada la medianoche con «El día termina» configurado, y jalar hacia abajo para actualizar
- [ ] App de Mac (M1–M3 y mejoras, rama `feat/mac-widgets`): fusionar el PR y probar en la Mac lo que pide la checklist de `docs/APP-MAC.md` (permitir notificaciones, widgets grande/Racha/configurable, ⌃⌥Espacio, «Marcar todos», ✓ del widget con la app cerrada, atajos)
- [ ] Regla nueva de Hoy (tareas con pasos solo si uno cae hoy): llega a Pages y al iPhone al fusionar; reinstalar la app de iOS desde Xcode
### Siguiente
- [ ] Roadmap v2 (informe `files/deep-research-report.md`): Etapas 7–21, empezando por historial + Deshacer (el agente WebMCP escribe sin undo) y la línea base de check-ins
- [ ] App nativa, fase 2 (requiere Apple Developer de pago): la card se actualiza sola desde el servidor por APNs, push-to-start a la hora de la franja, TestFlight y avisos nativos
### Backlog
- [ ] Fase 6 (resto): Resumen navegar a meses anteriores y tendencia; guardar cambios sin conexión (hoy solo se puede mirar)
- [ ] Fase W: borrados con confirmación (nivel 3) en WebMCP
- [ ] Fase W: proponer pasos en el planificador desde un agente
- [ ] Fase W: servidor MCP (variantes B y C de `docs/MCP.md`)

## Realizado
### 2026-10-10
- Hoy: una tarea con pasos programados solo sale si uno de sus pasos cae hoy (o vence hoy); antes salía en todo su rango y la card, la barra y los widgets la mostraban como «paso de hoy» (0e9f6ec)
- App de Mac M2: avisos de hábitos como notificaciones del sistema con las horas de 🔔 Avisos, «Marcar todos» y «En 30 min», aviso diario de tareas que vencen y proyectos parados; el modal 🔔 y la barra avisan si las notificaciones están desactivadas (112658a, 68f2746)
- App de Mac M3: widgets por App Group (Hoy configurable en pequeño, mediano y grande; Racha), que respetan el cambio de franja; un ✓ del widget abre la app en segundo plano y la marca «enviando» caduca a los 20 s; «Second Brain Dev» separado de producción (e97fbcb…618d390, 68f2746, 40b9cec)
- Barra de la Mac: semanales, captura rápida (también ⌃⌥Espacio), «…» al cambiar de franja y datos guardados sin conexión; al iniciar sesión en la Mac arranca sin ventana (68f2746)
- iOS: la card caduca en el cambio de franja (`staleDate`) y no muestra los hábitos de la franja anterior (68f2746)
- Web: arranca sin conexión con el último Hoy guardado (c89d70f) y atajos de teclado `n c 1–4 j k x e ?` (7369b76)
- El texto del aviso Web Push vive en `supabase/functions/recordatorios/texto.ts` con un test de contrato contra `textoAviso` (ac37d35); CI en cada PR con tests de la app de Mac en macOS (3b4ff96)
- App de Mac M1 (target `SecondBrainMac`, sin Capacitor): `WKWebView` persistente con el build `native` por `app://localhost`, puente `sbMac` con el mismo contrato que iOS, barra de menús con el % del día, hábitos de la franja y pasos de hoy (se refresca al abrir, al despertar y en `proximaFranja`), marcas compartidas con la Live Activity (`Marcas.swift`/`EstadoCard.swift`), XCTest y runbook `docs/APP-MAC.md` (abb9679…8621bdf)
- Duración de la tarea: `tasks.minutos_dia` («h/día», 8 h por defecto). Los pasos se miden contra días × h/día: presupuesto en el modal; un paso solo con tiempo toma el inicio de la tarea y uno con fecha sin días dura hasta el deadline; Encadenar llena el día de trabajo de la tarea y avisa de los que no caben; el calendario y el Gantt con zoom usan esa escala. El contrato para la app móvil y la de escritorio está en `docs/DATA-MODEL.md`. WebMCP aplica las mismas reglas. Migración en dev y producción; Tests: 187 vitest y 103 pgTAP (PR #7, 324c7f3)
### 2026-10-09
- Card de la Live Activity: el botón pasa a «enviando» al tocar sin esperar la red, luego hecho o «fallo» 2,5 s; ediciones serializadas y timeout de 10 s (3aa360b)
- Jornada configurable (tabla `jornada`, migración aplicada en dev y producción): inicio de tarde y noche y hora en que termina el día (≤ 06:00); antes de esa hora sigue siendo la noche del día anterior en toda la app, los triggers, los avisos y la card; se edita en Gestionar hábitos → Franjas del día; 14 tests pgTAP nuevos (3aa360b)
- Pasos del modal de tarea en una fila compacta (⠿ nombre · chip · ✕): un paso sin fecha es un pendiente simple, el chip abre fecha/rango y tiempo estimado, Enter añade otro paso (a0ca623)
- PR #4 (app nativa con Live Activity) fusionado y publicado en Pages (e65e60c)
- Team de firma en `project.yml` (8a2e9a0) y jalar hacia abajo para actualizar en la app nativa con el indicador de iOS (efe810a), en la rama `feat/refresco-nativo`
### 2026-10-08
- Fase 5 en producción: PR #1 (WebMCP) y PR #2 (avisos + PWA) fusionados y publicados en Pages; migración `recordatorios`, Edge Function desplegada, Vault configurado, cron activo (respuesta 200), prueba en iPhone OK
- Interfaz móvil y vista Resumen (PR #3, fusionado): arreglo responsive del calendario; burbujas de hábitos en Hoy con título «Hábitos»; vista Resumen (semana + mes con mapa de calor); botón Crear + (fila de pestañas en escritorio, flotante en móvil) con modal para elegir qué crear; detalle de paso en el Gantt (PasoModal); revisiones de código aplicadas (936da0c, ea68309, 25fe3b0, 05c5c2d, 8f405d6, da0ae85, 33781d4, 39bd656, fc9a459)
- Diseño de Live Activities hecho en lienzo, Variante A elegida
- App nativa (prototipo, cuenta gratuita): Capacitor 8 por SPM con XcodeGen, plugin `LiveActivity`, extensión SwiftUI con la Variante A en bloqueo e isla, botones que escriben por PostgREST con la sesión del Keychain y rotación del refresh token (5d8abb9…d088144)
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
