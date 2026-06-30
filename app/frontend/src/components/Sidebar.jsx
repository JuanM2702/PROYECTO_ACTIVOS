import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, RefreshCw, Signature, Shield } from 'lucide-react';
import { useAuth } from '../App';

export default function Sidebar() {
  const { user, isSidebarOpen } = useAuth();

  return (
    <aside className={`sidebar-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {/* Logotipo y Branding Premium */}
      <div className="sidebar-brand-wrapper">
        <div className="sidebar-logo">
          <Package size={22} color="var(--bg-primary)" />
        </div>
        <div>
          <h1 className="sidebar-title">
            Activos
          </h1>
          <span className="sidebar-subtitle">
            Gana Gana
          </span>
        </div>
      </div>

      {/* Menú de Navegación */}
      <nav className="sidebar-nav">
        <NavLink 
          to="/" 
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </NavLink>

        {user?.allowed_modules?.includes('inventory') && (
          <NavLink 
            to="/inventory" 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Package size={18} />
            <span>Inventario</span>
          </NavLink>
        )}

        {user?.allowed_modules?.includes('movements') && (
          <NavLink 
            to="/movements" 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <RefreshCw size={18} />
            <span>Movimientos</span>
          </NavLink>
        )}

        {user?.allowed_modules?.includes('acceptances') && (
          <NavLink 
            to="/acceptances" 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Signature size={18} />
            <span>Aceptaciones</span>
          </NavLink>
        )}

        {user?.role === 'ADMIN' && (
          <NavLink 
            to="/admin/users" 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Shield size={18} />
            <span>Administración</span>
          </NavLink>
        )}
      </nav>

      {/* Pie del Sidebar con el Rol Activo */}
      <div className="sidebar-footer">
        <span className="sidebar-footer-label">
          Usuario Activo:
        </span>
        <strong className="sidebar-footer-name">
          {user?.fullName}
        </strong>
        <span className={`sidebar-footer-role ${
          user?.role === 'ADMIN' ? 'role-admin' : user?.role === 'OPERATOR' ? 'role-operator' : 'role-consultant'
        }`}>
          ● {user?.role === 'ADMIN' ? 'Administrador' : user?.role === 'OPERATOR' ? 'Operador' : 'Consultor'}
        </span>
      </div>

      {/* Reglas de Estilo Dinámicas en el componente */}
      <style>{`
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          color: var(--text-muted);
          text-decoration: none;
          font-family: var(--font-display);
          font-size: 0.95rem;
          font-weight: 500;
          transition: var(--transition-smooth);
          border: 1px solid transparent;
        }
        .sidebar-link:hover {
          color: var(--text-main);
          background: rgba(0, 130, 63, 0.05);
          border-color: rgba(0, 130, 63, 0.08);
        }
        .sidebar-link.active {
          color: #ffffff;
          background: var(--gradient-brand);
          box-shadow: 0 4px 12px rgba(0, 130, 63, 0.25);
          font-weight: 600;
        }
      `}</style>
    </aside>
  );
}
