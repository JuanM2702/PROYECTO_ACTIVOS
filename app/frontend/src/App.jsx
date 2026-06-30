import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './styles/layout.css';

// Páginas
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AssetInventory from './pages/AssetInventory';
import AssetMovements from './pages/AssetMovements';
import AssetAcceptance from './pages/AssetAcceptance';
import AdminUsers from './pages/AdminUsers';

// Componentes Globales
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Configurar Axios por defecto para incluir cookies de sesión en peticiones cruzadas
axios.defaults.withCredentials = true;
// Base URL apuntando al API Gateway para enrutamiento correcto en producción
axios.defaults.baseURL = '/api/activos';

// Contexto Global de Autenticación y Notificaciones
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  // Utilidad para mostrar notificaciones no-bloqueantes en la app
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // Verificar si hay una sesión activa al cargar la aplicación
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await axios.get('/api/auth/me');
        if (response.data.success) {
          setUser(response.data.user);
        }
      } catch (err) {
        // Ignorar error al no estar autenticado inicialmente
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const loginUser = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      if (response.data.success) {
        setUser(response.data.user);
        showToast(`¡Bienvenido de vuelta, ${response.data.user.fullName}!`, 'success');
        return true;
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al iniciar sesión. Intente nuevamente.';
      showToast(errorMsg, 'error');
      return false;
    }
  };

  const logoutUser = async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
      showToast('Sesión cerrada con éxito.', 'success');
      // Redirección e invalidación de caché
      window.location.href = '/activos/login';
    } catch (err) {
      showToast('Error al cerrar sesión.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <span>Cargando plataforma de activos...</span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loginUser, logoutUser, showToast, isSidebarOpen, toggleSidebar }}>
      <Router basename="/activos">
        <div className="app-container">
          {user && <Sidebar />}
          
          <div 
            className={`app-routes-container ${user ? "main-content" : "full-width-content"}`}
            style={{ marginLeft: user && isSidebarOpen ? '260px' : '0' }}
          >
            {user && <Header />}
            
            <Routes>
              <Route 
                path="/login" 
                element={!user ? <Login /> : <Navigate to="/" replace />} 
              />
              
              <Route 
                path="/" 
                element={user ? <Dashboard /> : <Navigate to="/login" replace />} 
              />
              
              <Route 
                path="/inventory" 
                element={user && user.allowed_modules?.includes('inventory') ? <AssetInventory /> : <Navigate to="/" replace />} 
              />
              
              <Route 
                path="/movements" 
                element={user && user.allowed_modules?.includes('movements') ? <AssetMovements /> : <Navigate to="/" replace />} 
              />
              
              <Route 
                path="/acceptances" 
                element={user && user.allowed_modules?.includes('acceptances') ? <AssetAcceptance /> : <Navigate to="/" replace />} 
              />

              <Route 
                path="/admin/users" 
                element={user && user.role === 'ADMIN' ? <AdminUsers /> : <Navigate to="/" replace />} 
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>

          {/* Banner Toast Flotante */}
          {toast.show && (
            <div className={`toast toast-${toast.type}`}>
              <span>{toast.message}</span>
            </div>
          )}
        </div>
      </Router>
    </AuthContext.Provider>
  );
}
