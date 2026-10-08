import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SLOT_NOMBRE, type HabitSlot } from '@sb/shared';
import { api, type AvisosConfig, type Dispositivo } from '../lib/api';
import { desuscribir, endpointActual, estadoPush, suscribir, type EstadoPush } from '../lib/push';
import { Field, Modal, ModalActions } from './Modal';
import { useToast } from './Toast';
import { confirmar } from './ui/Confirmar';

const FRANJAS: HabitSlot[] = ['manana', 'tarde', 'noche'];
const POR_DEFECTO: AvisosConfig = { activo: true, horas: { manana: '11:00', tarde: '17:00', noche: '21:30' } };

const MENSAJE: Record<Exclude<EstadoPush, 'activo' | 'inactivo'>, string> = {
  nativo:
    'En la app, los avisos llegan por la PWA instalada (Safari → Agregar a inicio). La card en vivo de la pantalla de bloqueo se activa al abrir la app.',
  'sin-soporte': 'Este navegador no admite notificaciones push.',
  instalar: 'En iPhone, instala la app para recibir avisos: Compartir → «Agregar a inicio», y ábrela desde ahí.',
  bloqueado: 'Bloqueaste las notificaciones de este sitio. Actívalas en los ajustes del navegador.',
};

/** «iPhone · Safari», «Mac · Chrome»… a partir del user agent. */
function nombreDispositivo(ua: string) {
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return nav ? `${so} · ${nav}` : so;
}

export function AvisosModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const avisos = useQuery({ queryKey: ['avisos'], queryFn: api.avisos });
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [actual, setActual] = useState<string | null>(null);
  const [config, setConfig] = useState<AvisosConfig | null>(null);

  const refrescarDispositivo = async () => {
    setEstado(await estadoPush());
    setActual(await endpointActual());
  };
  useEffect(() => {
    void refrescarDispositivo();
  }, []);
  // El formulario parte de lo guardado (o de los valores por defecto) una sola vez
  useEffect(() => {
    if (avisos.data && !config) setConfig(avisos.data.config ?? POR_DEFECTO);
  }, [avisos.data, config]);

  const alTerminar = (msg: string) => () => {
    toast(msg);
    qc.invalidateQueries({ queryKey: ['avisos'] });
    void refrescarDispositivo();
  };
  const onError = (err: Error) => toast(`⚠ ${err.message}`);

  const activar = useMutation({
    mutationFn: async () => {
      await api.suscribir(await suscribir());
      // Sin configuración guardada, activar el primer dispositivo guarda las horas por defecto
      // (solo si la consulta respondió: con ella cargando o fallida pisaría las horas guardadas)
      if (avisos.isSuccess && !avisos.data.config) await api.guardarAvisos(config ?? POR_DEFECTO);
    },
    onSuccess: alTerminar('🔔 Avisos activados en este dispositivo'),
    onError,
  });
  const desactivar = useMutation({
    mutationFn: async () => {
      const endpoint = await desuscribir();
      if (endpoint) await api.quitarEndpoint(endpoint);
    },
    onSuccess: alTerminar('Avisos desactivados en este dispositivo'),
    onError,
  });
  const guardar = useMutation({ mutationFn: api.guardarAvisos, onSuccess: alTerminar('✓ Horas guardadas'), onError });
  const quitar = useMutation({
    mutationFn: async (d: Dispositivo) => {
      if (d.endpoint === actual) await desuscribir();
      await api.quitarDispositivo(d.id);
    },
    onSuccess: alTerminar('Dispositivo quitado'),
    onError,
  });
  const probar = useMutation({
    mutationFn: api.probarAviso,
    onSuccess: (n) => toast(n ? `📨 Prueba enviada a ${n} dispositivo${n === 1 ? '' : 's'}` : '⚠ No hay dispositivos suscritos'),
    onError,
  });

  // Suscrito en el navegador pero sin fila (lo quitaron desde otro dispositivo o se recreó la base): el cron
  // no le enviaría nada, así que se ofrece activar de nuevo (vuelve a guardar la misma suscripción)
  const registrado = !avisos.isSuccess || avisos.data.dispositivos.some((d) => d.endpoint === actual);
  const visible = estado === 'activo' && !registrado ? 'inactivo' : estado;

  const setHora = (f: HabitSlot, v: string | null) => setConfig((c) => c && { ...c, horas: { ...c.horas, [f]: v } });

  return (
    <Modal title="🔔 Avisos" hint="Un recordatorio por franja si te quedan hábitos sin marcar." onClose={onClose}>
      <Field label="Este dispositivo" group>
        {visible === null ? null : visible === 'activo' ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>✓ Recibe avisos</span>
            <button className="btn" onClick={() => desactivar.mutate()} disabled={desactivar.isPending}>
              Desactivar aquí
            </button>
          </div>
        ) : visible === 'inactivo' ? (
          <button className="btn btn-primary" onClick={() => activar.mutate()} disabled={activar.isPending}>
            Activar avisos aquí
          </button>
        ) : (
          <p className="m-0 text-sm text-muted">{MENSAJE[visible]}</p>
        )}
      </Field>

      {avisos.isError && <p className="m-0 mb-3 text-sm text-hot">⚠ No se pudieron cargar los avisos: {avisos.error.message}</p>}

      {config && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate(config);
          }}
        >
          <Field label="Horas" group>
            <label className="mb-2.5 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.activo} onChange={(e) => setConfig({ ...config, activo: e.target.checked })} />
              Recordatorios activos
            </label>
            {FRANJAS.map((f) => (
              <div key={f} className="mb-2 flex items-center gap-2">
                <span className="w-20 text-sm">{SLOT_NOMBRE[f]}</span>
                <input
                  type="time"
                  max="23:45"
                  className="input w-32"
                  aria-label={`Hora del aviso de ${SLOT_NOMBRE[f]}`}
                  value={config.horas[f] ?? ''}
                  disabled={!config.activo}
                  onChange={(e) => setHora(f, e.target.value || null)}
                />
                {config.horas[f] == null ? (
                  <span className="text-xs text-faint">sin aviso</span>
                ) : (
                  <button type="button" className="text-xs text-muted hover:text-text" disabled={!config.activo} onClick={() => setHora(f, null)}>
                    quitar
                  </button>
                )}
              </div>
            ))}
            <p className="m-0 text-xs text-faint">Hasta las 23:45. Si guardas tarde, solo se avisa la franja más reciente.</p>
          </Field>
          <ModalActions>
            <button type="button" className="btn" onClick={() => probar.mutate()} disabled={probar.isPending}>
              Enviar prueba
            </button>
            <button className="btn btn-primary" disabled={guardar.isPending}>
              Guardar horas
            </button>
          </ModalActions>
        </form>
      )}

      {!!avisos.data?.dispositivos.length && (
        <Field label="Dispositivos" group>
          {avisos.data.dispositivos.map((d) => (
            <div key={d.id} className="mb-2 flex items-center justify-between gap-2 rounded-[9px] border border-line bg-surface2 px-[11px] py-[9px] text-[13px]">
              <span>
                {nombreDispositivo(d.userAgent)}
                {d.endpoint === actual && <span className="text-faint"> · este</span>}
                <span className="block text-xs text-faint">desde {new Date(d.createdAt).toLocaleDateString()}</span>
              </span>
              <button
                className="text-xs text-muted hover:text-text"
                aria-label={`Quitar ${nombreDispositivo(d.userAgent)}`}
                disabled={quitar.isPending}
                onClick={async () => {
                  if (await confirmar({ titulo: '¿Quitar este dispositivo?', mensaje: 'Dejará de recibir avisos.', aceptar: 'Quitar', cancelar: 'Cancelar' }))
                    quitar.mutate(d);
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </Field>
      )}
    </Modal>
  );
}
