import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { RefreshCw, MapPin, User, FileText, ArrowRight, Clock, Download, CheckSquare, Square, Activity, X, FileDown, ExternalLink, Clock3, CheckCircle2, Eye, Users } from 'lucide-react';
import { useAuth } from '../App';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { ATLAS_LOGO } from '../assets/logo-base64';
import '../styles/forms.css';
import '../styles/dashboard.css';

export default function AssetMovements() {
  const { user, showToast } = useAuth();
  
  // Estados de datos
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [oficinas, setOficinas] = useState([]);
  const [puntos, setPuntos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados de Formulario
  const [assetId, setAssetId] = useState('');
  const [oficinaId, setOficinaId] = useState('');
  const [puntoId, setPuntoId] = useState('');
  const [destinationAssigneeId, setDestinationAssigneeId] = useState('');
  const [reason, setReason] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  const [showAssetDrop, setShowAssetDrop] = useState(false);
  const [oficinaQuery, setOficinaQuery] = useState('');
  const [showOficinaDrop, setShowOficinaDrop] = useState(false);
  const [puntoQuery, setPuntoQuery] = useState('');
  const [showPuntoDrop, setShowPuntoDrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cedulaOrigen, setCedulaOrigen] = useState('');
  const [cargoOrigen, setCargoOrigen] = useState('');

  // Nuevos estados para movimiento masivo y tipo de entrega
  const [movementMode, setMovementMode] = useState('individual'); // 'individual' o 'masivo'
  const [selectedAssetIds, setSelectedAssetIds] = useState([]); // Array de IDs de activos para traslado masivo
  const [assetSearchQuery, setAssetSearchQuery] = useState(''); // Búsqueda de activo en modo masivo
  const [estadoEntrega, setEstadoEntrega] = useState('TRASLADO');
  const [filterUserId, setFilterUserId] = useState(''); // Para filtrar activos por usuario (ADMIN)
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Refs
  const sigCanvasCreateRef = useRef(null);

  // Cargar datos
  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsRes, usersRes, oficinasRes, puntosRes] = await Promise.all([
        axios.get('/api/assets?all=true'),
        axios.get('/api/auth/users'),
        axios.get('/api/dictionaries/oficinas').catch(() => ({ data: { success: false, data: [] } })),
        axios.get('/api/dictionaries/puntos').catch(() => ({ data: { success: false, data: [] } }))
      ]);

      if (assetsRes.data.success) setAssets(assetsRes.data.assets);
      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (oficinasRes.data.success) setOficinas(oficinasRes.data.data);
      if (puntosRes.data.success) setPuntos(puntosRes.data.data);
    } catch (err) {
      showToast('Error al cargar datos del formulario.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Autocompletar cargo y cédula del solicitante al cargar los datos del usuario actual
  useEffect(() => {
    if (user) {
      setCargoOrigen(user.cargo || 'Funcionario / Responsable');
      setCedulaOrigen(user.cedula || '');
    }
  }, [user]);



  // Seleccionar usuario y cargar automáticamente su ubicación anclada
  const handleUserChange = (selectedUserId) => {
    setDestinationAssigneeId(selectedUserId);
    if (!selectedUserId) return;

    const targetUser = users.find(u => String(u.id) === String(selectedUserId));
    if (targetUser) {
      if (targetUser.oficina_nombre) {
        const foundOficina = oficinas.find(o => o.nombre.toLowerCase() === targetUser.oficina_nombre.toLowerCase());
        if (foundOficina) {
          setOficinaId(foundOficina.id);
          setOficinaQuery(foundOficina.nombre);
        } else {
          setOficinaQuery(targetUser.oficina_nombre);
        }
      }
      if (targetUser.punto_nombre) {
        const foundPunto = puntos.find(p => p.nombre.toLowerCase() === targetUser.punto_nombre.toLowerCase());
        if (foundPunto) {
          setPuntoId(foundPunto.id);
          setPuntoQuery(foundPunto.nombre);
        } else {
          setPuntoQuery(targetUser.punto_nombre);
        }
      }
      showToast(`Ubicación anclada de ${targetUser.full_name} cargada automáticamente.`, 'info');
    }
  };

  // Registrar Traslado
  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalAssetIds = movementMode === 'masivo' ? selectedAssetIds : (assetId ? [parseInt(assetId, 10)] : []);

    if (finalAssetIds.length === 0 || (!destinationAssigneeId && (!oficinaId || !puntoId)) || !reason) {
      showToast('Debe seleccionar al menos un activo, nuevo responsable o ubicación de destino, y la justificación.', 'error');
      return;
    }

    if (!sigCanvasCreateRef.current || sigCanvasCreateRef.current.isEmpty()) {
      showToast('Por favor, proporcione su firma digital para registrar el traslado.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const signatureData = sigCanvasCreateRef.current.toDataURL('image/png');

      const response = await axios.post('/api/movements', {
        asset_ids: finalAssetIds,
        oficina_id: oficinaId ? parseInt(oficinaId, 10) : null,
        punto_id: puntoId ? parseInt(puntoId, 10) : null,
        destination_assignee_id: destinationAssigneeId ? parseInt(destinationAssigneeId, 10) : null,
        reason,
        firma_origen: signatureData,
        cedula_origen: cedulaOrigen,
        cargo_origen: cargoOrigen,
        estado_entrega: estadoEntrega
      });

      if (response.data.success) {
        showToast('El traslado del activo fue registrado y procesado.', 'success');
        setAssetId('');
        setSelectedAssetIds([]);
        setOficinaId('');
        setPuntoId('');
        setAssetQuery('');
        setOficinaQuery('');
        setPuntoQuery('');
        setDestinationAssigneeId('');
        setReason('');
        setCedulaOrigen('');
        setCargoOrigen('');
        setEstadoEntrega('TRASLADO');
        sigCanvasCreateRef.current?.clear();
        loadData();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al procesar el traslado del activo.';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Obtener PDF de previsualización desde el Backend superpuesto en la plantilla oficial ───
  const buildPreviewPDF = async () => {
    const finalAssetIds = movementMode === 'masivo' ? selectedAssetIds : (assetId ? [parseInt(assetId, 10)] : []);
    if (finalAssetIds.length === 0) {
      showToast('Seleccione al menos un activo para previsualizar.', 'error');
      return;
    }

    if (!sigCanvasCreateRef.current || sigCanvasCreateRef.current.isEmpty()) {
      showToast('Por favor, proporcione su firma digital para previsualizar el PDF de traslado.', 'error');
      return;
    }

    if (!cedulaOrigen || !cargoOrigen) {
      showToast('Por favor complete la cédula y cargo de quien entrega.', 'error');
      return;
    }

    showToast('Generando previsualización del PDF de traslado...', 'info');

    try {
      const signatureData = sigCanvasCreateRef.current.toDataURL('image/png');

      const response = await axios.post('/api/movements/preview', {
        asset_ids: finalAssetIds,
        oficina_id: oficinaId ? parseInt(oficinaId, 10) : null,
        punto_id: puntoId ? parseInt(puntoId, 10) : null,
        destination_assignee_id: destinationAssigneeId ? parseInt(destinationAssigneeId, 10) : null,
        reason,
        firma_origen: signatureData,
        cedula_origen: cedulaOrigen,
        cargo_origen: cargoOrigen,
        estado_entrega: estadoEntrega
      }, {
        responseType: 'blob'
      });

      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Previsualización de PDF generada con éxito.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al generar la previsualización del PDF oficial.', 'error');
    }
  };

  // PDF Generation FR-GA-57 Format
  const generatePDF = () => {
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear());

    doc.rect(10, y, 195, 42);
    doc.line(10, y + 6, 205, y + 6);
    doc.line(10, y + 12, 205, y + 12);
    doc.line(10, y + 18, 205, y + 18);
    doc.line(10, y + 24, 205, y + 24);
    doc.line(10, y + 30, 205, y + 30);

    doc.line(55, y, 55, y + 6);
    doc.line(85, y, 85, y + 6);
    doc.line(125, y, 125, y + 6);
    doc.line(165, y, 165, y + 6);
    doc.line(55, y + 6, 55, y + 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FECHA:', 12, y + 4.5);
    doc.text(`DIA: ${day}`, 60, y + 4.5);
    doc.text(`MES: ${month}`, 95, y + 4.5);
    doc.text(`AÑO: ${year}`, 135, y + 4.5);

    const firstMov = selected[0];

    doc.text('QUIEN RECIBE:', 12, y + 10.5);
    doc.setFont('helvetica', 'normal');
    doc.text(String(firstMov.destination_assignee_name || user?.fullName || 'N/A'), 58, y + 10.5);

    doc.setFont('helvetica', 'bold');
    doc.text('CÉDULA:', 12, y + 16.5);
    doc.setFont('helvetica', 'normal');
    doc.text('_______________________', 58, y + 16.5);

    doc.setFont('helvetica', 'bold');
    doc.text('CARGO:', 12, y + 22.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Funcionario / Responsable de Activo', 58, y + 22.5);

    doc.setFont('helvetica', 'bold');
    doc.text('PROCESO QUE RECIBE:', 12, y + 28.5);
    doc.setFont('helvetica', 'normal');
    doc.text(String(firstMov.destination_oficina ? `${firstMov.destination_oficina} / ${firstMov.destination_punto}` : 'Sede Principal'), 58, y + 28.5);

    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO ENTREGA DE ACTIVO:', 12, y + 34.5);
    doc.setFontSize(7);
    const est = String(firstMov.estado_entrega || 'TRASLADO').toUpperCase();
    doc.text(`NUEVO: [ ${est === 'NUEVO' ? 'X' : ' '} ]`, 60, y + 34.5);
    doc.text(`REPARACIÓN: [ ${est === 'REPARACIÓN' ? 'X' : ' '} ]`, 95, y + 34.5);
    doc.text(`TRASLADO: [ ${est === 'TRASLADO' ? 'X' : ' '} ]`, 135, y + 34.5);
    doc.text(`RETIRO: [ ${est === 'RETIRO' ? 'X' : ' '} ]`, 60, y + 40);
    doc.text(`VACACIONES: [ ${est === 'VACACIONES' ? 'X' : ' '} ]`, 95, y + 40);
    doc.text(`VERIFICACIÓN: [ ${est === 'VERIFICACIÓN' ? 'X' : ' '} ]`, 135, y + 40);

    y += 48;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('HAGO CONSTAR', 107.5, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('Que he recibido de Gana Gana / Red Multiservicios los siguientes artículos:', 10, y);

    y += 4;
    const itemsHead = [['TIPO DE ACTIVO (AF/AC)', 'NOMBRE DE ACTIVO', 'ID PLACA ACTIVO', 'MARCA/MODELO ACTIVO', 'ESTADO (B/R/D)', 'OBSERVACIONES ADICIONALES']];
    const itemsBody = selected.map(mov => [
      'AF',
      mov.asset_name || 'Activo',
      mov.asset_code || 'N/A',
      mov.asset_code ? `Código: ${mov.asset_code}` : 'N/A',
      'B',
      mov.reason || 'Traslado registrado'
    ]);

    doc.autoTable({
      startY: y,
      head: itemsHead,
      body: itemsBody,
      theme: 'grid',
      headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 40 },
        2: { cellWidth: 28 },
        3: { cellWidth: 35 },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 40 }
      },
      margin: { left: 10, right: 10 }
    });

    y = doc.lastAutoTable.finalY + 3;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('B: Bueno       R: Regular       D: Dañado', 10, y);

    y += 5;
    doc.rect(10, y, 195, 42);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('INDICO QUÉ', 107.5, y + 4, { align: 'center' });
    
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    const legalP1 = "Recibo los activos y/o inventarios relacionados en la presenta acta y sus anexos los cuales estarán bajo mi responsabilidad, les daré el uso y trato adecuado al desempeño de mis funciones y la destinación prevista para cada uno de ellos. Me comprometo a informar oportunamente al área de activos fijos sobre cualquier desplazamiento, siniestro, reparación, traslado, cambio de responsables, por medio de los formatos respectivos y sobre cualquier situación que ponga en inminente el riesgo los bienes de la empresa.";
    const legalP2 = "En caso de lo contrario asumiré el daño, la pérdida, mal uso, falta de control o incumplimiento de las políticas establecidas para la conservación y custodia de estos. Dado que la omisión de esas disposiciones es considerada como falta grave por el Reglamento Interno de Trabajo, asumo las consecuencias económicas que conlleven el daño o la pérdida de los bienes mencionados.";
    const legalP3 = "En caso de existir faltantes al momento de hacer la entrega del paz y salvo de los Activos Fijos que están bajo mi responsabilidad, y que firmé en señal de aceptación se adelantarán las disposiciones que dicté el Reglamento Interno de Trabajo.";

    const split1 = doc.splitTextToSize(legalP1, 191);
    doc.text(split1, 12, y + 8);
    const yNext1 = y + 8 + (split1.length * 2.8);

    const split2 = doc.splitTextToSize(legalP2, 191);
    doc.text(split2, 12, yNext1);
    const yNext2 = yNext1 + (split2.length * 2.8);

    const split3 = doc.splitTextToSize(legalP3, 191);
    doc.text(split3, 12, yNext2);

    y += 46;
    doc.rect(10, y, 95, 28);
    doc.rect(110, y, 95, 28);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA DE QUIEN ENTREGA', 12, y + 24);
    doc.text(`N° CÉDULA: _______________`, 12, y + 27);

    doc.text('FIRMA DE QUIEN RECIBE', 112, y + 24);
    doc.text(`N° CÉDULA: _______________`, 112, y + 27);

    if (sigCanvasExportRef.current && !sigCanvasExportRef.current.isEmpty()) {
      const sigData = sigCanvasExportRef.current.toDataURL('image/png');
      doc.addImage(sigData, 'PNG', 125, y + 2, 60, 18);
    }

    y += 33;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Visto Bueno de Activos Fijos_________________   Esta firma será necesaria cuando aplique', 10, y);

    doc.save(`FR-GA-57_Acta_Traslado_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('Acta FR-GA-57 generada y descargada exitosamente.', 'success');
    setShowPdfModal(false);
    setSelectedIds(new Set());
  };

  // Todos los usuarios autenticados pueden registrar movimientos de sus activos
  const isWriteAllowed = !!user;

  if (loading && assets.length === 0) {
    return (
      <div className="page-loading">
        <span>Cargando datos del formulario...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      
      {/* Formulario de Registro (Solo Admin y Operador) */}
      {isWriteAllowed && (
        <div className="glass-card" style={{ marginBottom: '2.5rem', padding: '2rem' }}>
          <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', marginBottom: '1.5rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
            <RefreshCw size={22} color="var(--accent-primary)" />
            Registrar Traslado / Movimiento de Activo
          </h3>
          
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
            
            {/* Sección Izquierda: Datos del Traslado */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflow: 'visible' }}>
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-glass)',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                overflow: 'visible'
              }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ background: 'var(--accent-primary)', color: '#fff', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>1</span>
                  Información del Traslado
                </h4>

                {/* Selector de modo */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.25rem' }}>
                  <button
                    type="button"
                    className={`btn ${movementMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', minWidth: 'unset' }}
                    onClick={() => {
                      if (movementMode !== 'individual') {
                        setMovementMode('individual');
                        setSelectedAssetIds([]);
                        sigCanvasCreateRef.current?.clear();
                        showToast('Modo Individual activado. Firma reiniciada por seguridad.', 'info');
                      }
                    }}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    className={`btn ${movementMode === 'masivo' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', minWidth: 'unset' }}
                    onClick={() => {
                      if (movementMode !== 'masivo') {
                        setMovementMode('masivo');
                        setAssetId('');
                        sigCanvasCreateRef.current?.clear();
                        showToast('Modo Masivo activado. Firma reiniciada por seguridad.', 'info');
                      }
                    }}
                  >
                    Masivo
                  </button>
                </div>

                {/* Estado de Entrega de Activo */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Estado de Entrega de Activo *</label>
                  <select
                    className="input-field"
                    value={estadoEntrega}
                    onChange={(e) => setEstadoEntrega(e.target.value)}
                    required
                  >
                    <option value="NUEVO">NUEVO</option>
                    <option value="REPARACIÓN">REPARACIÓN</option>
                    <option value="TRASLADO">TRASLADO</option>
                    <option value="RETIRO">RETIRO</option>
                    <option value="VACACIONES">VACACIONES</option>
                    <option value="VERIFICACIÓN">VERIFICACIÓN</option>
                  </select>
                </div>

                {movementMode === 'individual' ? (
                  /* Activo — Combo buscador */
                  <div className="form-group" style={{ margin: 0, position: 'relative', zIndex: 30 }}>
                    <label className="form-label">Seleccionar Activo *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Escriba para buscar activo..."
                        value={assetId
                          ? `[${assets.find(a => a.id == assetId)?.code}] ${assets.find(a => a.id == assetId)?.name}`
                          : assetQuery}
                        onChange={e => { setAssetQuery(e.target.value); setAssetId(''); }}
                        onFocus={() => setShowAssetDrop(true)}
                        onBlur={() => setTimeout(() => setShowAssetDrop(false), 200)}
                        required={movementMode === 'individual'}
                      />
                      {showAssetDrop && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0,
                          maxHeight: '220px', overflowY: 'auto', zIndex: 9999,
                          background: '#ffffff', border: '1.5px solid var(--accent-primary)',
                          borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.20)', marginTop: '3px'
                        }}>
                          {assets
                            .filter(a => {
                              // MOV-04: Excluir activos pendientes de aceptación
                              if (a.status === 'Pendiente Aceptación' || a.status === 'PENDIENTE' || a.estatus === 'Pendiente Aceptación' || a.estatus === 'PENDIENTE') return false;
                              if (user?.role !== 'ADMIN' && a.assigned_to != user?.id) return false;
                              if (assetQuery && !`${a.code} ${a.name}`.toLowerCase().includes(assetQuery.toLowerCase())) return false;
                              return true;
                            })
                            .slice(0, 60)
                            .map(a => (
                              <div
                                key={a.id}
                                onMouseDown={() => { setAssetId(a.id); setAssetQuery(''); setShowAssetDrop(false); }}
                                style={{
                                  padding: '0.55rem 0.9rem', cursor: 'pointer', fontSize: '0.88rem',
                                  borderBottom: '1px solid rgba(0,0,0,0.06)', color: 'var(--text-main)',
                                  transition: 'background 0.15s', background: '#ffffff'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                              >
                                <span style={{ color: 'var(--accent-primary)', fontWeight: 600, marginRight: '0.5rem' }}>[{a.code}]</span>
                                {a.name}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Activo — Masivo Selector */
                  <div className="form-group" style={{ margin: 0, position: 'relative', zIndex: 30 }}>
                    <label className="form-label">Buscar y Agregar Activos *</label>

                    {/* Filtro por usuario (solo ADMIN) */}
                    {user?.role === 'ADMIN' && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <Users size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          Filtrar activos por usuario
                        </label>
                        <select
                          className="input-field"
                          value={filterUserId}
                          onChange={e => { setFilterUserId(e.target.value); setSelectedAssetIds([]); }}
                          style={{ fontSize: '0.85rem' }}
                        >
                          <option value="">-- Todos los usuarios --</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Busque activos para agregar al traslado masivo..."
                          value={assetSearchQuery}
                          onChange={e => setAssetSearchQuery(e.target.value)}
                          onFocus={() => setShowAssetDrop(true)}
                          onBlur={() => setTimeout(() => setShowAssetDrop(false), 200)}
                        />
                        {showAssetDrop && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0,
                            maxHeight: '220px', overflowY: 'auto', zIndex: 9999,
                            background: '#ffffff', border: '1.5px solid var(--accent-primary)',
                            borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.20)', marginTop: '3px'
                          }}>
                            {assets
                              .filter(a => {
                                // MOV-04: Excluir activos pendientes de aceptación
                                if (a.status === 'Pendiente Aceptación' || a.status === 'PENDIENTE' || a.estatus === 'Pendiente Aceptación' || a.estatus === 'PENDIENTE') return false;
                                if (selectedAssetIds.includes(a.id)) return false;
                                if (user?.role === 'ADMIN' && filterUserId && a.assigned_to != filterUserId) return false;
                                if (user?.role !== 'ADMIN' && a.assigned_to != user?.id) return false;
                                if (assetSearchQuery && !`${a.code} ${a.name}`.toLowerCase().includes(assetSearchQuery.toLowerCase())) return false;
                                return true;
                              })
                              .slice(0, 60)
                              .map(a => (
                                <div
                                  key={a.id}
                                  onMouseDown={() => {
                                    setSelectedAssetIds(prev => [...prev, a.id]);
                                    setAssetSearchQuery('');
                                    setShowAssetDrop(false);
                                  }}
                                  style={{
                                    padding: '0.55rem 0.9rem', cursor: 'pointer', fontSize: '0.88rem',
                                    borderBottom: '1px solid rgba(0,0,0,0.06)', color: 'var(--text-main)',
                                    transition: 'background 0.15s', background: '#ffffff'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                                >
                                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600, marginRight: '0.5rem' }}>[{a.code}]</span>
                                  {a.name}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap', minWidth: 'unset' }}
                        onClick={() => {
                          const available = assets.filter(a => {
                            if (selectedAssetIds.includes(a.id)) return false;
                            if (user?.role === 'ADMIN' && filterUserId && a.assigned_to != filterUserId) return false;
                            if (user?.role !== 'ADMIN' && a.assigned_to != user?.id) return false;
                            return true;
                          });
                          setSelectedAssetIds(prev => [...prev, ...available.map(a => a.id)]);
                        }}
                      >
                        <CheckSquare size={13} style={{ marginRight: '4px' }} />
                        Seleccionar Todos
                      </button>
                    </div>

                    {/* Lista de activos seleccionados */}
                    {selectedAssetIds.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{selectedAssetIds.length} activo(s) seleccionado(s)</span>
                          <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem', minWidth: 'unset' }} onClick={() => setSelectedAssetIds([])}>
                            Limpiar Todo
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '100px', overflowY: 'auto', padding: '0.25rem', border: '1px solid var(--border-glass)', borderRadius: '8px', background: 'var(--bg-tertiary)' }}>
                          {selectedAssetIds.map(id => {
                            const asset = assets.find(a => a.id === id);
                            return (
                              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--accent-primary-glow)', color: 'var(--text-main)', border: '1px solid var(--accent-primary)', borderRadius: '16px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                                [{asset?.code}] {asset?.name}
                                <X size={12} style={{ cursor: 'pointer', color: 'var(--accent-primary)' }} onClick={() => setSelectedAssetIds(prev => prev.filter(item => item !== id))} />
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Nuevo Responsable (Selección auto-carga la ubicación anclada del usuario) */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Nuevo Responsable</label>
                  <select 
                    className="input-field" 
                    value={destinationAssigneeId} 
                    onChange={(e) => handleUserChange(e.target.value)}
                    style={{ borderColor: destinationAssigneeId ? 'var(--accent-primary)' : 'var(--border-glass)' }}
                  >
                    <option value="">-- Seleccionar Nuevo Responsable --</option>
                    {users
                      .filter(u => u.id !== user?.id)
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} {u.oficina_nombre ? `(${u.oficina_nombre} / ${u.punto_nombre})` : ''}
                        </option>
                      ))}
                  </select>
                  {destinationAssigneeId && (() => {
                    const targetUser = users.find(u => String(u.id) === String(destinationAssigneeId));
                    return targetUser ? (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <MapPin size={13} />
                        Ubicación anclada: {targetUser.oficina_nombre || 'Sede Principal'} / {targetUser.punto_nombre || 'Punto General'}
                      </div>
                    ) : null;
                  })()}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Oficina de Destino — Combo buscador (Auto-completado al seleccionar usuario) */}
                  <div className="form-group" style={{ margin: 0, position: 'relative', zIndex: 20 }}>
                    <label className="form-label">Oficina de Destino {destinationAssigneeId ? '(Auto-cargada)' : '*'}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Buscar o auto-cargada por usuario..."
                        value={oficinaId
                          ? oficinas.find(o => o.id == oficinaId)?.nombre
                          : oficinaQuery}
                        onChange={e => { setOficinaQuery(e.target.value); setOficinaId(''); }}
                        onFocus={() => setShowOficinaDrop(true)}
                        onBlur={() => setTimeout(() => setShowOficinaDrop(false), 200)}
                        required={!destinationAssigneeId}
                      />
                      {showOficinaDrop && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0,
                          maxHeight: '200px', overflowY: 'auto', zIndex: 9999,
                          background: '#ffffff', border: '1.5px solid var(--accent-primary)',
                          borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.20)', marginTop: '3px'
                        }}>
                          {oficinas
                            .filter(o => !oficinaQuery || o.nombre.toLowerCase().includes(oficinaQuery.toLowerCase()))
                            .map(o => (
                              <div
                                key={o.id}
                                onMouseDown={() => { setOficinaId(o.id); setOficinaQuery(''); setShowOficinaDrop(false); }}
                                style={{
                                  padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.88rem',
                                  borderBottom: '1px solid rgba(0,0,0,0.06)', color: 'var(--text-main)',
                                  background: '#ffffff'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                              >
                                {o.nombre}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Punto de Destino — Combo buscador (Auto-completado al seleccionar usuario) */}
                  <div className="form-group" style={{ margin: 0, position: 'relative', zIndex: 20 }}>
                    <label className="form-label">Punto de Destino {destinationAssigneeId ? '(Auto-cargado)' : '*'}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Buscar o auto-cargado por usuario..."
                        value={puntoId
                          ? puntos.find(p => p.id == puntoId)?.nombre
                          : puntoQuery}
                        onChange={e => { setPuntoQuery(e.target.value); setPuntoId(''); }}
                        onFocus={() => setShowPuntoDrop(true)}
                        onBlur={() => setTimeout(() => setShowPuntoDrop(false), 200)}
                        required={!destinationAssigneeId}
                      />
                      {showPuntoDrop && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0,
                          maxHeight: '200px', overflowY: 'auto', zIndex: 9999,
                          background: '#ffffff', border: '1.5px solid var(--accent-primary)',
                          borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.20)', marginTop: '3px'
                        }}>
                          {puntos
                            .filter(p => !puntoQuery || p.nombre.toLowerCase().includes(puntoQuery.toLowerCase()))
                            .map(p => (
                              <div
                                key={p.id}
                                onMouseDown={() => { setPuntoId(p.id); setPuntoQuery(''); setShowPuntoDrop(false); }}
                                style={{
                                  padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.88rem',
                                  borderBottom: '1px solid rgba(0,0,0,0.06)', color: 'var(--text-main)',
                                  background: '#ffffff'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                              >
                                {p.nombre}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Razón */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Razón / Observaciones *</label>
                  <div className="search-wrapper">
                    <FileText size={16} color="var(--text-dark)" className="search-icon" />
                    <input type="text" className="input-field search-input" placeholder="Ej: Mantenimiento preventivo programado / Traslado físico de sede" value={reason} onChange={(e) => setReason(e.target.value)} required />
                  </div>
                </div>
              </div>
            </div>

            {/* Sección Derecha: Autorización (Quien Solicita / Entrega) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-glass)',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                height: '100%',
                boxSizing: 'border-box'
              }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ background: 'var(--accent-primary)', color: '#fff', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>2</span>
                  Autorización de Quien Entrega
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Cédula del Solicitante *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Número de cédula"
                      value={cedulaOrigen}
                      readOnly
                      style={{ backgroundColor: 'var(--bg-tertiary)', opacity: 0.8, cursor: 'not-allowed' }}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Cargo del Solicitante *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Cargo / Rol"
                      value={cargoOrigen}
                      readOnly
                      style={{ backgroundColor: 'var(--bg-tertiary)', opacity: 0.8, cursor: 'not-allowed' }}
                      required
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Firma Digital del Solicitante *</label>
                  <div 
                    ref={(el) => {
                      if (el && sigCanvasCreateRef.current) {
                        const canvas = sigCanvasCreateRef.current.getCanvas();
                        if (canvas) {
                          const rect = el.getBoundingClientRect();
                          if (rect.width > 0 && canvas.width !== Math.floor(rect.width)) {
                            canvas.width = Math.floor(rect.width);
                            canvas.height = 140;
                          }
                        }
                      }
                    }}
                    style={{
                      border: '2px dashed var(--accent-primary)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      background: '#ffffff',
                      position: 'relative'
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '6px', left: '50%', transform: 'translateX(-50%)',
                      fontSize: '0.7rem', color: '#94a3b8', pointerEvents: 'none', userSelect: 'none'
                    }}>Firme aquí con el mouse o pantalla táctil</div>
                    <SignatureCanvas
                      ref={sigCanvasCreateRef}
                      penColor="#000000"
                      canvasProps={{
                        style: { display: 'block', width: '100%', height: '140px', cursor: 'crosshair', touchAction: 'none' }
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => sigCanvasCreateRef.current?.clear()}
                    >
                      Limpiar Firma
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '0.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ minWidth: '170px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    onClick={buildPreviewPDF}
                  >
                    <Eye size={16} /> Previsualizar PDF
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ minWidth: '200px', height: '46px' }} disabled={submitting}>
                    {submitting ? 'Registrando...' : 'Registrar Movimiento'}
                  </button>
                </div>
              </div>
            </div>

          </form>
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
