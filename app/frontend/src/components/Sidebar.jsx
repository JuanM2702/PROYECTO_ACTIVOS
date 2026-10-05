import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ArrowLeftRight, 
  CheckSquare, 
  Users, 
  Grid, 
  FileText, 
  Settings, 
  LogOut,
  ArchiveX 
} from 'lucide-react';
import { useAuth } from '../App';
import { ATLAS_LOGO } from '../assets/logo-base64';

export default function Sidebar() {
  const { user, isSidebarOpen, toggleSidebar, logoutUser } = useAuth();

  const getInitials = (name) => {
    if (!name) return 'WC';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768 && isSidebarOpen) {
      toggleSidebar();
    }
  };

  return (
    <>
      {/* Overlay oscuro para pantallas móviles */}
      {isSidebarOpen && (
        <div 
          className="sidebar-backdrop"
          onClick={toggleSidebar}
        />
      )}
      <aside className={`sidebar-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        {/* Logotipo y Branding Atlas */}
        <div className="sidebar-brand-wrapper" style={{ justifyContent: 'center', padding: '10px 0' }}>
          <img 
            src={ATLAS_LOGO} 
            alt="Atlas Gestión de Activos" 
            style={{ width: '100%', maxWidth: '180px', height: 'auto', objectFit: 'contain' }} 
          />
        </div>

        {/* Menú de Navegación */}
        <nav className="sidebar-nav">
          <NavLink 
            to="/" 
            onClick={handleNavClick}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </NavLink>

          {user?.allowed_modules?.includes('inventory') && (
            <NavLink 
              to="/inventory" 
              onClick={handleNavClick}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Package size={19} />
              <span>Inventario</span>
            </NavLink>
          )}

          {user?.allowed_modules?.includes('movements') && (
            <NavLink 
              to="/movements" 
              onClick={handleNavClick}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <ArrowLeftRight size={19} />
              <span>Movimientos</span>
            </NavLink>
          )}

          {user?.allowed_modules?.includes('acceptances') && (
            <NavLink 
              to="/acceptances" 
              onClick={handleNavClick}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <CheckSquare size={19} />
              <span>Aceptaciones</span>
            </NavLink>
          )}

          {user?.role === 'ADMIN' && (
            <NavLink 
              to="/admin/users" 
              onClick={handleNavClick}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Users size={19} />
              <span>Usuarios</span>
            </NavLink>
          )}

          {user?.role === 'ADMIN' && (
            <NavLink 
              to="/bajas" 
              onClick={handleNavClick}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <ArchiveX size={19} />
              <span>Bajas de Activos</span>
            </NavLink>
          )}

          {user?.role === 'ADMIN' && (
            <NavLink 
              to="/admin/catalogs" 
              onClick={handleNavClick}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Grid size={19} />
              <span>Personalización</span>
            </NavLink>
          )}
        </nav>

        {/* Tarjeta de Perfil de Usuario en el Footer del Sidebar */}
        <div className="sidebar-user-profile">
          <div className="user-avatar-circle">
            {getInitials(user?.fullName)}
          </div>
          <div className="user-profile-details">
            <span className="user-profile-name" title={user?.fullName}>{user?.fullName || 'William Cruz'}</span>
            <span className={`user-profile-role-badge role-${(user?.role || 'VIEWER').toLowerCase()}`}>
              {user?.role === 'ADMIN' ? 'Administrador' : user?.role === 'OPERATOR' ? 'Operador' : 'Consultor'}
            </span>
          </div>
          <button 
            onClick={logoutUser} 
            className="sidebar-logout-btn" 
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

