import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  ArchiveX, 
  Search, 
  Plus, 
  FileText, 
  CheckCircle2, 
  Calendar, 
  User, 
  ShieldAlert, 
  ExternalLink, 
  X,
  FileCheck,
  Layers,
  CheckSquare,
  Square,
  PenTool,
  RefreshCcw
} from 'lucide-react';
import { useAuth } from '../App';
import SearchableSelect from '../components/SearchableSelect';

export default function AssetBajas() {
  const { user, showToast } = useAuth();
  const [bajas, setBajas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Estados de Modal para Registrar Baja
  const [showModal, setShowModal] = useState(false);
  const [bajaMode, setBajaMode] = useState('individual'); // 'individual' o 'masivo'
  const [availableAssets, setAvailableAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  
  // Selección Individual
  const [selectedAssetId, setSelectedAssetId] = useState('');
  
  // Selección Masiva
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [modalAssetSearch, setModalAssetSearch] = useState('');

  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Catálogo de Motivos de Baja
  const [motivosList, setMotivosList] = useState([]);
  const [selectedMotivo, setSelectedMotivo] = useState('');

  // Firma Canvas
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState('');

  const fetchBajas = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/bajas', {
        params: { search, page, limit: 15 }
      });
      if (response.data.success) {
        setBajas(response.data.data);
        if (response.data.pagination) {
          setTotal(response.data.pagination.total);
          setTotalPages(response.data.pagination.totalPages);
        }
      }
    } catch (err) {
      showToast('Error al cargar el historial de bajas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveAssetsForSelection = async () => {
    setLoadingAssets(true);
    try {
      const response = await axios.get('/api/assets', { params: { limit: 1000 } });
      if (response.data.success) {
        const activeOnly = (response.data.assets || []).filter(a => a.status !== 'DADO DE BAJA' && a.estatus !== 'DADO DE BAJA');
        setAvailableAssets(activeOnly);
      }
    } catch (err) {
      showToast('Error al consultar activos disponibles para baja.', 'error');
    } finally {
      setLoadingAssets(false);
    }
  };

  const fetchMotivos = async () => {
    try {
      const response = await axios.get('/api/dictionaries/motivos-baja');
      if (response.data.success && response.data.data.length > 0) {
        setMotivosList(response.data.data);
        setSelectedMotivo(response.data.data[0].nombre);
      }
    } catch (err) {
      console.error('Error al cargar motivos de baja:', err);
    }
  };

  useEffect(() => {
    fetchBajas();
    fetchMotivos();
  }, [search, page]);

  const handleOpenModal = () => {
    setBajaMode('individual');
    setSelectedAssetId('');
    setSelectedAssetIds([]);
    setModalAssetSearch('');
    setObservaciones('');
    setHasSignature(false);
    setSignatureBase64('');
    fetchActiveAssetsForSelection();
    setShowModal(true);
    setTimeout(() => clearCanvas(), 100);
  };

  // --- Lógica del Canvas de Firma Digital ---
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches[0]?.clientY) - rect.top;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      if (canvas) {
        setSignatureBase64(canvas.toDataURL('image/png'));
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      setSignatureBase64('');
    }
  };

  const toggleSelectAssetInBulk = (id) => {
    setSelectedAssetIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllInBulk = () => {
    const filteredIds = filteredModalAssets.map(a => a.id);
    const allSelected = filteredIds.every(id => selectedAssetIds.includes(id));
    if (allSelected) {
      setSelectedAssetIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedAssetIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  // Guardar Baja con Generación Automática del PDF
  const handleSubmitBaja = async (e) => {
    e.preventDefault();

    const idsToSubmit = bajaMode === 'individual' 
      ? (selectedAssetId ? [parseInt(selectedAssetId, 10)] : [])
      : selectedAssetIds;

    if (idsToSubmit.length === 0) {
      showToast('Por favor seleccione al menos un activo para dar de baja.', 'error');
      return;
    }

    if (!hasSignature || !signatureBase64) {
      showToast('Por favor capture su firma digital en el recuadro para firmar el Acta de Baja.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post('/api/bajas', {
        activo_ids: idsToSubmit,
        motivo: selectedMotivo || 'Dar de baja',
        observaciones,
        firma_admin: signatureBase64
      });

      if (response.data.success) {
        showToast(response.data.message || 'Activo(s) dado(s) de baja exitosamente. El Acta Oficial fue generada automáticamente.', 'success');
        setShowModal(false);
        fetchBajas();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al procesar la baja.';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtro avanzado en modal: Busca por Código, Nombre, Serial, PSL, Cédula o Nombre del Responsable
  const filteredModalAssets = availableAssets.filter(a => {
    if (!modalAssetSearch.trim()) return true;
    const s = modalAssetSearch.toLowerCase().trim();
    const code = (a.code || a.codigo || '').toLowerCase();
    const name = (a.name || a.modelo || '').toLowerCase();
    const serial = (a.serial || '').toLowerCase();
    const psl = (a.psl || '').toLowerCase();
    const respName = (a.assignee_name || a.asignado_a_nombre || '').toLowerCase();
    const respCedula = String(a.assignee_cedula || a.cedula || '').toLowerCase();

    return code.includes(s) || name.includes(s) || serial.includes(s) || psl.includes(s) || respName.includes(s) || respCedula.includes(s);
  });

  // Si el usuario no es Administrador
  if (user?.role !== 'ADMIN') {
    return (
      <div className="atlas-dashboard-wrapper">
        <div style={{ 
          background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)', 
          border: '1px solid #FCA5A5', 
          borderRadius: '12px', 
          padding: '24px', 
          textAlign: 'center',
          maxWidth: '600px',
          margin: '40px auto'
        }}>
          <ShieldAlert size={48} color="#EF4444" style={{ marginBottom: '12px' }} />
          <h2 style={{ color: '#991B1B', margin: '0 0 8px 0', fontSize: '1.3rem' }}>Acceso Restringido</h2>
          <p style={{ color: '#7F1D1D', fontSize: '0.9rem', margin: 0 }}>
            El módulo de <strong>Bajas de Activos</strong> está reservado exclusivamente para el rol de <strong>Administrador</strong>. 
            No tienes permisos suficientes para consultar o procesar retiros de activos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="atlas-dashboard-wrapper">
      
      {/* Encabezado del Módulo */}
      <div className="atlas-welcome-bar">
        <div>
          <h1 className="welcome-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ArchiveX size={26} color="#1352E6" />
            <span>Módulo de Bajas de Activos</span>
          </h1>
          <p className="welcome-subtitle">
            Gestión de baja individual y masiva con generación automática del Acta Oficial en PDF y Firma Digital
          </p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleOpenModal}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 600 }}
        >
          <Plus size={18} />
          <span>Registrar Baja de Activo</span>
        </button>
      </div>


      {/* Barra de Filtros y Búsqueda */}
      <div className="atlas-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ flex: 1, minWidth: '260px' }}>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="input-field search-input"
              placeholder="Buscar por código de activo, nombre, serial, cédula o responsable..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      {/* Tabla de Registros de Bajas */}
      <div className="atlas-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
            Cargando historial de bajas de activos...
          </div>
        ) : bajas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
            No se encontraron registros de bajas de activos en el sistema.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="atlas-table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Código</th>
                  <th>Activo</th>
                  <th>Serial / PSL</th>
                  <th>Persona Responsable</th>
                  <th>Solicitud / Motivo</th>
                  <th>Acta PDF Generada</th>
                  <th>Registrado Por</th>
                  <th>Fecha de Baja</th>
                </tr>
              </thead>
              <tbody>
                {bajas.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="badge" style={{ background: '#FEF2F2', color: '#991B1B', fontWeight: 700 }}>
                        {b.activo_codigo}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>{b.activo_nombre}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {b.activo_tipo_recurso} • {b.activo_marca} ({b.activo_empresa || 'N/A'})
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>S/N: {b.activo_serial || 'N/A'}</div>
                      {b.activo_psl && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>PSL: {b.activo_psl}</div>}
                    </td>
                    <td>
                      {b.responsable_nombre ? (
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0F172A' }}>{b.responsable_nombre}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748B' }}>C.C. {b.responsable_cedula || 'N/A'}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94A3B8', italic: 'true' }}>Sin responsable previo</span>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
                        {b.motivo || 'Dar de baja'}
                      </span>
                      {b.observaciones && (
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.observaciones}>
                          {b.observaciones}
                        </div>
                      )}
                    </td>
                    <td>
                      {b.documento_baja_url ? (
                        <a
                          href={b.documento_baja_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn"
                          style={{ 
                            padding: '4px 10px', 
                            fontSize: '0.78rem', 
                            background: '#EBF3FF', 
                            color: '#1352E6', 
                            border: '1px solid #BFDBFE',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderRadius: '6px'
                          }}
                        >
                          <FileText size={14} />
                          <span>Ver Acta PDF</span>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: '#EF4444' }}>Sin documento</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={14} color="#64748B" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{b.registrado_por_nombre || b.registrado_por_username || 'Administrador'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#475569' }}>
                        <Calendar size={14} color="#64748B" />
                        <span>{new Date(b.fecha_baja).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
              Mostrando página {page} de {totalPages} ({total} registros)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                Anterior
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Registrar Baja de Activo (Individual o Masivo) */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '720px' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', color: '#FFFFFF' }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FFFFFF' }}>
                <ArchiveX size={20} color="#EF4444" />
                <span>Procesar Baja de Activo(s)</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="modal-close-btn" style={{ color: '#94A3B8' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitBaja}>
              <div className="modal-body modal-body-form" style={{ padding: '20px' }}>
                
                {/* Selector de Modalidad: Individual vs Masivo */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => setBajaMode('individual')}
                    className="btn"
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      background: bajaMode === 'individual' ? '#EBF3FF' : '#F8FAFC',
                      border: bajaMode === 'individual' ? '2px solid #1352E6' : '1px solid #E2E8F0',
                      color: bajaMode === 'individual' ? '#1352E6' : '#64748B',
                      fontWeight: bajaMode === 'individual' ? 700 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <ArchiveX size={18} />
                    <span>Baja Individual (1 Activo)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBajaMode('masivo')}
                    className="btn"
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      background: bajaMode === 'masivo' ? '#EBF3FF' : '#F8FAFC',
                      border: bajaMode === 'masivo' ? '2px solid #1352E6' : '1px solid #E2E8F0',
                      color: bajaMode === 'masivo' ? '#1352E6' : '#64748B',
                      fontWeight: bajaMode === 'masivo' ? 700 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Layers size={18} />
                    <span>Baja Masiva (Varios Activos / Por Cédula)</span>
                  </button>
                </div>

                {/* Selección de Activos según modalidad */}
                {bajaMode === 'individual' ? (
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Seleccionar Activo *</label>
                    {loadingAssets ? (
                      <div style={{ fontSize: '0.82rem', color: '#64748B' }}>Cargando activos disponibles...</div>
                    ) : (
                      <SearchableSelect
                        options={availableAssets.map(a => ({
                          id: a.id,
                          label: `${a.code || a.codigo} - ${a.name || a.modelo} (SN: ${a.serial || 'N/A'}) | Responsable: ${a.assignee_name || 'Sin Asignar'} (C.C. ${a.assignee_cedula || 'N/A'})`
                        }))}
                        value={selectedAssetId}
                        onChange={(val) => setSelectedAssetId(val)}
                        placeholder="Buscar por código, nombre, serial o nombre/cédula del responsable..."
                      />
                    )}
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                        Seleccionar Activos a Dar de Baja ({selectedAssetIds.length} seleccionados) *
                      </label>
                      <button
                        type="button"
                        onClick={toggleSelectAllInBulk}
                        className="btn"
                        style={{ fontSize: '0.78rem', color: '#1352E6', padding: '2px 8px', background: '#EBF3FF' }}
                      >
                        {filteredModalAssets.length > 0 && filteredModalAssets.every(a => selectedAssetIds.includes(a.id)) ? 'Deseleccionar Todos' : 'Seleccionar Todos Visibles'}
                      </button>
                    </div>

                    {/* Campo de búsqueda masiva por Cédula o Nombre del Responsable */}
                    <div style={{ marginBottom: '8px' }}>
                      <input
                        type="text"
                        placeholder="Buscar por Cédula o Nombre de Persona Responsable, Código o Serial..."
                        value={modalAssetSearch}
                        onChange={(e) => setModalAssetSearch(e.target.value)}
                        className="input-field"
                        style={{ fontSize: '0.84rem', padding: '8px 12px', border: '1px solid #1352E6' }}
                      />
                    </div>

                    <div style={{ 
                      maxHeight: '200px', 
                      overflowY: 'auto', 
                      border: '1px solid #CBD5E1', 
                      borderRadius: '8px', 
                      padding: '6px',
                      background: '#FFFFFF'
                    }}>
                      {filteredModalAssets.length === 0 ? (
                        <div style={{ padding: '14px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                          No se encontraron activos que coincidan con la búsqueda.
                        </div>
                      ) : (
                        filteredModalAssets.map(a => {
                          const isSelected = selectedAssetIds.includes(a.id);
                          return (
                            <div
                              key={a.id}
                              onClick={() => toggleSelectAssetInBulk(a.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                background: isSelected ? '#EFF6FF' : 'transparent',
                                cursor: 'pointer',
                                borderBottom: '1px solid #F1F5F9'
                              }}
                            >
                              {isSelected ? (
                                <CheckSquare size={18} color="#1352E6" />
                              ) : (
                                <Square size={18} color="#94A3B8" />
                              )}
                              <div style={{ flex: 1, fontSize: '0.82rem' }}>
                                <strong style={{ color: '#0F172A' }}>{a.code || a.codigo}</strong> - {a.name || a.modelo}
                                <span style={{ color: '#64748B', marginLeft: '6px', fontSize: '0.76rem' }}>
                                  (SN: {a.serial || 'N/A'})
                                </span>
                                <div style={{ fontSize: '0.75rem', color: '#1352E6', fontWeight: 500, marginTop: '2px' }}>
                                  Responsable: {a.assignee_name || 'Sin Asignar'} {a.assignee_cedula ? `(C.C. ${a.assignee_cedula})` : ''}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Selector de Motivo de Baja desde Catálogo */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Motivo de Baja *</label>
                  {motivosList.length > 0 ? (
                    <select
                      className="input-field"
                      value={selectedMotivo}
                      onChange={(e) => setSelectedMotivo(e.target.value)}
                      required
                      style={{ fontWeight: 600, color: '#0F172A' }}
                    >
                      {motivosList.map(m => (
                        <option key={m.id} value={m.nombre}>{m.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="input-field"
                      value={selectedMotivo || 'Obsolescencia tecnológica'}
                      onChange={(e) => setSelectedMotivo(e.target.value)}
                      placeholder="Ingrese el motivo de baja..."
                      required
                    />
                  )}
                </div>

                {/* Observaciones */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Observaciones / Dictamen Técnico</label>
                  <textarea
                    rows={2}
                    className="input-field"
                    placeholder="Ingrese detalles técnicos o justificación de la baja..."
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Captura de Firma Digital del Administrador */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <PenTool size={16} color="#1352E6" />
                      <span>Firma Digital del Administrador Autorizante (Obligatorio) *</span>
                    </label>
                    {hasSignature && (
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="btn"
                        style={{ fontSize: '0.75rem', color: '#EF4444', padding: '2px 8px', background: '#FEF2F2', border: '1px solid #FCA5A5' }}
                      >
                        <RefreshCcw size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Limpiar Firma
                      </button>
                    )}
                  </div>

                  <div style={{
                    border: hasSignature ? '2px solid #10B981' : '2px dashed #94A3B8',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                    textAlign: 'center',
                    padding: '4px',
                    position: 'relative'
                  }}>
                    <canvas
                      ref={canvasRef}
                      width={620}
                      height={120}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      style={{ cursor: 'crosshair', width: '100%', height: '120px', touchAction: 'none' }}
                    />
                    {!hasSignature && (
                      <div style={{
                        position: 'absolute',
                        top: '40%',
                        left: '0',
                        right: '0',
                        pointerEvents: 'none',
                        color: '#94A3B8',
                        fontSize: '0.82rem'
                      }}>
                        Dibuje o firme aquí con su ratón / pantalla táctil para respaldar el Acta de Baja
                      </div>
                    )}
                  </div>
                  {hasSignature && (
                    <div style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={14} /> Firma capturada correctamente. Se incrustará en el Acta Oficial PDF.
                    </div>
                  )}
                </div>

              </div>

              <div className="modal-footer" style={{ padding: '16px 20px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    submitting || 
                    !hasSignature ||
                    (bajaMode === 'individual' && !selectedAssetId) || 
                    (bajaMode === 'masivo' && selectedAssetIds.length === 0)
                  }
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#EF4444', borderColor: '#DC2626' }}
                >
                  {submitting ? (
                    <span>Generando Acta PDF y Procesando...</span>
                  ) : (
                    <>
                      <FileText size={16} />
                      <span>
                        Generar Acta y Confirmar Baja {bajaMode === 'masivo' ? `(${selectedAssetIds.length} activos)` : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
