import React from 'react';

export default function Footer() {
  return (
    <footer className="atlas-global-footer">
      <div className="footer-left">
        <strong>Atlas</strong> - Gestión de Activos
      </div>
      <div className="footer-right">
        © 2026 Integra World Solutions. Todos los derechos reservados.
      </div>
      <style>{`
        .atlas-global-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0 8px 0;
          margin-top: 28px;
          border-top: 1px solid var(--border-default, #E2E8F0);
          font-size: 0.8rem;
          color: #64748B;
          width: 100%;
        }
        .atlas-global-footer strong {
          color: #0F172A;
        }
      `}</style>
    </footer>
  );
}
