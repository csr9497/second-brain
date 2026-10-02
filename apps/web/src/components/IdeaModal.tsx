import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal, ModalActions } from './Modal';
import { useToast } from './Toast';

export function IdeaModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const ideas = useQuery({ queryKey: ['ideas'], queryFn: api.ideas });
  const create = useMutation({
    mutationFn: api.createIdea,
    onSuccess: () => {
      setTexto('');
      toast('⚡ Idea guardada');
      qc.invalidateQueries({ queryKey: ['ideas'] });
    },
    onError: (err) => toast(`⚠ ${err.message}`),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (texto.trim()) create.mutate(texto.trim());
  }

  return (
    <Modal title="⚡ Captura rápida" hint="Suéltala aquí; la ordenas después en la revisión." onClose={onClose}>
      <form onSubmit={submit} className="mb-3.5 flex gap-2">
        <input className="input flex-1" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nueva idea…" />
        <button className="btn btn-primary" disabled={create.isPending || !texto.trim()}>
          Añadir
        </button>
      </form>
      {ideas.data?.map((i) => (
        <div key={i.id} className="mb-2 flex items-start gap-[9px] rounded-[9px] border border-line bg-surface2 px-[11px] py-[9px] text-[13px]">
          <span className="flex-none text-faint">💡</span>
          <span>{i.texto}</span>
        </div>
      ))}
      <ModalActions>
        <button className="btn" onClick={onClose}>
          Cerrar
        </button>
      </ModalActions>
    </Modal>
  );
}
