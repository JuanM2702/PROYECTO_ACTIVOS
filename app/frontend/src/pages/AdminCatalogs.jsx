import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Tag, 
  Server, 
  Activity, 
  Briefcase, 
  Building2, 
  MapPin, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  RefreshCcw,
  Layers,
  ChevronRight,
  Truck,
  Search,
  ArchiveX
} from 'lucide-react';
import { useAuth } from '../App';

const initialCategoriesData = [
  {
    id: 1,
    name: 'Construcciones y Edificaciones',
    subcategories: []
  },
  {
    id: 2,
    name: 'Equipo de Cómputo y Comunicación',
    subcategories: []
  },
  {
    id: 3,
    name: 'Flota y Equipo de Transporte',
    subcategories: []
  },
  {
    id: 4,
    name: 'Maquinaria y Equipo',
    subcategories: []
  },
  {
    id: 5,
    name: 'Muebles y Enseres',
    subcategories: []
  }
];

export default function AdminCatalogs() {
  const { showToast } = useAuth();
  const [activeTab, setActiveTab] = useState('categories_sub');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtros de búsqueda para catálogos
  const [searchCat, setSearchCat] = useState('');
  const [searchSubcat, setSearchSubcat] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Estado de Paginación para catálogos
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Categorías y Subcategorías state
  const [categoriesList, setCategoriesList] = useState([]);
  const [subcategoriesList, setSubcategoriesList] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState(null);
  
  const [newSubcatName, setNewSubcatName] = useState('');
  const [editingSubcatId, setEditingSubcatId] = useState(null);
  const [editingSubcatName, setEditingSubcatName] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');

  // General catalog form states
  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [newLocation, setNewLocation] = useState({ area: '', punto_venta: '', oficina: '', zona: '' });
  const [editingLocation, setEditingLocation] = useState({ area: '', punto_venta: '', oficina: '', zona: '' });

  // Proveedores state
  const [newProveedor, setNewProveedor] = useState({ nombre: '', nit: '', telefono: '', email: '', direccion: '' });
  const [editingProveedor, setEditingProveedor] = useState({ nombre: '', nit: '', telefono: '', email: '', direccion: '' });

  const tabs = [
    { id: 'categories_sub', label: 'Categorías y Subcategorías', icon: Layers, endpoint: null },
    { id: 'states', label: 'Estados Físicos', icon: Activity, endpoint: '/api/dictionaries/states' },
    { id: 'brands', label: 'Marcas', icon: Tag, endpoint: '/api/dictionaries/brands' },
    { id: 'proveedores', label: 'Proveedores', icon: Truck, endpoint: '/api/dictionaries/proveedores' },
    { id: 'cargos', label: 'Cargos (DB Centralizada)', icon: Briefcase, endpoint: '/api/dictionaries/cargos', readOnly: true },
    { id: 'companies', label: 'Empresas', icon: Building2, endpoint: '/api/dictionaries/companies' },
    { id: 'locations', label: 'Ubicaciones', icon: MapPin, endpoint: '/api/dictionaries/ubicaciones' },
    { id: 'motivos_baja', label: 'Motivos de Baja', icon: ArchiveX, endpoint: '/api/dictionaries/motivos-baja' }
  ];

  const currentTabInfo = tabs.find(t => t.id === activeTab);

  const fetchCategoriesAndSubcategories = async () => {
    setLoading(true);
    try {
      const [catRes, subRes] = await Promise.all([
        axios.get('/api/dictionaries/resource-types'),
        axios.get('/api/dictionaries/subresource-types')
      ]);
      
      let cats = catRes.data.success ? catRes.data.data : [];
      let subs = subRes.data.success ? subRes.data.data : [];

      setCategoriesList(cats);
      setSubcategoriesList(subs);

      if (cats.length > 0 && !selectedCatId) {
        setSelectedCatId(cats[0].id);
      }
    } catch (err) {
      showToast('Error al cargar categorías de la base de datos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    if (!currentTabInfo || !currentTabInfo.endpoint) return;
    setLoading(true);
    try {
      const response = await axios.get(currentTabInfo.endpoint, {
        params: {
          page,
          limit,
          search: catalogSearch
        }
      });
      if (response.data.success) {
        setData(response.data.data);
        if (response.data.pagination) {
          setTotal(response.data.pagination.total);
          setTotalPages(response.data.pagination.totalPages);
        } else {
          setTotal(response.data.data.length);
          setTotalPages(1);
        }
      }
    } catch (err) {
      showToast(`Error al cargar datos de ${currentTabInfo.label}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNewItemName('');
    setEditingId(null);
    setCatalogSearch('');
    setSearchCat('');
    setSearchSubcat('');
    setPage(1);
    if (activeTab === 'categories_sub') {
      fetchCategoriesAndSubcategories();
    } else {
      fetchItems();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'categories_sub') {
      fetchItems();
    }
  }, [page, catalogSearch]);

  // Handlers para Categorías
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      const res = await axios.post('/api/dictionaries/resource-types', { nombre: newCategoryName.trim().toUpperCase() });
      if (res.data.success) {
        showToast('Categoría creada exitosamente en base de datos', 'success');
        setNewCategoryName('');
        fetchCategoriesAndSubcategories();
        if (res.data.data?.id) setSelectedCatId(res.data.data.id);
      }
    } catch (err) {
      showToast('Error al crear categoría', 'error');
    }
  };

  const handleUpdateCategory = async (catId) => {
    if (!editingCatName.trim()) return;
    try {
      const res = await axios.put(`/api/dictionaries/resource-types/${catId}`, { nombre: editingCatName.trim().toUpperCase() });
      if (res.data.success) {
        showToast('Categoría actualizada', 'success');
        setEditingCatId(null);
        fetchCategoriesAndSubcategories();
      }
    } catch (err) {
      showToast('Error al actualizar categoría', 'error');
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('¿Desea eliminar esta categoría y todas sus subcategorías asociadas?')) return;
    try {
      const res = await axios.delete(`/api/dictionaries/resource-types/${catId}`);
      if (res.data.success) {
        showToast('Categoría eliminada', 'success');
        fetchCategoriesAndSubcategories();
      }
    } catch (err) {
      showToast('No se puede eliminar la categoría porque tiene activos o registros asociados', 'error');
    }
  };

  // Handlers para Subcategorías
  const handleAddSubcategory = async (e) => {
    e.preventDefault();
    if (!newSubcatName.trim() || !selectedCatId) return;
    try {
      const res = await axios.post('/api/dictionaries/subresource-types', {
        nombre: newSubcatName.trim(),
        tipo_recurso_id: selectedCatId
      });
      if (res.data.success) {
        showToast('Subcategoría agregada en base de datos', 'success');
        setNewSubcatName('');
        fetchCategoriesAndSubcategories();
      }
    } catch (err) {
      showToast('Error al guardar subcategoría', 'error');
    }
  };

  const handleUpdateSubcategory = async (subId) => {
    if (!editingSubcatName.trim()) return;
    try {
      const res = await axios.put(`/api/dictionaries/subresource-types/${subId}`, {
        nombre: editingSubcatName.trim(),
        tipo_recurso_id: selectedCatId
      });
      if (res.data.success) {
        showToast('Subcategoría actualizada', 'success');
        setEditingSubcatId(null);
        fetchCategoriesAndSubcategories();
      }
    } catch (err) {
      showToast('Error al actualizar subcategoría', 'error');
    }
  };

  const handleDeleteSubcategory = async (subId) => {
    if (!window.confirm('¿Desea eliminar esta subcategoría?')) return;
    try {
      const res = await axios.delete(`/api/dictionaries/subresource-types/${subId}`);
      if (res.data.success) {
        showToast('Subcategoría eliminada', 'success');
        fetchCategoriesAndSubcategories();
      }
    } catch (err) {
      showToast('Error al eliminar subcategoría', 'error');
    }
  };

  const handleUpdateLocation = async (id) => {
    if (!editingLocation.area || !editingLocation.punto_venta || !editingLocation.oficina || !editingLocation.zona) {
      showToast('Todos los campos son requeridos para la ubicación', 'error');
      return;
    }
    try {
      const res = await axios.put(`/api/dictionaries/ubicaciones/${id}`, editingLocation);
      if (res.data.success) {
        showToast('Ubicación actualizada exitosamente', 'success');
        setEditingId(null);
        fetchItems();
      }
    } catch (err) {
      showToast('Error al actualizar ubicación', 'error');
    }
  };

  const handleCreateGeneric = async (e) => {
    e.preventDefault();
    if (activeTab === 'locations') {
      if (!newLocation.area || !newLocation.punto_venta || !newLocation.oficina || !newLocation.zona) {
        showToast('Todos los campos son requeridos', 'error');
        return;
      }
      try {
        const res = await axios.post(currentTabInfo.endpoint, newLocation);
        if (res.data.success) {
          showToast('Ubicación registrada exitosamente', 'success');
          setNewLocation({ area: '', punto_venta: '', oficina: '', zona: '' });
          fetchItems();
        }
      } catch (err) {
        showToast('Error al guardar ubicación', 'error');
      }
      return;
    }

    if (activeTab === 'proveedores') {
      if (!newProveedor.nombre.trim()) {
        showToast('El nombre del proveedor es obligatorio', 'error');
        return;
      }
      try {
        const res = await axios.post(currentTabInfo.endpoint, newProveedor);
        if (res.data.success) {
          showToast('Proveedor registrado exitosamente', 'success');
          setNewProveedor({ nombre: '', nit: '', telefono: '', email: '', direccion: '' });
          fetchItems();
        }
      } catch (err) {
        showToast(err.response?.data?.error || 'Error al guardar proveedor', 'error');
      }
      return;
    }

    if (!newItemName.trim()) return;
    try {
      const res = await axios.post(currentTabInfo.endpoint, { nombre: newItemName });
      if (res.data.success) {
        showToast('Registro creado exitosamente', 'success');
        setNewItemName('');
        fetchItems();
      }
    } catch (err) {
      showToast('Error al crear registro', 'error');
    }
  };

  const handleUpdateGeneric = async (id) => {
    if (activeTab === 'locations') {
      return handleUpdateLocation(id);
    }
    if (activeTab === 'proveedores') {
      if (!editingProveedor.nombre.trim()) {
        showToast('El nombre del proveedor es obligatorio', 'error');
        return;
      }
      try {
        const res = await axios.put(`${currentTabInfo.endpoint}/${id}`, editingProveedor);
        if (res.data.success) {
          showToast('Proveedor actualizado exitosamente', 'success');
          setEditingId(null);
          fetchItems();
        }
      } catch (err) {
        showToast(err.response?.data?.error || 'Error al actualizar proveedor', 'error');
      }
      return;
    }

    if (!editingName.trim()) return;
    try {
      const res = await axios.put(`${currentTabInfo.endpoint}/${id}`, { nombre: editingName });
      if (res.data.success) {
        showToast('Registro actualizado exitosamente', 'success');
        setEditingId(null);
        fetchItems();
      }
    } catch (err) {
      showToast('Error al actualizar', 'error');
    }
  };

  const handleDeleteGeneric = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este elemento?')) return;
    try {
      const res = await axios.delete(`${currentTabInfo.endpoint}/${id}`);
      if (res.data.success) {
        showToast('Registro eliminado correctamente', 'success');
        fetchItems();
      }
    } catch (err) {
      showToast('No se puede eliminar el registro ya que tiene activos asociados', 'error');
    }
  };

  const selectedCategoryObj = categoriesList.find(c => c.id === selectedCatId) || categoriesList[0];
  const currentSubcategories = subcategoriesList.filter(s => s.tipo_recurso_id === (selectedCategoryObj?.id || selectedCatId));

  const filteredCategories = categoriesList.filter(c => 
    !searchCat.trim() || (c.nombre || c.name || '').toLowerCase().includes(searchCat.toLowerCase().trim())
  );

  const filteredSubcategories = currentSubcategories.filter(s => 
    !searchSubcat.trim() || (s.nombre || '').toLowerCase().includes(searchSubcat.toLowerCase().trim())
  );

  const filteredData = Array.isArray(data) ? data.filter(item => {
    if (!catalogSearch.trim()) return true;
    const q = catalogSearch.toLowerCase().trim();
    if (activeTab === 'locations') {
      return (item.area || '').toLowerCase().includes(q) ||
             (item.punto_venta || '').toLowerCase().includes(q) ||
             (item.oficina || '').toLowerCase().includes(q) ||
             (item.zona || '').toLowerCase().includes(q);
    }
    if (activeTab === 'proveedores') {
      return (item.nombre || '').toLowerCase().includes(q) ||
             (item.nit || '').toLowerCase().includes(q) ||
             (item.telefono || '').toLowerCase().includes(q) ||
             (item.email || '').toLowerCase().includes(q) ||
             (item.direccion || '').toLowerCase().includes(q);
    }
    return (item.nombre || item.name || '').toLowerCase().includes(q);
  }) : [];

  return (
    <div className="atlas-dashboard-wrapper">
      <div className="atlas-welcome-bar">
        <div>
          <h1 className="welcome-title">Personalización del Sistema</h1>
          <p className="welcome-subtitle">Gestión de categorías, subcategorías y diccionarios corporativos de activos</p>
        </div>
      </div>

      {/* Selector de Pestañas */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="btn"
              style={{
                background: isActive ? '#1352E6' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#475569',
                border: isActive ? '1px solid #1352E6' : '1px solid #E2E8F0',
                fontWeight: isActive ? 600 : 500,
                borderRadius: '8px',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isActive ? '0 2px 8px rgba(19,82,230,0.25)' : 'none',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* PESTAÑA: CATEGORÍAS Y SUBCATEGORÍAS */}
      {activeTab === 'categories_sub' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '16px' }}>
          {/* Panel Izquierdo: Categorías */}
          <div className="atlas-card">
            <div className="atlas-card-header">
              <h3 className="atlas-card-title">Categorías Principales</h3>
              <span style={{ fontSize: '0.78rem', color: '#64748B' }}>{filteredCategories.length} registradas</span>
            </div>

            {/* Búsqueda de Categorías */}
            <div style={{ marginBottom: '12px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Filtrar categorías..."
                value={searchCat}
                onChange={e => setSearchCat(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '30px', fontSize: '0.8rem', padding: '6px 10px 6px 30px' }}
              />
            </div>

            {/* Form Crear Categoría */}
            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Nueva Categoría..."
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                className="input-field"
                style={{ flex: 1, padding: '6px 10px', fontSize: '0.83rem' }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px' }}>
                <Plus size={15} />
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '520px', overflowY: 'auto' }}>
              {filteredCategories.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center', padding: '16px' }}>
                  No se encontraron categorías.
                </div>
              ) : (
                filteredCategories.map(cat => {
                  const isSelected = cat.id === selectedCatId;
                  const catSubCount = subcategoriesList.filter(s => s.tipo_recurso_id === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCatId(cat.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: isSelected ? '#EBF3FF' : '#F8FAFC',
                        border: isSelected ? '1px solid #1352E6' : '1px solid #E2E8F0',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {editingCatId === cat.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }} onClick={e=>e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingCatName}
                            onChange={e => setEditingCatName(e.target.value)}
                            className="input-field"
                            style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                          />
                          <button onClick={() => handleUpdateCategory(cat.id)} className="btn-icon" title="Guardar">
                            <Save size={14} color="#10B981" />
                          </button>
                          <button onClick={() => setEditingCatId(null)} className="btn-icon" title="Cancelar">
                            <X size={14} color="#EF4444" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: isSelected ? 700 : 600, fontSize: '0.82rem', color: isSelected ? '#1352E6' : '#0F172A' }}>
                              {cat.nombre || cat.name}
                            </span>
                            <span style={{ fontSize: '0.73rem', color: '#64748B' }}>
                              {catSubCount} subcategorías
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={e=>e.stopPropagation()}>
                            <button 
                              onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.nombre || cat.name); }}
                              className="btn-icon"
                              title="Editar Categoría"
                            >
                              <Edit2 size={13} color="#64748B" />
                            </button>
                            <button 
                              onClick={() => handleDeleteCategory(cat.id)}
                              className="btn-icon"
                              title="Eliminar Categoría"
                            >
                              <Trash2 size={13} color="#EF4444" />
                            </button>
                            <ChevronRight size={16} color={isSelected ? '#1352E6' : '#94A3B8'} />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Panel Derecho: Subcategorías de la Categoría Seleccionada */}
          <div className="atlas-card">
            <div className="atlas-card-header">
              <div>
                <h3 className="atlas-card-title">Subcategorías de: <span style={{ color: '#1352E6' }}>{selectedCategoryObj?.nombre || selectedCategoryObj?.name}</span></h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Gestione las opciones desplegables para activos</span>
              </div>
            </div>

            {/* Búsqueda de Subcategorías */}
            <div style={{ marginBottom: '12px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Filtrar subcategorías..."
                value={searchSubcat}
                onChange={e => setSearchSubcat(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '30px', fontSize: '0.8rem', padding: '6px 10px 6px 30px' }}
              />
            </div>

            {/* Form Crear Subcategoría */}
            <form onSubmit={handleAddSubcategory} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder={`Agregar subcategoría a ${selectedCategoryObj?.nombre || selectedCategoryObj?.name || 'la categoría'}...`}
                value={newSubcatName}
                onChange={e => setNewSubcatName(e.target.value)}
                className="input-field"
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary">
                <Plus size={16} />
                <span>Agregar</span>
              </button>
            </form>

            {/* Grilla / Lista de Subcategorías */}
            {filteredSubcategories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                No hay subcategorías que coincidan con la búsqueda.
              </div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '480px', overflowY: 'auto' }}>
                <table className="atlas-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>#</th>
                      <th>Subcategoría</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubcategories.map((sub, idx) => (
                      <tr key={sub.id || idx}>
                        <td><code>{idx + 1}</code></td>
                        <td>
                          {editingSubcatId === sub.id ? (
                            <input
                              type="text"
                              value={editingSubcatName}
                              onChange={e => setEditingSubcatName(e.target.value)}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '0.83rem' }}
                            />
                          ) : (
                            <strong style={{ fontSize: '0.85rem', color: '#334155' }}>{sub.nombre}</strong>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {editingSubcatId === sub.id ? (
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button onClick={() => handleUpdateSubcategory(sub.id)} className="btn-icon" title="Guardar">
                                <Save size={15} color="#10B981" />
                              </button>
                              <button onClick={() => setEditingSubcatId(null)} className="btn-icon" title="Cancelar">
                                <X size={15} color="#EF4444" />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button 
                                onClick={() => { setEditingSubcatId(sub.id); setEditingSubcatName(sub.nombre); }} 
                                className="btn-icon" 
                                title="Editar Subcategoría"
                              >
                                <Edit2 size={14} color="#1352E6" />
                              </button>
                              <button 
                                onClick={() => handleDeleteSubcategory(sub.id)} 
                                className="btn-icon" 
                                title="Eliminar Subcategoría"
                              >
                                <Trash2 size={14} color="#EF4444" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      ) : (
        /* RESTO DE CATÁLOGOS (Marcas, Estados, Cargos, Empresas, Ubicaciones, Proveedores) */
        <div className="atlas-card">
          <div className="atlas-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <h3 className="atlas-card-title">{currentTabInfo?.label}</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder={`Buscar en ${currentTabInfo?.label.toLowerCase()}...`}
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '30px', fontSize: '0.8rem', padding: '6px 10px 6px 30px' }}
                />
              </div>

              <button className="btn-icon" onClick={fetchItems} title="Actualizar">
                <RefreshCcw size={16} />
              </button>
            </div>
          </div>

          {currentTabInfo?.readOnly && (
            <div style={{ 
              background: 'rgba(99, 102, 241, 0.08)', 
              border: '1px solid rgba(99, 102, 241, 0.25)', 
              borderRadius: '8px', 
              padding: '12px 16px', 
              marginBottom: '16px',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '1.1rem' }}>🔒</span>
              <span>Los <strong>{currentTabInfo?.label}</strong> provienen de la base de datos centralizada (tabla <code>positions</code>) y son de <strong>solo lectura</strong>. Para modificarlos, contacte al administrador de la base de datos central.</span>
            </div>
          )}

          {!currentTabInfo?.readOnly && (
          <form onSubmit={handleCreateGeneric} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {activeTab === 'locations' ? (
              <>
                <input
                  type="text"
                  placeholder="Área"
                  value={newLocation.area}
                  onChange={e => setNewLocation({ ...newLocation, area: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '130px' }}
                />
                <input
                  type="text"
                  placeholder="Punto de Venta"
                  value={newLocation.punto_venta}
                  onChange={e => setNewLocation({ ...newLocation, punto_venta: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '130px' }}
                />
                <input
                  type="text"
                  placeholder="Oficina"
                  value={newLocation.oficina}
                  onChange={e => setNewLocation({ ...newLocation, oficina: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '130px' }}
                />
                <input
                  type="text"
                  placeholder="Zona"
                  value={newLocation.zona}
                  onChange={e => setNewLocation({ ...newLocation, zona: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '130px' }}
                />
              </>
            ) : activeTab === 'proveedores' ? (
              <>
                <input
                  type="text"
                  placeholder="Nombre / Razón Social *"
                  value={newProveedor.nombre}
                  onChange={e => setNewProveedor({ ...newProveedor, nombre: e.target.value })}
                  className="input-field"
                  style={{ flex: 1.5, minWidth: '180px' }}
                  required
                />
                <input
                  type="text"
                  placeholder="NIT / Documento"
                  value={newProveedor.nit}
                  onChange={e => setNewProveedor({ ...newProveedor, nit: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '130px' }}
                />
                <input
                  type="text"
                  placeholder="Teléfono"
                  value={newProveedor.telefono}
                  onChange={e => setNewProveedor({ ...newProveedor, telefono: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '120px' }}
                />
                <input
                  type="text"
                  placeholder="Correo Electrónico"
                  value={newProveedor.email}
                  onChange={e => setNewProveedor({ ...newProveedor, email: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '150px' }}
                />
                <input
                  type="text"
                  placeholder="Dirección"
                  value={newProveedor.direccion}
                  onChange={e => setNewProveedor({ ...newProveedor, direccion: e.target.value })}
                  className="input-field"
                  style={{ flex: 1, minWidth: '150px' }}
                />
              </>
            ) : (
              <input
                type="text"
                placeholder={`Nuevo nombre en ${currentTabInfo?.label}...`}
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                className="input-field"
                style={{ flex: 1, minWidth: '220px' }}
              />
            )}

            <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} />
              <span>Agregar</span>
            </button>
          </form>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>Cargando datos...</div>
          ) : filteredData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
              {data.length === 0 ? 'No hay elementos registrados.' : 'No se encontraron elementos que coincidan con la búsqueda.'}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="atlas-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>ID</th>
                    {activeTab === 'locations' ? (
                      <>
                        <th>Área</th>
                        <th>Punto de Venta</th>
                        <th>Oficina</th>
                        <th>Zona</th>
                      </>
                    ) : activeTab === 'proveedores' ? (
                      <>
                        <th>Nombre / Razón Social</th>
                        <th>NIT / Documento</th>
                        <th>Teléfono</th>
                        <th>Email</th>
                        <th>Dirección</th>
                      </>
                    ) : (
                      <th>Nombre / Valor</th>
                    )}
                    {!currentTabInfo?.readOnly && <th style={{ width: '120px', textAlign: 'right' }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item) => (
                    <tr key={item.id}>
                      <td><code>#{item.id}</code></td>
                      {activeTab === 'locations' ? (
                        editingId === item.id ? (
                          <>
                            <td>
                              <input
                                type="text"
                                value={editingLocation.area}
                                onChange={e => setEditingLocation({ ...editingLocation, area: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingLocation.punto_venta}
                                onChange={e => setEditingLocation({ ...editingLocation, punto_venta: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingLocation.oficina}
                                onChange={e => setEditingLocation({ ...editingLocation, oficina: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingLocation.zona}
                                onChange={e => setEditingLocation({ ...editingLocation, zona: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{item.area}</td>
                            <td>{item.punto_venta}</td>
                            <td>{item.oficina}</td>
                            <td>{item.zona}</td>
                          </>
                        )
                      ) : activeTab === 'proveedores' ? (
                        editingId === item.id ? (
                          <>
                            <td>
                              <input
                                type="text"
                                value={editingProveedor.nombre}
                                onChange={e => setEditingProveedor({ ...editingProveedor, nombre: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingProveedor.nit}
                                onChange={e => setEditingProveedor({ ...editingProveedor, nit: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingProveedor.telefono}
                                onChange={e => setEditingProveedor({ ...editingProveedor, telefono: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingProveedor.email}
                                onChange={e => setEditingProveedor({ ...editingProveedor, email: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingProveedor.direccion}
                                onChange={e => setEditingProveedor({ ...editingProveedor, direccion: e.target.value })}
                                className="input-field"
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td><strong>{item.nombre}</strong></td>
                            <td>{item.nit || '-'}</td>
                            <td>{item.telefono || '-'}</td>
                            <td>{item.email || '-'}</td>
                            <td>{item.direccion || '-'}</td>
                          </>
                        )
                      ) : (
                        <td>
                          {editingId === item.id ? (
                            <input
                              type="text"
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              className="input-field"
                              style={{ padding: '4px 8px' }}
                            />
                          ) : (
                            <strong>{item.nombre || item.estado || item.area}</strong>
                          )}
                        </td>
                      )}

                      {!currentTabInfo?.readOnly && (
                      <td style={{ textAlign: 'right' }}>
                        {editingId === item.id ? (
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button onClick={() => handleUpdateGeneric(item.id)} className="btn-icon" title="Guardar">
                              <Save size={16} color="#10B981" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="btn-icon" title="Cancelar">
                              <X size={16} color="#EF4444" />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button 
                              onClick={() => {
                                setEditingId(item.id);
                                if (activeTab === 'locations') {
                                  setEditingLocation({ area: item.area || '', punto_venta: item.punto_venta || '', oficina: item.oficina || '', zona: item.zona || '' });
                                } else if (activeTab === 'proveedores') {
                                  setEditingProveedor({ nombre: item.nombre || '', nit: item.nit || '', telefono: item.telefono || '', email: item.email || '', direccion: item.direccion || '' });
                                } else {
                                  setEditingName(item.nombre || item.estado || '');
                                }
                              }} 
                              className="btn-icon" 
                              title="Editar"
                            >
                              <Edit2 size={15} color="#1352E6" />
                            </button>
                            <button onClick={() => handleDeleteGeneric(item.id)} className="btn-icon" title="Eliminar">
                              <Trash2 size={15} color="#EF4444" />
                            </button>
                          </div>
                        )}
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación para catálogos */}
          {activeTab !== 'categories_sub' && totalPages > 1 && (
            <div className="pagination-container" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Mostrando {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} de {total} registros
              </span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Anterior
                </button>
                <span style={{ fontSize: '13px', fontWeight: '600', padding: '0 8px' }}>
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
