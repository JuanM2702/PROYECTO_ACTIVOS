import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, Edit2, Trash2, Camera, Upload, X } from 'lucide-react';
import { useAuth } from '../App';
import '../styles/forms.css';
import '../styles/layout.css';

export default function AssetInventory() {
  const { user, showToast } = useAuth();
  
  // Estados de datos
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados de filtros
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Estados de modal
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  
  // Campos del formulario
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Hardware');
  const [location, setLocation] = useState('');
  const [value, setValue] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [photoData, setPhotoData] = useState(null);

  // Cargar activos y usuarios al inicializar o filtrar
  const fetchAssets = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;

      const response = await axios.get('/api/assets', { params });
      if (response.data.success) {
        setAssets(response.data.assets);
      }
    } catch (err) {
      showToast('Error al obtener el inventario de activos.', 'error');
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/auth/users');
      if (response.data.success) {
        setUsers(response.data.users);
      }
    } catch (err) {
      // Ignorar fallo si no se tienen permisos (por ejemplo, visor)
    }
  };

  useEffect(() => {
    fetchAssets();
    fetchUsers();
  }, [search, categoryFilter, statusFilter]);

  // Abrir Modal para crear nuevo activo
  const handleOpenAdd = () => {
    setEditingAsset(null);
    setName('');
    setDescription('');
    setCategory('Hardware');
    setLocation('');
    setValue('');
    setPurchaseDate('');
    setAssignedTo('');
    setPhotoData(null);
    setShowModal(true);
  };

  // Abrir Modal para editar activo existente
  const handleOpenEdit = (asset) => {
    setEditingAsset(asset);
    setName(asset.name);
    setDescription(asset.description || '');
    setCategory(asset.category);
    setLocation(asset.location);
    setValue(asset.value.toString());
    setPurchaseDate(asset.purchase_date ? asset.purchase_date.substring(0, 10) : '');
    setAssignedTo(asset.assigned_to ? asset.assigned_to.toString() : '');
    setPhotoData(asset.photo_data || null);
    setShowModal(true);
  };

  // Guardar (Crear o Editar)
  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!name || !category || !location || !value) {
      showToast('Por favor complete todos los campos mandatorios.', 'error');
      return;
    }

    const payload = {
      name,
      description,
      category,
      location,
      value: parseFloat(value),
      purchase_date: purchaseDate || null,
      assigned_to: assignedTo ? parseInt(assignedTo, 10) : null,
      photo_data: photoData
    };

    try {
      if (editingAsset) {
        // Enviar actualización
        const response = await axios.put(`/api/assets/${editingAsset.id}`, {
          ...payload,
          status: editingAsset.status // Conservar estado o reaccionar en backend
        });
        if (response.data.success) {
          showToast('Activo actualizado exitosamente.', 'success');
        }
      } else {
        // Enviar registro
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

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoData(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <select 
            className="input-field filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas Categorías</option>
            <option value="Hardware">Hardware</option>
            <option value="Software">Software</option>
            <option value="Vehículos">Vehículos</option>
            <option value="Mobiliario">Mobiliario</option>
          </select>

          <select 
            className="input-field filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos Estados</option>
            <option value="Activo">Activos</option>
            <option value="Pendiente Aceptación">Firmas Pendientes</option>
            <option value="En Mantenimiento">Mantenimiento</option>
            <option value="Rechazado">Rechazados</option>
          </select>
        </div>

        {/* Botón de Creación */}
        {isWriteAllowed && (
          <button 
            className="btn btn-primary action-btn"
            onClick={handleOpenAdd}
          >
            <Plus size={18} />
            <span>Agregar Activo</span>
          </button>
        )}
      </div>

      {/* Listado de Inventario en Tabla */}
      <div className="glass-card table-card">
        {assets.length === 0 ? (
          <div className="empty-state">
            No se encontraron activos con los filtros indicados.
          </div>
        ) : (
          <table className="premium-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Valor ($)</th>
                <th>Ubicación</th>
                <th>Responsable</th>
                <th>Estado</th>
                {isWriteAllowed && <th className="col-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="col-code">
                    {asset.code}
                  </td>
                  <td>
                    <div className="asset-name">{asset.name}</div>
                    {asset.description && <div className="asset-desc">{asset.description}</div>}
                  </td>
                  <td>{asset.category}</td>
                  <td className="col-value">
                    ${Number(asset.value || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{asset.location}</td>
                  <td>{asset.assignee_name || <span className="text-muted">Sin Asignar</span>}</td>
                  <td>
                    <span className={`badge badge-${
                      asset.status === 'Activo' ? 'active' : 
                      asset.status === 'Pendiente Aceptación' ? 'pending' : 
                      asset.status === 'En Mantenimiento' ? 'maintenance' : 'rejected'
                    }`}>
                      {asset.status}
                    </span>
                  </td>
                  {isWriteAllowed && (
                    <td>
                      <div className="table-actions">
                        <button 
                          className="btn btn-secondary icon-btn" 
                          onClick={() => handleOpenEdit(asset)}
                          title="Editar Activo"
                        >
                          <Edit2 size={16} />
                        </button>
                        {isDeleteAllowed && (
                          <button 
                            className="btn btn-secondary icon-btn" 
                            onClick={() => handleDelete(asset.id)}
                            title="Eliminar Activo"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Seguro de Formulario */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingAsset ? `Editar Activo: ${editingAsset.code}` : 'Registrar Nuevo Activo'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave}>
              <div className="modal-body modal-body-form">
                
                <div className="form-group">
                  <label className="form-label">Nombre del Activo *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej: Laptop Lenovo ThinkPad T14"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea
                    className="input-field form-textarea"
                    placeholder="Detalles del equipo, serial, características..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Categoría *</label>
                    <select
                      className="input-field"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="Hardware">Hardware</option>
                      <option value="Software">Software</option>
                      <option value="Vehículos">Vehículos</option>
                      <option value="Mobiliario">Mobiliario</option>
                    </select>
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
                    <label className="form-label">Ubicación Física *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej: Oficina Norte Piso 2"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Fecha de Compra</label>
                    <input
                      type="date"
                      className="input-field"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Asignar Responsable</label>
                  <select
                    className="input-field"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                  >
                    <option value="">-- Sin Asignación (Disponible) --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                    ))}
                  </select>
                  <span className="field-hint">
                    Al asignar un responsable, el activo quedará "Pendiente de Aceptación" hasta su firma.
                  </span>
                </div>

                <div className="form-group">
                  <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    Fotografía del Activo
                    <span className="field-hint">(Opcional)</span>
                  </div>
                  
                  {!photoData ? (
                    <div className="form-grid-2">
                      <label className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer', alignItems: 'center', gap: '0.5rem' }}>
                        <Camera size={18} /> Tomar Foto
                        <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={{ display: 'none' }} />
                      </label>
                      <label className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer', alignItems: 'center', gap: '0.5rem' }}>
                        <Upload size={18} /> Subir Archivo
                        <input type="file" accept="image/*" onChange={handlePhotoCapture} style={{ display: 'none' }} />
                      </label>
                    </div>
                  ) : (
                    <div className="photo-preview-wrapper">
                      <img src={photoData} alt="Preview" className="photo-preview-img" />
                      <button type="button" onClick={() => setPhotoData(null)} className="btn btn-secondary photo-remove-btn">
                        <Trash2 size={16} /> Eliminar Foto
                      </button>
                    </div>
                  )}
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
                >
                  {editingAsset ? 'Guardar Cambios' : 'Registrar Activo'}
                </button>
              </div>
            </form>
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
