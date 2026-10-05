import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../App';
import { ATLAS_LOGO } from '../assets/logo-base64';

export default function Login() {
  const { loginUser } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    
    setLoading(true);
    const success = await loginUser(username, password);
    setLoading(false);
  };

  const fillCredentials = (userHint, passHint) => {
    setUsername(userHint);
    setPassword(passHint);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Encabezado con Logo Oficial de Atlas */}
        <div className="login-header" style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
          <img 
            src={ATLAS_LOGO} 
            alt="Atlas Gestión de Activos" 
            style={{ width: '100%', maxWidth: '240px', height: 'auto', objectFit: 'contain', margin: '0 auto 0.5rem auto', display: 'block' }} 
          />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Sistema Integrado de Control de Activos IoT
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Usuario</label>
            <div style={{ position: 'relative' }}>
              <span style={inputIconStyle}>
                <User size={18} color="var(--text-dark)" />
              </span>
              <input
                id="username"
                type="text"
                className="input-field"
                placeholder="Ingrese su usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <span style={inputIconStyle}>
                <Lock size={18} color="var(--text-dark)" />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="input-field"
                placeholder="Ingrese su contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={18} color="var(--text-muted)" /> : <Eye size={18} color="var(--text-muted)" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', height: '46px' }}
          >
            {loading ? 'Verificando...' : 'Iniciar Sesión'}
          </button>
        </form>

        {/* Ayuda de Credenciales Sembradas (Premium visual sandbox helper) */}
        <div style={{
          marginTop: '2.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--border-glass)',
        }}>
          <h3 style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.75rem',
            textAlign: 'center'
          }}>
            Credenciales de Prueba (Sandbox)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div 
              onClick={() => fillCredentials('admin', 'admin_activos_2026')}
              className="credential-hint"
              style={hintCardStyle}
            >
              <div>
                <strong>admin</strong> <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>[Administrador]</span>
              </div>
              <code style={codeStyle}>admin_activos_2026</code>
            </div>

            <div 
              onClick={() => fillCredentials('operator', 'operator_activos_2026')}
              className="credential-hint"
              style={hintCardStyle}
            >
              <div>
                <strong>operator</strong> <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>[Operador]</span>
              </div>
              <code style={codeStyle}>operator_activos_2026</code>
            </div>

            <div 
              onClick={() => fillCredentials('viewer', 'viewer_activos_2026')}
              className="credential-hint"
              style={hintCardStyle}
            >
              <div>
                <strong>viewer</strong> <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>[Consultor]</span>
              </div>
              <code style={codeStyle}>viewer_activos_2026</code>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .credential-hint {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 0.85rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.8rem;
          transition: var(--transition-smooth);
        }
        .credential-hint:hover {
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.2);
          transform: translateX(4px);
        }
      `}</style>
    </div>
  );
}

const inputIconStyle = {
  position: 'absolute',
  left: '0.85rem',
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
};

const hintCardStyle = {
  // Manejado por la etiqueta <style> arriba
};

const codeStyle = {
  fontSize: '0.75rem',
  background: 'var(--bg-tertiary)',
  padding: '0.2rem 0.4rem',
  borderRadius: '4px',
  color: 'var(--text-main)',
  fontFamily: 'monospace'
};
