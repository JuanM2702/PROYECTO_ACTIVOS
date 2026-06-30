import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { Users, Shield, CheckCircle, XCircle } from 'lucide-react';

export default function AdminUsers() {
  const { user, showToast } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'VIEWER',
    allowed_modules: ['dashboard']
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
      showToast('Error al cambiar estado', 'error');
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

  const submitCreate = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/auth/admin/users', formData);
      showToast('Usuario creado exitosamente', 'success');
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Error al crear usuario', 'error');
    }
  };

  // Simplificación visual para la UI
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

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="glass-card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={24} color="var(--accent-primary)" />
            Administración de Usuarios
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Control de acceso y permisos por módulo</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setFormData({ username: '', fullName: '', email: '', password: '', role: 'VIEWER', allowed_modules: ['dashboard'] });
          setIsModalOpen(true);
        }}>
          + Nuevo Usuario
        </button>
      </div>

      <div className="table-container">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol / Permisos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <strong>{u.full_name}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{u.username} | {u.email}</div>
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
                            if(u.role === 'ADMIN') return; // Admin siempre tiene acceso a todo lógicamente
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
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                    onClick={() => toggleStatus(u)}
                    disabled={u.id === user.id}
                  >
                    {u.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <form onSubmit={submitCreate}>
              <div className="modal-header">
                <h3>Crear Usuario</h3>
              </div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Nombre Completo</label>
                    <input type="text" required className="input-field" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Usuario</label>
                    <input type="text" required className="input-field" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input type="email" required className="input-field" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña Temporal</label>
                    <input type="text" required className="input-field" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">Rol Base (Asigna permisos por defecto)</label>
                  <select className="input-field" value={formData.role} onChange={e => handleRolePreset(e.target.value)}>
                    <option value="VIEWER">Consultor (VIEWER)</option>
                    <option value="OPERATOR">Operador (OPERATOR)</option>
                    <option value="ADMIN">Administrador (ADMIN)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ajuste Fino de Módulos (Checkboxes)</label>
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
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
