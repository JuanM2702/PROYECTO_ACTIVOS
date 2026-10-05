import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { Users, Shield, CheckSquare, Eye, Edit3, Lock, Plus, Save, Trash2, CheckCircle, XCircle } from 'lucide-react';

export default function AdminUsers() {
  const { user, showToast } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = crear, object = editar
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'VIEWER',
    allowed_modules: ['dashboard'],
    cargo: '',
    empresa: '',
    cedula: ''
  });

  const ALL_MODULES = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'inventory', label: 'Inventario' },
    { id: 'movements', label: 'Movimientos' },
    { id: 'acceptances', label: 'Aceptaciones' }
  ];

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/auth/admin/users');
      if (response.data.success) {
        setUsers(response.data.users);
      }
    } catch (err) {
      showToast('Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (u.full_name && u.full_name.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.role && u.role.toLowerCase().includes(term))
    );
  });

  const total = filteredUsers.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginatedUsers = filteredUsers.slice((page - 1) * limit, page * limit);

  const toggleStatus = async (targetUser) => {
    if (targetUser.id === user.id) {
      return showToast('No puedes desactivar tu propia cuenta', 'warning');
    }
    try {
      await axios.put(`/api/auth/admin/users/${targetUser.id}/status`, {
        is_active: !targetUser.is_active
      });
      showToast(`Usuario ${targetUser.is_active ? 'desactivado' : 'activado'}`, 'success');
      fetchUsers();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al cambiar estado del usuario';
      showToast(errorMsg, 'warning');
    }
  };

  const handleRolePreset = (role) => {
    let preset = ['dashboard'];
    if (role === 'ADMIN') preset = ['dashboard', 'inventory', 'movements', 'acceptances'];
    if (role === 'OPERATOR') preset = ['dashboard', 'inventory', 'movements'];
    setFormData(prev => ({ ...prev, role, allowed_modules: preset }));
  };

  const toggleModule = (modId) => {
    setFormData(prev => {
      const isSelected = prev.allowed_modules.includes(modId);
      const updated = isSelected
        ? prev.allowed_modules.filter(id => id !== modId)
        : [...prev.allowed_modules, modId];
      return { ...prev, allowed_modules: updated };
    });
  };

  // Central DB lookup states
  const [searchingCentral, setSearchingCentral] = useState(false);
  const [centralUserData, setCentralUserData] = useState(null);

  const openCreateModal = () => {
    setEditingUser(null);
    setCentralUserData(null);
    setFormData({
      username: '',
      fullName: '',
      email: '',
      password: '',
      role: 'VIEWER',
      allowed_modules: ['dashboard'],
      cargo: '',
      empresa: 'SEAPTO S.A.',
      cedula: ''
    });
    setIsModalOpen(true);
  };

  const searchCentralUser = async (cedulaToSearch) => {
    const queryCedula = cedulaToSearch || formData.cedula;
    if (!queryCedula || !queryCedula.trim()) {
      return showToast('Ingrese una cédula para buscar en la base de datos centralizada', 'warning');
    }
    setSearchingCentral(true);
    setCentralUserData(null);
    try {
      const response = await axios.get(`/api/auth/admin/central-user/${queryCedula.trim()}`);
      if (response.data.success && response.data.user) {
        const cUser = response.data.user;
        setCentralUserData(cUser);
        setFormData(prev => ({
          ...prev,
          cedula: cUser.cedula,
          username: cUser.username,
          fullName: cUser.fullName,
          email: cUser.email,
          cargo: cUser.cargo,
          empresa: cUser.empresa
        }));
        showToast(`Usuario ${cUser.fullName} encontrado en DB Centralizada`, 'success');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'No se encontró el usuario en la base de datos centralizada';
      showToast(msg, 'error');
    } finally {
      setSearchingCentral(false);
    }
  };

  const openEditModal = (targetUser) => {
    setEditingUser(targetUser);
    setCentralUserData(null);
    setFormData({
      username: targetUser.username || '',
      fullName: targetUser.full_name || '',
      email: targetUser.email || '',
      password: '', // En blanco por seguridad (solo si se cambia)
      role: targetUser.role || 'VIEWER',
      allowed_modules: targetUser.allowed_modules || ['dashboard'],
      cargo: targetUser.cargo || '',
      empresa: targetUser.empresa || '',
      cedula: targetUser.cedula || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await axios.put(`/api/auth/admin/users/${editingUser.id}`, formData);
        showToast('Usuario actualizado exitosamente', 'success');
      } else {
        if (!formData.cedula) {
          return showToast('La cédula es obligatoria', 'warning');
        }
        await axios.post('/api/auth/admin/users', {
          cedula: formData.cedula,
          role: formData.role,
          allowed_modules: formData.allowed_modules,
          password: formData.password
        });
        showToast('Usuario vinculado y creado exitosamente desde la DB Centralizada', 'success');
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Error al guardar usuario', 'error');
    }
  };

  const saveModules = async (targetUser, newModules, newRole) => {
     try {
       await axios.put(`/api/auth/admin/users/${targetUser.id}/modules`, {
         allowed_modules: newModules,
         role: newRole
       });
       showToast('Permisos actualizados', 'success');
       fetchUsers();
     } catch (err) {
       showToast('Error al actualizar permisos', 'error');
     }
  };

  if (loading) return <div>Cargando usuarios...</div>;

  return (
    <div className="glass-card" style={{ maxWidth: '1050px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={24} color="var(--accent-primary)" />
            Administración de Usuarios ({total.toLocaleString('es-CO')})
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Control de acceso y permisos por módulo</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          + Nuevo Usuario
        </button>
      </div>

      {/* Buscador de usuarios */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input 
          type="text" 
          className="input-field" 
          placeholder="Buscar por nombre, usuario o email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="table-container">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Usuario / Detalles</th>
              <th>Cargo / Empresa</th>
              <th>Rol / Permisos</th>
              <th>Estado</th>
              <th style={{ textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.map(u => (
              <tr key={u.id}>
                <td>
                  <strong>{u.full_name}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{u.username} \| {u.email}</div>
                  {u.cedula && <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 'bold' }}>CC: {u.cedula}</div>}
                </td>
                <td>
                  <div style={{ fontWeight: '500' }}>{u.cargo || 'No asignado'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.empresa || 'N/A'}</div>
                </td>
                <td>
                  <span className={`badge ${u.role === 'ADMIN' ? 'badge-active' : 'badge-pending'}`}>{u.role}</span>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {ALL_MODULES.map(m => {
                      const hasAccess = u.allowed_modules?.includes(m.id);
                      return (
                        <span 
                          key={m.id} 
                          onClick={() => {
                            if(u.role === 'ADMIN') return;
                            const newMods = hasAccess ? u.allowed_modules.filter(x => x !== m.id) : [...(u.allowed_modules||[]), m.id];
                            saveModules(u, newMods, u.role);
                          }}
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: hasAccess ? 'var(--accent-primary-glow)' : 'var(--bg-tertiary)',
                            color: hasAccess ? 'var(--accent-primary)' : 'var(--text-muted)',
                            cursor: u.role === 'ADMIN' ? 'default' : 'pointer',
                            border: `${hasAccess ? '1px solid var(--accent-primary)' : '1px solid var(--border-glass)'}`
                          }}>
                          {m.label}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`} style={{ color: u.is_active ? 'green' : 'red' }}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button 
                      className="btn btn-secondary icon-btn" 
                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => openEditModal(u)}
                      title="Editar usuario"
                    >
                      <Edit3 size={14} /> Editar
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => toggleStatus(u)}
                      disabled={u.id === user.id}
                    >
                      {u.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Componente de Paginación para Usuarios */}
        <div className="pagination-container">
          <div>
            Mostrando <strong>{total === 0 ? 0 : (page - 1) * limit + 1}</strong> - <strong>{Math.min(page * limit, total)}</strong> de <strong>{total.toLocaleString('es-CO')}</strong> usuarios
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
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSubmit}>
              <div className="modal-header">
                <h3>{editingUser ? `Editar Usuario: @${formData.username}` : 'Vincular Usuario desde DB Centralizada'}</h3>
              </div>
              <div className="modal-body">
                {!editingUser ? (
                  /* Formulario de Creación mediante Cédula + DB Centralizada */
                  <div>
                    <div className="form-group" style={{ marginBottom: '1.2rem' }}>
                      <label className="form-label" style={{ fontWeight: 'bold' }}>Número de Cédula / Documento *</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                          type="text" 
                          required 
                          className="input-field" 
                          placeholder="Ingrese la cédula de la persona..."
                          value={formData.cedula} 
                          onChange={e => setFormData({...formData, cedula: e.target.value})}
                          onBlur={() => { if (formData.cedula.trim() && !centralUserData) searchCentralUser(); }}
                        />
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          onClick={() => searchCentralUser()}
                          disabled={searchingCentral || !formData.cedula.trim()}
                        >
                          {searchingCentral ? 'Buscando...' : 'Buscar'}
                        </button>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Se consultará la información de la persona en la base de datos centralizada.
                      </span>
                    </div>

                    {/* Previsualización del Usuario de la DB Centralizada */}
                    {centralUserData && (
                      <div style={{ 
                        background: 'var(--bg-tertiary)', 
                        padding: '1rem', 
                        borderRadius: '8px', 
                        border: '1px solid var(--accent-primary)',
                        marginBottom: '1.2rem' 
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{centralUserData.fullName}</strong>
                          <span className="badge badge-success" style={{ color: 'green', fontWeight: 'bold' }}>
                            {centralUserData.status || 'Active'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                          <div><strong>Usuario:</strong> @{centralUserData.username}</div>
                          <div><strong>Email:</strong> {centralUserData.email}</div>
                          <div><strong>Cargo:</strong> {centralUserData.cargo}</div>
                          <div><strong>Empresa:</strong> {centralUserData.empresa}</div>
                        </div>
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Rol Base para este Servicio</label>
                      <select className="input-field" value={formData.role} onChange={e => handleRolePreset(e.target.value)}>
                        <option value="VIEWER">Consultor (VIEWER)</option>
                        <option value="OPERATOR">Operador (OPERATOR)</option>
                        <option value="ADMIN">Administrador (ADMIN)</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Contraseña Inicial (Opcional)</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="Por defecto la contraseña será la cédula" 
                        value={formData.password} 
                        onChange={e => setFormData({...formData, password: e.target.value})} 
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Si la deja en blanco, la contraseña inicial para iniciar sesión será su número de cédula.
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Módulos Permitidos</label>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {ALL_MODULES.map(m => (
                          <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={formData.allowed_modules.includes(m.id)}
                              onChange={() => toggleModule(m.id)}
                            />
                            <span style={{ fontSize: '0.9rem' }}>{m.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Formulario de Edición de Usuario Existente */
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Nombre Completo *</label>
                        <input type="text" required className="input-field" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Usuario *</label>
                        <input type="text" required className="input-field" disabled value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email *</label>
                        <input type="email" required className="input-field" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Contraseña (Solo para cambiar)</label>
                        <input type="text" className="input-field" placeholder="En blanco para conservar" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Cédula / Documento</label>
                        <input type="text" className="input-field" value={formData.cedula} onChange={e => setFormData({...formData, cedula: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Cargo</label>
                        <input type="text" className="input-field" value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value})} />
                      </div>
                      <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Empresa</label>
                        <input type="text" className="input-field" value={formData.empresa} onChange={e => setFormData({...formData, empresa: e.target.value})} />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label className="form-label">Rol Base</label>
                      <select className="input-field" value={formData.role} onChange={e => handleRolePreset(e.target.value)}>
                        <option value="VIEWER">Consultor (VIEWER)</option>
                        <option value="OPERATOR">Operador (OPERATOR)</option>
                        <option value="ADMIN">Administrador (ADMIN)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ajuste Fino de Módulos</label>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {ALL_MODULES.map(m => (
                          <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={formData.allowed_modules.includes(m.id)}
                              onChange={() => toggleModule(m.id)}
                            />
                            <span style={{ fontSize: '0.9rem' }}>{m.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Guardar Cambios' : 'Vincular y Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
