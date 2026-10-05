import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, Edit2, Trash2, Camera, Upload, X, Download, Check, AlertTriangle, FileSpreadsheet, CheckCircle2, AlertCircle, Eye, Tag, Calendar, User, MapPin, DollarSign, Shield, FileText, Package } from 'lucide-react';
import { useAuth } from '../App';
import SearchableSelect from '../components/SearchableSelect';
import '../styles/forms.css';
import '../styles/layout.css';

// Funciones auxiliares para autocompletado bidireccional de proveedores
const normStr = (str) => (str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const cleanNitStr = (str) => (str || '').replace(/[^0-9kK]/g, '');

const deriveNitFromNombre = (selectedNombre, proveedoresList = []) => {
  if (!selectedNombre || !Array.isArray(proveedoresList)) return '';
  const normVal = normStr(selectedNombre);
  if (!normVal) return '';
  const matched = proveedoresList.find(
    (p) => p.nombre && normStr(p.nombre) === normVal
  ) || proveedoresList.find(
    (p) => p.nombre && normStr(p.nombre).includes(normVal)
  );
  return matched?.nit || '';
};

const deriveNombreFromNit = (selectedNit, proveedoresList = []) => {
  if (!selectedNit || !Array.isArray(proveedoresList)) return '';
  const cleanInput = cleanNitStr(selectedNit);
  const rawInput = selectedNit.trim();
  if (!cleanInput && !rawInput) return '';
  const matched = proveedoresList.find(
    (p) => p.nit && (p.nit.trim() === rawInput || (cleanInput && cleanNitStr(p.nit) === cleanInput))
  );
  return matched?.nombre || '';
};

export default function AssetInventory() {
  const { user, showToast } = useAuth();
  
  // Estados de datos y paginación
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Datos de catálogo para filtros y formulario
  const [resourceTypes, setResourceTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filteredBrands, setFilteredBrands] = useState([]);
  const [categoryAssetNames, setCategoryAssetNames] = useState([]);
  const [estados, setEstados] = useState([]);
  const [locationsList, setLocationsList] = useState([]); // Listado de dim_ubicaciones
  const [companies, setCompanies] = useState([]);
  const [proveedoresList, setProveedoresList] = useState([]);
  
  // Estados de filtros
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cedulaFilter, setCedulaFilter] = useState('');
  const [clasificacionFilter, setClasificacionFilter] = useState('');

  // Selección múltiple para bulk operations
  const [selectedIds, setSelectedIds] = useState([]);

  // Estados de modal
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingAsset, setViewingAsset] = useState(null);

  // Modalidad de creación: 'individual' o 'bulk'
  const [creationMode, setCreationMode] = useState('individual');
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkAllowPartial, setBulkAllowPartial] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Campos del formulario (individual)
  const [codigo, setCodigo] = useState('');
  const [clasificacion, setClasificacion] = useState('Activo Fijo (AF)');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tipoRecursoId, setTipoRecursoId] = useState('');
  const [marcaId, setMarcaId] = useState('');
  const [estadoId, setEstadoId] = useState('');
  const [locationId, setLocationId] = useState(''); // Ahora es un catálogo
  const [empresa, setEmpresa] = useState('');
  const [serial, setSerial] = useState('');
  const [psl, setPsl] = useState('');
  const [value, setValue] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [photoUrl, setPhotoUrl] = useState(''); // MinIO url
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [proveedor, setProveedor] = useState('');
  const [nitProveedor, setNitProveedor] = useState('');
  const [codigoContable, setCodigoContable] = useState('');
  const [facturaUrl, setFacturaUrl] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Campos de formulario (edición masiva)
  const [bulkEstadoId, setBulkEstadoId] = useState('');
  const [bulkLocationId, setBulkLocationId] = useState('');
  const [bulkAssignedTo, setBulkAssignedTo] = useState('');

  // Cargar activos y usuarios al inicializar o filtrar
  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;
      if (cedulaFilter) params.cedula = cedulaFilter;
      if (clasificacionFilter) params.clasificacion = clasificacionFilter;

      const response = await axios.get('/api/assets', { params });
      if (response.data.success) {
        setAssets(response.data.assets);
        if (response.data.pagination) {
          setTotal(response.data.pagination.total);
          setTotalPages(response.data.pagination.totalPages);
        }
      }
    } catch (err) {
      showToast('Error al obtener el inventario de activos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogs = async () => {
    try {
      const [rtRes, estRes, locRes, brandRes, compRes, provRes] = await Promise.all([
        axios.get('/api/dictionaries/resource-types'),
        axios.get('/api/dictionaries/states'),
        axios.get('/api/dictionaries/areas'), // Usamos las áreas/ubicaciones desnormalizadas de dim_ubicaciones
        axios.get('/api/dictionaries/brands'),
        axios.get('/api/dictionaries/companies'),
        axios.get('/api/dictionaries/proveedores')
      ]);
      if (rtRes.data.success) setResourceTypes(rtRes.data.data);
      if (estRes.data.success) setEstados(estRes.data.data);
      if (locRes.data.success) setLocationsList(locRes.data.data);
      if (brandRes.data.success) setBrands(brandRes.data.data);
      if (compRes.data.success) setCompanies(compRes.data.data);
      if (provRes && provRes.data && provRes.data.success) setProveedoresList(provRes.data.data);
    } catch (err) {
      // Silencioso
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/auth/users');
      if (response.data.success) {
        setUsers(response.data.users);
      }
    } catch (err) {
      // Ignorar fallo si no se tienen permisos
    }
  };

  useEffect(() => {
    fetchAssets();
    // Limpiar selección al recargar o filtrar
    setSelectedIds([]);
  }, [page, limit, search, categoryFilter, statusFilter, cedulaFilter, clasificacionFilter]);

  useEffect(() => {
    fetchUsers();
    fetchCatalogs();
  }, []);

  // Cargar marcas y nombres estandarizados filtrados cuando cambia la categoría seleccionada
  useEffect(() => {
    const fetchCategoryDetails = async () => {
      if (!tipoRecursoId) {
        setFilteredBrands([]);
        setCategoryAssetNames([]);
        return;
      }
      try {
        const [brandsRes, namesRes] = await Promise.all([
          axios.get(`/api/dictionaries/brands-by-category?category_id=${tipoRecursoId}`),
          axios.get(`/api/dictionaries/asset-names-by-category?category_id=${tipoRecursoId}`)
        ]);
        if (brandsRes.data.success) {
          setFilteredBrands(brandsRes.data.data);
        }
        if (namesRes.data.success) {
          setCategoryAssetNames(namesRes.data.data);
        }
      } catch (err) {
        // Silencioso
      }
    };

    fetchCategoryDetails();
  }, [tipoRecursoId]);

  // Reiniciar a página 1 cuando cambian los filtros
  const handleFilterChange = (setter, val) => {
    setter(val);
    setPage(1);
  };

  // Checkbox de selección
  const handleSelectToggle = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === assets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(assets.map(a => a.id));
    }
  };

  // Exportación a Excel (Respeta selecciones y filtros activos de pantalla con feedback)
  const handleExportExcel = async () => {
    const params = new URLSearchParams();
    if (selectedIds.length > 0) {
      params.append('ids', selectedIds.join(','));
      showToast(`Exportando ${selectedIds.length} activos seleccionados...`, 'info');
    } else {
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category', categoryFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (cedulaFilter) params.append('cedula', cedulaFilter);
      if (clasificacionFilter) params.append('clasificacion', clasificacionFilter);
      
      showToast('Generando archivo Excel del inventario...', 'info');
    }
    const queryString = params.toString();
    const url = `/api/assets/export${queryString ? '?' + queryString : ''}`;

    try {
      const response = await axios.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `inventario_activos_${new Date().toISOString().substring(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      showToast('Inventario exportado exitosamente a Excel.', 'success');
    } catch (err) {
      showToast('Error al exportar los activos a Excel.', 'error');
    }
  };

  // Descargar plantilla oficial de Excel con feedback (ATLAS-09)
  const handleDownloadTemplate = async () => {
    showToast('Generando plantilla oficial en Excel...', 'info');
    try {
      const response = await axios.get('/api/assets/template', { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', 'Plantilla_Carga_Masiva_Activos.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      showToast('Plantilla descargada con éxito.', 'success');
    } catch (err) {
      showToast('Error al descargar la plantilla de Excel.', 'error');
    }
  };

  // Abrir Modal para crear nuevo activo
  const handleOpenAdd = () => {
    setEditingAsset(null);
    setCreationMode('individual');
    setBulkFile(null);
    setBulkResults(null);
    setBulkLoading(false);
    setBulkAllowPartial(false);
    setCodigo('');
    setClasificacion('Activo Fijo (AF)');
    setName('');
    setDescription('');
    setTipoRecursoId('');
    setMarcaId('');
    setEstadoId('');
    setLocationId('');
    setEmpresa('');
    setSerial('');
    setPsl('');
    setValue('');
    setPurchaseDate('');
    setAssignedTo('');
    setPhotoUrl('');
    setProveedor('');
    setNitProveedor('');
    setCodigoContable('');
    setFacturaUrl('');
    setShowModal(true);
  };

  // Abrir Modal para visualizar información completa del activo ("Ojito")
  const handleOpenView = (asset) => {
    setViewingAsset(asset);
    setShowViewModal(true);
  };

  // Abrir Modal para editar activo existente (ATLAS-04: precarga de categoría con fallback)
  const handleOpenEdit = (asset) => {
    setEditingAsset(asset);
    setCreationMode('individual');
    setBulkFile(null);
    setBulkResults(null);
    setCodigo(asset.code || '');
    setClasificacion(asset.clasificacion || 'Activo Fijo (AF)');
    setName(asset.name);
    setDescription(asset.description || '');

    // Precargar categoría con fallback por nombre si id no está directamente mapeado
    let matchedCatId = asset.tipo_recurso_id ? asset.tipo_recurso_id.toString() : '';
    if (!matchedCatId && asset.category) {
      const catNorm = asset.category.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const found = resourceTypes.find(rt => 
        rt.nombre && rt.nombre.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === catNorm
      );
      if (found) matchedCatId = found.id.toString();
    }
    setTipoRecursoId(matchedCatId);

    // Precargar marca con fallback por nombre
    let matchedBrandId = asset.marca_id ? asset.marca_id.toString() : '';
    if (!matchedBrandId && asset.marca) {
      const brandNorm = asset.marca.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const found = brands.find(b => 
        b.nombre && b.nombre.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === brandNorm
      );
      if (found) matchedBrandId = found.id.toString();
    }
    setMarcaId(matchedBrandId);

    setEstadoId(asset.estado_id ? asset.estado_id.toString() : '');
    setLocationId(asset.area_id ? asset.area_id.toString() : '');
    setEmpresa(asset.empresa || '');
    setSerial(asset.serial || '');
    setPsl(asset.psl || '');
    setValue(asset.value ? asset.value.toString() : '0');
    setPurchaseDate(asset.purchase_date ? asset.purchase_date.substring(0, 10) : '');
    setAssignedTo(asset.assigned_to ? asset.assigned_to.toString() : '');
    setPhotoUrl(asset.foto_url || '');
    setProveedor(asset.proveedor || '');
    setNitProveedor(asset.nit_proveedor || '');
    setCodigoContable(asset.codigo_contable || '');
    setFacturaUrl(asset.factura_url || '');
    setShowModal(true);
  };

  // Handler para subir Factura / Orden de Compra a MinIO
  const handleDocumentUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('document', file);
    setUploadingDoc(true);

    try {
      const response = await axios.post('/api/assets/upload-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setFacturaUrl(response.data.url);
        showToast('Factura / Documento cargado exitosamente.', 'success');
      }
    } catch (err) {
      showToast('Error al subir el documento de factura.', 'error');
    } finally {
      setUploadingDoc(false);
    }
  };



  // Validar y asignar archivo Excel seleccionado
  const validateAndSetFile = (file) => {
    if (!file) return;
    const isExtensionValid = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (!isExtensionValid) {
      showToast('Por favor seleccione un archivo Excel válido (.xlsx o .xls).', 'error');
      return;
    }
    setBulkFile(file);
    setBulkResults(null);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  // Procesar la subida del Excel para creación masiva
  const handleProcessBulkUpload = async () => {
    if (!bulkFile) {
      showToast('Por favor seleccione un archivo Excel antes de procesar.', 'error');
      return;
    }

    setBulkLoading(true);
    setBulkResults(null);

    const formData = new FormData();
    formData.append('file', bulkFile);
    if (bulkAllowPartial) {
      formData.append('allow_partial', 'true');
    }

    try {
      const response = await axios.post('/api/assets/bulk-create', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setBulkResults(response.data);
        showToast(response.data.message || 'Carga masiva completada con éxito.', 'success');
        fetchAssets();
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData && errData.errors) {
        setBulkResults(errData);
        showToast(errData.message || 'Se encontraron errores de validación en el archivo.', 'error');
      } else {
        showToast(errData?.error || 'Error al procesar el archivo Excel.', 'error');
      }
    } finally {
      setBulkLoading(false);
    }
  };

  // Guardar (Crear o Editar)
  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!name || !value || !locationId) {
      showToast('Por favor complete todos los campos obligatorios.', 'error');
      return;
    }

    const payload = {
      codigo: codigo.trim() || undefined,
      clasificacion,
      name,
      description,
      tipo_recurso_id: tipoRecursoId ? parseInt(tipoRecursoId, 10) : null,
      marca_id: marcaId ? parseInt(marcaId, 10) : null,
      estado_id: estadoId ? parseInt(estadoId, 10) : null,
      area_id: parseInt(locationId, 10),
      empresa: empresa ? empresa.trim() : null,
      serial: serial ? serial.trim() : null,
      psl: psl ? psl.trim() : null,
      value: parseFloat(value),
      purchase_date: purchaseDate || null,
      assigned_to: assignedTo ? parseInt(assignedTo, 10) : null,
      photo_url: photoUrl,
      proveedor: proveedor.trim() || null,
      nit_proveedor: nitProveedor.trim() || null,
      codigo_contable: codigoContable.trim() || null,
      factura_url: facturaUrl || null
    };

    try {
      if (editingAsset) {
        const response = await axios.put(`/api/assets/${editingAsset.id}`, {
          ...payload,
          status: editingAsset.status
        });
        if (response.data.success) {
          showToast('Activo actualizado exitosamente.', 'success');
        }
      } else {
        const response = await axios.post('/api/assets', payload);
        if (response.data.success) {
          showToast('Activo registrado correctamente en el inventario.', 'success');
        }
      }
      setShowModal(false);
      fetchAssets();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al procesar el activo.';
      showToast(errorMsg, 'error');
    }
  };

  // Eliminar (Solo ADMIN)
  const handleDelete = async (id) => {
    if (!window.confirm('¿Está completamente seguro de eliminar permanentemente este activo? Se borrarán sus trazas asociadas.')) {
      return;
    }

    try {
      const response = await axios.delete(`/api/assets/${id}`);
      if (response.data.success) {
        showToast('Activo retirado del sistema.', 'success');
        fetchAssets();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al eliminar el activo.';
      showToast(errorMsg, 'error');
    }
  };

  // Bulk Edit Save
  const handleBulkEditSave = async (e) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;

    const changes = {};
    if (bulkEstadoId) changes.estado_id = parseInt(bulkEstadoId, 10);

    try {
      const response = await axios.patch('/api/assets/bulk-update', {
        ids: selectedIds,
        changes
      });
      if (response.data.success) {
        showToast(`Se actualizaron ${response.data.count} activos correctamente.`, 'success');
        setShowBulkEditModal(false);
        setSelectedIds([]);
        fetchAssets();
      }
    } catch (err) {
      showToast('Error al actualizar masivamente los activos.', 'error');
    }
  };

  // Bulk Delete (Solo ADMIN)
  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Está seguro de eliminar permanentemente los ${selectedIds.length} activos seleccionados?`)) {
      return;
    }

    try {
      const response = await axios.post('/api/assets/bulk-delete', { ids: selectedIds });
      if (response.data.success) {
        showToast(`Se eliminaron ${response.data.count} activos con éxito.`, 'success');
        setSelectedIds([]);
        fetchAssets();
      }
    } catch (err) {
      showToast('Error al eliminar los activos seleccionados.', 'error');
    }
  };

  // Subida de foto a MinIO
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file);

    setUploadingPhoto(true);
    try {
      const response = await axios.post('/api/assets/upload-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data.success) {
        setPhotoUrl(response.data.url);
        showToast('Fotografía subida con éxito.', 'success');
      }
    } catch (err) {
      showToast('Error al subir la imagen.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const isCreateAllowed = user?.role === 'ADMIN';
  const isWriteAllowed = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
  const isDeleteAllowed = user?.role === 'ADMIN';

  return (
    <div className="page-container">
      
      {/* Barra de Búsqueda y Filtros */}
      <div className="glass-card filters-bar">
        <div className="filters-group">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="input-field search-input"
              placeholder="Buscar por código, nombre o ubicación..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
            />
          </div>

          <div className="search-wrapper" style={{ minWidth: '160px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Buscar por cédula..."
              value={cedulaFilter}
              onChange={(e) => handleFilterChange(setCedulaFilter, e.target.value)}
              style={{ paddingLeft: '12px' }}
            />
          </div>
          
          <div style={{ minWidth: '180px' }}>
            <SearchableSelect
              value={clasificacionFilter}
              onChange={(val) => handleFilterChange(setClasificacionFilter, val)}
              options={[
                { value: '', label: 'Clasificación (Todas)' },
                { value: 'Activo Fijo (AF)', label: 'Activo Fijo (AF)' },
                { value: 'Activo de Control (AC)', label: 'Activo de Control (AC)' }
              ]}
              placeholder="Clasificación (Todas)"
            />
          </div>

          <div style={{ minWidth: '190px' }}>
            <SearchableSelect
              value={categoryFilter}
              onChange={(val) => handleFilterChange(setCategoryFilter, val)}
              options={[
                { value: '', label: 'Todas Categorías' },
                ...resourceTypes.map(rt => ({ value: rt.id.toString(), label: rt.nombre }))
              ]}
              placeholder="Todas Categorías"
            />
          </div>

          <div style={{ minWidth: '170px' }}>
            <SearchableSelect
              value={statusFilter}
              onChange={(val) => handleFilterChange(setStatusFilter, val)}
              options={[
                { value: '', label: 'Todos Estados' },
                ...estados.map(est => ({ value: est.id.toString(), label: est.nombre }))
              ]}
              placeholder="Todos Estados"
            />
          </div>
        </div>

        {/* Botones de Acción Globales */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-secondary action-btn"
            onClick={handleExportExcel}
            title="Exportar base actual a Excel"
          >
            <Download size={16} />
            <span>Exportar Excel</span>
          </button>

          {isCreateAllowed && (
            <button 
              className="btn btn-primary action-btn"
              onClick={handleOpenAdd}
            >
              <Plus size={18} />
              <span>Agregar Activo</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra Contextual de Acciones Masivas (Bulk Actions) */}
      {selectedIds.length > 0 && (
        <div className="bulk-action-bar">
          <div>
            Se han seleccionado <span className="bulk-count">{selectedIds.length}</span> activos.
          </div>
          <div className="bulk-actions">
            <button 
              className="btn btn-secondary btn-ghost" 
              onClick={() => setSelectedIds([])}
            >
              Cancelar
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => {
                setBulkEstadoId('');
                setBulkLocationId('');
                setBulkAssignedTo('');
                setShowBulkEditModal(true);
              }}
            >
              Editar Selección
            </button>
            {isDeleteAllowed && (
              <button 
                className="btn btn-outline-danger"
                onClick={handleBulkDelete}
              >
                Eliminar Selección
              </button>
            )}
          </div>
        </div>
      )}

      {/* Listado de Inventario en Tabla */}
      <div className="glass-card table-card">
        {loading ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <span>Cargando inventario de activos...</span>
          </div>
        ) : assets.length === 0 ? (
          <div className="empty-state">
            No se encontraron activos con los filtros indicados.
          </div>
        ) : (
          <>
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }} className="col-center">
                    <div 
                      className={`custom-checkbox ${selectedIds.length === assets.length ? 'checked' : ''}`}
                      onClick={handleSelectAll}
                    >
                      {selectedIds.length === assets.length && <Check size={12} color="white" />}
                    </div>
                  </th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Valor ($)</th>
                  <th>Ubicación</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                  <th className="col-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td className="col-center">
                      <div 
                        className={`custom-checkbox ${selectedIds.includes(asset.id) ? 'checked' : ''}`}
                        onClick={() => handleSelectToggle(asset.id)}
                      >
                        {selectedIds.includes(asset.id) && <Check size={12} color="white" />}
                      </div>
                    </td>
                    <td className="col-code">
                      <div style={{ fontWeight: '700' }}>{asset.code}</div>
                      <span className={`clasificacion-badge ${asset.clasificacion && asset.clasificacion.includes('AC') ? 'ac' : 'af'}`}>
                        {asset.clasificacion && asset.clasificacion.includes('AC') ? 'AC' : 'AF'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {asset.foto_url && (
                          <img 
                            src={asset.foto_url} 
                            alt={asset.name} 
                            style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--border-default)' }} 
                          />
                        )}
                        <div>
                          <div className="asset-name">{asset.name}</div>
                          {asset.description && <div className="asset-desc">{asset.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{asset.category}</td>
                    <td className="col-value">
                      <div style={{ fontWeight: '700' }}>
                        ${Number(asset.value || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                      </div>
                      {asset.book_value !== undefined && (
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }} title={`Depreciación acumulada: $${Number(asset.accumulated_depreciation || 0).toLocaleString('es-CO')}`}>
                          Libros: ${Number(asset.book_value || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                        </div>
                      )}
                      {asset.factura_url && (
                        <a 
                          href={asset.factura_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          style={{ fontSize: '11px', color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}
                          title="Ver Factura / Orden de Compra"
                        >
                          <FileSpreadsheet size={12} /> Factura
                        </a>
                      )}
                    </td>
                    <td>{asset.location}</td>
                    <td>
                      {asset.assignee_name ? (
                        <div>
                          <div style={{ fontWeight: '600' }}>{asset.assignee_name}</div>
                          {asset.assignee_cedula && (
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              C.C. {asset.assignee_cedula}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '12px' }}>Sin Asignar</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${
                        asset.status === 'Activo' ? 'active' : 
                        asset.status === 'Pendiente Aceptación' ? 'pending' : 
                        asset.status === 'En Mantenimiento' ? 'maintenance' : 'rejected'
                      }`}>
                        {asset.status}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button 
                          className="btn btn-secondary icon-btn" 
                          onClick={() => handleOpenView(asset)}
                          title="Ver Detalle del Activo"
                        >
                          <Eye size={14} />
                        </button>
                        {isWriteAllowed && (
                          <button 
                            className="btn btn-secondary icon-btn" 
                            onClick={() => handleOpenEdit(asset)}
                            title="Editar Activo"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {isDeleteAllowed && (
                          <button 
                            className="btn btn-secondary icon-btn" 
                            onClick={() => handleDelete(asset.id)}
                            title="Eliminar Activo"
                            style={{ color: 'var(--accent-danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Componente de Paginación */}
            <div className="pagination-container">
              <div>
                Mostrando <strong>{total === 0 ? 0 : (page - 1) * limit + 1}</strong> - <strong>{Math.min(page * limit, total)}</strong> de <strong>{total.toLocaleString('es-CO')}</strong> activos
              </div>

              <div className="pagination-controls">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Mostrar:
                  <select 
                    className="pagination-select" 
                    value={limit} 
                    onChange={(e) => {
                      setLimit(parseInt(e.target.value, 10));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10 por pág</option>
                    <option value={20}>20 por pág</option>
                    <option value={50}>50 por pág</option>
                    <option value={100}>100 por pág</option>
                  </select>
                </label>

                <button 
                  className="pagination-btn" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  &laquo; Anterior
                </button>
                
                <span>Página <strong>{page}</strong> de <strong>{totalPages}</strong></span>

                <button 
                  className="pagination-btn" 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Siguiente &raquo;
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal Seguro de Formulario */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: creationMode === 'bulk' && !editingAsset ? '640px' : '560px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingAsset ? `Editar Activo: ${editingAsset.code}` : (
                  creationMode === 'bulk' ? 'Carga Masiva de Activos (Excel)' : 'Registrar Nuevo Activo'
                )}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>

            {/* Pestañas de Modalidad (Solo en Creación) */}
            {!editingAsset && (
              <div style={{ padding: '0 24px', marginTop: '12px' }}>
                <div className="modal-tabs">
                  <button
                    type="button"
                    className={`modal-tab-btn ${creationMode === 'individual' ? 'active' : ''}`}
                    onClick={() => {
                      setCreationMode('individual');
                      setBulkResults(null);
                    }}
                  >
                    <Plus size={16} />
                    <span>Registro Individual</span>
                  </button>
                  <button
                    type="button"
                    className={`modal-tab-btn ${creationMode === 'bulk' ? 'active' : ''}`}
                    onClick={() => setCreationMode('bulk')}
                  >
                    <FileSpreadsheet size={16} />
                    <span>Carga Masiva (Excel)</span>
                  </button>
                </div>
              </div>
            )}
            
            {/* Modalidad 1: Formulario Individual (o Edición) */}
            {(creationMode === 'individual' || editingAsset) ? (
              <form onSubmit={handleSave}>
                <div className="modal-body modal-body-form">
                  
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Código de Activo</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ej: ACT-0001 (vacío = autogenerar)"
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value)}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        Si lo deja vacío se generará automáticamente.
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Clasificación del Activo</label>
                      <SearchableSelect
                        value={clasificacion}
                        onChange={(val) => setClasificacion(val)}
                        options={[
                          { value: 'Activo Fijo (AF)', label: 'Activo Fijo (AF)' },
                          { value: 'Activo de Control (AC)', label: 'Activo de Control (AC)' }
                        ]}
                        placeholder="Seleccionar Clasificación..."
                      />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Tipo de Recurso / Categoría *</label>
                      <SearchableSelect
                        value={tipoRecursoId}
                        onChange={(val) => setTipoRecursoId(val)}
                        options={resourceTypes.map(rt => ({ value: rt.id.toString(), label: rt.nombre }))}
                        placeholder="-- Seleccionar Categoría --"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Marca</label>
                      <SearchableSelect
                        value={marcaId}
                        onChange={(val) => setMarcaId(val)}
                        options={(filteredBrands.length > 0 ? filteredBrands : brands).map(b => ({ value: b.id.toString(), label: b.nombre }))}
                        placeholder="-- Seleccionar Marca --"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nombre / Modelo del Activo *</label>
                    <SearchableSelect
                      value={name}
                      onChange={(val) => setName(val)}
                      options={categoryAssetNames.map(n => ({ value: n, label: n }))}
                      placeholder={tipoRecursoId ? "Seleccione o escriba el nombre del activo..." : "Seleccione primero una categoría o escriba el nombre..."}
                      allowCustom={true}
                      required={true}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Descripción / Observaciones Generales</label>
                    <textarea
                      className="input-field form-textarea"
                      placeholder="Observaciones adicionales, estado cosmético o notas específicas del activo..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Estado / Condición Física</label>
                      <SearchableSelect
                        value={estadoId}
                        onChange={(val) => setEstadoId(val)}
                        options={estados.map(est => ({ value: est.id.toString(), label: est.nombre }))}
                        placeholder="-- Seleccionar Estado --"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ubicación Física *</label>
                      <SearchableSelect
                        value={locationId}
                        onChange={(val) => setLocationId(val)}
                        options={locationsList.map(loc => ({
                          value: loc.id.toString(),
                          label: `${loc.area} | ${loc.punto_venta} (${loc.oficina})`,
                          subtitle: `${loc.departamento} - ${loc.municipio}`
                        }))}
                        placeholder="-- Seleccionar Ubicación --"
                        required={true}
                      />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Empresa</label>
                      <SearchableSelect
                        value={empresa}
                        onChange={(val) => setEmpresa(val)}
                        options={companies.map(c => ({ value: c.nombre, label: c.nombre }))}
                        placeholder="-- Seleccionar Empresa --"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Valor Comercial ($) *</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-field"
                        placeholder="Ej: 1500.00"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Serial</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ej: SN-987654321"
                        value={serial}
                        onChange={(e) => setSerial(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Código Contable / PSL</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ej: 152405-01 / PSL-2026-X"
                        value={codigoContable || psl}
                        onChange={(e) => {
                          setCodigoContable(e.target.value);
                          setPsl(e.target.value);
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Fecha de Compra</label>
                      <input
                        type="date"
                        className="input-field"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Asignar Responsable</label>
                      <SearchableSelect
                        value={assignedTo}
                        onChange={(val) => setAssignedTo(val)}
                        options={users.map(u => ({
                          value: u.id.toString(),
                          label: u.full_name,
                          subtitle: `${u.role}${u.cedula ? ' | C.C. ' + u.cedula : ''}`
                        }))}
                        placeholder="-- Sin Asignación (Disponible) --"
                      />
                    </div>
                  </div>
                  <span className="field-hint" style={{ marginTop: '-6px', marginBottom: '8px', display: 'block' }}>
                    Al asignar un responsable, el activo quedará "Pendiente de Aceptación" hasta su firma.
                  </span>

                  {/* Sección de Proveedor y Datos Contables */}
                  <div style={{ margin: '16px 0 8px 0', borderTop: '1px solid var(--border-default)', paddingTop: '12px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Datos de Compra y Contabilidad
                    </h4>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Proveedor</label>
                      <SearchableSelect
                        options={Array.from(
                          new Map(proveedoresList.filter((p) => p.nombre).map((p) => [p.nombre.trim(), p])).values()
                        ).map((p) => ({
                          value: p.nombre,
                          label: p.nombre,
                          subtitle: p.nit ? `NIT: ${p.nit}` : ''
                        }))}
                        value={proveedor}
                        onChange={(selectedNombre) => {
                          setProveedor(selectedNombre);
                          const derivedNit = deriveNitFromNombre(selectedNombre, proveedoresList);
                          if (derivedNit || !selectedNombre) {
                            setNitProveedor(derivedNit);
                          }
                        }}
                        placeholder="-- Buscar por Nombre --"
                        allowCustom={true}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">NIT del Proveedor</label>
                      <SearchableSelect
                        options={Array.from(
                          new Map(proveedoresList.filter((p) => p.nit).map((p) => [p.nit.trim(), p])).values()
                        ).map((p) => ({
                          value: p.nit,
                          label: p.nit,
                          subtitle: p.nombre ? `Proveedor: ${p.nombre}` : ''
                        }))}
                        value={nitProveedor}
                        onChange={(selectedNit) => {
                          setNitProveedor(selectedNit);
                          const derivedNombre = deriveNombreFromNit(selectedNit, proveedoresList);
                          if (derivedNombre || !selectedNit) {
                            setProveedor(derivedNombre);
                          }
                        }}
                        placeholder="-- Buscar por NIT --"
                        allowCustom={true}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Orden de Compra / Factura</label>
                      {facturaUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <a href={facturaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                            <FileSpreadsheet size={14} /> Ver Documento Adjunto
                          </a>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setFacturaUrl('')}>
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                          className="input-field"
                          onChange={handleDocumentUpload}
                          disabled={uploadingDoc}
                        />
                      )}
                      <span className="field-hint">
                        {uploadingDoc ? 'Subiendo documento a MinIO...' : 'Adjunte PDF, imagen o documento de la factura/OC'}
                      </span>
                    </div>

                  <div className="form-group">
                    <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      Fotografía del Activo
                      <span className="field-hint">(Opcional)</span>
                    </div>
                    
                    {!photoUrl ? (
                      <div className="form-grid-2">
                        <label className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer', alignItems: 'center', gap: '0.5rem' }}>
                          <Camera size={18} /> Tomar Foto
                          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} style={{ display: 'none' }} disabled={uploadingPhoto} />
                        </label>
                        <label className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer', alignItems: 'center', gap: '0.5rem' }}>
                          <Upload size={18} /> Subir Archivo
                          <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} disabled={uploadingPhoto} />
                        </label>
                      </div>
                    ) : (
                      <div className="photo-preview-wrapper">
                        <img src={photoUrl} alt="Preview" className="photo-preview-img" />
                        <button type="button" onClick={() => setPhotoUrl('')} className="btn btn-secondary photo-remove-btn" style={{ color: 'var(--accent-danger)' }}>
                          <Trash2 size={16} /> Eliminar Foto
                        </button>
                      </div>
                    )}
                    {uploadingPhoto && <span className="field-hint" style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>Subiendo fotografía...</span>}
                  </div>

                </div>

                <div className="modal-footer">
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
                    disabled={uploadingPhoto}
                  >
                    {editingAsset ? 'Guardar Cambios' : 'Registrar Activo'}
                  </button>
                </div>
              </form>
            ) : (
              /* Modalidad 2: Carga Masiva (Excel) */
              <div>
                <div className="modal-body modal-body-form">
                  
                  {/* Paso 1: Descargar Plantilla Oficial */}
                  <div className="template-download-box">
                    <div className="template-download-info">
                      <div className="excel-file-icon">
                        <FileSpreadsheet size={28} color="#10b981" />
                      </div>
                      <div className="template-download-text">
                        <h4>Paso 1: Descargar Plantilla Oficial</h4>
                        <p>
                          Descargue la estructura oficial en Excel con encabezados, filas de ejemplo y los catálogos válidos del sistema (categorías, marcas, ubicaciones y usuarios).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary action-btn"
                      onClick={handleDownloadTemplate}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <Download size={16} />
                      <span>Descargar Plantilla</span>
                    </button>
                  </div>

                  {/* Paso 2: Subir Archivo Excel */}
                  <div style={{ marginTop: '4px' }}>
                    <label className="form-label">Paso 2: Cargar Archivo Excel con los Activos</label>
                    
                    {!bulkFile ? (
                      <div
                        className={`excel-dropzone ${isDragging ? 'dragover' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleFileDrop}
                        onClick={() => document.getElementById('excel-file-input').click()}
                      >
                        <div className="excel-dropzone-icon">
                          <Upload size={22} />
                        </div>
                        <div className="excel-dropzone-title">
                          Arrastre aquí su archivo Excel o haga clic para examinar
                        </div>
                        <div className="excel-dropzone-subtitle">
                          Formatos aceptados: .xlsx, .xls (Máximo 10 MB)
                        </div>
                        <input
                          id="excel-file-input"
                          type="file"
                          accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                          style={{ display: 'none' }}
                          onChange={handleFileSelect}
                        />
                      </div>
                    ) : (
                      <div className="excel-selected-file">
                        <div className="excel-file-details">
                          <FileSpreadsheet size={24} className="excel-file-icon" />
                          <div>
                            <div className="excel-file-name">{bulkFile.name}</div>
                            <div className="excel-file-size">{(bulkFile.size / 1024).toFixed(1)} KB</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary icon-btn"
                          onClick={() => { setBulkFile(null); setBulkResults(null); }}
                          title="Quitar archivo"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Resultados de la Carga */}
                  {bulkResults && (
                    <div className="bulk-results-box">
                      <div className="bulk-results-stats">
                        <div className="bulk-stat-pill success">
                          <CheckCircle2 size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                          {bulkResults.createdCount || 0} Registrados con éxito
                        </div>
                        {bulkResults.omittedCount > 0 && (
                          <div className="bulk-stat-pill warning">
                            <AlertTriangle size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                            {bulkResults.omittedCount} Omitido(s) por duplicado
                          </div>
                        )}
                        {bulkResults.errorCount > 0 && (
                          <div className="bulk-stat-pill danger">
                            <AlertCircle size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                            {bulkResults.errorCount} Fila(s) con error
                          </div>
                        )}
                      </div>

                      {/* Lista de Activos Omitidos por Duplicidad */}
                      {bulkResults.omitted && bulkResults.omitted.length > 0 && (
                        <>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: '#b45309', marginBottom: '4px', marginTop: '8px' }}>
                            Activos omitidos por duplicidad (ya existían en el inventario o en el archivo):
                          </div>
                          <div className="bulk-errors-list" style={{ maxHeight: '130px', marginBottom: '8px' }}>
                            {bulkResults.omitted.map((item, idx) => (
                              <div key={idx} className="bulk-error-item">
                                <span className="bulk-omitted-row-badge">Fila {item.row}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{item.reason}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Lista de Errores de Validación */}
                      {bulkResults.errors && bulkResults.errors.length > 0 && (
                        <>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-danger)', marginBottom: '4px', marginTop: '8px' }}>
                            Detalle de errores de validación detectados:
                          </div>
                          <div className="bulk-errors-list" style={{ maxHeight: '130px' }}>
                            {bulkResults.errors.map((err, idx) => (
                              <div key={idx} className="bulk-error-item">
                                <span className="bulk-error-row-badge">Fila {err.row}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{err.error}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                </div>

                <div className="modal-footer">
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowModal(false)}
                  >
                    {bulkResults?.createdCount > 0 ? 'Cerrar' : 'Cancelar'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    disabled={!bulkFile || bulkLoading}
                    onClick={handleProcessBulkUpload}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    {bulkLoading ? (
                      <span>Procesando archivo...</span>
                    ) : (
                      <>
                        <FileSpreadsheet size={16} />
                        <span>Procesar Carga Masiva</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Modal Seguro de Edición Masiva */}
      {showBulkEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                Edición Masiva de Activos
              </h3>
              <button 
                onClick={() => setShowBulkEditModal(false)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleBulkEditSave}>
              <div className="modal-body modal-body-form">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'var(--accent-warning-light)', borderRadius: '8px', border: '1px solid rgba(217, 119, 6, 0.2)', marginBottom: '8px' }}>
                  <AlertTriangle size={20} color="var(--accent-warning)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#78350f' }}>
                    Los campos modificados a continuación se aplicarán a los <strong>{selectedIds.length}</strong> activos seleccionados. Deje los campos vacíos para no realizar cambios.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Estado del Activo *</label>
                  <select
                    className="input-field"
                    value={bulkEstadoId}
                    onChange={(e) => setBulkEstadoId(e.target.value)}
                    required
                  >
                    <option value="">-- Seleccionar Estado --</option>
                    {estados.map(est => (
                      <option key={est.id} value={est.id}>{est.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowBulkEditModal(false)}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  Aplicar Cambios en Lote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Activo ("Ojito" para Visualizadores y Todos los Usuarios) */}
      {showViewModal && viewingAsset && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            
            {/* Cabecera de la Modal */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="col-code" style={{ fontSize: '15px' }}>
                  {viewingAsset.code}
                </div>
                <span className={`clasificacion-badge ${viewingAsset.clasificacion && viewingAsset.clasificacion.includes('AC') ? 'ac' : 'af'}`}>
                  {viewingAsset.clasificacion && viewingAsset.clasificacion.includes('AC') ? 'Activo de Control (AC)' : 'Activo Fijo (AF)'}
                </span>
                <span className={`badge badge-${
                  viewingAsset.status === 'Activo' ? 'active' : 
                  viewingAsset.status === 'Pendiente Aceptación' ? 'pending' : 
                  viewingAsset.status === 'En Mantenimiento' ? 'maintenance' : 'rejected'
                }`}>
                  {viewingAsset.status}
                </span>
              </div>
              <button 
                onClick={() => setShowViewModal(false)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body modal-body-form" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              
              {/* Título Principal */}
              <div style={{ marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {viewingAsset.name}
                </h3>
                {viewingAsset.description && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {viewingAsset.description}
                  </p>
                )}
              </div>

              {/* Fotografía del Activo */}
              {viewingAsset.foto_url ? (
                <div className="photo-preview-wrapper" style={{ maxHeight: '220px', textAlign: 'center', background: '#000' }}>
                  <img 
                    src={viewingAsset.foto_url} 
                    alt={viewingAsset.name} 
                    style={{ maxHeight: '220px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <Package size={20} color="var(--text-tertiary)" />
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                    Sin fotografía de activo registrada en el sistema.
                  </span>
                </div>
              )}

              {/* Sección 1: Información General de Identificación */}
              <div className="card-info-box" style={{ background: 'var(--bg-secondary)' }}>
                <div style={{ fontWeight: '700', fontSize: '12px', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={14} /> Información General
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px' }}>
                  <div><strong>Categoría:</strong> {viewingAsset.category || 'N/A'}</div>
                  <div><strong>Marca:</strong> {viewingAsset.marca || 'GENÉRICO'}</div>
                  <div><strong>Empresa:</strong> {viewingAsset.empresa || 'SEAPTO S.A.'}</div>
                  <div><strong>Ubicación Física:</strong> {viewingAsset.location || 'Sede Principal'}</div>
                  <div><strong>Serial:</strong> {viewingAsset.serial || 'N/A'}</div>
                  <div><strong>Código Contable / PSL:</strong> {viewingAsset.codigo_contable || viewingAsset.psl || 'N/A'}</div>
                  {viewingAsset.grupo_homogeneo && (
                    <div><strong>Grupo Homogéneo:</strong> {viewingAsset.grupo_homogeneo}</div>
                  )}
                  {viewingAsset.vida_util_meses && (
                    <div><strong>Vida Útil Estimada:</strong> {viewingAsset.vida_util_meses} meses</div>
                  )}
                </div>
              </div>

              {/* Sección 2: Responsable Asignado */}
              <div className="card-info-box" style={{ background: 'var(--bg-secondary)' }}>
                <div style={{ fontWeight: '700', fontSize: '12px', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} /> Responsable Asignado
                </div>
                {viewingAsset.assignee_name ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px' }}>
                    <div><strong>Funcionario:</strong> {viewingAsset.assignee_name}</div>
                    <div><strong>Cédula:</strong> {viewingAsset.assignee_cedula ? `C.C. ${viewingAsset.assignee_cedula}` : 'N/A'}</div>
                    {viewingAsset.assignee_cargo && <div><strong>Cargo:</strong> {viewingAsset.assignee_cargo}</div>}
                    {viewingAsset.assignee_email && <div><strong>Email:</strong> {viewingAsset.assignee_email}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                    Activo disponible sin funcionario responsable asignado.
                  </div>
                )}
              </div>

              {/* Sección 3: Datos Financieros y Depreciación */}
              <div className="card-info-box" style={{ background: 'var(--bg-secondary)' }}>
                <div style={{ fontWeight: '700', fontSize: '12px', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <DollarSign size={14} /> Datos Financieros y Depreciación
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px' }}>
                  <div>
                    <strong>Valor Comercial / Inicial:</strong>{' '}
                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                      ${Number(viewingAsset.value || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <strong>Valor en Libros:</strong>{' '}
                    <span style={{ fontWeight: '700', color: '#10b981' }}>
                      ${Number(viewingAsset.book_value !== undefined ? viewingAsset.book_value : viewingAsset.value || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <strong>Depreciación Acumulada:</strong>{' '}
                    <span>
                      ${Number(viewingAsset.accumulated_depreciation || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <strong>Depreciación Mensual:</strong>{' '}
                    <span>
                      ${Number(viewingAsset.monthly_depreciation || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {viewingAsset.meses_transcurridos !== undefined && (
                    <div><strong>Meses Transcurridos:</strong> {viewingAsset.meses_transcurridos} meses</div>
                  )}
                </div>
              </div>

              {/* Sección 4: Datos de Compra y Contabilidad */}
              <div className="card-info-box" style={{ background: 'var(--bg-secondary)' }}>
                <div style={{ fontWeight: '700', fontSize: '12px', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={14} /> Compra y Soporte Contable
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px' }}>
                  <div><strong>Proveedor:</strong> {viewingAsset.proveedor || 'No registrado'}</div>
                  <div><strong>NIT Proveedor:</strong> {viewingAsset.nit_proveedor || 'N/A'}</div>
                  <div><strong>Código Contable / PSL:</strong> {viewingAsset.codigo_contable || viewingAsset.psl || 'N/A'}</div>
                  <div><strong>Fecha de Compra:</strong> {viewingAsset.purchase_date ? viewingAsset.purchase_date.substring(0, 10) : 'N/A'}</div>
                </div>

                {viewingAsset.factura_url ? (
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-default)' }}>
                    <a 
                      href={viewingAsset.factura_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn btn-secondary btn-sm"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <FileSpreadsheet size={16} color="var(--accent-primary)" />
                      <span>Ver / Descargar Factura o Documento Adjunto</span>
                    </a>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: '6px' }}>
                    Sin documento o factura digital adjunta.
                  </div>
                )}
              </div>

            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowViewModal(false)}
              >
                Cerrar
              </button>
              {isWriteAllowed && (
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={() => {
                    setShowViewModal(false);
                    handleOpenEdit(viewingAsset);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit2 size={14} />
                  <span>Editar Activo</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
