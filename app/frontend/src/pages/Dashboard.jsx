import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Package, 
  CheckCircle2, 
  Wrench, 
  XSquare, 
  ClipboardCheck, 
  Calendar, 
  Filter, 
  ChevronDown, 
  AlertTriangle, 
  Clock, 
  Info, 
  CheckCircle,
  RefreshCcw,
  Building2,
  Server,
  Tag,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowDownUp,
  Inbox
} from 'lucide-react';
import { useAuth } from '../App';
import '../styles/dashboard.css';

export default function Dashboard() {
  const { showToast, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [chartViewMode, setChartViewMode] = useState('cumulative'); // 'cumulative' | 'monthly'
  const [hoveredPointIdx, setHoveredPointIdx] = useState(null);
  const [activePreset, setActivePreset] = useState('all');

  // Modal "Ver todos" state
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsPagination, setEventsPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 0 });
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventsTypeFilter, setEventsTypeFilter] = useState('ALL');

  // Filters State
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    category: '',
    status: '',
    empresa: ''
  });

  const [categoriesOpt, setCategoriesOpt] = useState([]);
  const [statesOpt, setStatesOpt] = useState([]);
  const [companiesOpt, setCompaniesOpt] = useState([]);

  useEffect(() => {
    const fetchDictionaries = async () => {
      try {
        const [catRes, stateRes, compRes] = await Promise.all([
          axios.get('/api/dictionaries/resource-types').catch(() => ({ data: { success: false } })),
          axios.get('/api/dictionaries/states').catch(() => ({ data: { success: false } })),
          axios.get('/api/dictionaries/companies').catch(() => ({ data: { success: false } }))
        ]);
        if (catRes.data?.success) setCategoriesOpt(catRes.data.data);
        if (stateRes.data?.success) setStatesOpt(stateRes.data.data);
        if (compRes.data?.success) setCompaniesOpt(compRes.data.data);
      } catch (err) {
        console.error("Error loading dictionaries", err);
      }
    };
    fetchDictionaries();
  }, []);

  const fetchStats = async (overrideFilters = null) => {
    setLoading(true);
    const activeFilters = overrideFilters || filters;
    try {
      const queryParams = new URLSearchParams();
      if (activeFilters.startDate) queryParams.append('startDate', activeFilters.startDate);
      if (activeFilters.endDate) queryParams.append('endDate', activeFilters.endDate);
      if (activeFilters.category) queryParams.append('category', activeFilters.category);
      if (activeFilters.status) queryParams.append('status', activeFilters.status);
      if (activeFilters.empresa) queryParams.append('empresa', activeFilters.empresa);

      const response = await axios.get(`/api/dashboard/stats?${queryParams.toString()}`);
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (err) {
      showToast('Error al cargar datos del Dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleApplyFilters = () => {
    fetchStats();
  };

  const handleClearFilters = () => {
    const emptyFilters = { startDate: '', endDate: '', category: '', status: '', empresa: '' };
    setFilters(emptyFilters);
    setActivePreset('all');
    fetchStats(emptyFilters);
  };

  // ─── Funciones del modal "Ver todos los eventos" ─────────────────────────
  const fetchAllEvents = useCallback(async (page = 1) => {
    setEventsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 15);
      if (eventsSearch.trim()) params.append('search', eventsSearch.trim());
      if (eventsTypeFilter && eventsTypeFilter !== 'ALL') params.append('type', eventsTypeFilter);

      const res = await axios.get(`/api/dashboard/all-events?${params.toString()}`);
      if (res.data.success) {
        setAllEvents(res.data.data);
        setEventsPagination(res.data.pagination);
      } else {
        showToast(res.data.error || 'Error al cargar los eventos del sistema.', 'error');
      }
    } catch (err) {
      console.error('Error al cargar eventos:', err);
      showToast('Error al cargar los eventos del sistema.', 'error');
    } finally {
      setEventsLoading(false);
    }
  }, [eventsSearch, eventsTypeFilter, showToast]);

  const handleOpenEventsModal = () => {
    setShowEventsModal(true);
    fetchAllEvents(1);
  };

  const handleCloseEventsModal = () => {
    setShowEventsModal(false);
    setAllEvents([]);
    setEventsSearch('');
    setEventsTypeFilter('ALL');
    setEventsPagination({ total: 0, page: 1, limit: 15, totalPages: 0 });
  };
  const handlePresetSelect = (presetKey) => {
    setActivePreset(presetKey);
    let newFilters = { ...filters };
    const now = new Date();

    if (presetKey === 'all') {
      newFilters.startDate = '';
      newFilters.endDate = '';
    } else if (presetKey === '30days') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      newFilters.startDate = past30.toISOString().substring(0, 10);
      newFilters.endDate = now.toISOString().substring(0, 10);
    } else if (presetKey === '6months') {
      const past6m = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      newFilters.startDate = past6m.toISOString().substring(0, 10);
      newFilters.endDate = now.toISOString().substring(0, 10);
    } else if (presetKey === 'year2026') {
      newFilters.startDate = '2026-01-01';
      newFilters.endDate = '2026-12-31';
    }

    setFilters(newFilters);
    fetchStats(newFilters);
  };

  // Extraer datos reales calculados de la base de datos PostgreSQL
  const totalCount = stats?.totalCount || 0;
  const activeCount = stats?.activeCount || 0;
  const maintenanceCount = stats?.maintenanceCount || 0;
  const rejectedCount = stats?.rejectedCount || 0;
  const pendingCount = stats?.pendingCount || 0;

  const activePercent = totalCount > 0 ? Math.round((activeCount / totalCount) * 1000) / 10 : 0;
  const maintPercent = totalCount > 0 ? Math.round((maintenanceCount / totalCount) * 1000) / 10 : 0;
  const rejectedPercent = totalCount > 0 ? Math.round((rejectedCount / totalCount) * 1000) / 10 : 0;
  const pendingPercent = totalCount > 0 ? Math.round((pendingCount / totalCount) * 1000) / 10 : 0;

  // Categorías Donut Data en tiempo real desde la BD - Top 5 + Otros
  const categoryList = (() => {
    if (!stats?.categories || stats.categories.length === 0) return [];
    const colors = ['#0047FF', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#94A3B8'];
    const sorted = [...stats.categories].sort((a, b) => b.count - a.count);
    
    if (sorted.length <= 6) {
      return sorted.map((c, i) => {
        const pct = totalCount > 0 ? Math.round((c.count / totalCount) * 1000) / 10 : 0;
        return { name: c.name, count: c.count, percent: pct, color: colors[i % colors.length] };
      });
    }
    
    const top5 = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    const othersCount = rest.reduce((sum, c) => sum + c.count, 0);
    const result = top5.map((c, i) => {
      const pct = totalCount > 0 ? Math.round((c.count / totalCount) * 1000) / 10 : 0;
      return { name: c.name, count: c.count, percent: pct, color: colors[i] };
    });
    if (othersCount > 0) {
      const othersPct = totalCount > 0 ? Math.round((othersCount / totalCount) * 1000) / 10 : 0;
      result.push({ name: `Otros (${rest.length})`, count: othersCount, percent: othersPct, color: colors[5] });
    }
    return result;
  })();

  // Top Responsables Data en tiempo real desde la BD
  const topResponsablesList = (stats?.topResponsables && stats.topResponsables.length > 0)
    ? stats.topResponsables.map((u, i) => {
        const initials = u.name ? u.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'US';
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];
        const maxVal = stats.topResponsables[0].count || 1;
        return {
          initials,
          name: u.name,
          role: u.role,
          count: u.count,
          percent: Math.round((u.count / maxVal) * 100),
          avatarBg: colors[i % colors.length]
        };
      })
    : [];

  // Movimientos Recientes en tiempo real desde la BD
  const recentMovementsList = (stats?.recentActivity && stats.recentActivity.length > 0)
    ? stats.recentActivity.slice(0, 5).map(m => ({
        date: new Date(m.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        type: m.reason || 'Traslado',
        code: m.asset_code || 'AC-0001',
        desc: m.asset_name || 'Equipo',
        responsible: m.performed_by_name || 'Usuario',
        status: 'Completado'
      }))
    : [];

  // Donut SVG helper
  let cumulativePercent = 0;
  const donutRadius = 60;
  const donutCircumference = 2 * Math.PI * donutRadius;

  // Procesar puntos dinámicos del gráfico interactivo de línea (Resumen de activos)
  const chartPoints = (() => {
    const rawTimeline = stats?.timelineData || [];
    let pointsData = [];

    if (rawTimeline.length >= 2) {
      pointsData = rawTimeline.map(t => ({
        label: t.month,
        value: chartViewMode === 'cumulative' ? t.cumulativeCount : t.newCount,
        newCount: t.newCount,
        cumulativeCount: t.cumulativeCount
      }));
    } else {
      const baseVal = totalCount || 10;
      const sampleLabels = ['Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar'];
      const sampleFactors = [0.35, 0.48, 0.62, 0.76, 0.88, 1.0];
      pointsData = sampleLabels.map((lbl, idx) => {
        const cumulativeVal = Math.round(baseVal * sampleFactors[idx]);
        const addedVal = Math.max(1, Math.round(baseVal * 0.12));
        return {
          label: lbl,
          value: chartViewMode === 'cumulative' ? cumulativeVal : addedVal,
          newCount: addedVal,
          cumulativeCount: cumulativeVal
        };
      });
    }

    const maxVal = Math.max(...pointsData.map(p => p.value), 1);
    const minVal = 0;
    const yRange = maxVal - minVal || 1;

    const xMin = 50;
    const xMax = 460;
    const yMin = 25;
    const yMax = 145;

    const mapped = pointsData.map((pt, i) => {
      const x = pointsData.length === 1 ? (xMin + xMax) / 2 : xMin + (i / (pointsData.length - 1)) * (xMax - xMin);
      const normY = (pt.value - minVal) / yRange;
      const y = yMax - normY * (yMax - yMin);
      return { ...pt, x, y };
    });

    return { points: mapped, maxVal };
  })();

  const pathD = chartPoints.points.length > 0
    ? chartPoints.points.reduce((acc, pt, idx) => {
        if (idx === 0) return `M ${pt.x} ${pt.y}`;
        const prev = chartPoints.points[idx - 1];
        const cx1 = prev.x + (pt.x - prev.x) / 2;
        const cy1 = prev.y;
        const cx2 = prev.x + (pt.x - prev.x) / 2;
        const cy2 = pt.y;
        return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pt.x} ${pt.y}`;
      }, '')
    : 'M 50 145 L 460 145';

  const areaD = chartPoints.points.length > 0
    ? `${pathD} L ${chartPoints.points[chartPoints.points.length - 1].x} 145 L ${chartPoints.points[0].x} 145 Z`
    : '';

  const activeHoverPt = chartPoints.points[
    hoveredPointIdx !== null && hoveredPointIdx < chartPoints.points.length 
      ? hoveredPointIdx 
      : chartPoints.points.length - 1
  ] || chartPoints.points[0];

  return (
    <div className="atlas-dashboard-wrapper">
      {/* 1. Header de Bienvenida & Controles */}
      <div className="atlas-welcome-bar">
        <div className="welcome-text-container">
          <h1 className="welcome-title">
            ¡Bienvenido, {user?.fullName?.split(' ')[0] || 'William'}!
          </h1>
          <p className="welcome-subtitle">
            Resumen general de la gestión de activos
          </p>
        </div>

        <div className="welcome-actions">
          {/* Preset Buttons para Filtrado de Fechas Rápido y Claro */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => handlePresetSelect('all')}
              className={`btn ${activePreset === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px' }}
            >
              Histórico Completo
            </button>
            <button
              onClick={() => handlePresetSelect('30days')}
              className={`btn ${activePreset === '30days' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px' }}
            >
              Últimos 30 días
            </button>
            <button
              onClick={() => handlePresetSelect('6months')}
              className={`btn ${activePreset === '6months' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px' }}
            >
              Últimos 6 meses
            </button>
            <button
              onClick={() => handlePresetSelect('year2026')}
              className={`btn ${activePreset === 'year2026' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px' }}
            >
              Año 2026
            </button>

            {/* Botón Filtros Detallados */}
            <button 
              className={`btn-filters-toggle ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              style={{ fontSize: '12px', padding: '5px 12px' }}
            >
              <Filter size={14} />
              <span>Personalizado</span>
            </button>
          </div>
        </div>
      </div>

      {/* Panel Desplegable de Filtros Personalizados */}
      {showFilters && (
        <section className="atlas-filters-panel">
          <div className="filters-panel-header">
            <h4><Filter size={16} color="var(--accent-primary)" /> Rango de Fechas y Filtros Personalizados</h4>
            <button className="btn-icon" onClick={handleClearFilters} title="Limpiar Filtros" style={{ padding: '6px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <RefreshCcw size={14} color="#64748B" />
            </button>
          </div>
          <div className="filters-panel-grid">
            <div className="filter-group">
              <label><Calendar size={13} /> Fecha Desde (Inicio)</label>
              <input 
                type="date" 
                name="startDate" 
                value={filters.startDate} 
                onChange={(e) => { setActivePreset('custom'); handleFilterChange(e); }} 
                className="input-field" 
              />
            </div>
            <div className="filter-group">
              <label><Calendar size={13} /> Fecha Hasta (Fin)</label>
              <input 
                type="date" 
                name="endDate" 
                value={filters.endDate} 
                onChange={(e) => { setActivePreset('custom'); handleFilterChange(e); }} 
                className="input-field" 
              />
            </div>
            <div className="filter-group">
              <label><Server size={13} /> Categoría</label>
              <select 
                name="category" 
                value={filters.category} 
                onChange={handleFilterChange} 
                className="input-field"
              >
                <option value="">Todas las categorías</option>
                {categoriesOpt.map(c => (
                  <option key={c.id} value={c.nombre}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label><Tag size={13} /> Estado Físico</label>
              <select 
                name="status" 
                value={filters.status} 
                onChange={handleFilterChange} 
                className="input-field"
              >
                <option value="">Todos los estados</option>
                {statesOpt.map(s => (
                  <option key={s.id} value={s.id}>{s.estado || s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="filter-group filter-action-container">
              <button 
                className="btn btn-primary" 
                onClick={handleApplyFilters} 
                disabled={loading}
                style={{ width: '100%', height: '38px', gap: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Filter size={14} />
                <span>{loading ? 'Cargando...' : 'Aplicar Rango'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 2. Fila de 5 Tarjetas KPI */}
      <div className="atlas-kpi-grid">
        {/* KPI 1: Total de Activos */}
        <div className="atlas-kpi-card">
          <div className="kpi-icon-box kpi-icon-blue">
            <Package size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Total de activos</span>
            <div className="kpi-value-number">{totalCount.toLocaleString('es-CO')}</div>
            <span className="kpi-subtext subtext-blue">100% del inventario</span>
          </div>
        </div>

        {/* KPI 2: Activos en uso */}
        <div className="atlas-kpi-card">
          <div className="kpi-icon-box kpi-icon-green">
            <CheckCircle2 size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Activos en uso</span>
            <div className="kpi-value-number">{activeCount.toLocaleString('es-CO')}</div>
            <span className="kpi-subtext subtext-green">{activePercent}% del total</span>
          </div>
        </div>

        {/* KPI 3: En mantenimiento */}
        <div className="atlas-kpi-card">
          <div className="kpi-icon-box kpi-icon-orange">
            <Wrench size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">En mantenimiento</span>
            <div className="kpi-value-number">{maintenanceCount.toLocaleString('es-CO')}</div>
            <span className="kpi-subtext subtext-orange">{maintPercent}% del total</span>
          </div>
        </div>

        {/* KPI 4: Fuera de servicio */}
        <div className="atlas-kpi-card">
          <div className="kpi-icon-box kpi-icon-red">
            <XSquare size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Fuera de servicio</span>
            <div className="kpi-value-number">{rejectedCount.toLocaleString('es-CO')}</div>
            <span className="kpi-subtext subtext-red">{rejectedPercent}% del total</span>
          </div>
        </div>

        {/* KPI 5: Pendientes acepta. */}
        <div className="atlas-kpi-card">
          <div className="kpi-icon-box kpi-icon-purple">
            <ClipboardCheck size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Pendientes acepta.</span>
            <div className="kpi-value-number">{pendingCount.toLocaleString('es-CO')}</div>
            <span className="kpi-subtext subtext-purple">{pendingPercent}% del total</span>
          </div>
        </div>
      </div>

      {/* 3. Sección Media: 3 Contenedores (Resumen de Activos, Activos por Categoría, Alertas y Notificaciones) */}
      <div className="atlas-middle-grid">
        {/* Card 1: Resumen de Activos (Line Chart Interactivo) */}
        <div className="atlas-card card-chart-line">
          <div className="atlas-card-header">
            <h3 className="atlas-card-title">Resumen de activos</h3>
            <div className="card-header-select" style={{ cursor: 'pointer' }}>
              <select
                value={chartViewMode}
                onChange={(e) => setChartViewMode(e.target.value)}
                style={{ border: 'none', background: 'transparent', fontWeight: '600', fontSize: '12px', color: 'var(--accent-primary)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="cumulative">Total Acumulado</option>
                <option value="monthly">Registros en el Mes</option>
              </select>
            </div>
          </div>

          <div className="line-chart-container" style={{ position: 'relative' }}>
            <svg width="100%" height="190" viewBox="0 0 500 190" preserveAspectRatio="none" className="line-chart-svg">
              <defs>
                <linearGradient id="line-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1352E6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#1352E6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="35" y1="25" x2="475" y2="25" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="35" y1="55" x2="475" y2="55" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="35" y1="85" x2="475" y2="85" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="35" y1="115" x2="475" y2="115" stroke="#F1F5F9" strokeWidth="1" />

              {/* Dynamic Y Axis Labels */}
              <text x="30" y="29" fontSize="10" fill="#94A3B8" textAnchor="end">{chartPoints.maxVal.toLocaleString('es-CO')}</text>
              <text x="30" y="69" fontSize="10" fill="#94A3B8" textAnchor="end">{Math.round(chartPoints.maxVal * 0.66).toLocaleString('es-CO')}</text>
              <text x="30" y="109" fontSize="10" fill="#94A3B8" textAnchor="end">{Math.round(chartPoints.maxVal * 0.33).toLocaleString('es-CO')}</text>
              <text x="30" y="149" fontSize="10" fill="#94A3B8" textAnchor="end">0</text>

              {/* Fill Area */}
              <path d={areaD} fill="url(#line-area-grad)" />

              {/* Dynamic Line Path */}
              <path d={pathD} fill="none" stroke="#1352E6" strokeWidth="3.5" strokeLinecap="round" />

              {/* Dynamic Data Points */}
              {chartPoints.points.map((pt, idx) => {
                const isHovered = hoveredPointIdx === idx || (hoveredPointIdx === null && idx === chartPoints.points.length - 1);
                return (
                  <g key={idx} onMouseEnter={() => setHoveredPointIdx(idx)} style={{ cursor: 'pointer' }}>
                    {isHovered && (
                      <circle cx={pt.x} cy={pt.y} r="9" fill="rgba(19, 82, 230, 0.2)" />
                    )}
                    <circle 
                      cx={pt.x} 
                      cy={pt.y} 
                      r={isHovered ? 5.5 : 4} 
                      fill="#1352E6" 
                      stroke="#FFFFFF" 
                      strokeWidth={isHovered ? 2.5 : 1.5} 
                    />
                    {/* X Axis Labels */}
                    <text 
                      x={pt.x} 
                      y="174" 
                      fontSize="10" 
                      fill={isHovered ? "#1352E6" : "#64748B"} 
                      fontWeight={isHovered ? "700" : "500"} 
                      textAnchor="middle"
                    >
                      {pt.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Dynamic Interactive Tooltip */}
            {activeHoverPt && (
              <div 
                className="line-chart-tooltip" 
                style={{ 
                  left: `${Math.min(82, Math.max(12, (activeHoverPt.x / 500) * 100))}%`, 
                  top: `${Math.max(8, (activeHoverPt.y / 190) * 100 - 25)}%`,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span className="tooltip-date">{activeHoverPt.label}</span>
                <span className="tooltip-value">
                  <span className="tooltip-blue-dot">•</span>{' '}
                  {chartViewMode === 'cumulative' ? 'Total Acumulado' : 'Nuevos en el Mes'}:{' '}
                  <strong>{activeHoverPt.value.toLocaleString('es-CO')} activos</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Activos por Categoría (Donut Chart) */}
        <div className="atlas-card card-chart-donut">
          <div className="atlas-card-header">
            <h3 className="atlas-card-title">Activos por categoría</h3>
          </div>

          <div className="donut-content-wrapper">
            <div className="donut-graphic-container">
              {(() => {
                let donutCumulativePercent = 0;
                return (
                  <svg width="140" height="140" viewBox="0 0 160 160" className="donut-chart-svg">
                    {categoryList.map((cat, idx) => {
                      const percent = cat.percent / 100;
                      const strokeDashoffset = donutCircumference - (percent * donutCircumference);
                      const strokeDasharray = donutCircumference;
                      const rotationOffset = (donutCumulativePercent / 100) * donutCircumference;
                      donutCumulativePercent += cat.percent;

                      return (
                        <circle
                          key={idx}
                          cx="80"
                          cy="80"
                          r={donutRadius}
                          fill="transparent"
                          stroke={cat.color}
                          strokeWidth="16"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="donut-arc-path"
                          style={{ transform: `rotate(${(rotationOffset / donutCircumference) * 360}deg)` }}
                        />
                      );
                    })}
                  </svg>
                );
              })()}
              <div className="donut-center-label">
                <span className="donut-total-val">{totalCount.toLocaleString('es-CO')}</span>
                <span className="donut-total-lbl">Total</span>
              </div>
            </div>

            {/* Leyenda a la Derecha */}
            <div className="donut-legend-list">
              {categoryList.map((cat, idx) => (
                <div key={idx} className="donut-legend-row">
                  <span className="legend-color-dot" style={{ backgroundColor: cat.color }} />
                  <div className="legend-row-info">
                    <span className="legend-cat-name">{cat.name}</span>
                    <span className="legend-cat-val">{cat.percent}% ({cat.count.toLocaleString('es-CO')})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Alertas y Notificaciones */}
        <div className="atlas-card card-alerts">
          <div className="atlas-card-header">
            <h3 className="atlas-card-title">Alertas y notificaciones</h3>
          </div>

          <div className="alerts-list">
            {/* Alerta 1: Mantenimiento */}
            {maintenanceCount > 0 && (
              <div className="alert-item">
                <div className="alert-icon-box alert-red">
                  <AlertTriangle size={18} />
                </div>
                <div className="alert-content">
                  <p className="alert-text">
                    <strong>{maintenanceCount} activo{maintenanceCount !== 1 ? 's' : ''}</strong> <span className="alert-desc">En mantenimiento</span>
                  </p>
                </div>
                <span className="alert-time">Hoy</span>
              </div>
            )}

            {/* Alerta 2: Aceptaciones Pendientes */}
            {pendingCount > 0 && (
              <div className="alert-item">
                <div className="alert-icon-box alert-orange">
                  <Clock size={18} />
                </div>
                <div className="alert-content">
                  <p className="alert-text">
                    <strong>{pendingCount.toLocaleString('es-CO')} aceptación{pendingCount !== 1 ? 'es' : ''}</strong> <span className="alert-desc">Pendientes por aceptar</span>
                  </p>
                </div>
                <span className="alert-time">Hoy</span>
              </div>
            )}

            {/* Alerta 3: Fuera de servicio */}
            {rejectedCount > 0 && (
              <div className="alert-item">
                <div className="alert-icon-box alert-blue">
                  <Info size={18} />
                </div>
                <div className="alert-content">
                  <p className="alert-text">
                    <strong>{rejectedCount} activo{rejectedCount !== 1 ? 's' : ''}</strong> <span className="alert-desc">Fuera de servicio o dados de baja</span>
                  </p>
                </div>
                <span className="alert-time">Hoy</span>
              </div>
            )}

            {/* Alerta 4: Todo bien */}
            {maintenanceCount === 0 && pendingCount === 0 && rejectedCount === 0 && (
              <div className="alert-item">
                <div className="alert-icon-box alert-green">
                  <CheckCircle size={18} />
                </div>
                <div className="alert-content">
                  <p className="alert-text">
                    <strong>Sin alertas pendientes</strong> <span className="alert-desc">Todos los activos están al día</span>
                  </p>
                </div>
                <span className="alert-time">Hoy</span>
              </div>
            )}

            {/* Resumen general siempre visible */}
            <div className="alert-item">
              <div className="alert-icon-box alert-green">
                <CheckCircle size={18} />
              </div>
              <div className="alert-content">
                <p className="alert-text">
                  <strong>{activeCount} activo{activeCount !== 1 ? 's' : ''} en uso</strong> <span className="alert-desc">{totalCount > 0 ? `${activePercent}% del inventario operativo` : 'Sin activos registrados'}</span>
                </p>
              </div>
              <span className="alert-time">Hoy</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Sección Inferior: 2 Contenedores (Movimientos Recientes y Top Responsables) */}
      <div className="atlas-bottom-grid">
        {/* Movimientos Recientes */}
        <div className="atlas-card card-movements">
          <div className="atlas-card-header">
            <h3 className="atlas-card-title">Movimientos recientes</h3>
            <button className="atlas-card-link" onClick={handleOpenEventsModal} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>Ver todos</button>
          </div>

          <div className="table-responsive">
            <table className="atlas-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Activo</th>
                  <th>Descripción</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentMovementsList.map((m, idx) => (
                  <tr key={idx}>
                    <td className="td-date">{m.date}</td>
                    <td className="td-type">{m.type}</td>
                    <td className="td-code">{m.code}</td>
                    <td className="td-desc">{m.desc}</td>
                    <td className="td-responsible">{m.responsible}</td>
                    <td>
                      <span className={`status-pill ${m.status === 'Completado' ? 'pill-green' : 'pill-orange'}`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Responsables de Activos */}
        <div className="atlas-card card-top-responsables">
          <div className="atlas-card-header">
            <h3 className="atlas-card-title">Top responsables de activos</h3>
            <a href="/inventory" className="atlas-card-link">Ver reporte</a>
          </div>

          <div className="responsables-list">
            {topResponsablesList.map((r, idx) => (
              <div key={idx} className="responsable-row">
                <div className="responsable-avatar" style={{ backgroundColor: r.avatarBg || '#3B82F6' }}>
                  {r.initials}
                </div>
                <div className="responsable-info">
                  <span className="responsable-name">{r.name}</span>
                  <span className="responsable-role">{r.role}</span>
                </div>
                <div className="responsable-bar-container">
                  <div className="responsable-progress-track">
                    <div className="responsable-progress-fill" style={{ width: `${r.percent}%` }} />
                  </div>
                </div>
                <div className="responsable-count">
                  <strong>{r.count}</strong> <span className="count-label">activos</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── MODAL VER TODOS LOS EVENTOS ────────────────────────────────────── */}
      {showEventsModal && (
        <div className="events-modal-overlay" onClick={handleCloseEventsModal}>
          <div className="events-modal" onClick={e => e.stopPropagation()}>
            <div className="events-modal-header">
              <h2>Todos los eventos del sistema</h2>
              <button className="events-modal-close" onClick={handleCloseEventsModal}>
                <X size={16} />
              </button>
            </div>

            <div className="events-modal-toolbar">
              <div className="events-search-wrapper">
                <Search size={15} className="search-icon-inside" />
                <input
                  type="text"
                  className="events-search-input"
                  placeholder="Buscar por codigo, activo, motivo..."
                  value={eventsSearch}
                  onChange={e => setEventsSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') fetchAllEvents(1); }}
                />
              </div>
              <select
                className="events-type-filter"
                value={eventsTypeFilter}
                onChange={e => { setEventsTypeFilter(e.target.value); }}
              >
                <option value="ALL">Todos los tipos</option>
                <option value="MOVIMIENTO">Movimientos</option>
                <option value="BAJA">Bajas</option>
                <option value="ACEPTACION">Aceptaciones</option>
                <option value="RECHAZO">Rechazos</option>
                <option value="PENDIENTE">Pendientes</option>
              </select>
              <button className="events-pagination-btn" onClick={() => fetchAllEvents(1)} style={{ fontWeight: 600 }}>
                <Search size={14} /> Buscar
              </button>
            </div>

            <div className="events-modal-body">
              {eventsLoading ? (
                <div className="events-loading">Cargando eventos...</div>
              ) : allEvents.length === 0 ? (
                <div className="events-empty-state">
                  <Inbox size={40} />
                  <p>No se encontraron eventos</p>
                </div>
              ) : (
                <table className="atlas-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Codigo</th>
                      <th>Activo</th>
                      <th>Motivo</th>
                      <th>Responsable</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allEvents.map((ev, idx) => {
                      const badgeClass = ev.event_type === 'MOVIMIENTO' ? 'badge-movimiento'
                        : ev.event_type === 'BAJA' ? 'badge-baja'
                        : ev.event_type === 'ACEPTACION' ? 'badge-aceptacion'
                        : ev.event_type === 'RECHAZO' ? 'badge-rechazo'
                        : 'badge-pendiente';
                      return (
                        <tr key={`${ev.event_type}-${ev.id}-${idx}`}>
                          <td>{ev.event_date ? new Date(ev.event_date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                          <td><span className={`event-type-badge ${badgeClass}`}>{ev.event_type}</span></td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ev.asset_code || '-'}</td>
                          <td>{ev.asset_name || '-'}</td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.reason || '-'}</td>
                          <td>{ev.performed_by || '-'}</td>
                          <td><span className={`status-pill ${ev.status_label === 'BAJA' ? 'pill-red' : 'pill-green'}`}>{ev.status_label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="events-modal-footer">
              <span>Mostrando {allEvents.length} de {eventsPagination.total} eventos</span>
              <div className="events-pagination-controls">
                <button
                  className="events-pagination-btn"
                  disabled={eventsPagination.page <= 1}
                  onClick={() => fetchAllEvents(eventsPagination.page - 1)}
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {eventsPagination.page} / {eventsPagination.totalPages || 1}
                </span>
                <button
                  className="events-pagination-btn"
                  disabled={eventsPagination.page >= eventsPagination.totalPages}
                  onClick={() => fetchAllEvents(eventsPagination.page + 1)}
                >
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

