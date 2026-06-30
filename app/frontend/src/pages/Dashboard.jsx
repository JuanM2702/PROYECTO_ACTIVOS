import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, DollarSign, Activity, Signature, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../App';
import '../styles/dashboard.css';

export default function Dashboard() {
  const { showToast } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/dashboard/stats');
        if (response.data.success) {
          setStats(response.data.stats);
        }
      } catch (err) {
        showToast('Error al cargar datos del Dashboard.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <span>Cargando analítica...</span>
      </div>
    );
  }

  const { totalCount, totalValue, activeCount, pendingCount, maintenanceCount, rejectedCount, categories, recentActivity } = stats || {
    totalCount: 0,
    totalValue: 0,
    activeCount: 0,
    pendingCount: 0,
    maintenanceCount: 0,
    rejectedCount: 0,
    categories: [],
    recentActivity: []
  };

  // Cálculos para Gráfico 1: Categorías (SVG Bar Chart)
  const maxCategoryVal = categories.length > 0 ? Math.max(...categories.map(c => c.value)) : 1;
  const chartHeight = 160;
  const barWidth = 36;
  const gap = 32;

  // Cálculos para Gráfico 2: Anillo de Estados (SVG Donut Chart)
  const statusData = [
    { name: 'Activo', count: activeCount, color: 'var(--accent-success)' },
    { name: 'Firma Pendiente', count: pendingCount, color: 'var(--accent-warning)' },
    { name: 'Mantenimiento', count: maintenanceCount, color: 'var(--accent-primary)' },
    { name: 'Rechazado', count: rejectedCount, color: 'var(--accent-danger)' }
  ].filter(s => s.count > 0);

  const totalStatusCount = statusData.reduce((acc, curr) => acc + curr.count, 0) || 1;
  
  // Calcular radios para Donut Chart
  let cumulativePercent = 0;
  const donutRadius = 60;
  const donutCircumference = 2 * Math.PI * donutRadius;

  return (
    <div className="dashboard-container">
      {/* 1. Dashboard KPI Grid */}
      <div className="dashboard-grid">
        {/* KPI 1 */}
        <div className="glass-card kpi-card">
          <div className="kpi-details">
            <h3>Activos Registrados</h3>
            <div className="kpi-value">{totalCount}</div>
          </div>
          <div className="kpi-icon">
            <Package size={22} />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="glass-card kpi-card">
          <div className="kpi-details">
            <h3>Valorización Total</h3>
            <div className="kpi-value">
              ${totalValue.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="kpi-icon" style={{ color: 'var(--accent-success)' }}>
            <DollarSign size={22} />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="glass-card kpi-card">
          <div className="kpi-details">
            <h3>Firmas Pendientes</h3>
            <div className="kpi-value">{pendingCount}</div>
          </div>
          <div className="kpi-icon" style={{ color: 'var(--accent-warning)' }}>
            <Signature size={22} />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="glass-card kpi-card">
          <div className="kpi-details">
            <h3>Tasa Operatividad</h3>
            <div className="kpi-value">
              {totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0}%
            </div>
          </div>
          <div className="kpi-icon" style={{ color: 'var(--accent-secondary)' }}>
            <Activity size={22} />
          </div>
        </div>
      </div>

      {/* 2. Gráficos Customizados Premium */}
      <div className="charts-grid">
        {/* Gráfico 1: Valor de Inventario por Categoría */}
        <div className="glass-card">
          <h3 className="chart-title">
            Valor de Inventario por Categoría ($)
          </h3>
          <div className="chart-wrapper">
            {categories.length === 0 ? (
              <span className="category-chart-empty">Sin datos de categorías</span>
            ) : (
              <svg width="100%" height="220" className="category-chart-svg">
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-primary)" />
                    <stop offset="100%" stopColor="var(--accent-secondary)" />
                  </linearGradient>
                </defs>
                {/* Gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                  const y = chartHeight * (1 - p) + 20;
                  return (
                    <g key={idx}>
                      <line x1="40" y1={y} x2="100%" y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                      <text x="30" y={y + 4} fill="var(--text-dark)" fontSize="10" textAnchor="end">
                        ${Math.round((maxCategoryVal * p) / 1000)}k
                      </text>
                    </g>
                  );
                })}
                
                {/* Barras */}
                {categories.map((c, idx) => {
                  const barHeight = (c.value / maxCategoryVal) * chartHeight;
                  const x = 60 + idx * (barWidth + gap);
                  const y = chartHeight - barHeight + 20;

                  return (
                    <g key={idx}>
                      {/* Barra Rectangular Redondeada */}
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill="url(#barGradient)"
                        rx="6"
                        className="category-chart-bar"
                      />
                      {/* Valor flotante en el tope de barra */}
                      <text x={x + barWidth / 2} y={y - 8} fill="var(--text-main)" fontSize="11" fontWeight="600" textAnchor="middle">
                        ${Math.round(c.value / 100).toLocaleString() /* simplificado */}
                      </text>
                      {/* Etiqueta del Eje X */}
                      <text x={x + barWidth / 2} y={chartHeight + 40} fill="var(--text-muted)" fontSize="11" textAnchor="middle">
                        {c.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Gráfico 2: Distribución por Estado (Donut SVG) */}
        <div className="glass-card">
          <h3 className="chart-title">
            Distribución por Estado
          </h3>
          <div className="chart-wrapper donut-chart-wrapper">
            {statusData.length === 0 ? (
              <span className="category-chart-empty">Sin datos de estados</span>
            ) : (
              <>
                <svg width="130" height="130" viewBox="0 0 160 160" className="donut-chart-svg">
                  {statusData.map((s, idx) => {
                    const percent = s.count / totalStatusCount;
                    const strokeDashoffset = donutCircumference - (percent * donutCircumference);
                    const strokeDasharray = donutCircumference;
                    const rotationOffset = (cumulativePercent / 100) * donutCircumference;
                    cumulativePercent += percent * 100;

                    return (
                      <circle
                        key={idx}
                        cx="80"
                        cy="80"
                        r={donutRadius}
                        fill="transparent"
                        stroke={s.color}
                        strokeWidth="14"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        className="donut-chart-path"
                        style={{ transform: `rotate(${(rotationOffset / donutCircumference) * 360}deg)` }}
                      />
                    );
                  })}
                  {/* Círculo central para efecto Donut */}
                  <circle cx="80" cy="80" r="48" fill="var(--bg-secondary)" />
                </svg>

                {/* Leyenda */}
                <div className="donut-legend-container">
                  {statusData.map((s, idx) => (
                    <div key={idx} className="donut-legend-item">
                      <span className="donut-legend-dot" style={{ background: s.color }} />
                      <span className="donut-legend-label">{s.name}:</span>
                      <strong className="donut-legend-value">{s.count}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Timeline de Novedades y Auditoría Reciente */}
      <div className="glass-card">
        <h3 className="chart-title timeline-title-wrapper">
          <Activity size={18} color="var(--accent-primary)" />
          Línea de Actividad y Auditoría Reciente
        </h3>
        {recentActivity.length === 0 ? (
          <div className="timeline-empty">
            No se han registrado movimientos de activos en este periodo.
          </div>
        ) : (
          <div className="timeline-list">
            {/* Línea vertical decorativa */}
            <div className="timeline-vertical-line" />
            
            {recentActivity.map((act, idx) => (
              <div key={idx} className="timeline-item">
                {/* Nodo de la línea */}
                <div className="timeline-node" />
                
                {/* Contenido del Nodo */}
                <div className="timeline-content">
                  <div className="timeline-header">
                    <span className="timeline-asset-name">
                      {act.asset_name} <code className="timeline-asset-code">{act.asset_code}</code>
                    </span>
                    <span className="timeline-date">
                      {new Date(act.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="timeline-reason">
                    {act.reason} a <strong>{act.destination_location}</strong>
                  </p>
                  <span className="timeline-performer">
                    Acción registrada por: {act.performed_by_name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
