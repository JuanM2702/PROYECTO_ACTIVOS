import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Signature, CheckCircle, XCircle, Clock, Check, X, FileText, Download, ExternalLink, Eye, CheckSquare } from 'lucide-react';
import { useAuth } from '../App';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { ATLAS_LOGO } from '../assets/logo-base64';
import '../styles/forms.css';
import '../styles/layout.css';

export default function AssetAcceptance() {
  const { user, showToast } = useAuth();
  
  const [acceptances, setAcceptances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDIENTE');
  const [showSignModal, setShowSignModal] = useState(false);
  const [selectedAct, setSelectedAct] = useState(null); // Puede ser objeto individual o Array de actas
  const [selectedAcceptanceIds, setSelectedAcceptanceIds] = useState([]); // Selección masiva
  const [itemDecisions, setItemDecisions] = useState({}); // Mapa de decisiones por activo: { [id]: { status: 'ACEPTADO'|'RECHAZADO', comments: '' } }
  const [decision, setDecision] = useState('ACEPTADO');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cedulaDestino, setCedulaDestino] = useState('');
  const [cargoDestino, setCargoDestino] = useState('');
  const sigCanvasRef = useRef(null);

  // Paginación y búsqueda
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  const fetchAcceptances = async () => {
    setLoading(true);
    try {
      const params = { page, limit, status: activeTab };
      if (search) params.search = search;

      const response = await axios.get('/api/acceptances', { params });
      if (response.data.success) {
        setAcceptances(response.data.acceptances);
        if (response.data.pagination) {
          setTotal(response.data.pagination.total);
          setTotalPages(response.data.pagination.totalPages);
        }
      }
    } catch (err) {
      showToast('Error al obtener bandeja de firmas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewPDF = async (actId) => {
    try {
      const response = await axios.get(`/api/acceptances/${actId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      showToast('Error al cargar el documento PDF. Posiblemente no exista en el repositorio.', 'error');
    }
  };

  useEffect(() => {
    fetchAcceptances();
    setSelectedAcceptanceIds([]);
  }, [activeTab, page, limit, search]);

  // Selección individual o masiva para firma
  const handleOpenSign = (acta) => {
    setSelectedAct(acta);
    setDecision('ACEPTADO');
    setComments('');
    setCedulaDestino(user?.cedula || '');
    setCargoDestino(user?.cargo || 'Funcionario / Responsable');

    // Inicializar mapa de decisiones individuales para activos del lote
    const initialDecisions = {};
    if (Array.isArray(acta)) {
      acta.forEach(a => {
        initialDecisions[a.id] = { status: 'ACEPTADO', comments: '' };
      });
    } else if (acta && acta.assets_detail && Array.isArray(acta.assets_detail)) {
      acta.assets_detail.forEach(a => {
        initialDecisions[a.id] = { status: 'ACEPTADO', comments: '' };
      });
    } else if (acta && acta.ids && Array.isArray(acta.ids)) {
      acta.ids.forEach(id => {
        initialDecisions[id] = { status: 'ACEPTADO', comments: '' };
      });
    } else if (acta && acta.id) {
      initialDecisions[acta.id] = { status: 'ACEPTADO', comments: '' };
    }
    setItemDecisions(initialDecisions);
    setShowSignModal(true);
  };

  const handleSetAllDecisions = (newStatus) => {
    setDecision(newStatus);
    setItemDecisions(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(id => {
        updated[id] = { ...updated[id], status: newStatus };
      });
      return updated;
    });
  };

  const handleItemDecisionChange = (id, newStatus) => {
    setItemDecisions(prev => ({
      ...prev,
      [id]: { ...prev[id], status: newStatus }
    }));
  };

  const handleItemCommentChange = (id, newComments) => {
    setItemDecisions(prev => ({
      ...prev,
      [id]: { ...prev[id], comments: newComments }
    }));
  };

  // Toggle de Selección Masiva (Garantiza estrictamente el MISMO entregante)
  const handleToggleSelectAcceptance = (act) => {
    if (selectedAcceptanceIds.includes(act.id)) {
      setSelectedAcceptanceIds(prev => prev.filter(id => id !== act.id));
    } else {
      if (selectedAcceptanceIds.length > 0) {
        const firstSelected = acceptances.find(a => selectedAcceptanceIds.includes(a.id));
        const firstSenderKey = firstSelected?.cedula_origen || firstSelected?.sender_name || 'SIN_ENTREGANTE';
        const newSenderKey = act.cedula_origen || act.sender_name || 'SIN_ENTREGANTE';

        if (firstSenderKey !== newSenderKey) {
          showToast(`Para garantizar la validez legal de las firmas, solo puede realizar aceptación masiva sobre activos que provienen del MISMO entregante (${firstSelected?.sender_name || 'Mismo entregante'}).`, 'warning');
          return;
        }
      }
      setSelectedAcceptanceIds(prev => [...prev, act.id]);
    }
  };

  const previewAcceptancePDF = () => {
    if (!selectedAct) return;
    if (!cedulaDestino || !cargoDestino) {
      showToast('Por favor complete la cédula y cargo del receptor antes de previsualizar el PDF.', 'error');
      return;
    }
    const signatureData = sigCanvasRef.current && !sigCanvasRef.current.isEmpty()
      ? sigCanvasRef.current.toDataURL('image/png')
      : null;
    const doc = buildAcceptancePDF(selectedAct, decision, comments, {
      cedula_destino: cedulaDestino,
      cargo_destino: cargoDestino,
      firma_destino: signatureData,
      itemDecisions
    });
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Previsualización de acta generada.', 'info');
  };

  const handleSign = async (e) => {
    e.preventDefault();
    if (!selectedAct) return;

    const isBulk = Array.isArray(selectedAct) || selectedAct.is_bulk;
    
    // Obtener lista completa de items a procesar con sus decisiones individuales
    let itemsList = [];
    if (Array.isArray(selectedAct)) {
      itemsList = selectedAct.map(a => ({
        id: a.id,
        status: itemDecisions[a.id]?.status || decision,
        comments: itemDecisions[a.id]?.comments || comments
      }));
    } else if (selectedAct.assets_detail && Array.isArray(selectedAct.assets_detail)) {
      itemsList = selectedAct.assets_detail.map(a => ({
        id: a.id,
        status: itemDecisions[a.id]?.status || decision,
        comments: itemDecisions[a.id]?.comments || comments
      }));
    } else if (selectedAct.ids && Array.isArray(selectedAct.ids)) {
      itemsList = selectedAct.ids.map(id => ({
        id: id,
        status: itemDecisions[id]?.status || decision,
        comments: itemDecisions[id]?.comments || comments
      }));
    } else {
      itemsList = [{
        id: selectedAct.id,
        status: itemDecisions[selectedAct.id]?.status || decision,
        comments: itemDecisions[selectedAct.id]?.comments || comments
      }];
    }

    const ids = itemsList.map(item => item.id);
    const hasAnyAccepted = itemsList.some(item => item.status === 'ACEPTADO');

    if (hasAnyAccepted) {
      if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
        showToast('Por favor, proporcione su firma digital para los activos aceptados.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      let pdfBase64 = null;
      let signatureData = null;
      if (hasAnyAccepted && sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
        signatureData = sigCanvasRef.current.toDataURL('image/png');
        pdfBase64 = generateAcceptancePDFDataUri(selectedAct, decision, comments, {
          cedula_destino: cedulaDestino,
          cargo_destino: cargoDestino,
          firma_destino: signatureData,
          itemDecisions
        });
      }

      let response;
      if (isBulk) {
        response = await axios.put('/api/acceptances/bulk-respond', {
          items: itemsList,
          ids: ids,
          status: decision,
          comments,
          cedula_destino: cedulaDestino,
          cargo_destino: cargoDestino,
          firma_destino: signatureData,
          pdf_base64: pdfBase64
        });
      } else {
        const item = itemsList[0];
        response = await axios.put(`/api/acceptances/${item.id}`, {
          status: item.status,
          comments: item.comments || comments,
          cedula_destino: cedulaDestino,
          cargo_destino: cargoDestino,
          firma_destino: signatureData,
          pdf_base64: pdfBase64
        });
      }

      if (response.data.success) {
        showToast(response.data.message || 'Activos procesados correctamente.', 'success');
        setShowSignModal(false);
        setSelectedAct(null);
        setSelectedAcceptanceIds([]);
        setItemDecisions({});
        setComments('');
        setCedulaDestino('');
        setCargoDestino('');
        fetchAcceptances();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al firmar las actas de aceptación.';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };


  const generateAcceptancePDFDataUri = (act, status, obs, options) => {
    const doc = buildAcceptancePDF(act, status, obs, options);
    return doc.output('datauristring');
  };

  const buildAcceptancePDF = (actInput, status, obs, options = {}) => {
    let actList = [];

    if (Array.isArray(actInput)) {
      actList = actInput.flatMap(item => {
        if (item.assets_detail && Array.isArray(item.assets_detail)) {
          return item.assets_detail.map(a => ({
            id: a.id,
            asset_category: a.category || a.asset_category || 'AF',
            asset_name: a.name || a.asset_name || 'Activo',
            asset_code: a.code || a.asset_code || 'N/A',
            asset_value: a.value !== undefined ? a.value : (a.asset_value || 0),
            status: options.itemDecisions?.[a.id]?.status || status,
            comments: options.itemDecisions?.[a.id]?.comments || obs || item.comments || 'Entrega en conformidad para uso operativo'
          }));
        }
        return [{
          id: item.id,
          asset_category: item.asset_category || item.category || 'AF',
          asset_name: item.asset_name || item.name || 'Activo',
          asset_code: item.asset_code || item.code || 'N/A',
          asset_value: item.asset_value !== undefined ? item.asset_value : (item.value || 0),
          status: options.itemDecisions?.[item.id]?.status || status,
          comments: options.itemDecisions?.[item.id]?.comments || obs || item.comments || 'Entrega en conformidad para uso operativo'
        }];
      });
    } else if (actInput && actInput.assets_detail && Array.isArray(actInput.assets_detail)) {
      actList = actInput.assets_detail.map(a => ({
        id: a.id,
        asset_category: a.category || a.asset_category || 'AF',
        asset_name: a.name || a.asset_name || 'Activo',
        asset_code: a.code || a.asset_code || 'N/A',
        asset_value: a.value !== undefined ? a.value : (a.asset_value || 0),
        status: options.itemDecisions?.[a.id]?.status || status,
        comments: options.itemDecisions?.[a.id]?.comments || obs || actInput.comments || 'Entrega en conformidad para uso operativo'
      }));
    } else if (actInput) {
      actList = [{
        id: actInput.id,
        asset_category: actInput.asset_category || actInput.category || 'AF',
        asset_name: actInput.asset_name || actInput.name || 'Activo',
        asset_code: actInput.asset_code || actInput.code || 'N/A',
        asset_value: actInput.asset_value !== undefined ? actInput.asset_value : (actInput.value || 0),
        status: options.itemDecisions?.[actInput.id]?.status || status,
        comments: options.itemDecisions?.[actInput.id]?.comments || obs || actInput.comments || 'Entrega en conformidad para uso operativo'
      }];
    }

    const act = Array.isArray(actInput) ? actInput[0] : (actInput || {});

    const doc = new jsPDF('portrait', 'mm', 'letter');
    
    doc.setLineWidth(0.4);
    doc.setDrawColor(0, 0, 0);

    // Header Frame
    doc.rect(10, 10, 195, 20);
    doc.line(70, 10, 70, 30);
    doc.line(150, 10, 150, 30);
    
    // Logo Box
    doc.addImage(ATLAS_LOGO, 'PNG', 13, 11, 52, 18);

    // Header Title
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FORMATO ACTA DE ENTREGA Y/O', 110, 17, { align: 'center' });
    doc.text('DEVOLUCIÓN DE ACTIVOS', 110, 23, { align: 'center' });

    // Metadata Right Box
    doc.setFontSize(8);
    doc.text('CÓDIGO: FR-GA-57', 152, 16);
    doc.line(150, 18, 205, 18);
    doc.text('VERSIÓN: 6 Del 12/07/2023', 152, 23);
    doc.line(150, 25, 205, 25);
    doc.text('PÁGINA: 1 de 1', 152, 29);

    // Info Table Grid
    let y = 33;
    const dateObj = new Date(act.assigned_date || Date.now());
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear());

    doc.rect(10, y, 195, 46);
    doc.line(10, y + 6, 205, y + 6);
    doc.line(10, y + 14, 205, y + 14);
    doc.line(10, y + 22, 205, y + 22);
    doc.line(10, y + 30, 205, y + 30);
    doc.line(10, y + 38, 205, y + 38);

    doc.line(55, y, 55, y + 6);
    doc.line(85, y, 85, y + 6);
    doc.line(125, y, 125, y + 6);
    doc.line(165, y, 165, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FECHA:', 12, y + 4.5);
    doc.text(`DIA: ${day}`, 60, y + 4.5);
    doc.text(`MES: ${month}`, 95, y + 4.5);
    doc.text(`AÑO: ${year}`, 135, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.text('QUIEN SOLICITA / ENTREGA:', 12, y + 11.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${act.sender_name || 'Operador / Entregante'} (Cédula: ${act.cedula_origen || 'N/A'} | Cargo: ${act.cargo_origen || 'N/A'})`, 58, y + 11.5);

    doc.setFont('helvetica', 'bold');
    doc.text('QUIEN RECIBE:', 12, y + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${act.assignee_name || 'N/A'} (Cédula: ${options.cedula_destino || act.cedula_destino || '_______________________'})`, 58, y + 19.5);

    doc.setFont('helvetica', 'bold');
    doc.text('CARGO Y PROCESO RECIBE:', 12, y + 27.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${options.cargo_destino || act.cargo_destino || 'Funcionario / Responsable'} - ${act.asset_location || 'Sede Principal'}`, 58, y + 27.5);

    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO ENTREGA DE ACTIVO:', 12, y + 35.5);
    doc.setFontSize(7);
    const est = String(act.estado_entrega || 'TRASLADO').toUpperCase();
    doc.text(`NUEVO: [ ${est === 'NUEVO' ? 'X' : ' '} ]`, 60, y + 35.5);
    doc.text(`REPARACIÓN: [ ${est === 'REPARACIÓN' ? 'X' : ' '} ]`, 95, y + 35.5);
    doc.text(`TRASLADO: [ ${est === 'TRASLADO' ? 'X' : ' '} ]`, 135, y + 35.5);
    doc.text(`RETIRO: [ ${est === 'RETIRO' ? 'X' : ' '} ]`, 60, y + 42);
    doc.text(`VACACIONES: [ ${est === 'VACACIONES' ? 'X' : ' '} ]`, 95, y + 42);
    doc.text(`VERIFICACIÓN: [ ${est === 'VERIFICACIÓN' ? 'X' : ' '} ]`, 135, y + 42);

    y += 52;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('HAGO CONSTAR', 107.5, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('Que he recibido de Gana Gana / Red Multiservicios los siguientes artículos:', 10, y);

    y += 4;
    const itemsHead = [['TIPO DE ACTIVO (AF/AC)', 'NOMBRE DE ACTIVO', 'ID PLACA ACTIVO', 'MARCA/MODELO ACTIVO', 'ESTADO (B/R/D)', 'OBSERVACIONES ADICIONALES']];
    
    // Generación dinámica de filas para cada uno de los activos del lote
    const itemsBody = actList.map(a => {
      const itemStatus = a.status || options.itemDecisions?.[a.id]?.status || status;
      const itemComment = a.comments || options.itemDecisions?.[a.id]?.comments || obs || 'Entrega en conformidad para uso operativo';
      return [
        a.asset_category || 'AF',
        a.asset_name || 'Activo',
        a.asset_code || 'N/A',
        `Valor: $${Number(a.asset_value || 0).toLocaleString('es-CO')}`,
        itemStatus === 'ACEPTADO' ? 'B' : itemStatus === 'RECHAZADO' ? 'D' : 'R',
        itemComment
      ];
    });


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
    const legalP1 = "Recibo los activos y/o inventarios relacionados en la presenta acta y sus anexos los cuales estarán bajo mi responsabilidad, les daré el uso y trato adecuado al desempeño de mis funciones y la destinación prevista para cada uno de ellos. Me comprometo a informar oportunamente al área de activos fijos sobre cualquier desplazamiento, siniestro, reparación, traslado, cambio de responsables, por medio de los formatos respectivos.";
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
    doc.rect(10, y, 95, 34);
    doc.rect(110, y, 95, 34);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA DE QUIEN ENTREGA', 12, y + 24);
    doc.text(`N° CÉDULA: ${act.cedula_origen || ''}`, 12, y + 27);
    doc.text(`NOMBRE: ${act.sender_name || 'Operador / Entregante'}`, 12, y + 30);
    doc.text(`CARGO: ${act.cargo_origen || ''}`, 12, y + 33);

    if (act.firma_origen) {
      try { doc.addImage(act.firma_origen, 'PNG', 25, y + 2, 60, 18); } catch(e) {}
    }

    doc.text('FIRMA DE QUIEN RECIBE', 112, y + 24);
    doc.text(`N° CÉDULA: ${options.cedula_destino || act.cedula_destino || ''}`, 112, y + 27);
    doc.text(`NOMBRE: ${act.assignee_name || ''}`, 112, y + 30);
    doc.text(`CARGO: ${options.cargo_destino || act.cargo_destino || ''}`, 112, y + 33);

    const destSig = options.firma_destino || act.firma_destino || null;
    if (destSig) {
      try { doc.addImage(destSig, 'PNG', 125, y + 2, 60, 18); } catch(e) {}
    }

    y += 38;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Visto Bueno de Activos Fijos_________________   Esta firma será necesaria cuando aplique', 10, y);

    return doc;
  };

  if (loading && acceptances.length === 0) {
    return (
      <div className="page-loading">
        <span>Cargando bandeja de firmas...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      
      <div className="filters-bar" style={{ marginBottom: '1.25rem' }}>
        <div className="tabs-container" style={{ margin: 0, border: 'none', padding: 0 }}>
          <button
            onClick={() => { setActiveTab('PENDIENTE'); setPage(1); }}
            className={`tab-btn ${activeTab === 'PENDIENTE' ? 'active' : ''}`}
          >
            <Signature size={16} />
            <span>Pendientes de Firma ({activeTab === 'PENDIENTE' ? total : 0})</span>
          </button>
          <button
            onClick={() => { setActiveTab('HISTORIAL'); setPage(1); }}
            className={`tab-btn ${activeTab === 'HISTORIAL' ? 'active' : ''}`}
          >
            <CheckCircle size={16} />
            <span>Historial de Firmas ({activeTab === 'HISTORIAL' ? total : 0})</span>
          </button>
        </div>

        <div className="search-wrapper" style={{ maxWidth: '300px' }}>
          <input 
            type="text"
            className="input-field search-input"
            placeholder="Buscar por código, activo o persona..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Barra de Acciones Masivas (Garantiza el mismo entregante) */}
      {activeTab === 'PENDIENTE' && selectedAcceptanceIds.length > 0 && (
        <div style={{
          background: 'var(--accent-primary-glow)',
          border: '1px solid var(--accent-primary)',
          borderRadius: '12px',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckSquare size={20} color="var(--accent-primary)" />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600 }}>
              {selectedAcceptanceIds.length} activo(s) seleccionado(s) 
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontWeight: 500 }}>
                (Entregante: {acceptances.find(a => selectedAcceptanceIds.includes(a.id))?.sender_name || 'Mismo entregante'})
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
              onClick={() => setSelectedAcceptanceIds([])}
            >
              Limpiar Selección
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => {
                const selectedActs = acceptances.filter(a => selectedAcceptanceIds.includes(a.id));
                setSelectedAct(selectedActs);
                setDecision('ACEPTADO');
                setComments('');
                setCedulaDestino(user?.cedula || '');
                setCargoDestino(user?.cargo || 'Funcionario / Responsable');
                setShowSignModal(true);
              }}
            >
              <Signature size={16} /> Firmar y Aceptar Lote ({selectedAcceptanceIds.length})
            </button>
          </div>
        </div>
      )}

      {activeTab === 'PENDIENTE' ? (
        acceptances.length === 0 ? (
          <div className="empty-state glass-card">
            <CheckCircle size={40} className="empty-state-icon" />
            <h4 className="empty-state-title">¡Bandeja Limpia!</h4>
            <p>No tienes actas de entrega o asignación de activos pendientes de aceptación.</p>
          </div>
        ) : (
          <div>
            <div className="cards-grid">
              {acceptances.map((act) => {
                const isSelected = selectedAcceptanceIds.includes(act.id);
                const isBulkCard = act.is_bulk || act.total_activos > 1;

                return (
                  <div key={act.id} className={`glass-card card-item ${isSelected ? 'selected-card' : ''}`} style={isSelected ? { border: '1.5px solid var(--accent-primary)', background: 'rgba(19, 82, 230, 0.03)' } : {}}>
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectAcceptance(act)}
                          style={{ width: '18px', height: '18px', marginTop: '3px', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                        />
                        <div>
                          <span className="card-code">{act.asset_code}</span>
                          <h4 className="card-title">{act.asset_name}</h4>
                        </div>
                      </div>
                      <span className={`badge ${isBulkCard ? 'badge-primary' : 'badge-pending'}`} style={isBulkCard ? { backgroundColor: 'rgba(19, 82, 230, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' } : {}}>
                        {isBulkCard ? `Acta Masiva (${act.total_activos} activos)` : 'Pendiente Firma'}
                      </span>
                    </div>

                    <div className="card-info-box">
                      <div><strong>Entregante:</strong> {act.sender_name || 'Operador / Entregante'}</div>
                      {isBulkCard ? (
                        <>
                          <div style={{ marginTop: '0.2rem' }}><strong>Activos incluidos ({act.total_activos}):</strong></div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.3rem', marginBottom: '0.4rem', maxHeight: '90px', overflowY: 'auto' }}>
                            {act.assets_detail?.map((item, idx) => (
                              <span key={item.id || idx} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', padding: '2px 7px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 500 }}>
                                [{item.code}] {item.name}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div><strong>Categoría:</strong> {act.asset_category}</div>
                      )}
                      <div><strong>Ubicación:</strong> {act.asset_location}</div>
                      <div><strong>Valor Total:</strong> ${Number(act.asset_value || 0).toLocaleString('es-CO')}</div>
                      <div><strong>Asignado el:</strong> {new Date(act.assigned_date).toLocaleDateString('es-CO', { dateStyle: 'long' })}</div>
                    </div>

                    <button
                      className="btn btn-primary full-btn"
                      onClick={() => handleOpenSign(act)}
                    >
                      <Signature size={15} />
                      <span>{isBulkCard ? `Revisar y Firmar Delivery Masivo (${act.total_activos} Activos)` : 'Revisar y Firmar Entrega'}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Paginación */}
            <div className="pagination-container" style={{ marginTop: '1.5rem', borderRadius: '12px' }}>
              <div>
                Mostrando <strong>{total === 0 ? 0 : (page - 1) * limit + 1}</strong> - <strong>{Math.min(page * limit, total)}</strong> de <strong>{total.toLocaleString('es-CO')}</strong> actas
              </div>
              <div className="pagination-controls">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Mostrar:
                  <select 
                    className="pagination-select" 
                    value={limit} 
                    onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
                  >
                    <option value={10}>10 por pág</option>
                    <option value={20}>20 por pág</option>
                    <option value={50}>50 por pág</option>
                  </select>
                </label>
                <button className="pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  &laquo; Anterior
                </button>
                <span>Página <strong>{page}</strong> de <strong>{totalPages}</strong></span>
                <button className="pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Siguiente &raquo;
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="glass-card table-card">
          {acceptances.length === 0 ? (
            <div className="empty-state">
              Aún no se registran firmas completadas en el historial.
            </div>
          ) : (
            <>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Activo</th>
                    <th>Asignado a</th>
                    <th>Fecha Firma</th>
                    <th>Respuesta</th>
                    <th>Comentarios</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptances.map((act) => {
                    const isBulkCard = act.is_bulk || act.total_activos > 1;
                    const mainId = act.ids ? act.ids[0] : act.id;

                    return (
                      <tr key={act.id}>
                        <td className="col-code">
                          {isBulkCard ? (
                            <span className="badge badge-pending" style={{ backgroundColor: 'rgba(19, 82, 230, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                              Acta Masiva ({act.total_activos})
                            </span>
                          ) : (
                            act.asset_code
                          )}
                        </td>
                        <td>{act.asset_name}</td>
                        <td>{act.assignee_name}</td>
                        <td>{new Date(act.acceptance_date || act.assigned_date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td>
                          <span className={`badge ${act.status === 'ACEPTADO' ? 'badge-active' : 'badge-rejected'}`}>
                            {act.status === 'ACEPTADO' ? 'Aceptado' : 'Rechazado'}
                          </span>
                        </td>
                        <td>{act.comments || 'Sin observaciones'}</td>
                        <td>
                          {act.status === 'ACEPTADO' && (
                            <button 
                              className="btn btn-secondary icon-btn" 
                              style={{ padding: '0.3rem 0.5rem' }} 
                              onClick={() => handleViewPDF(mainId)}
                              title="Ver Acta PDF"
                            >
                              <ExternalLink size={14} /> Ver PDF
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Paginación */}
              <div className="pagination-container">
                <div>
                  Mostrando <strong>{total === 0 ? 0 : (page - 1) * limit + 1}</strong> - <strong>{Math.min(page * limit, total)}</strong> de <strong>{total.toLocaleString('es-CO')}</strong> actas
                </div>
                <div className="pagination-controls">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Mostrar:
                    <select 
                      className="pagination-select" 
                      value={limit} 
                      onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
                    >
                      <option value={10}>10 por pág</option>
                      <option value={20}>20 por pág</option>
                      <option value={50}>50 por pág</option>
                    </select>
                  </label>
                  <button className="pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                    &laquo; Anterior
                  </button>
                  <span>Página <strong>{page}</strong> de <strong>{totalPages}</strong></span>
                  <button className="pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    Siguiente &raquo;
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {showSignModal && selectedAct && (
        <div className="modal-overlay" onClick={() => setShowSignModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedAct.is_bulk || Array.isArray(selectedAct) 
                  ? `Firma Digital: Acta Masiva (${selectedAct.total_activos || selectedAct.length} Activos)`
                  : `Firma Digital: ${selectedAct.asset_code}`}
              </h3>
              <button className="modal-close-btn" onClick={() => setShowSignModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSign}>
              <div className="modal-body modal-body-form">
                {selectedAct.is_bulk || Array.isArray(selectedAct) ? (
                  <>
                    <div className="info-box" style={{ marginBottom: '1rem', padding: '0.65rem 0.85rem' }}>
                      <strong>Acta Masiva ({(selectedAct.assets_detail || selectedAct).length} Activos) - Entregante: {selectedAct.sender_name || (Array.isArray(selectedAct) ? selectedAct[0]?.sender_name : 'Operador')}</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Deslice el botón en los activos que desee <strong>Denegar / Rechazar</strong>.
                      </p>
                    </div>

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>
                          Decisión por Activo del Lote
                        </label>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                            onClick={() => handleSetAllDecisions('ACEPTADO')}
                          >
                            ✓ Conforme Todos
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fecdd3', background: '#fff1f2' }}
                            onClick={() => handleSetAllDecisions('RECHAZADO')}
                          >
                            ✕ Denegar Todos
                          </button>
                        </div>
                      </div>

                      <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        {(selectedAct.assets_detail || selectedAct).map((item, idx) => {
                          const itemId = item.id || idx;
                          const currentStatus = itemDecisions[itemId]?.status || decision;
                          const currentComment = itemDecisions[itemId]?.comments || '';

                          return (
                            <div key={itemId} className={`bulk-item-row ${currentStatus === 'RECHAZADO' ? 'rejected-row' : ''}`}>
                              <div className="bulk-item-header">
                                <div className="bulk-item-info">
                                  <span className="bulk-item-code">[{item.code || item.asset_code}]</span>
                                  <span className="bulk-item-name">{item.name || item.asset_name}</span>
                                </div>
                                <div className="bulk-toggle-wrapper">
                                  <span className={`toggle-status-label ${currentStatus === 'ACEPTADO' ? 'text-success' : 'text-danger'}`}>
                                    {currentStatus === 'ACEPTADO' ? '✓ Conforme' : '✕ Denegado'}
                                  </span>
                                  <label className="switch" title={currentStatus === 'ACEPTADO' ? 'Cambiar a Denegado' : 'Cambiar a Conforme'}>
                                    <input 
                                      type="checkbox"
                                      checked={currentStatus === 'ACEPTADO'}
                                      onChange={(e) => handleItemDecisionChange(itemId, e.target.checked ? 'ACEPTADO' : 'RECHAZADO')}
                                    />
                                    <span className="slider round"></span>
                                  </label>
                                </div>
                              </div>

                              {currentStatus === 'RECHAZADO' && (
                                <div className="bulk-item-reason">
                                  <input
                                    type="text"
                                    className="input-field reason-input"
                                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', marginTop: '0.4rem', borderColor: '#fca5a5' }}
                                    placeholder="Indique la causa o motivo de denegación de este activo *"
                                    value={currentComment}
                                    onChange={(e) => handleItemCommentChange(itemId, e.target.value)}
                                    required
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '0.75rem' }}>
                      <label className="form-label" style={{ fontSize: '0.82rem' }}>Observaciones Generales del Acta (Opcional)</label>
                      <textarea
                        className="input-field"
                        style={{ height: '55px', fontSize: '0.82rem' }}
                        placeholder="Observaciones generales adicionales..."
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                      />
                    </div>
                  </>
                ) : (

                  <>
                    <div className="info-box">
                      <strong>{selectedAct.asset_name}</strong>
                      <p>Categoría: {selectedAct.asset_category} | Ubicación: {selectedAct.asset_location}</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent-primary)' }}>Entregante: {selectedAct.sender_name || 'Operador / Entregante'}</p>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Estado de Recepción</label>
                      <div className="radio-group">
                        <label className={`radio-option ${decision === 'ACEPTADO' ? 'active' : ''}`}>
                          <input type="radio" name="decision" value="ACEPTADO" checked={decision === 'ACEPTADO'} onChange={(e) => {
                            setDecision(e.target.value);
                            handleSetAllDecisions(e.target.value);
                          }} />
                          <Check size={16} /> Conforme
                        </label>
                        <label className={`radio-option ${decision === 'RECHAZADO' ? 'active' : ''}`}>
                          <input type="radio" name="decision" value="RECHAZADO" checked={decision === 'RECHAZADO'} onChange={(e) => {
                            setDecision(e.target.value);
                            handleSetAllDecisions(e.target.value);
                          }} />
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
                  </>
                )}


                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Cédula del Receptor *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Cédula de quien recibe"
                      value={cedulaDestino}
                      readOnly
                      style={{ backgroundColor: 'var(--bg-tertiary)', opacity: 0.8, cursor: 'not-allowed' }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cargo del Receptor *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Cargo de quien recibe"
                      value={cargoDestino}
                      readOnly
                      style={{ backgroundColor: 'var(--bg-tertiary)', opacity: 0.8, cursor: 'not-allowed' }}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Firma Digital *</label>
                  <div 
                    className="signature-canvas-wrapper"
                    ref={(el) => {
                      if (el && sigCanvasRef.current) {
                        const canvas = sigCanvasRef.current.getCanvas();
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
                      ref={sigCanvasRef}
                      penColor="#000000"
                      canvasProps={{
                        style: { display: 'block', width: '100%', height: '140px', cursor: 'crosshair', touchAction: 'none' }
                      }}
                    />
                  </div>
                  <button type="button" className="btn btn-secondary photo-remove-btn" style={{ marginTop: '0.5rem' }} onClick={() => sigCanvasRef.current?.clear()}>
                    Limpiar Firma
                  </button>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSignModal(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-secondary" onClick={previewAcceptancePDF} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Eye size={16} /> Previsualizar PDF
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

      {/* Reglas CSS Locales para Pestañas y Selección */}
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

        /* Estilos limpios para Botón Deslizante (Toggle Switch) en Lote */
        .bulk-item-row {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 7px 12px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }
        .bulk-item-row.rejected-row {
          border-color: #fca5a5;
          background: #fff5f5;
        }
        .bulk-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .bulk-item-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }
        .bulk-item-code {
          font-weight: 700;
          font-size: 0.8rem;
          color: #1352e6;
          white-space: nowrap;
        }
        .bulk-item-name {
          font-size: 0.82rem;
          font-weight: 600;
          color: #1e293b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bulk-toggle-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .toggle-status-label {
          font-size: 0.78rem;
          font-weight: 700;
          min-width: 76px;
          text-align: right;
        }
        .text-success { color: #16a34a; }
        .text-danger { color: #dc2626; }

        /* Modern Toggle Switch */
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #ef4444; /* Rojo si está denegado */
          transition: .25s ease;
          border-radius: 24px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .25s ease;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        input:checked + .slider {
          background-color: #16a34a; /* Verde si está conforme */
        }
        input:checked + .slider:before {
          transform: translateX(20px);
        }
      `}</style>
    </div>
  );
}

