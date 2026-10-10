import AppKit
import SwiftUI

/// Menús Archivo y Ver. Si la ventana está cerrada, primero la abren.
struct Comandos: Commands {
    let web: Web
    @Environment(\.openWindow) private var abrir

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("Nueva tarea") { hacer("nueva-tarea") }.keyboardShortcut("n")
            Button("Crear…") { hacer("crear") }.keyboardShortcut("n", modifiers: [.command, .shift])
        }
        CommandGroup(before: .toolbar) {
            Button("Hoy") { hacer("ir:hoy") }.keyboardShortcut("1")
            Button("Calendario") { hacer("ir:calendario") }.keyboardShortcut("2")
            Button("Gantt") { hacer("ir:gantt") }.keyboardShortcut("3")
            Button("Resumen") { hacer("ir:resumen") }.keyboardShortcut("4")
            Divider()
            Button("Actualizar") { web.refrescar() }.keyboardShortcut("r")
            Divider()
        }
    }

    private func hacer(_ accion: String) {
        abrir(id: Delegado.ventana)
        NSApp.activate()
        Task { await web.accion(accion) }
    }
}
