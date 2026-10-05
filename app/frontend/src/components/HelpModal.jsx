import React from 'react';
import { X, HelpCircle, Mail, Phone, BookOpen, ShieldCheck } from 'lucide-react';
import '../styles/forms.css';

export default function HelpModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', color: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HelpCircle size={22} color="#38BDF8" />
            <h3 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.15rem' }}>Centro de Ayuda y Soporte ATLAS</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} style={{ color: '#94A3B8' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body modal-body-form" style={{ padding: '20px' }}>
          <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={16} color="#1352E6" />
              Preguntas Frecuentes
            </h4>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.82rem', color: '#475569' }}>
              <strong>¿Cómo creo un nuevo movimiento de activo?</strong><br />
              Vaya a la sección <em>Movimientos</em>, seleccione el activo, el usuario destino y registre las observaciones antes de firmar.
            </p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>
              <strong>¿Cómo acepto un activo asignado?</strong><br />
              Revise su bandeja en <em>Aceptaciones</em>, valide las condiciones del equipo y firme el acta digital correspondiente.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '14px', borderRadius: '10px', background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Mail size={16} color="#0284C7" />
                <strong style={{ fontSize: '0.86rem', color: '#0369A1' }}>Soporte Técnico</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#0C4A6E' }}>soporte@activos.com</p>
              <span style={{ fontSize: '0.72rem', color: '#0284C7', fontWeight: 600 }}>Atención 24/7</span>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Phone size={16} color="#16A34A" />
                <strong style={{ fontSize: '0.86rem', color: '#15803D' }}>Mesa de Ayuda</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#14532D' }}>Extensión: 101 - 105</p>
              <span style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 600 }}>Lun - Vie (8am - 6pm)</span>
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#64748B' }}>
            <ShieldCheck size={16} color="#10B981" />
            <span>Sistema Atlas v2.4 — SEAPTO S.A. & Integral World Solutions</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
