import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { RefreshCw, MapPin, User, FileText, ArrowRight, Clock, Download, CheckSquare, Square, Activity, X } from 'lucide-react';
import { useAuth } from '../App';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import '../styles/forms.css';
import '../styles/dashboard.css';

export default function AssetMovements() {
  const { user, showToast } = useAuth();
  
  // Estados de datos
  const [movements, setMovements] = useState([]);
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados de Formulario
  const [assetId, setAssetId] = useState('');
  const [destinationLocation, setDestinationLocation] = useState('');
  const [destinationAssigneeId, setDestinationAssigneeId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Multi-select & PDF
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showPdfModal, setShowPdfModal] = useState(false);
  const sigCanvasRef = useRef(null);

  // Cargar datos
  const loadData = async () => {
    try {
      const movementsRes = await axios.get('/api/movements');
      const assetsRes = await axios.get('/api/assets');
      const usersRes = await axios.get('/api/auth/users');

      if (movementsRes.data.success) setMovements(movementsRes.data.movements);
      if (assetsRes.data.success) setAssets(assetsRes.data.assets);
      if (usersRes.data.success) setUsers(usersRes.data.users);
    } catch (err) {
      showToast('Error al cargar historial de traslados.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Registrar Traslado
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assetId || !destinationLocation || !reason) {
      showToast('Por favor diligencie todos los campos obligatorios.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post('/api/movements', {
        asset_id: parseInt(assetId, 10),
        destination_location: destinationLocation,
        destination_assignee_id: destinationAssigneeId ? parseInt(destinationAssigneeId, 10) : null,
        reason
      });

      if (response.data.success) {
        showToast('El traslado del activo fue registrado y procesado.', 'success');
        setAssetId('');
        setDestinationLocation('');
        setDestinationAssigneeId('');
        setReason('');
        loadData();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al procesar el traslado del activo.';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Multi-select logic
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === movements.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(movements.map(m => m.id)));
    }
  };

  // PDF Generation
  const generatePDF = () => {
    const selected = movements.filter(m => selectedIds.has(m.id));
    if (selected.length === 0) {
      showToast('Seleccione al menos un movimiento para exportar.', 'error');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'letter');
    
    // Header
    doc.setFillColor(0, 130, 63);
    doc.rect(0, 0, 280, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE MOVIMIENTOS DE ACTIVOS', 14, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${new Date().toLocaleString('es-CO')} | Por: ${user?.fullName || 'N/A'}`, 14, 22);
    doc.text(`Total registros: ${selected.length}`, 240, 22);

    // Table
    const tableData = selected.map(mov => [
      mov.asset_code || '',
      mov.asset_name || '',
      mov.origin_location || 'N/A',
      mov.destination_location || '',
      mov.origin_assignee_name || 'Disponible',
      mov.destination_assignee_name || 'Disponible',
      mov.reason || '',
      new Date(mov.date).toLocaleDateString('es-CO')
    ]);

    doc.autoTable({
      startY: 34,
      head: [['Código', 'Activo', 'Origen', 'Destino', 'Resp. Anterior', 'Resp. Nuevo', 'Motivo', 'Fecha']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 130, 63], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 250, 245] },
      margin: { left: 10, right: 10 },
    });

    // Signature area
    const finalY = doc.lastAutoTable.finalY + 15;
    
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      const sigData = sigCanvasRef.current.toDataURL('image/png');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.text('Firma de Conformidad:', 14, finalY);
      doc.addImage(sigData, 'PNG', 14, finalY + 2, 60, 25);
      doc.line(14, finalY + 28, 74, finalY + 28);
      doc.setFontSize(8);
      doc.text(user?.fullName || '', 14, finalY + 33);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-CO')}`, 14, finalY + 37);
    }

    doc.save(`movimientos_activos_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF generado y descargado exitosamente.', 'success');
    setShowPdfModal(false);
    setSelectedIds(new Set());
  };

  const isWriteAllowed = user?.role === 'ADMIN' || user?.role === 'OPERATOR';

  if (loading) {
    return (
      <div className="page-loading">
        <span>Cargando historial de movimientos...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      
      {/* Formulario de Registro (Solo Admin y Operador) */}
      {isWriteAllowed && (
        <div className="glass-card" style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-display)', marginBottom: '1.25rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw size={18} color="var(--accent-primary)" />
            Registrar Traslado / Movimiento de Activo
          </h3>
          
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', alignItems: 'flex-end' }}>
            
            <div className="form-group">
              <label className="form-label">Seleccionar Activo *</label>
              <select className="input-field" value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
                <option value="">-- Seleccionar Equipo --</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>[{a.code}] {a.name} - ({a.location})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Nueva Ubicación Física *</label>
              <div className="search-wrapper">
                <MapPin size={16} color="var(--text-dark)" className="search-icon" />
                <input type="text" className="input-field search-input" placeholder="Ej: Sala de Servidores B" value={destinationLocation} onChange={(e) => setDestinationLocation(e.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Asignar Nuevo Responsable (Opcional)</label>
              <select className="input-field" value={destinationAssigneeId} onChange={(e) => setDestinationAssigneeId(e.target.value)}>
                <option value="">-- Sin Cambio de Responsable --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Razón / Observaciones *</label>
              <div className="search-wrapper">
                <FileText size={16} color="var(--text-dark)" className="search-icon" />
                <input type="text" className="input-field search-input" placeholder="Ej: Mantenimiento preventivo programado / Traslado físico de sede" value={reason} onChange={(e) => setReason(e.target.value)} required />
              </div>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 1' }}>
              <button type="submit" className="btn btn-primary full-btn" disabled={submitting}>
                {submitting ? 'Registrando...' : 'Registrar Movimiento'}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Historial de Auditoría con Multi-select */}
      <div className="glass-card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} color="var(--accent-primary)" />
              Timeline de Movimientos Recientes
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {movements.length > 0 && (
                <button className="btn btn-secondary icon-btn" onClick={toggleAll}>
                  <CheckSquare size={16} /> 
                  {selectedIds.size === movements.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                </button>
              )}
              {selectedIds.size > 0 && (
                <button className="btn btn-primary icon-btn" onClick={() => setShowPdfModal(true)}>
                  <Download size={16} /> Exportar {selectedIds.size} a PDF
                </button>
              )}
            </div>
          </div>

        {movements.length === 0 ? (
          <div className="empty-state">
            No se encontraron movimientos registrados.
          </div>
        ) : (
          <div className="timeline-list">
            <div className="timeline-vertical-line" />
            
            {movements.map((mov) => (
              <div key={mov.id} className="timeline-item" style={{ alignItems: 'flex-start' }}>
                
                {/* Checkbox */}
                <input 
                  type="checkbox" 
                  checked={selectedIds.has(mov.id)}
                  onChange={() => toggleSelect(mov.id)}
                  style={{ cursor: 'pointer', zIndex: 3, marginTop: '6px' }}
                />

                {/* Nodo del Timeline */}
                <div className="timeline-node" style={{
                  background: selectedIds.has(mov.id) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  borderColor: selectedIds.has(mov.id) ? '#ffffff' : 'var(--border-glass)',
                  boxShadow: selectedIds.has(mov.id) ? '0 0 0 3px rgba(0, 130, 63, 0.2)' : 'none',
                }} />

                {/* Tarjeta de Detalle del Movimiento */}
                <div 
                  className="glass-card" 
                  style={{ 
                    flex: 1, 
                    padding: '1.25rem', 
                    background: selectedIds.has(mov.id) ? 'var(--accent-primary-glow)' : 'var(--bg-secondary)',
                    border: `1px solid ${selectedIds.has(mov.id) ? 'var(--accent-primary)' : 'var(--border-glass)'}`,
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onClick={() => toggleSelect(mov.id)}
                >
                  
                  {/* Fila superior: Equipo, Código y Fecha */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: '700', color: 'var(--accent-primary)', fontFamily: 'monospace' }}>
                        {mov.asset_code}
                      </span>
                      <strong style={{ color: 'var(--text-main)' }}>{mov.asset_name}</strong>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>
                      {new Date(mov.date).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* Detalles (Origen y Destino) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <MapPin size={16} color="var(--accent-primary)" />
                      <span style={{ color: 'var(--text-muted)' }}>Físico:</span>
                      <span style={{ textDecoration: mov.origin_location ? 'line-through' : 'none', color: 'var(--text-dark)' }}>
                        {mov.origin_location || 'N/A'}
                      </span>
                      <ArrowRight size={14} color="var(--text-muted)" />
                      <strong style={{ color: 'var(--accent-success)' }}>{mov.destination_location}</strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <User size={16} color="var(--accent-secondary)" />
                      <span style={{ color: 'var(--text-muted)' }}>Responsable:</span>
                      <span style={{ textDecoration: mov.origin_assignee_name ? 'line-through' : 'none', color: 'var(--text-dark)' }}>
                        {mov.origin_assignee_name || 'Disponible'}
                      </span>
                      <ArrowRight size={14} color="var(--accent-primary)" />
                      <strong style={{ color: 'var(--text-main)' }}>{mov.destination_assignee_name || 'Disponible'}</strong>
                    </div>
                  </div>

                  {/* Footer del Movimiento */}
                  <div className="card-info-box" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText size={14} color="var(--text-muted)" />
                      <span style={{ color: 'var(--text-main)', fontStyle: 'italic' }}>"{mov.reason}"</span>
                    </div>
                    <span className="field-hint">
                      Registrado por: <strong>{mov.performed_by_name}</strong>
                    </span>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Exportar PDF con Firma */}
      {showPdfModal && (
        <div className="modal-overlay" onClick={() => setShowPdfModal(false)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                Firmar y Exportar a PDF
              </h3>
              <button className="modal-close-btn" onClick={() => setShowPdfModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body modal-body-form">
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Se exportarán <strong style={{ color: 'var(--accent-primary)' }}>{selectedIds.size}</strong> movimientos seleccionados.
                Por favor, proporcione su firma digital para validar el documento.
              </p>
              
              <div className="form-group">
                <label className="form-label">Firma Digital del Responsable *</label>
                <div className="signature-canvas-wrapper">
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    penColor="#00823F"
                    canvasProps={{
                      width: 460,
                      height: 150,
                      style: { width: '100%', height: '150px' }
                    }}
                  />
                </div>
                <button 
                  type="button" 
                  className="btn btn-secondary photo-remove-btn"
                  onClick={() => sigCanvasRef.current?.clear()}
                >
                  Limpiar Firma
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPdfModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={generatePDF}>
                <Download size={16} /> Generar y Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
