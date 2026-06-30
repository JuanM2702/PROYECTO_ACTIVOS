import React from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut, User, ShieldAlert, Menu } from 'lucide-react';
import { useAuth } from '../App';

export default function Header() {
  const { user, logoutUser, toggleSidebar, isSidebarOpen } = useAuth();
  const location = useLocation();

  // Determinar el título amigable según la ruta activa
  const getSectionTitle = () => {
    switch (location.pathname) {
      case '/':
        return { title: 'Panel de Control', subtitle: 'Estadísticas, valorización de inventario y analíticas' };
      case '/inventory':
        return { title: 'Inventario de Activos', subtitle: 'Control general, asignaciones y CRUD de equipos' };
      case '/movements':
        return { title: 'Historial de Traslados', subtitle: 'Línea de tiempo de movimientos físicos y auditoría' };
      case '/acceptances':
        return { title: 'Bandeja de Aceptaciones', subtitle: 'Firmas digitales de recepción y actas de conformidad' };
      case '/admin/users':
        return { title: 'Administración de Usuarios', subtitle: 'Gestión de roles, permisos y módulos de acceso' };
      default:
        return { title: 'Gestión de Activos', subtitle: 'Sistema de control corporativo' };
    }
  };

  const section = getSectionTitle();

  return (
    <header className="header-container">
      {/* Títulos Contextuales y Toggle */}
      <div className="header-title-wrapper">
        <button
          onClick={toggleSidebar}
          className="btn btn-secondary header-toggle-btn"
          title={isSidebarOpen ? "Ocultar Menú" : "Mostrar Menú"}
        >
          <Menu size={20} color="var(--text-main)" />
        </button>
        <div>
        <h2 className="header-title">
          {section.title}
        </h2>
        <span className="header-subtitle">
          {section.subtitle}
        </span>
        </div>
      </div>

      {/* Información del Usuario y Cierre de Sesión */}
      <div className="header-actions">
        {/* Tarjeta de Perfil Compacta */}
        <div className="header-profile-card">
          <div className="header-avatar">
            <User size={16} />
          </div>
          <div className="header-user-info">
            <span className="header-user-name">
              {user?.fullName}
            </span>
            <span className="header-user-email">
              {user?.email}
            </span>
          </div>
        </div>

        {/* Botón de Logout */}
        <button 
          onClick={logoutUser}
          className="btn btn-secondary header-toggle-btn"
          title="Cerrar Sesión"
        >
          <LogOut size={18} color="var(--accent-danger)" />
        </button>
      </div>
    </header>
  );
}
