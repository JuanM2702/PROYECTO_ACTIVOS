const db = require('../config/db');

// Obtener actas de aceptación pendientes
async function getAcceptances(req, res) {
  const { own } = req.query;
  let queryText = `
    SELECT 
      ac.id,
      ac.status,
      ac.comments,
      ac.created_at as assigned_date,
      ac.acceptance_date,
      a.code as asset_code,
      a.name as asset_name,
      a.category as asset_category,
      a.value as asset_value,
      a.location as asset_location,
      u.full_name as assignee_name
    FROM asset_acceptances ac
    JOIN assets a ON ac.asset_id = a.id
    JOIN users u ON ac.user_id = u.id
    WHERE 1=1
  `;
  const queryParams = [];

  // Si el usuario es un VIEWER o se pide explícitamente "propias", filtrar por el ID de usuario activo
  if (req.user.role === 'VIEWER' || own === 'true') {
    queryText += ` AND ac.user_id = $1`;
    queryParams.push(req.user.id);
  }

  queryText += ' ORDER BY ac.created_at DESC';

  try {
    const result = await db.query(queryText, queryParams);
    return res.json({ success: true, acceptances: result.rows });
  } catch (err) {
    console.error('Error al obtener aceptaciones:', err);
    return res.status(500).json({ error: 'Error al consultar las actas de aceptación.' });
  }
}

// Responder a un acta de aceptación (Aprobar o Rechazar con firmas)
async function respondToAcceptance(req, res) {
  const { id } = req.params;
  const { status, comments } = req.body; // status: 'ACEPTADO' o 'RECHAZADO'

  if (!status || !['ACEPTADO', 'RECHAZADO'].includes(status)) {
    return res.status(400).json({ error: 'El estado de respuesta debe ser ACEPTADO o RECHAZADO.' });
  }

  try {
    // 1. Verificar existencia del acta y correspondencia de usuario
    const checkResult = await db.query(
      'SELECT id, asset_id, user_id, status FROM asset_acceptances WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Acta de aceptación no encontrada.' });
    }

    const acceptance = checkResult.rows[0];

    // Restricción de seguridad: Un consultor común solo puede firmar sus propias actas
    if (req.user.role === 'VIEWER' && acceptance.user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes autorización para responder en nombre de otro usuario.' });
    }

    if (acceptance.status !== 'PENDIENTE') {
      return res.status(400).json({ error: 'Esta acta ya ha sido respondida previamente.' });
    }

    // 2. Iniciar transacción
    await db.query('BEGIN');

    // a. Actualizar el acta de aceptación
    await db.query(
      `UPDATE asset_acceptances 
       SET status = $1, comments = $2, acceptance_date = NOW()
       WHERE id = $3`,
      [status, comments ? comments.trim() : null, id]
    );

    // b. Actualizar el estado del activo asociado
    const nextAssetStatus = status === 'ACEPTADO' ? 'Activo' : 'Rechazado';
    await db.query(
      `UPDATE assets 
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [nextAssetStatus, acceptance.asset_id]
    );

    // c. Registrar en el histórico de movimientos que hubo un cambio de aceptación
    const explanation = status === 'ACEPTADO' 
      ? 'Aceptación formal del activo por parte del responsable'
      : `Rechazo del activo. Comentarios: ${comments || 'Sin comentarios'}`;

    await db.query(
      `INSERT INTO asset_movements (asset_id, origin_location, destination_location, origin_assignee_id, destination_assignee_id, reason, performed_by)
       SELECT id, location, location, assigned_to, assigned_to, $1, $2 FROM assets WHERE id = $3`,
      [explanation, req.user.id, acceptance.asset_id]
    );

    await db.query('COMMIT');

    return res.json({ success: true, message: `Activo ${status.toLowerCase()} correctamente.` });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Error al responder aceptación:', err);
    return res.status(500).json({ error: 'Error interno al procesar el acta de aceptación.' });
  }
}

module.exports = {
  getAcceptances,
  respondToAcceptance,
};
