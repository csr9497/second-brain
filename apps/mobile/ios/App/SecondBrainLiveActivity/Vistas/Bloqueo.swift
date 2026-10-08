import SwiftUI
import WidgetKit

/// Pantalla de bloqueo, Variante A. El sistema recorta la card a unos 160 pt de alto, así que hay dos disposiciones:
/// - con burbujas (franja pendiente): cabecera 22 + burbujas y anillo ~66 + 1 paso 38 ≈ 160 pt con márgenes;
///   los pasos que no caben van en «+N ›» dentro de la fila del paso.
/// - sin burbujas (franja completa o sin hábitos): cabecera + hasta 2 pasos + «Ver N más ›» ≈ 156 pt.
struct VistaBloqueo: View {
    var estado: EstadoCard

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Cabecera(estado: estado)
            if estado.diaCompleto {
                DiaCompleto(pct: estado.pct)
            } else if estado.mostrarBurbujas {
                HStack(alignment: .top, spacing: 12) {
                    FilaBurbujas(habitos: estado.habitos, tamano: 46, conNombre: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(spacing: 2) {
                        Anillo(pct: estado.pctDia, tamano: 56, grosor: 6, tamanoTexto: 14)
                        Text("del día").font(.system(size: 11)).foregroundStyle(Tema.tenue)
                    }
                    .padding(.top, -5)
                }
                if let paso = estado.pasos.first {
                    FilaPaso(paso: paso, extra: estado.totalPasos - 1)
                }
            } else {
                let visibles = Array(estado.pasos.prefix(2))
                ForEach(visibles, id: \.self) { paso in
                    FilaPaso(paso: paso)
                }
                let ocultos = estado.totalPasos - visibles.count
                if ocultos > 0 {
                    Link(destination: Tema.enlaceHoy) {
                        HStack(spacing: 4) {
                            Text("Ver \(ocultos) más")
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold))
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Tema.acento)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
    }
}

struct Cabecera: View {
    var estado: EstadoCard

    var body: some View {
        HStack(spacing: 10) {
            Glifo()
            Text("Second Brain")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Tema.suave)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 6) {
                if estado.diaCompleto {
                    Text("Día completo").font(.system(size: 14, weight: .semibold)).foregroundStyle(Tema.texto)
                    CheckRelleno(tamano: 18)
                } else {
                    Text(estado.nombreFranja).font(.system(size: 14, weight: .semibold)).foregroundStyle(Tema.texto)
                    if estado.franjaCompleta {
                        CheckRelleno(tamano: 18)
                        Text("· \(estado.pct) % del día").font(.system(size: 13)).foregroundStyle(Tema.tenue)
                    }
                }
            }
            .fixedSize()
        }
        .frame(height: 22)
    }
}

struct DiaCompleto: View {
    var pct: Int

    var body: some View {
        HStack(spacing: 12) {
            CheckRelleno(tamano: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Nada pendiente por hoy").font(.system(size: 15, weight: .medium)).foregroundStyle(Tema.texto)
                Text("\(pct) % del día").font(.system(size: 13)).foregroundStyle(Tema.tenue)
            }
        }
        .padding(.vertical, 6)
    }
}
