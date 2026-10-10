# App de Mac (M2): avisos nativos

Avisos de hábitos como notificaciones del sistema en la app de Mac, con las mismas horas por franja que los avisos Web Push (🔔 Avisos, `recordatorios_config`).

## Diseño

- **La web calcula y Swift programa.** `avisosDelDia(today, config, ahora)` (`@sb/shared`, `domain/avisos.ts`, con tests) devuelve un aviso por franja con:
  - hora configurada;
  - hábitos pendientes en `today.habits.porFranja`, con los turnos «o» repetidos contados una sola vez;
  - una hora todavía por venir.
- **Texto:** el mismo que la Edge Function (`textoAviso`): «Tarde · te faltan 2» / «Agua, Leer», hasta 4 nombres y luego +n.
- **Hora:** la del día de Hoy (`today.date`, el día de la jornada). Una hora anterior a `fin_dia` cae en la madrugada siguiente, como en `recordatorios_por_enviar`.
- **Envío a Swift:** `useAvisosMac` (solo en la Mac) observa `['today']` y `['avisos']` y manda la lista con `programarAvisos` (`avisosMac`, `lib/nativo/plataforma.ts`) cada vez que cambia.
- **Programación:** `Mac/Avisos.swift` reemplaza los avisos programados (prefijo `aviso-`) con `UNCalendarNotificationTrigger`, a una fecha y hora de reloj. Si la Mac duerme, el aviso sale al despertar.
- **Consecuencias:**
  - Marcar los hábitos de una franja recalcula la lista y quita su aviso.
  - Desactivar los avisos o cerrar sesión los quita todos.
  - Llegan aunque la app esté cerrada, con el texto del último cálculo.
- **Con la app al frente** el aviso también se muestra. Tocarlo abre la ventana en Hoy (`Ventana.mostrar`).
- **Abrir la ventana desde fuera de SwiftUI:** `openWindow` lo deja la etiqueta de la barra de menús (`Ventana.abrir`). Lo usan los avisos, el Dock y tocar un widget (`applicationShouldHandleReopen`).
- **En el modal 🔔 de la Mac** se explica que los avisos son nativos y que conviene desactivar los de Safari en esa Mac para no recibirlos dos veces.

## Pruebas

- **vitest:** `avisos.test.ts` (texto, franjas con hora y pendientes, solo las futuras, desactivado o sin configuración, turno «o» repetido, `fin_dia`) y `avisosMac` en `plataforma.test.ts`.
- **En vivo** contra dev, con una configuración temporal de tarde 17:00 y noche 21:30:
  - quedaron programados `aviso-2026-10-10-tarde` («Tarde · te faltan 3») a las 22:00 Z y `aviso-2026-10-10-noche` a las 02:30 Z;
  - al borrar la configuración, la app los quitó.
- **Pendiente (Cesar):** permitir las notificaciones de Second Brain en Ajustes del Sistema (en la prueba estaban **denegadas**) y ver llegar uno.
