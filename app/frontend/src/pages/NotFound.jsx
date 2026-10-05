import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Home, ArrowLeft } from 'lucide-react';
import '../styles/forms.css';

export default function NotFound() {
  return (
    <div className="page-container" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <div className="glass-card" style={{
        maxWidth: '480px',
        padding: '2.5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.25rem'
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#EF4444'
        }}>
          <AlertCircle size={40} />
        </div>

        <h1 style={{
          fontSize: '3rem',
          fontWeight: '800',
          margin: 0,
          color: 'var(--text-primary)',
          lineHeight: 1
        }}>
          404
        </h1>

        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          margin: 0,
          color: 'var(--text-primary)'
        }}>
          Página No Encontrada
        </h2>

        <p style={{
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
          lineHeight: 1.5
        }}>
          La ruta que intentas consultar no existe o fue movida. Por favor verifica la dirección ingresada.
        </p>

        <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-primary action-btn">
            <Home size={16} />
            <span>Volver al Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
