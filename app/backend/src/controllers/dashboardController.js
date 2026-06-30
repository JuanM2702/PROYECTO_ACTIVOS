const db = require('../config/db');

// Obtener datos consolidados para el Dashboard de Analítica
async function getDashboardStats(req, res) {
  try {
    // 1. Obtener KPIs generales
    const kpisPromise = db.query(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(value), 0) as total_value,
        COUNT(CASE WHEN status = 'Activo' THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'Pendiente Aceptación' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'En Mantenimiento' THEN 1 END) as maintenance_count,
        COUNT(CASE WHEN status = 'Rechazado' THEN 1 END) as rejected_count
      FROM assets
    `);

    // 2. Distribución de activos por categoría
    const categoriesPromise = db.query(`
      SELECT category, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
      FROM assets
      GROUP BY category
      ORDER BY total_value DESC
    `);

    // 3. Actividad reciente (últimos 5 movimientos)
    const recentActivityPromise = db.query(`
      SELECT 
        m.id,
        m.movement_date as date,
        m.reason,
        m.destination_location,
        a.code as asset_code,
        a.name as asset_name,
        u_perf.full_name as performed_by_name
      FROM asset_movements m
      JOIN assets a ON m.asset_id = a.id
      LEFT JOIN users u_perf ON m.performed_by = u_perf.id
      ORDER BY m.movement_date DESC
      LIMIT 5
    `);

    // Esperar a que se ejecuten todas las consultas en paralelo
    const [kpisResult, categoriesResult, recentActivityResult] = await Promise.all([
      kpisPromise,
      categoriesPromise,
      recentActivityPromise
    ]);

    const kpis = kpisResult.rows[0];

    return res.json({
      success: true,
      stats: {
        totalCount: parseInt(kpis.total_count, 10),
        totalValue: parseFloat(kpis.total_value),
        activeCount: parseInt(kpis.active_count, 10),
        pendingCount: parseInt(kpis.pending_count, 10),
        maintenanceCount: parseInt(kpis.maintenance_count, 10),
        rejectedCount: parseInt(kpis.rejected_count, 10),
        categories: categoriesResult.rows.map(c => ({
          name: c.category,
          count: parseInt(c.count, 10),
          value: parseFloat(c.total_value)
        })),
        recentActivity: recentActivityResult.rows
      }
    });

  } catch (err) {
    console.error('Error al obtener estadísticas del dashboard:', err);
    return res.status(500).json({ error: 'Error al calcular las estadísticas del panel de control.' });
  }
}

module.exports = {
  getDashboardStats,
};
