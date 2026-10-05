const db = require('../config/db');
const { minioClient, BUCKET_PENDIENTES, BUCKET_ACEPTACIONES } = require('../config/minio');

// Obtener actas de aceptación pendientes o historial con paginación
async function getAcceptances(req, res) {
  const { own, search, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  let whereClause = ' WHERE 1=1';
  const queryParams = [];
  let paramIndex = 1;

  if (req.user.role !== 'ADMIN' || own === 'true') {
    whereClause += ` AND ac.usuario_id = $${paramIndex}`;
    queryParams.push(req.user.id);
    paramIndex++;
  }

  if (status) {
    if (status === 'PENDIENTE') {
      whereClause += ` AND ac.estatus = 'PENDIENTE'`;
    } else if (status === 'HISTORIAL') {
      whereClause += ` AND ac.estatus != 'PENDIENTE'`;
    } else {
      whereClause += ` AND ac.estatus = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }
  }

  if (search) {
    whereClause += ` AND (a.codigo ILIKE $${paramIndex} OR a.modelo ILIKE $${paramIndex} OR u.nombre_completo ILIKE $${paramIndex})`;
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  try {
    const countQuery = `
      SELECT COUNT(DISTINCT COALESCE(ac.batch_key, ac.minio_key, ac.creado_en::text || '_' || ac.usuario_id || '_' || COALESCE(ac.cedula_origen, '')))::int as count
      FROM aceptaciones_activo ac
      JOIN dim_activos a ON ac.activo_id = a.id
      JOIN dim_usuarios u ON ac.usuario_id = u.id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0]?.count || 0, 10);

    const dataQuery = `
      SELECT 
        COALESCE(ac.batch_key, ac.minio_key, ac.creado_en::text || '_' || ac.usuario_id || '_' || COALESCE(ac.cedula_origen, '')) as group_key,
        COUNT(*)::int as total_activos,
        ARRAY_AGG(ac.id ORDER BY ac.id) as ids,
        ARRAY_AGG(a.codigo ORDER BY ac.id) as asset_codes,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', ac.id,
            'activo_id', a.id,
            'code', a.codigo,
            'name', COALESCE(a.modelo, 'Activo'),
            'category', COALESCE(a.tipo_recurso, 'Hardware'),
            'value', COALESCE(a.valor_inicial, 0)
          ) ORDER BY ac.id
        ) as assets_detail,
        MAX(ac.estatus) as status,
        MAX(ac.comentarios) as comments,
        MAX(ac.creado_en) as assigned_date,
        MAX(ac.fecha_aceptacion) as acceptance_date,
        MAX(ac.minio_key) as minio_key,
        MAX(ac.firma_origen) as firma_origen,
        MAX(ac.cedula_origen) as cedula_origen,
        MAX(ac.cargo_origen) as cargo_origen,
        MAX(ac.firma_destino) as firma_destino,
        MAX(ac.cedula_destino) as cedula_destino,
        MAX(ac.cargo_destino) as cargo_destino,
        MAX(ac.estado_entrega) as estado_entrega,
        COALESCE(MAX(ar.punto_venta || ' (' || ar.oficina || ')'), 'Sede Principal') as asset_location,
        MAX(u.nombre_completo) as assignee_name,
        (
          SELECT u2.nombre_completo 
          FROM fact_movimientos_activos m2 
          JOIN dim_usuarios u2 ON m2.realizado_por = u2.id 
          WHERE m2.activo_id = MIN(ac.activo_id) 
          ORDER BY m2.fecha_movimiento DESC LIMIT 1
        ) as sender_name,
        SUM(COALESCE(a.valor_inicial, 0)) as asset_value,
        MIN(ac.id) as id
      FROM aceptaciones_activo ac
      JOIN dim_activos a ON ac.activo_id = a.id
      LEFT JOIN dim_ubicaciones ar ON a.ubicacion_id = ar.id
      JOIN dim_usuarios u ON ac.usuario_id = u.id
      ${whereClause}
      GROUP BY group_key
      ORDER BY MAX(ac.creado_en) DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);

    const formattedAcceptances = dataResult.rows.map(row => {
      const isBulk = row.total_activos > 1;
      
      return {
        id: row.id,
        ids: row.ids,
        is_bulk: isBulk,
        total_activos: row.total_activos,
        asset_codes: row.asset_codes,
        assets_detail: row.assets_detail,
        asset_code: isBulk ? `Acta Masiva (${row.total_activos} activos)` : row.asset_codes[0],
        asset_name: isBulk 
          ? `Lote de ${row.total_activos} activos (${row.asset_codes.slice(0, 3).join(', ')}${row.asset_codes.length > 3 ? '...' : ''})`
          : row.assets_detail[0]?.name || 'Activo',
        asset_category: isBulk ? `Varios (${row.total_activos} activos)` : (row.assets_detail[0]?.category || 'Hardware'),
        asset_value: parseFloat(row.asset_value || 0),
        asset_location: row.asset_location,
        assignee_name: row.assignee_name,
        sender_name: row.sender_name,
        status: row.status,
        comments: row.comments,
        assigned_date: row.assigned_date,
        acceptance_date: row.acceptance_date,
        minio_key: row.minio_key,
        firma_origen: row.firma_origen,
        cedula_origen: row.cedula_origen,
        cargo_origen: row.cargo_origen,
        firma_destino: row.firma_destino,
        cedula_destino: row.cedula_destino,
        cargo_destino: row.cargo_destino,
        estado_entrega: row.estado_entrega
      };
    });

    return res.json({
      success: true,
      acceptances: formattedAcceptances,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('Error al obtener aceptaciones:', err);
    return res.status(500).json({ error: 'Error al consultar las actas de aceptación.' });
  }
}

// Helper interno para procesar la aceptación o rechazo de un activo individual
async function processAcceptanceItem(client, acceptanceId, userId, isUserAdmin, itemStatus, itemComments, recipientInfo, minioKey, tiempoId) {
  const checkResult = await client.query(
    `SELECT ac.id, ac.activo_id, ac.usuario_id, ac.estatus, a.codigo, a.modelo, a.estado_id
     FROM aceptaciones_activo ac
     JOIN dim_activos a ON ac.activo_id = a.id
     WHERE ac.id = $1`,
    [acceptanceId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error(`Acta de aceptación #${acceptanceId} no encontrada.`);
  }

  const acceptance = checkResult.rows[0];

  if (!isUserAdmin && acceptance.usuario_id !== userId) {
    throw new Error(`No tienes autorización para responder en nombre de otro usuario en el acta #${acceptanceId}.`);
  }

  if (acceptance.estatus !== 'PENDIENTE') {
    throw new Error(`El acta #${acceptanceId} ya ha sido respondida previamente.`);
  }

  const cleanComments = itemComments ? itemComments.trim() : null;

  if (itemStatus === 'ACEPTADO') {
    await client.query(
      `UPDATE aceptaciones_activo 
       SET estatus = 'ACEPTADO', comentarios = $1, fecha_aceptacion = NOW(), minio_key = $2,
           cedula_destino = $3, cargo_destino = $4, firma_destino = $5
       WHERE id = $6`,
      [cleanComments, minioKey, recipientInfo.cedula_destino || null, recipientInfo.cargo_destino || null, recipientInfo.firma_destino || null, acceptanceId]
    );

    await client.query(
      `UPDATE dim_activos 
       SET estatus = 'Activo', actualizado_en = NOW()
       WHERE id = $1`,
      [acceptance.activo_id]
    );

    const explanation = 'Aceptación formal del activo por parte del responsable';
    await client.query(
      `INSERT INTO fact_movimientos_activos 
         (activo_id, usuario_origen_id, usuario_destino_id, motivo, realizado_por, 
          ubicacion_origen_id, ubicacion_destino_id, tiempo_movimiento_id, tipo_movimiento_id, estado_id, estatus)
       SELECT id, asignado_a, asignado_a, $1, $2, ubicacion_id, ubicacion_id, $3, 2, estado_id, 'VALIDADO'
       FROM dim_activos WHERE id = $4`,
      [explanation, userId, tiempoId, acceptance.activo_id]
    );

  } else if (itemStatus === 'RECHAZADO') {
    const lastMovResult = await client.query(
      `SELECT usuario_origen_id, realizado_por, ubicacion_origen_id
       FROM fact_movimientos_activos
       WHERE activo_id = $1
       ORDER BY fecha_movimiento DESC LIMIT 1`,
      [acceptance.activo_id]
    );

    const lastMov = lastMovResult.rows[0];
    const senderId = lastMov?.usuario_origen_id || lastMov?.realizado_por || null;
    const originUbicacionId = lastMov?.ubicacion_origen_id || null;

    await client.query(
      `UPDATE aceptaciones_activo 
       SET estatus = 'RECHAZADO', comentarios = $1, fecha_aceptacion = NOW(), minio_key = $2,
           cedula_destino = $3, cargo_destino = $4, firma_destino = $5
       WHERE id = $6`,
      [cleanComments, minioKey, recipientInfo.cedula_destino || null, recipientInfo.cargo_destino || null, recipientInfo.firma_destino || null, acceptanceId]
    );

    // Revertir dim_activos al usuario entregante que lo envió
    await client.query(
      `UPDATE dim_activos 
       SET asignado_a = $1, estatus = 'Activo', actualizado_en = NOW(),
           ubicacion_id = COALESCE($2, ubicacion_id)
       WHERE id = $3`,
      [senderId, originUbicacionId, acceptance.activo_id]
    );

    // Registrar notificación en alertas para el usuario que lo envió
    if (senderId) {
      const recipientUserRes = await client.query(
        'SELECT nombre_completo FROM dim_usuarios WHERE id = $1',
        [userId]
      );
      const recipientName = recipientUserRes.rows[0]?.nombre_completo || 'El receptor';

      const alertMessage = `El activo ${acceptance.codigo} (${acceptance.modelo || 'Activo'}) fue RECHAZADO por ${recipientName}. Motivo: ${cleanComments || 'Sin comentarios'}. El activo ha retornado a tus activos asignados.`;

      await client.query(
        `INSERT INTO notificaciones_alertas 
           (tipo, usuario_id, mensaje, cantidad_activos, estatus, creado_en, actualizado_en)
         VALUES ('RECHAZO_ACTIVO', $1, $2, 1, 'PENDIENTE', NOW(), NOW())`,
        [senderId, alertMessage]
      );
    }

    const explanation = `Rechazo del activo por el destinatario. Comentarios: ${cleanComments || 'Sin comentarios'}`;
    await client.query(
      `INSERT INTO fact_movimientos_activos 
         (activo_id, usuario_origen_id, usuario_destino_id, motivo, realizado_por, 
          ubicacion_origen_id, ubicacion_destino_id, tiempo_movimiento_id, tipo_movimiento_id, estado_id, estatus)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, 2, $8, 'VALIDADO')`,
      [acceptance.activo_id, userId, senderId, explanation, userId, originUbicacionId, tiempoId, acceptance.estado_id || 1]
    );
  }
}

// Responder a un acta de aceptación individual (Aprobar o Rechazar con firmas)
async function respondToAcceptance(req, res) {
  const { id } = req.params;
  const { status, comments, pdf_base64, cedula_destino, cargo_destino, firma_destino } = req.body;

  if (!status || !['ACEPTADO', 'RECHAZADO'].includes(status)) {
    return res.status(400).json({ error: 'El estado de respuesta debe ser ACEPTADO o RECHAZADO.' });
  }

  try {
    let minioKey = null;
    if (pdf_base64) {
      try {
        const base64Data = pdf_base64.includes(',') ? pdf_base64.split(',').slice(1).join(',') : pdf_base64;
        const buffer = Buffer.from(base64Data, 'base64');
        minioKey = `acta_${id}_${Date.now()}.pdf`;
        await minioClient.putObject(BUCKET_ACEPTACIONES, minioKey, buffer, buffer.length, {
          'Content-Type': 'application/pdf'
        });
      } catch (mErr) {
        console.error('Error guardando PDF en MinIO:', mErr);
      }
    }

    const now = new Date();
    const tiempoId = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    await db.query('BEGIN');

    await processAcceptanceItem(
      db,
      id,
      req.user.id,
      req.user.role === 'ADMIN',
      status,
      comments,
      { cedula_destino, cargo_destino, firma_destino },
      minioKey,
      tiempoId
    );

    await db.query('COMMIT');

    const msg = status === 'ACEPTADO' 
      ? 'Activo aceptado correctamente.' 
      : 'Activo rechazado correctamente y devuelto a su originador.';

    return res.json({ success: true, message: msg, minio_key: minioKey });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Error al responder aceptación:', err);
    return res.status(500).json({ error: err.message || 'Error interno al procesar el acta de aceptación.' });
  }
}

// Descargar PDF desde MinIO
async function downloadAcceptancePDF(req, res) {
  const { id } = req.params;

  try {
    const result = await db.query(
      'SELECT id, estatus, minio_key, usuario_id FROM aceptaciones_activo WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Acta no encontrada.' });
    }

    const acceptance = result.rows[0];

    if (acceptance.estatus !== 'ACEPTADO') {
      return res.status(403).json({ error: 'El PDF de esta acta solo está disponible para descarga una vez que haya sido ACEPTADO.' });
    }

    if (req.user.role !== 'ADMIN' && acceptance.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'No tiene permisos para acceder a esta acta.' });
    }

    if (!acceptance.minio_key) {
      return res.status(404).json({ error: 'El archivo PDF no se encuentra almacenado en el repositorio.' });
    }

    const stream = await minioClient.getObject(BUCKET_ACEPTACIONES, acceptance.minio_key);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${acceptance.minio_key}"`);
    stream.pipe(res);

  } catch (err) {
    console.error('Error descargando PDF de MinIO:', err);
    return res.status(500).json({ error: 'Error al recuperar el archivo PDF desde el almacenamiento.' });
  }
}

async function getPendingCount(req, res) {
  try {
    let whereClause = "WHERE ac.estatus = 'PENDIENTE'";
    const params = [];

    if (req.user.role !== 'ADMIN') {
      whereClause += " AND ac.usuario_id = $1";
      params.push(req.user.id);
    }

    const result = await db.query(`
      SELECT 
        COUNT(*)::integer as count,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ac.id,
              'asset_code', a.codigo,
              'asset_name', CONCAT(a.tipo_recurso, ' ', a.modelo),
              'date', ac.creado_en
            )
          ) FILTER (WHERE ac.id IS NOT NULL),
          '[]'::json
        ) as pending_items
      FROM aceptaciones_activo ac
      JOIN dim_activos a ON ac.activo_id = a.id
      ${whereClause}
    `, params);

    const pendingCount = result.rows[0]?.count || 0;
    const items = result.rows[0]?.pending_items || [];

    let adminAlerts = [];
    if (req.user.role === 'ADMIN') {
      const alertsResult = await db.query(`
        SELECT 
          na.id, 
          na.tipo, 
          na.usuario_id, 
          na.mensaje, 
          na.cantidad_activos, 
          na.creado_en as date,
          u.nombre_completo as user_name
        FROM notificaciones_alertas na
        JOIN dim_usuarios u ON na.usuario_id = u.id
        WHERE na.estatus = 'PENDIENTE' AND na.tipo = 'INACTIVACION_USUARIO'
        ORDER BY na.creado_en DESC
      `);

      for (const alert of alertsResult.rows) {
        const checkAssets = await db.query(
          'SELECT COUNT(*)::integer as count FROM dim_activos WHERE asignado_a = $1',
          [alert.usuario_id]
        );
        const currentAssetCount = checkAssets.rows[0]?.count || 0;

        if (currentAssetCount === 0) {
          await db.query(
            "UPDATE notificaciones_alertas SET estatus = 'RESUELTO', actualizado_en = NOW() WHERE id = $1",
            [alert.id]
          );
        } else {
          if (currentAssetCount !== alert.cantidad_activos) {
            const updatedMsg = `El usuario ${alert.user_name} tiene ${currentAssetCount} activo(s) asignado(s) que deben ser reasignados antes de inactivarlo.`;
            await db.query(
              "UPDATE notificaciones_alertas SET cantidad_activos = $1, mensaje = $2, actualizado_en = NOW() WHERE id = $3",
              [currentAssetCount, updatedMsg, alert.id]
            );
            alert.cantidad_activos = currentAssetCount;
            alert.mensaje = updatedMsg;
          }
          adminAlerts.push(alert);
        }
      }
    }

    // Notificaciones personales de baja para el usuario logueado
    const userBajaAlertsRes = await db.query(`
      SELECT id, tipo, mensaje, creado_en as date
      FROM notificaciones_alertas
      WHERE usuario_id = $1 AND tipo = 'BAJA_ACTIVO' AND estatus = 'PENDIENTE'
      ORDER BY creado_en DESC
    `, [req.user.id]);
    const userBajaAlerts = userBajaAlertsRes.rows;

    // Notificaciones personales de rechazo/devolución para el usuario logueado
    const userRejectionAlertsRes = await db.query(`
      SELECT id, tipo, mensaje, creado_en as date
      FROM notificaciones_alertas
      WHERE usuario_id = $1 AND tipo = 'RECHAZO_ACTIVO' AND estatus = 'PENDIENTE'
      ORDER BY creado_en DESC
    `, [req.user.id]);
    const userRejectionAlerts = userRejectionAlertsRes.rows;

    const totalCount = pendingCount + adminAlerts.length + userBajaAlerts.length + userRejectionAlerts.length;

    return res.json({
      success: true,
      count: totalCount,
      data: items,
      alerts: adminAlerts,
      bajaAlerts: userBajaAlerts,
      rejectionAlerts: userRejectionAlerts
    });
  } catch (err) {
    console.error('Error al obtener conteo de notificaciones:', err);
    return res.status(500).json({ error: 'Error al consultar notificaciones.' });
  }
}

// Marcar notificación como leída / resuelta
async function markNotificationAsRead(req, res) {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE notificaciones_alertas 
       SET estatus = 'RESUELTO', actualizado_en = CURRENT_TIMESTAMP 
       WHERE id = $1 AND (usuario_id = $2 OR $3 = 'ADMIN') RETURNING id`,
      [id, req.user.id, req.user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o no pertenece al usuario.' });
    }

    return res.json({ success: true, message: 'Notificación marcada como leída.' });
  } catch (err) {
    console.error('Error al marcar notificación como leída:', err);
    return res.status(500).json({ error: 'Error al actualizar la notificación.' });
  }
}

// Responder de forma masiva a un lote de actas de aceptación (Permite aceptar o rechazar individualmente cada activo)
async function bulkRespondToAcceptance(req, res) {
  const { ids, items, status, comments, pdf_base64, cedula_destino, cargo_destino, firma_destino } = req.body;

  // Construir lista unificada de items a procesar
  let itemList = [];
  if (items && Array.isArray(items) && items.length > 0) {
    itemList = items.map(item => ({
      id: parseInt(item.id, 10),
      status: item.status || status || 'ACEPTADO',
      comments: item.comments !== undefined ? item.comments : comments
    }));
  } else if (ids && Array.isArray(ids) && ids.length > 0) {
    if (!status || !['ACEPTADO', 'RECHAZADO'].includes(status)) {
      return res.status(400).json({ error: 'El estado de respuesta global debe ser ACEPTADO o RECHAZADO.' });
    }
    itemList = ids.map(id => ({
      id: parseInt(id, 10),
      status: status,
      comments: comments
    }));
  } else {
    return res.status(400).json({ error: 'Debe proporcionar una lista de actas (ids o items) a procesar.' });
  }

  const targetIds = itemList.map(item => item.id);

  try {
    // 1. Obtener todas las actas seleccionadas
    const checkResult = await db.query(
      `SELECT ac.id, ac.activo_id, ac.usuario_id, ac.estatus, ac.cedula_origen, ac.firma_origen, ac.cargo_origen
       FROM aceptaciones_activo ac
       WHERE ac.id = ANY($1::int[])`,
      [targetIds]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontraron las actas de aceptación especificadas.' });
    }

    const acceptances = checkResult.rows;

    // RLS: Verificar que todas las actas pertenecen al usuario logueado o que es ADMIN
    for (const act of acceptances) {
      if (req.user.role !== 'ADMIN' && act.usuario_id !== req.user.id) {
        return res.status(403).json({ error: `No tienes autorización para responder el acta #${act.id} perteneciente a otro usuario.` });
      }
      if (act.estatus !== 'PENDIENTE') {
        return res.status(400).json({ error: `El acta #${act.id} ya fue respondida previamente.` });
      }
    }

    // Regla de Negocio Estricta: Garantizar que TODOS los activos seleccionados provienen del MISMO usuario entregante
    const firstSenderCedula = acceptances[0].cedula_origen || 'SIN_CEDULA';
    const hasDifferentSenders = acceptances.some(act => (act.cedula_origen || 'SIN_CEDULA') !== firstSenderCedula);

    if (hasDifferentSenders) {
      return res.status(400).json({
        error: 'Para mantener la validez legal de las firmas, la aceptación masiva solo puede realizarse sobre activos que provienen del MISMO usuario (entregante).'
      });
    }

    // Guardar el PDF masivo en MinIO si se adjunta
    let minioKey = null;
    if (pdf_base64) {
      try {
        const base64Data = pdf_base64.includes(',') ? pdf_base64.split(',').slice(1).join(',') : pdf_base64;
        const buffer = Buffer.from(base64Data, 'base64');
        minioKey = `acta_masiva_${Date.now()}.pdf`;
        await minioClient.putObject(BUCKET_ACEPTACIONES, minioKey, buffer, buffer.length, {
          'Content-Type': 'application/pdf'
        });
      } catch (mErr) {
        console.error('Error guardando PDF masivo en MinIO:', mErr);
      }
    }

    const now = new Date();
    const tiempoId = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    await db.query('BEGIN');

    let acceptedCount = 0;
    let rejectedCount = 0;

    for (const item of itemList) {
      await processAcceptanceItem(
        db,
        item.id,
        req.user.id,
        req.user.role === 'ADMIN',
        item.status,
        item.comments,
        { cedula_destino, cargo_destino, firma_destino },
        minioKey,
        tiempoId
      );

      if (item.status === 'ACEPTADO') acceptedCount++;
      if (item.status === 'RECHAZADO') rejectedCount++;
    }

    await db.query('COMMIT');

    let messageStr = '';
    if (acceptedCount > 0 && rejectedCount > 0) {
      messageStr = `${acceptedCount} activo(s) aceptado(s) y ${rejectedCount} activo(s) rechazado(s) y devuelto(s) al entregante.`;
    } else if (acceptedCount > 0) {
      messageStr = `${acceptedCount} activo(s) aceptado(s) correctamente en lote.`;
    } else {
      messageStr = `${rejectedCount} activo(s) rechazado(s) correctamente y devuelto(s) al entregante.`;
    }

    return res.json({
      success: true,
      message: messageStr,
      minio_key: minioKey,
      accepted_count: acceptedCount,
      rejected_count: rejectedCount
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Error al responder aceptación masiva:', err);
    return res.status(500).json({ error: err.message || 'Error interno al procesar la aceptación masiva de activos.' });
  }
}

module.exports = {
  getAcceptances,
  respondToAcceptance,
  bulkRespondToAcceptance,
  downloadAcceptancePDF,
  getPendingCount,
  markNotificationAsRead
};

