import Modal from '../Modal';
import StatusPill from '../StatusPill';
import { ExternalLink, Pencil } from 'lucide-react';
import { estadoPill, urgenciaPill, fmtFecha, MKT_ACCENT } from './constants';

function LinkRow({ label, url }) {
  if (!url) return null;
  const isHttp = /^https?:\/\//i.test(url);
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] text-text3 w-28 shrink-0 pt-0.5">{label}</span>
      {isHttp ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-[12px] text-blue hover:underline break-all flex items-center gap-1">
          {url.length > 60 ? url.slice(0, 60) + '…' : url} <ExternalLink size={11} className="shrink-0" />
        </a>
      ) : (
        <span className="text-[12px] text-text2 break-all">{url}</span>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] text-text3 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-[12px] text-text whitespace-pre-wrap">{value}</span>
    </div>
  );
}

// Vista de lectura de un ticket, con enlaces clickeables. Botón para editar.
export default function TicketDetail({ ticket, onClose, onEdit }) {
  if (!ticket) return null;
  return (
    <Modal
      open={!!ticket}
      onClose={onClose}
      maxWidth={620}
      title={ticket.code || 'Ticket'}
      headerExtra={
        <button onClick={() => onEdit(ticket)}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer mr-1"
          style={{ background: MKT_ACCENT }}>
          <Pencil size={12} /> Editar
        </button>
      }
    >
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[15px] font-bold">{ticket.client_name || 'Sin cliente'}</span>
        <StatusPill text={ticket.estado} pillClass={estadoPill(ticket.estado)} />
        {ticket.urgencia && <StatusPill text={ticket.urgencia} pillClass={urgenciaPill(ticket.urgencia)} />}
      </div>

      {ticket.cambio_solicitado && (
        <div className="bg-surface2 rounded-lg p-3 mb-3">
          <div className="text-[10px] uppercase tracking-wide text-text3 font-semibold mb-1">Cambio solicitado</div>
          <div className="text-[13px] text-text whitespace-pre-wrap">{ticket.cambio_solicitado}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 max-md:grid-cols-1">
        <InfoRow label="Categoría" value={ticket.categoria} />
        <InfoRow label="Fase" value={ticket.fase} />
        <InfoRow label="Sección" value={ticket.seccion} />
        <InfoRow label="Encargado" value={ticket.encargado} />
        <InfoRow label="Solicitado por" value={ticket.solicitado_por} />
        <InfoRow label="Fecha subida" value={fmtFecha(ticket.fecha_subida)} />
        <InfoRow label="Fecha entrega" value={fmtFecha(ticket.fecha_entrega)} />
        {ticket.dias_empleados != null && <InfoRow label="Días empleados" value={String(ticket.dias_empleados)} />}
      </div>

      <div className="mt-3">
        <LinkRow label="Landing" url={ticket.landing_url} />
        <LinkRow label="Referencia" url={ticket.referencia} />
        <LinkRow label="Docs / Notas" url={ticket.docs_notas} />
        <LinkRow label="Resultado" url={ticket.imagen_resultado} />
      </div>

      {ticket.comentarios && <InfoRow label="Comentarios" value={ticket.comentarios} />}
    </Modal>
  );
}
