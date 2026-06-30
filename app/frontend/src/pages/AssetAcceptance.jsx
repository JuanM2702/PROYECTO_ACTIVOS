import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Signature, CheckCircle, XCircle, Clock, Check, X, FileText, Download } from 'lucide-react';
import { useAuth } from '../App';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import '../styles/forms.css';
import '../styles/layout.css';

export default function AssetAcceptance() {
  const { user, showToast } = useAuth();
  
  const [acceptances, setAcceptances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDIENTE');
  const [showSignModal, setShowSignModal] = useState(false);
  const [selectedAct, setSelectedAct] = useState(null);
  const [decision, setDecision] = useState('ACEPTADO');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sigCanvasRef = useRef(null);

  const fetchAcceptances = async () => {
    try {
      const response = await axios.get('/api/acceptances');
      if (response.data.success) {
        setAcceptances(response.data.acceptances);
      }
    } catch (err) {
      showToast('Error al obtener bandeja de firmas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAcceptances();
  }, []);

  const handleOpenSign = (acta) => {
    setSelectedAct(acta);
    setDecision('ACEPTADO');
    setComments('');
    setShowSignModal(true);
  };

  const handleSign = async (e) => {
    e.preventDefault();
    if (!selectedAct) return;

    setSubmitting(true);
    try {
      const response = await axios.put(`/api/acceptances/${selectedAct.id}`, {
        status: decision,
        comments
      });

      if (response.data.success) {
        generateAcceptancePDF(selectedAct, decision, comments);
        showToast(`El acta de recepción fue firmada y clasificada como ${decision.toLowerCase()}.`, 'success');
        setShowSignModal(false);
        fetchAcceptances();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al firmar acta de entrega.';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const generateAcceptancePDF = (act, status, obs) => {
    const doc = new jsPDF('portrait', 'mm', 'letter');
    
    doc.setFillColor(0, 130, 63);
    doc.rect(0, 0, 220, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('ACTA DE ENTREGA Y RECEPCIÓN DE ACTIVO', 14, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date().toLocaleString('es-CO')}`, 14, 23);
    doc.text(`Estado: ${status}`, 140, 23);

    let y = 40;
    doc.setTextColor(0, 0, 0);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalles del Activo', 14, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const details = [
      ['Código', act.asset_code],
      ['Nombre', act.asset_name],
      ['Categoría', act.asset_category],
      ['Ubicación', act.asset_location],
      ['Valor Comercial', `$${Number(act.asset_value).toLocaleString('es-CO')}`],
      ['Fecha de Asignación', new Date(act.assigned_date).toLocaleDateString('es-CO', { dateStyle: 'long' })],
      ['Asignado a', act.assignee_name || user?.fullName || 'N/A'],
    ];

    details.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 60, y);
      y += 7;
    });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Decisión de Recepción:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(status === 'ACEPTADO' ? 0 : 200, status === 'ACEPTADO' ? 130 : 0, status === 'ACEPTADO' ? 63 : 0);
    doc.text(status === 'ACEPTADO' ? 'CONFORME — ACEPTADO' : 'INCONFORME — RECHAZADO', 70, y);
    doc.setTextColor(0, 0, 0);
    
    y += 10;
    if (obs) {
      doc.setFont('helvetica', 'bold');
      doc.text('Observaciones:', 14, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      const splitObs = doc.splitTextToSize(obs, 180);
      doc.text(splitObs, 14, y);
      y += splitObs.length * 5 + 5;
    }

    y += 10;
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      const sigData = sigCanvasRef.current.toDataURL('image/png');
      doc.setFont('helvetica', 'bold');
      doc.text('Firma del Receptor:', 14, y);
      y += 3;
      doc.addImage(sigData, 'PNG', 14, y, 70, 30);
      y += 32;
      doc.line(14, y, 84, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(user?.fullName || '', 14, y);
      doc.text(`C.C.: _______________`, 14, y + 5);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-CO')}`, 100, y);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text('Firma del Receptor:', 14, y);
      y += 20;
      doc.line(14, y, 84, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(user?.fullName || '', 14, y);
    }

    doc.save(`acta_${act.asset_code}_${status.toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const pendingActs = acceptances.filter(a => a.status === 'PENDIENTE');
  const completedActs = acceptances.filter(a => a.status !== 'PENDIENTE');

  if (loading) {
    return (
      <div className="page-loading">
        <span>Cargando bandeja de firmas...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      
      <div className="tabs-container">
        <button
          onClick={() => setActiveTab('PENDIENTE')}
          className={`tab-btn ${activeTab === 'PENDIENTE' ? 'active' : ''}`}
        >
          <Signature size={16} />
          <span>Pendientes de Firma ({pendingActs.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('HISTORIAL')}
          className={`tab-btn ${activeTab === 'HISTORIAL' ? 'active' : ''}`}
        >
          <CheckCircle size={16} />
          <span>Historial de Firmas ({completedActs.length})</span>
        </button>
      </div>

      {activeTab === 'PENDIENTE' ? (
        pendingActs.length === 0 ? (
          <div className="empty-state glass-card">
            <CheckCircle size={40} className="empty-state-icon" />
            <h4 className="empty-state-title">¡Bandeja Limpia!</h4>
            <p>No tienes actas de entrega o asignación de activos pendientes de aceptación.</p>
          </div>
        ) : (
          <div className="cards-grid">
            {pendingActs.map((act) => (
              <div key={act.id} className="glass-card card-item">
                <div className="card-header">
                  <div>
                    <span className="card-code">{act.asset_code}</span>
                    <h4 className="card-title">{act.asset_name}</h4>
                  </div>
                  <span className="badge badge-pending">Pendiente Firma</span>
                </div>

                <div className="card-info-box">
                  <div><strong>Categoría:</strong> {act.asset_category}</div>
                  <div><strong>Ubicación:</strong> {act.asset_location}</div>
                  <div><strong>Valor:</strong> ${Number(act.asset_value || 0).toLocaleString('es-CO')}</div>
                  <div><strong>Asignado el:</strong> {new Date(act.assigned_date).toLocaleDateString('es-CO', { dateStyle: 'long' })}</div>
                </div>

                <button
                  className="btn btn-primary full-btn"
                  onClick={() => handleOpenSign(act)}
                >
                  <Signature size={15} />
                  <span>Revisar y Firmar Entrega</span>
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="glass-card table-card">
          {completedActs.length === 0 ? (
            <div className="empty-state">
              Aún no se registran firmas completadas en el historial.
            </div>
          ) : (
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Activo</th>
                  <th>Asignado a</th>
                  <th>Fecha Firma</th>
                  <th>Respuesta</th>
                  <th>Comentarios</th>
                </tr>
              </thead>
              <tbody>
                {completedActs.map((act) => (
                  <tr key={act.id}>
                    <td className="cell-code">{act.asset_code}</td>
                    <td>{act.asset_name}</td>
                    <td>{act.assignee_name}</td>
                    <td>{new Date(act.acceptance_date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      <span className={`badge ${act.status === 'ACEPTADO' ? 'badge-active' : 'badge-rejected'}`}>
                        {act.status === 'ACEPTADO' ? 'Aceptado' : 'Rechazado'}
                      </span>
                    </td>
                    <td>{act.comments || 'Sin observaciones'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showSignModal && selectedAct && (
        <div className="modal-overlay" onClick={() => setShowSignModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Firma Digital: {selectedAct.asset_code}</h3>
              <button className="modal-close-btn" onClick={() => setShowSignModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSign}>
              <div className="modal-body modal-body-form">
                <div className="info-box">
                  <strong>{selectedAct.asset_name}</strong>
                  <p>Categoría: {selectedAct.asset_category} | Ubicación: {selectedAct.asset_location}</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Estado de Recepción</label>
                  <div className="radio-group">
                    <label className={`radio-option ${decision === 'ACEPTADO' ? 'active' : ''}`}>
                      <input type="radio" name="decision" value="ACEPTADO" checked={decision === 'ACEPTADO'} onChange={(e) => setDecision(e.target.value)} />
                      <Check size={16} /> Conforme
                    </label>
                    <label className={`radio-option ${decision === 'RECHAZADO' ? 'active' : ''}`}>
                      <input type="radio" name="decision" value="RECHAZADO" checked={decision === 'RECHAZADO'} onChange={(e) => setDecision(e.target.value)} />
                      <X size={16} /> Inconforme
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Observaciones</label>
                  <textarea
                    className="input-field"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    required={decision === 'RECHAZADO'}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Firma Digital</label>
                  <div className="signature-canvas-wrapper">
                    <SignatureCanvas
                      ref={sigCanvasRef}
                      penColor="#00823F"
                      canvasProps={{ width: 460, height: 120 }}
                    />
                  </div>
                  <button type="button" className="btn btn-secondary photo-remove-btn" onClick={() => sigCanvasRef.current?.clear()}>
                    Limpiar Firma
                  </button>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSignModal(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={decision === 'ACEPTADO' ? 'btn btn-success' : 'btn btn-danger'}
                  disabled={submitting}
                >
                  {submitting ? 'Firmando...' : 'Firmar y Descargar Acta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reglas CSS Locales para Pestañas (Tabs) */}
      <style>{`
        .tab-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-display);
          font-weight: 500;
          font-size: 0.95rem;
          padding: 0.5rem 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: var(--transition-smooth);
          border-bottom: 2px solid transparent;
        }
        .tab-btn:hover {
          color: var(--text-main);
        }
        .tab-btn.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const tabButtonStyle = {
  // Manejado en la etiqueta <style> arriba
};
