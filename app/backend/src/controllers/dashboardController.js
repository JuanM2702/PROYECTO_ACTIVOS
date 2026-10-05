const db = require('../config/db');

// Obtener datos consolidados para el Dashboard de Analítica
async function getDashboardStats(req, res) {
  try {
    const isUserAdmin = req.user.role === 'ADMIN';
    const userId = req.user.id;

    // Filtros por Query Params
    const { startDate, endDate, category, status, empresa } = req.query;

    const userParams = [];
    let baseConditions = isUserAdmin ? [] : ['a.asignado_a = $1'];
    if (!isUserAdmin) {
      userParams.push(userId);
    }

    if (startDate) {
      userParams.push(startDate);
      baseConditions.push(`a.fecha_compra >= $${userParams.length}`);
    }
    if (endDate) {
      userParams.push(endDate);
      // Agregamos 1 día para incluir el último día completo
      baseConditions.push(`a.fecha_compra < ($${userParams.length}::date + interval '1 day')`);
    }
    if (category) {
      userParams.push(category);
      baseConditions.push(`a.tipo_recurso = $${userParams.length}`);
    }
    if (empresa) {
      userParams.push(empresa);
      baseConditions.push(`a.empresa = $${userParams.length}`);
    }
    // Para KPIs de estatus general no podemos filtrar por estatus directamente si queremos ver el desglose,
    // pero si filtramos explícitamente por estado físico (status), sí lo agregamos
    if (status) {
      userParams.push(status);
      baseConditions.push(`a.estado_id = $${userParams.length}`);
    }

    const whereClauseStr = baseConditions.length > 0 ? 'WHERE ' + baseConditions.join(' AND ') : '';

    // 1. Obtener KPIs generales con depreciación
    const kpisPromise = db.query(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(a.valor_inicial), 0) as total_value,
        COALESCE(SUM(a.depreciacion_acumulada), 0) as total_depreciation,
        COALESCE(SUM(a.valor_libros), 0) as total_book_value,
        COUNT(CASE WHEN a.estatus = 'ACTIVO' OR a.estatus = 'Activo' THEN 1 END) as active_count,
        COUNT(CASE WHEN a.estatus = 'Pendiente Aceptación' OR a.estatus = 'PENDIENTE' THEN 1 END) as pending_count,
        COUNT(CASE WHEN a.estatus = 'En Mantenimiento' THEN 1 END) as maintenance_count,
        COUNT(CASE WHEN a.estatus = 'BAJA' OR a.estatus = 'Rechazado' THEN 1 END) as rejected_count
      FROM view_activos_depreciacion a
      ${whereClauseStr}
    `, userParams);

    // 2. Distribución de activos por categoría (tipo_recurso)
    const categoriesPromise = db.query(`
      SELECT COALESCE(a.tipo_recurso, 'General') as category, COUNT(*) as count, COALESCE(SUM(a.valor_inicial), 0) as total_value
      FROM dim_activos a
      ${whereClauseStr}
      GROUP BY COALESCE(a.tipo_recurso, 'General')
      ORDER BY count DESC, total_value DESC
    `, userParams);

    // 3. Actividad reciente (últimos 5 movimientos en fact_movimientos_activos)
    // Para movimientos, debemos filtrar usando los mismos IDs filtrados
    const activityPromise = db.query(`
      SELECT 
        m.id,
        m.fecha_movimiento as date,
        m.motivo as reason,
        COALESCE(ar_dest.area, 'Ubicación General') as destination_location,
        a.codigo as asset_code,
        COALESCE(a.modelo, 'Activo') as asset_name,
        u_perf.nombre_completo as performed_by_name
      FROM fact_movimientos_activos m
      JOIN dim_activos a ON m.activo_id = a.id
      LEFT JOIN dim_ubicaciones ar_dest ON m.ubicacion_destino_id = ar_dest.id
      LEFT JOIN dim_usuarios u_perf ON m.realizado_por = u_perf.id
      ${whereClauseStr}
      ORDER BY m.fecha_movimiento DESC
      LIMIT 10
    `, userParams);

    // 4. Distribución por estado físico
    const statesPromise = db.query(`
      SELECT 
        COALESCE(e.estado, 'Sin Estado') as state_name,
        COUNT(a.id)::int as count
      FROM dim_activos a
      LEFT JOIN dim_estados_activo e ON a.estado_id = e.id
      ${whereClauseStr}
      GROUP BY e.estado
      ORDER BY count DESC
    `, userParams).catch(() => ({ rows: [] }));

    // 5. Top responsables de activos (solo visible con alcance global para ADMIN)
    const topResponsablesPromise = isUserAdmin ? db.query(`
      SELECT 
        u.id, 
        u.nombre_completo as name, 
        COALESCE(u.cargo, 'Analista') as role, 
        COUNT(a.id)::int as count
      FROM dim_usuarios u
      JOIN dim_activos a ON a.asignado_a = u.id
      GROUP BY u.id, u.nombre_completo, u.cargo
      ORDER BY count DESC
      LIMIT 4
    `).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] });

    // 6. Tendencia temporal histórica de activos (Resumen de activos por mes)
    const timelinePromise = db.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', COALESCE(a.fecha_compra, a.creado_en)), 'Mon YYYY') as month_label,
        TO_CHAR(DATE_TRUNC('month', COALESCE(a.fecha_compra, a.creado_en)), 'YYYY-MM') as month_key,
        COUNT(*)::int as new_count
      FROM dim_activos a
      ${whereClauseStr}
      GROUP BY DATE_TRUNC('month', COALESCE(a.fecha_compra, a.creado_en))
      ORDER BY month_key ASC
      LIMIT 12
    `, userParams).catch(() => ({ rows: [] }));

    // Esperar a que se ejecuten todas las consultas en paralelo
    const [kpisResult, categoriesResult, recentActivityResult, statesResult, topResponsablesResult, timelineResult] = await Promise.all([
      kpisPromise,
      categoriesPromise,
      activityPromise,
      statesPromise,
      topResponsablesPromise,
      timelinePromise
    ]);

    const kpis = kpisResult.rows[0];

    // Calcular acumulados históricos para el gráfico interactivo
    let cumulativeAcc = 0;
    const timelineData = (timelineResult.rows || []).map(r => {
      const added = parseInt(r.new_count, 10) || 0;
      cumulativeAcc += added;
      return {
        month: r.month_label || r.month_key,
        key: r.month_key,
        newCount: added,
        cumulativeCount: cumulativeAcc
      };
    });

    return res.json({
      success: true,
      stats: {
        totalCount: parseInt(kpis.total_count, 10) || 0,
        totalValue: parseFloat(kpis.total_value) || 0,
        totalDepreciation: parseFloat(kpis.total_depreciation) || 0,
        totalBookValue: parseFloat(kpis.total_book_value) || 0,
        activeCount: parseInt(kpis.active_count, 10) || 0,
        pendingCount: parseInt(kpis.pending_count, 10) || 0,
        maintenanceCount: parseInt(kpis.maintenance_count, 10) || 0,
        rejectedCount: parseInt(kpis.rejected_count, 10) || 0,
        categories: categoriesResult.rows.map(c => ({
          name: c.category,
          count: parseInt(c.count, 10),
          value: parseFloat(c.total_value)
        })),
        stateDistribution: statesResult.rows.map(s => ({
          name: s.state_name,
          count: parseInt(s.count, 10)
        })),
        recentActivity: recentActivityResult.rows,
        topResponsables: (topResponsablesResult.rows || []).map(u => ({
          id: u.id,
          name: u.name,
          role: u.role,
          count: parseInt(u.count, 10) || 0
        })),
        timelineData
      }
    });

  } catch (err) {
    console.error('Error al obtener estadísticas del dashboard:', err);
    return res.status(500).json({ error: 'Error al calcular las estadísticas del panel de control.' });
  }
}

// ─── Obtener todos los eventos (movimientos + bajas) con paginación y búsqueda ───
async function getAllEvents(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 15, 10)));
    const offset = (page - 1) * limit;
    const { search, type } = req.query;

    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.id;

    const queryParams = [];
    let paramIdx = 1;
    let userFilter = '';

    if (!isAdmin) {
      userFilter = ` AND (sub.user_id = $${paramIdx})`;
      queryParams.push(userId);
      paramIdx++;
    }

    let searchFilter = '';
    if (search && search.trim()) {
      searchFilter = ` AND (
        sub.asset_code ILIKE $${paramIdx} OR 
        sub.asset_name ILIKE $${paramIdx} OR 
        sub.reason ILIKE $${paramIdx} OR 
        sub.performed_by ILIKE $${paramIdx}
      )`;
      queryParams.push(`%${search.trim()}%`);
      paramIdx++;
    }

    let typeFilter = '';
    if (type && type.trim() && type !== 'ALL') {
      typeFilter = ` AND sub.event_type = $${paramIdx}`;
      queryParams.push(type.trim());
      paramIdx++;
    }

    const unionQuery = `
      SELECT * FROM (
        SELECT 
          m.id,
          'MOVIMIENTO' as event_type,
          m.fecha_movimiento as event_date,
          m.motivo as reason,
          a.codigo as asset_code,
          COALESCE(a.modelo, 'Activo') as asset_name,
          COALESCE(u_perf.nombre_completo, 'Sistema') as performed_by,
          COALESCE(m.estado_entrega, 'TRASLADO') as status_label,
          m.realizado_por as user_id
        FROM fact_movimientos_activos m
        JOIN dim_activos a ON m.activo_id = a.id
        LEFT JOIN dim_usuarios u_perf ON m.realizado_por = u_perf.id

        UNION ALL

        SELECT 
          b.id,
          'BAJA' as event_type,
          b.fecha_baja as event_date,
          b.motivo as reason,
          a.codigo as asset_code,
          COALESCE(a.modelo, 'Activo') as asset_name,
          COALESCE(u_reg.nombre_completo, 'Sistema') as performed_by,
          'BAJA' as status_label,
          b.registrado_por as user_id
        FROM bajas_activo b
        JOIN dim_activos a ON b.activo_id = a.id
        LEFT JOIN dim_usuarios u_reg ON b.registrado_por = u_reg.id

        UNION ALL

        SELECT 
          ac.id,
          CASE WHEN ac.estatus = 'ACEPTADO' THEN 'ACEPTACION' 
               WHEN ac.estatus = 'RECHAZADO' THEN 'RECHAZO' 
               ELSE 'PENDIENTE' END as event_type,
          ac.creado_en as event_date,
          COALESCE(ac.estado_entrega, ac.estatus) as reason,
          a.codigo as asset_code,
          COALESCE(a.modelo, 'Activo') as asset_name,
          COALESCE(u_ac.nombre_completo, 'Sistema') as performed_by,
          ac.estatus as status_label,
          ac.usuario_id as user_id
        FROM aceptaciones_activo ac
        JOIN dim_activos a ON ac.activo_id = a.id
        LEFT JOIN dim_usuarios u_ac ON ac.usuario_id = u_ac.id
      ) sub
      WHERE 1=1 ${userFilter} ${searchFilter} ${typeFilter}
    `;

    // Count
    const countResult = await db.query(`SELECT COUNT(*) FROM (${unionQuery}) c`, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Data with pagination
    const dataResult = await db.query(
      `${unionQuery} ORDER BY sub.event_date DESC NULLS LAST LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, limit, offset]
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('Error al obtener todos los eventos:', err);
    return res.status(500).json({ error: 'Error al consultar los eventos del sistema.' });
  }
}

module.exports = {
  getDashboardStats,
  getAllEvents,
};
