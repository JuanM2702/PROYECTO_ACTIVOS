const db = require('../config/db');

// Obtener el histórico completo de movimientos (auditoría)
async function getMovements(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        m.id,
        m.movement_date as date,
        m.reason,
        m.origin_location,
        m.destination_location,
        a.code as asset_code,
        a.name as asset_name,
        u_perf.full_name as performed_by_name,
        u_orig.full_name as origin_assignee_name,
        u_dest.full_name as destination_assignee_name
      FROM asset_movements m
      JOIN assets a ON m.asset_id = a.id
      LEFT JOIN users u_perf ON m.performed_by = u_perf.id
      LEFT JOIN users u_orig ON m.origin_assignee_id = u_orig.id
      LEFT JOIN users u_dest ON m.destination_assignee_id = u_dest.id
      ORDER BY m.movement_date DESC
    `);

    return res.json({ success: true, movements: result.rows });
  } catch (err) {
    console.error('Error al obtener movimientos:', err);
    return res.status(500).json({ error: 'Error al consultar el historial de movimientos.' });
  }
}

// Registrar un movimiento físico/administrativo manual
async function createMovement(req, res) {
  const { asset_id, destination_location, destination_assignee_id, reason } = req.body;

  if (!asset_id || !destination_location || !reason) {
    return res.status(400).json({ error: 'El activo, la ubicación de destino y la justificación son requeridos.' });
  }

  try {
    // 1. Consultar el estado actual del activo
    const assetResult = await db.query(
      'SELECT id, location, assigned_to, status FROM assets WHERE id = $1',
      [asset_id]
    );

    if (assetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado.' });
    }

    const asset = assetResult.rows[0];
    const originLocation = asset.location;
    const originAssignee = asset.assigned_to;
    const nextAssignee = destination_assignee_id ? parseInt(destination_assignee_id, 10) : null;

    // 2. Determinar el nuevo estado
    // Si cambia de responsable, entra en "Pendiente Aceptación"
    let nextStatus = asset.status;
    if (nextAssignee !== originAssignee) {
      nextStatus = nextAssignee ? 'Pendiente Aceptación' : 'Activo';
    }

    // 3. Iniciar transacción en la base de datos (Garantiza consistencia)
    await db.query('BEGIN');

    // a. Registrar el movimiento
    await db.query(
      `INSERT INTO asset_movements (asset_id, origin_location, destination_location, origin_assignee_id, destination_assignee_id, reason, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        asset_id,
        originLocation,
        destination_location.trim(),
        originAssignee,
        nextAssignee,
        reason.trim(),
        req.user.id
      ]
    );

    // b. Actualizar el activo con su nueva ubicación, responsable y estado
    await db.query(
      `UPDATE assets 
       SET location = $1, assigned_to = $2, status = $3, updated_at = NOW() 
       WHERE id = $4`,
      [destination_location.trim(), nextAssignee, nextStatus, asset_id]
    );

    // c. Si hay un nuevo responsable asignado diferente, registrar el flujo de aceptación
    if (nextAssignee && nextAssignee !== originAssignee) {
      await db.query(
        `INSERT INTO asset_acceptances (asset_id, user_id, status)
         VALUES ($1, $2, 'PENDIENTE')`,
        [asset_id, nextAssignee]
      );
    }

    // Confirmar transacción
    await db.query('COMMIT');

    return res.status(201).json({ success: true, message: 'Traslado registrado y guardado exitosamente.' });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Error al realizar movimiento:', err);
    return res.status(500).json({ error: 'Error interno al registrar el movimiento del activo.' });
  }
}

module.exports = {
  getMovements,
  createMovement,
};
