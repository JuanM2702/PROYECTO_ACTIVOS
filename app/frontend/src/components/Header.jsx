import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell, HelpCircle, CheckSquare, Clock, X, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../App';
import iwsLogo from '../assets/iws-logo.png';
import HelpModal from './HelpModal';

export default function Header() {
  const { toggleSidebar, isSidebarOpen } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [bajaAlerts, setBajaAlerts] = useState([]);
  const [rejectionAlerts, setRejectionAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const popoverRef = useRef(null);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'Dashboard';
      case '/inventory':
        return 'Inventario';
      case '/movements':
        return 'Movimientos';
      case '/acceptances':
        return 'Aceptaciones';
      case '/bajas':
        return 'Bajas de Activos';
      case '/admin/users':
        return 'Usuarios';
      case '/admin/catalogs':
        return 'Personalización';
      default:
        return 'Dashboard';
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/api/acceptances/notifications');
      if (res.data.success) {
        setUnreadCount(res.data.count || 0);
        setNotifications(res.data.data || []);
        setAlerts(res.data.alerts || []);
        setBajaAlerts(res.data.bajaAlerts || []);
        setRejectionAlerts(res.data.rejectionAlerts || []);
      }
    } catch (err) {
      // Ignorar silencio si no está autenticado
    }
  };

  const handleMarkBajaAsRead = async (id) => {
    try {
      await axios.post(`/api/bajas/notifications/${id}/read`);
      fetchNotifications();
    } catch (err) {
      console.error('Error al marcar notificación de baja como leída:', err);
    }
  };

  const handleMarkRejectionAsRead = async (id) => {
    try {
      await axios.post(`/api/acceptances/notifications/${id}/read`);
      fetchNotifications();
    } catch (err) {
      console.error('Error al marcar notificación de rechazo como leída:', err);
    }
  };


  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // Polling cada 15 segundos para actualización rápida de alertas
    return () => clearInterval(interval);
  }, []);

  // Cerrar popover al dar click afuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setShowNotificationsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="header-container">
      {/* Título y Menú Hamburguesa */}
      <div className="header-title-wrapper">
        <button
          onClick={toggleSidebar}
          className="header-toggle-btn"
          title={isSidebarOpen ? "Ocultar Menú" : "Mostrar Menú"}
        >
          <Menu size={22} color="var(--text-secondary)" />
        </button>
        <h2 className="header-page-title">
          {getPageTitle()}
        </h2>
      </div>

      {/* Acciones de Cabecera Derecha */}
      <div className="header-actions">
        {/* Campanita de Notificaciones interactiva */}
        <div style={{ position: 'relative' }} ref={popoverRef}>
          <button 
            className="header-icon-btn" 
            title="Notificaciones y Alertas"
            onClick={() => {
              fetchNotifications();
              setShowNotificationsMenu(!showNotificationsMenu);
            }}
            style={{ position: 'relative' }}
          >
            <Bell size={20} color="var(--text-secondary)" />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>

          {/* Menú Desplegable (Popover) de Notificaciones */}
          {showNotificationsMenu && (
            <div 
              style={{
                position: 'absolute',
                top: '46px',
                right: '0',
                width: '350px',
                background: '#FFFFFF',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid #E2E8F0',
                zIndex: 1000,
                overflow: 'hidden'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #F1F5F9',
                background: '#F8FAFC'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bell size={16} color="#1352E6" />
                  <strong style={{ fontSize: '0.88rem', color: '#0F172A' }}>Notificaciones y Alertas</strong>
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: unreadCount > 0 ? '#1352E6' : '#94A3B8',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {unreadCount}
                </span>
              </div>

              {/* Sección de Alertas Administrativas de Inactivación */}
              {alerts.length > 0 && (
                <div style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <AlertTriangle size={16} color="#EA580C" />
                    <strong style={{ fontSize: '0.82rem', color: '#9A3412' }}>Alertas de Reasignación ({alerts.length})</strong>
                  </div>
                  {alerts.map((alt) => (
                    <div 
                      key={alt.id} 
                      style={{ 
                        background: '#FFFFFF', 
                        padding: '10px 12px', 
                        borderRadius: '8px', 
                        border: '1px solid #FDBA74',
                        marginBottom: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#C2410C', marginBottom: '2px' }}>
                        Inactivación Pospuesta: {alt.user_name}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#475569', marginBottom: '8px', lineHeight: '1.3' }}>
                        {alt.mensaje}
                      </div>
                      <button
                        onClick={() => {
                          setShowNotificationsMenu(false);
                          navigate('/movements');
                        }}
                        style={{
                          background: '#EA580C',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        Reasignar {alt.cantidad_activos} activo(s) →
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Sección de Alertas Personales de Baja de Activo */}
              {bajaAlerts.length > 0 && (
                <div style={{ background: '#FEF2F2', borderBottom: '1px solid #FCA5A5', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <AlertTriangle size={16} color="#DC2626" />
                    <strong style={{ fontSize: '0.82rem', color: '#991B1B' }}>Baja de Activos Asignados ({bajaAlerts.length})</strong>
                  </div>
                  {bajaAlerts.map((ba) => (
                    <div 
                      key={ba.id} 
                      style={{ 
                        background: '#FFFFFF', 
                        padding: '10px 12px', 
                        borderRadius: '8px', 
                        border: '1px solid #F87171',
                        marginBottom: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991B1B', marginBottom: '2px' }}>
                        Activo Dado de Baja
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#334155', marginBottom: '8px', lineHeight: '1.3' }}>
                        {ba.mensaje}
                      </div>
                      <button
                        onClick={() => handleMarkBajaAsRead(ba.id)}
                        style={{
                          background: '#EF4444',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Entendido / Marcar como leída
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Sección de Alertas Personales de Rechazo/Devolución de Activo */}
              {rejectionAlerts.length > 0 && (
                <div style={{ background: '#FFF1F2', borderBottom: '1px solid #FECDD3', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <AlertTriangle size={16} color="#E11D48" />
                    <strong style={{ fontSize: '0.82rem', color: '#9F1239' }}>Devolución de Activos Rechazados ({rejectionAlerts.length})</strong>
                  </div>
                  {rejectionAlerts.map((ra) => (
                    <div 
                      key={ra.id} 
                      style={{ 
                        background: '#FFFFFF', 
                        padding: '10px 12px', 
                        borderRadius: '8px', 
                        border: '1px solid #FDA4AF',
                        marginBottom: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9F1239', marginBottom: '2px' }}>
                        Activo Devuelto a tus Activos
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#334155', marginBottom: '8px', lineHeight: '1.3' }}>
                        {ra.mensaje}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => {
                            setShowNotificationsMenu(false);
                            handleMarkRejectionAsRead(ra.id);
                            navigate('/inventory');
                          }}
                          style={{
                            background: '#E11D48',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Ver mis activos →
                        </button>
                        <button
                          onClick={() => handleMarkRejectionAsRead(ra.id)}
                          style={{
                            background: '#F1F5F9',
                            color: '#475569',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Marcar leída
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lista de Aceptaciones Pendientes */}
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {notifications.length === 0 && alerts.length === 0 && bajaAlerts.length === 0 && rejectionAlerts.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                    <CheckSquare size={32} color="#CBD5E1" style={{ marginBottom: '8px' }} />
                    <p style={{ margin: 0 }}>¡Todo al día! No tienes notificaciones ni alertas pendientes.</p>
                  </div>
                ) : (

                  notifications.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => {
                        setShowNotificationsMenu(false);
                        navigate('/acceptances');
                      }}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1352E6' }}>{item.asset_code}</span>
                        <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={11} /> {new Date(item.date).toLocaleDateString()}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>{item.asset_name}</span>
                      <span style={{ fontSize: '0.73rem', color: '#EA580C', fontWeight: 500 }}>⚠️ Requiere su firma y aceptación</span>
                    </div>
                  ))
                )}
              </div>

              <div style={{
                padding: '10px',
                textAlign: 'center',
                background: '#F8FAFC',
                borderTop: '1px solid #F1F5F9'
              }}>
                <button
                  onClick={() => {
                    setShowNotificationsMenu(false);
                    navigate('/acceptances');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#1352E6',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Ver todas las aceptaciones →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Ayuda y Soporte (ATLAS-07) */}
        <button 
          className="header-icon-btn" 
          title="Ayuda y Soporte"
          onClick={() => setShowHelpModal(true)}
        >
          <HelpCircle size={20} color="var(--text-secondary)" />
        </button>

        <div className="header-divider" />

        {/* Logo Corporativo Integra World Solutions */}
        <div className="company-logo-wrapper" style={{ display: 'flex', alignItems: 'center', padding: '2px 4px' }}>
          <img src={iwsLogo} alt="Integral World Solutions" style={{ height: '42px', objectFit: 'contain' }} />
        </div>
      </div>

      {/* Modal de Ayuda y Soporte */}
      {showHelpModal && (
        <HelpModal onClose={() => setShowHelpModal(false)} />
      )}
    </header>
  );
}

