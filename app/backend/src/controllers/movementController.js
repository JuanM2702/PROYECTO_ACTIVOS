const db = require('../config/db');
const { minioClient, BUCKET_PENDIENTES } = require('../config/minio');

// ─── Obtener el histórico completo de movimientos con paginación y búsqueda ───
async function getMovements(req, res) {
  const { search, statusFilter } = req.query;
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  let whereClause = ' WHERE 1=1';
  const queryParams = [];
  let paramIndex = 1;

  // RLS: Los usuarios no-admin solo ven sus propios movimientos
  if (req.user.role !== 'ADMIN') {
    whereClause += ` AND (m.usuario_origen_id = $${paramIndex} OR m.usuario_destino_id = $${paramIndex} OR m.realizado_por = $${paramIndex})`;
    queryParams.push(req.user.id);
    paramIndex++;
  }

  if (search) {
    whereClause += ` AND (a.codigo ILIKE $${paramIndex} OR a.modelo ILIKE $${paramIndex} OR m.motivo ILIKE $${paramIndex} OR od.oficina ILIKE $${paramIndex} OR od.punto_venta ILIKE $${paramIndex})`;
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  // Filtro por estado de aceptación
  if (statusFilter === 'PENDIENTE') {
    whereClause += ` AND m.usuario_destino_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM aceptaciones_activo ac
      WHERE ac.activo_id = m.activo_id AND ac.usuario_id = m.usuario_destino_id AND ac.estatus = 'PENDIENTE'
    )`;
  } else if (statusFilter === 'ACEPTADO') {
    whereClause += ` AND EXISTS (
      SELECT 1 FROM aceptaciones_activo ac
      WHERE ac.activo_id = m.activo_id AND ac.usuario_id = m.usuario_destino_id AND ac.estatus = 'ACEPTADO'
    )`;
  }

  try {
    const countQuery = `
      SELECT COUNT(*) 
      FROM fact_movimientos_activos m
      JOIN dim_activos a ON m.activo_id = a.id
      LEFT JOIN dim_ubicaciones od ON m.ubicacion_destino_id = od.id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT 
        m.id,
        m.fecha_movimiento as date,
        m.motivo as reason,
        m.minio_key,
        m.estado_entrega,
        COALESCE(oo.oficina, 'Sin especificación') as origin_oficina,
        COALESCE(oo.punto_venta, 'Sin especificación') as origin_punto,
        COALESCE(od.oficina, 'Sin especificación') as destination_oficina,
        COALESCE(od.punto_venta, 'Sin especificación') as destination_punto,
        a.codigo as asset_code,
        COALESCE(a.modelo, 'Activo') as asset_name,
        u_perf.nombre_completo as performed_by_name,
        u_orig.nombre_completo as origin_assignee_name,
        u_dest.nombre_completo as destination_assignee_name,
        (
          SELECT ac.id FROM aceptaciones_activo ac
          WHERE ac.activo_id = m.activo_id AND ac.usuario_id = m.usuario_destino_id
          ORDER BY ac.creado_en DESC LIMIT 1
        ) as acceptance_id,
        (
          SELECT ac.estatus FROM aceptaciones_activo ac
          WHERE ac.activo_id = m.activo_id AND ac.usuario_id = m.usuario_destino_id
          ORDER BY ac.creado_en DESC LIMIT 1
        ) as acceptance_status,
        (
          SELECT ac.minio_key FROM aceptaciones_activo ac
          WHERE ac.activo_id = m.activo_id AND ac.usuario_id = m.usuario_destino_id
          ORDER BY ac.creado_en DESC LIMIT 1
        ) as acceptance_minio_key
      FROM fact_movimientos_activos m
      JOIN dim_activos a ON m.activo_id = a.id
      LEFT JOIN dim_ubicaciones oo ON m.ubicacion_origen_id = oo.id
      LEFT JOIN dim_ubicaciones od ON m.ubicacion_destino_id = od.id
      LEFT JOIN dim_usuarios u_perf ON m.realizado_por = u_perf.id
      LEFT JOIN dim_usuarios u_orig ON m.usuario_origen_id = u_orig.id
      LEFT JOIN dim_usuarios u_dest ON m.usuario_destino_id = u_dest.id
      ${whereClause}
      ORDER BY m.fecha_movimiento DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);

    return res.json({
      success: true,
      movements: dataResult.rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });

  } catch (err) {
    console.error('Error al obtener movimientos:', err);
    return res.status(500).json({ error: 'Error al consultar el historial de movimientos.' });
  }
}

// ─── Registrar un movimiento físico/administrativo ────────────────────────────
async function createMovement(req, res) {
  let { asset_id, asset_ids, oficina_id, punto_id, destination_assignee_id, reason, estado_entrega } = req.body;

  const idsToProcess = Array.isArray(asset_ids) ? asset_ids : (asset_id ? [parseInt(asset_id, 10)] : []);

  if (idsToProcess.length === 0 || !reason) {
    return res.status(400).json({ error: 'El o los activos y la justificación son obligatorios.' });
  }

  // RLS: Verificar que los usuarios no-admin solo puedan mover sus propios activos asignados
  if (req.user.role !== 'ADMIN') {
    const unownedRes = await db.query(
      'SELECT id FROM dim_activos WHERE id = ANY($1::int[]) AND (asignado_a IS NULL OR asignado_a != $2)',
      [idsToProcess, req.user.id]
    );
    if (unownedRes.rows.length > 0) {
      return res.status(403).json({ error: 'Acceso denegado: Solo los administradores pueden realizar traslados sobre activos no asignados a su propio usuario.' });
    }
  }

  try {
    // Si no se especifica oficina_id o punto_id, intentar inferirlos de la ubicación anclada del nuevo responsable
    if ((!oficina_id || !punto_id) && destination_assignee_id) {
      const userLocRes = await db.query(
        `SELECT a.ubicacion_id, loc.oficina, loc.punto_venta 
         FROM dim_activos a 
         JOIN dim_ubicaciones loc ON a.ubicacion_id = loc.id 
         WHERE a.asignado_a = $1 LIMIT 1`,
        [destination_assignee_id]
      );
      if (userLocRes.rows.length > 0) {
        if (!oficina_id) oficina_id = userLocRes.rows[0].ubicacion_id;
        if (!punto_id) punto_id = userLocRes.rows[0].ubicacion_id;
      } else {
        const defaultLoc = await db.query('SELECT id FROM dim_ubicaciones ORDER BY id ASC LIMIT 1');
        if (defaultLoc.rows.length > 0) {
          if (!oficina_id) oficina_id = defaultLoc.rows[0].id;
          if (!punto_id) punto_id = defaultLoc.rows[0].id;
        }
      }
    }

    // Resolver oficina_name y punto_name con consultas indexadas optimizadas
    let oficina_name = null;
    let punto_name = null;

    if (oficina_id) {
      const byId = await db.query('SELECT oficina FROM dim_ubicaciones WHERE id = $1', [oficina_id]);
      if (byId.rows.length > 0) {
        oficina_name = byId.rows[0].oficina;
      } else {
        const oficinasRes = await db.query('SELECT DISTINCT oficina FROM dim_ubicaciones ORDER BY oficina ASC');
        const targetIndex = parseInt(oficina_id, 10) - 1;
        if (oficinasRes.rows[targetIndex]) oficina_name = oficinasRes.rows[targetIndex].oficina;
      }
    }

    if (punto_id) {
      const byId = await db.query('SELECT punto_venta FROM dim_ubicaciones WHERE id = $1', [punto_id]);
      if (byId.rows.length > 0) {
        punto_name = byId.rows[0].punto_venta;
      } else {
        const puntosRes = await db.query('SELECT DISTINCT punto_venta FROM dim_ubicaciones ORDER BY punto_venta ASC');
        const targetIndex = parseInt(punto_id, 10) - 1;
        if (puntosRes.rows[targetIndex]) punto_name = puntosRes.rows[targetIndex].punto_venta;
      }
    }

    // Buscar la dimensión de ubicación destino indexada
    const destUbicacionRes = await db.query(
      `SELECT id FROM dim_ubicaciones 
       WHERE (id = $1) OR (oficina = $2 AND punto_venta = $3) 
       ORDER BY id ASC LIMIT 1`,
      [oficina_id || 0, oficina_name, punto_name]
    );
    const destinationUbicacionId = destUbicacionRes.rows.length > 0 ? destUbicacionRes.rows[0].id : (parseInt(oficina_id, 10) || 1);

    // Generar ID de tiempo
    const now = new Date();
    const tiempoId = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    const nextAssignee = destination_assignee_id ? parseInt(destination_assignee_id, 10) : null;

    await db.query('BEGIN');

    const createdMovements = [];
    const batchKey = `traslado_masivo_${Date.now()}_${Math.floor(Math.random() * 1000)}.txt`;

    for (const currentAssetId of idsToProcess) {
      const assetResult = await db.query(
        `SELECT a.id, a.asignado_a, a.estatus, a.ubicacion_id, a.estado_id
         FROM dim_activos a WHERE a.id = $1`,
        [currentAssetId]
      );

      if (assetResult.rows.length === 0) {
        throw new Error(`Activo con ID ${currentAssetId} no encontrado.`);
      }

      const asset = assetResult.rows[0];
      const originAssignee = asset.asignado_a;

      let nextStatus = asset.estatus;
      if (nextAssignee !== originAssignee) {
        nextStatus = nextAssignee ? 'Pendiente Aceptación' : 'Activo';
      }

      const insertResult = await db.query(
        `INSERT INTO fact_movimientos_activos 
           (activo_id, usuario_origen_id, usuario_destino_id, motivo, realizado_por,
            ubicacion_origen_id, ubicacion_destino_id, tiempo_movimiento_id, tipo_movimiento_id, estado_id, estatus, estado_entrega, minio_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VALIDADO', $11, $12)
         RETURNING id`,
        [
          currentAssetId,
          originAssignee,
          nextAssignee,
          reason.trim(),
          req.user.id,
          asset.ubicacion_id || null,
          destinationUbicacionId,
          tiempoId,
          2, // TRASLADO INTERNO
          asset.estado_id || 1,
          estado_entrega || 'TRASLADO',
          batchKey
        ]
      );

      const movementId = insertResult.rows[0].id;

      await db.query(
        `UPDATE dim_activos 
         SET asignado_a = $1, estatus = $2, actualizado_en = NOW(),
             ubicacion_id = $3
         WHERE id = $4`,
        [nextAssignee, nextStatus, destinationUbicacionId, currentAssetId]
      );

      if (nextAssignee && nextAssignee !== originAssignee) {
        const { firma_origen, cedula_origen, cargo_origen } = req.body;
        await db.query(
          `INSERT INTO aceptaciones_activo (activo_id, usuario_id, estatus, firma_origen, cedula_origen, cargo_origen, estado_entrega, batch_key)
           VALUES ($1, $2, 'PENDIENTE', $3, $4, $5, $6, $7)`,
          [currentAssetId, nextAssignee, firma_origen || null, cedula_origen || null, cargo_origen || null, estado_entrega || 'TRASLADO', batchKey]
        );
      }

      createdMovements.push({ movementId, currentAssetId });
    }

    await db.query('COMMIT');

    // Subir un acta única en MinIO (bucket pendientes) que asocie todos los activos del lote
    if (createdMovements.length > 0) {
      try {
        const assetsListStr = createdMovements.map(mov => `- Activo ID: ${mov.currentAssetId}`).join('\n');
        
        const actaContent = Buffer.from(
          `ACTA DE TRASLADO MASIVO\nDocumento: ${batchKey}\nMotivo: ${reason}\nEstado de Entrega: ${estado_entrega || 'TRASLADO'}\nFecha: ${new Date().toISOString()}\nRealizado por: ${req.user.id}\n\nActivos Trasladados:\n${assetsListStr}`,
          'utf-8'
        );
        
        await minioClient.putObject(BUCKET_PENDIENTES, batchKey, actaContent, actaContent.length, {
          'Content-Type': 'text/plain'
        });
      } catch (mErr) {
        console.error(`⚠️ [MinIO] No se pudo guardar el acta de traslado masivo:`, mErr.message);
      }
    }

    return res.status(201).json({ success: true, message: 'Traslado registrado y procesado exitosamente.' });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Error al realizar movimiento:', err);
    return res.status(500).json({ error: err.message || 'Error interno al registrar el movimiento del activo.' });
  }
}

// ─── Previsualizar PDF superponiendo datos sobre la plantilla FR-GA-57 de MinIO ───
async function previewPDF(req, res) {
  const {
    asset_ids,
    oficina_id,
    punto_id,
    destination_assignee_id,
    reason,
    firma_origen,
    cedula_origen,
    cargo_origen,
    estado_entrega
  } = req.body;

  const idsToProcess = Array.isArray(asset_ids) ? asset_ids : [];
  if (idsToProcess.length === 0) {
    return res.status(400).json({ error: 'Debe seleccionar al menos un activo para generar la previsualización.' });
  }

  // RLS: Verificar permisos si el usuario no es ADMIN
  if (req.user.role !== 'ADMIN') {
    const unownedRes = await db.query(
      'SELECT id FROM dim_activos WHERE id = ANY($1::int[]) AND (asignado_a IS NULL OR asignado_a != $2)',
      [idsToProcess, req.user.id]
    );
    if (unownedRes.rows.length > 0) {
      return res.status(403).json({ error: 'Acceso denegado: Solo puede previsualizar actas de activos bajo su responsabilidad.' });
    }
  }

  try {
    // 1. Consultar datos para el PDF (Activos con más detalle)
    const assetsQuery = await db.query(
      `SELECT id, codigo, COALESCE(modelo, 'Activo') as modelo, COALESCE(marca, '') as marca, COALESCE(tipo_recurso, 'AF') as tipo_recurso FROM dim_activos WHERE id = ANY($1::int[])`,
      [idsToProcess]
    );

    // Resolve oficina_name & punto_name
    let oficina_name = null;
    let punto_name = null;

    if (!oficina_id || !punto_id) {
      if (destination_assignee_id) {
        const uLoc = await db.query(
          `SELECT loc.oficina, loc.punto_venta FROM dim_activos a JOIN dim_ubicaciones loc ON a.ubicacion_id = loc.id WHERE a.asignado_a = $1 LIMIT 1`,
          [destination_assignee_id]
        );
        if (uLoc.rows.length > 0) {
          oficina_name = uLoc.rows[0].oficina;
          punto_name = uLoc.rows[0].punto_venta;
        }
      }
    }

    if (!oficina_name && oficina_id) {
      const byId = await db.query('SELECT oficina FROM dim_ubicaciones WHERE id = $1', [oficina_id]);
      if (byId.rows.length > 0) {
        oficina_name = byId.rows[0].oficina;
      } else {
        const oficinasRes = await db.query('SELECT DISTINCT oficina FROM dim_ubicaciones ORDER BY oficina ASC');
        const targetOficinaIndex = parseInt(oficina_id, 10) - 1;
        if (oficinasRes.rows[targetOficinaIndex]) oficina_name = oficinasRes.rows[targetOficinaIndex].oficina;
      }
    }

    if (!punto_name && punto_id) {
      const byId = await db.query('SELECT punto_venta FROM dim_ubicaciones WHERE id = $1', [punto_id]);
      if (byId.rows.length > 0) {
        punto_name = byId.rows[0].punto_venta;
      } else {
        const puntosRes = await db.query('SELECT DISTINCT punto_venta FROM dim_ubicaciones ORDER BY punto_venta ASC');
        const targetPuntoIndex = parseInt(punto_id, 10) - 1;
        if (puntosRes.rows[targetPuntoIndex]) punto_name = puntosRes.rows[targetPuntoIndex].punto_venta;
      }
    }

    let locationStr = 'Sede Principal';
    if (oficina_name && punto_name) {
      locationStr = `${oficina_name} / ${punto_name}`;
    } else if (oficina_name) {
      locationStr = oficina_name;
    }

    let receiverName = 'N/A';
    if (destination_assignee_id) {
      const userRes = await db.query(
        `SELECT nombre_completo FROM dim_usuarios WHERE id = $1`,
        [destination_assignee_id]
      );
      if (userRes.rows.length > 0) {
        receiverName = userRes.rows[0].nombre_completo;
      }
    }

    // 2. Construir PDF Dinámicamente usando pdf-lib desde cero
    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
    const { GANAGANA_LOGO } = require('../assets/logo-base64');
    
    const pdfDoc = await PDFDocument.create();
    const firstPage = pdfDoc.addPage([612, 792]); // Tamaño carta

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Dibujar Cabecera
    // Marco exterior de la cabecera: X: 30 a 582 (ancho 552), Y: 720 a 762 (alto 42)
    firstPage.drawRectangle({
      x: 30,
      y: 720,
      width: 552,
      height: 42,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    // Líneas divisoras verticales de la cabecera
    firstPage.drawLine({ start: { x: 170, y: 720 }, end: { x: 170, y: 762 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawLine({ start: { x: 410, y: 720 }, end: { x: 410, y: 762 }, thickness: 1, color: rgb(0, 0, 0) });

    // Estampar Logo
    if (GANAGANA_LOGO && GANAGANA_LOGO.startsWith('data:image')) {
      try {
        const logoBytes = Buffer.from(GANAGANA_LOGO.split(',')[1], 'base64');
        const logoImg = await pdfDoc.embedPng(logoBytes);
        firstPage.drawImage(logoImg, {
          x: 35,
          y: 722,
          width: 130,
          height: 38
        });
      } catch (lErr) {
        console.error('Error al insertar el logo:', lErr);
      }
    }

    // Título Central
    firstPage.drawText('FORMATO ACTA DE ENTREGA Y/O', { x: 190, y: 746, size: 9, font: helveticaBold });
    firstPage.drawText('DEVOLUCIÓN DE ACTIVOS', { x: 212, y: 732, size: 9, font: helveticaBold });

    // Cuadro derecho de metadatos
    firstPage.drawText('CÓDIGO: FR-GA-57', { x: 415, y: 750, size: 8, font: helveticaBold });
    firstPage.drawLine({ start: { x: 410, y: 744 }, end: { x: 582, y: 744 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawText('VERSIÓN: 6 Del 12/07/2023', { x: 415, y: 734, size: 7.5, font: helveticaBold });
    firstPage.drawLine({ start: { x: 410, y: 728 }, end: { x: 582, y: 728 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawText('PÁGINA: 1 de 1', { x: 415, y: 718, size: 7.5, font: helveticaBold });

    // Cuadro de Información del traslado (Y: 620 a 710)
    firstPage.drawRectangle({
      x: 30,
      y: 600,
      width: 552,
      height: 110,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    // Líneas horizontales de información
    for (let rowY = 618; rowY <= 710; rowY += 18) {
      firstPage.drawLine({ start: { x: 30, y: rowY }, end: { x: 582, y: rowY }, thickness: 1, color: rgb(0, 0, 0) });
    }

    // Líneas verticales de fecha
    firstPage.drawLine({ start: { x: 170, y: 692 }, end: { x: 170, y: 710 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawLine({ start: { x: 300, y: 692 }, end: { x: 300, y: 710 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawLine({ start: { x: 430, y: 692 }, end: { x: 430, y: 710 }, thickness: 1, color: rgb(0, 0, 0) });

    const dateObj = new Date();
    const formatter = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(dateObj);
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;

    firstPage.drawText('FECHA:', { x: 35, y: 698, size: 8, font: helveticaBold });
    firstPage.drawText(`DIA: ${day}`, { x: 175, y: 698, size: 8, font: helvetica });
    firstPage.drawText(`MES: ${month}`, { x: 305, y: 698, size: 8, font: helvetica });
    firstPage.drawText(`AÑO: ${year}`, { x: 435, y: 698, size: 8, font: helvetica });

    firstPage.drawText('QUIEN SOLICITA / ENTREGA:', { x: 35, y: 680, size: 8, font: helveticaBold });
    firstPage.drawText(`${req.user.nombre_completo || 'N/A'} (Cédula: ${cedula_origen || 'N/A'} | Cargo: ${cargo_origen || 'N/A'})`, { x: 175, y: 680, size: 7.5, font: helvetica });

    firstPage.drawText('QUIEN RECIBE:', { x: 35, y: 662, size: 8, font: helveticaBold });
    firstPage.drawText(receiverName, { x: 175, y: 662, size: 8, font: helvetica });

    firstPage.drawText('PROCESO QUE RECIBE:', { x: 35, y: 644, size: 8, font: helveticaBold });
    firstPage.drawText(locationStr, { x: 175, y: 644, size: 8, font: helvetica });

    firstPage.drawText('ESTADO ENTREGA DE ACTIVO:', { x: 35, y: 608, size: 8, font: helveticaBold });
    const est = String(estado_entrega || 'TRASLADO').toUpperCase();
    firstPage.drawText(`NUEVO: [ ${est === 'NUEVO' ? 'X' : ' '} ]`, { x: 175, y: 608, size: 7.5, font: helvetica });
    firstPage.drawText(`REPARACIÓN: [ ${est === 'REPARACIÓN' || est === 'REPARACION' ? 'X' : ' '} ]`, { x: 250, y: 608, size: 7.5, font: helvetica });
    firstPage.drawText(`TRASLADO: [ ${est === 'TRASLADO' ? 'X' : ' '} ]`, { x: 360, y: 608, size: 7.5, font: helvetica });
    firstPage.drawText(`RETIRO: [ ${est === 'RETIRO' ? 'X' : ' '} ]`, { x: 440, y: 608, size: 7.5, font: helvetica });
    firstPage.drawText(`VACACIONES: [ ${est === 'VACACIONES' ? 'X' : ' '} ]`, { x: 500, y: 608, size: 7.5, font: helvetica });

    // HAGO CONSTAR
    firstPage.drawText('HAGO CONSTAR', { x: 260, y: 575, size: 10, font: helveticaBold });
    firstPage.drawText('Que he recibido de Gana Gana / Red Multiservicios los siguientes artículos:', { x: 30, y: 555, size: 8.5, font: helvetica });

    // TABLA DE ARTÍCULOS - Dibujado dinámico
    let currentY = 510;
    const numRows = Math.min(7, Math.max(1, assetsQuery.rows.length));
    const rowHeight = 20;
    const tableHeight = (numRows + 1) * rowHeight; // header + rows

    // Rectángulo contenedor de la tabla
    firstPage.drawRectangle({
      x: 30,
      y: currentY + 20 - tableHeight,
      width: 552,
      height: tableHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    // Líneas horizontales de la tabla
    for (let i = 0; i <= numRows; i++) {
      const lineY = currentY + 20 - (i * rowHeight);
      firstPage.drawLine({ start: { x: 30, y: lineY }, end: { x: 582, y: lineY }, thickness: 1, color: rgb(0, 0, 0) });
    }

    // Líneas verticales de columnas
    // Columnas: TIPO (120) | NOMBRE (250) | PLACA (330) | MARCA (440) | ESTADO (490) | OBS (582)
    firstPage.drawLine({ start: { x: 120, y: currentY + 20 - tableHeight }, end: { x: 120, y: currentY + 20 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawLine({ start: { x: 250, y: currentY + 20 - tableHeight }, end: { x: 250, y: currentY + 20 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawLine({ start: { x: 330, y: currentY + 20 - tableHeight }, end: { x: 330, y: currentY + 20 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawLine({ start: { x: 440, y: currentY + 20 - tableHeight }, end: { x: 440, y: currentY + 20 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawLine({ start: { x: 490, y: currentY + 20 - tableHeight }, end: { x: 490, y: currentY + 20 }, thickness: 1, color: rgb(0, 0, 0) });

    // Cabecera Tabla
    firstPage.drawText('TIPO ACTIVO', { x: 34, y: currentY + 6, size: 6.5, font: helveticaBold });
    firstPage.drawText('NOMBRE DE ACTIVO', { x: 130, y: currentY + 6, size: 6.5, font: helveticaBold });
    firstPage.drawText('ID PLACA ACTIVO', { x: 258, y: currentY + 6, size: 6.5, font: helveticaBold });
    firstPage.drawText('MARCA / MODELO', { x: 338, y: currentY + 6, size: 6.5, font: helveticaBold });
    firstPage.drawText('ESTADO (B/R/D)', { x: 442, y: currentY + 6, size: 6.0, font: helveticaBold });
    firstPage.drawText('OBSERVACIONES', { x: 494, y: currentY + 6, size: 6.5, font: helveticaBold });

    // Filas Tabla
    if (assetsQuery.rows.length === 0) {
      const rowY = currentY - 14;
      firstPage.drawText('-', { x: 34, y: rowY, size: 7, font: helvetica });
      firstPage.drawText('No hay activos seleccionados', { x: 125, y: rowY, size: 7, font: helvetica });
      firstPage.drawText('-', { x: 255, y: rowY, size: 7, font: helvetica });
      firstPage.drawText('-', { x: 335, y: rowY, size: 7, font: helvetica });
      firstPage.drawText('-', { x: 460, y: rowY, size: 7, font: helvetica });
      firstPage.drawText('-', { x: 494, y: rowY, size: 6.5, font: helvetica });
    } else {
      assetsQuery.rows.forEach((asset, idx) => {
        if (idx < 7) {
          const rowY = currentY - 14 - (idx * rowHeight);
          const tipoStr = (asset.tipo_recurso || 'AF').substring(0, 2).toUpperCase() === 'AC' ? 'AC' : 'AF';
          firstPage.drawText(tipoStr, { x: 34, y: rowY, size: 7, font: helvetica });
          firstPage.drawText((asset.modelo || 'Activo').substring(0, 32), { x: 125, y: rowY, size: 7, font: helvetica });
          firstPage.drawText(asset.codigo || 'N/A', { x: 255, y: rowY, size: 7, font: helvetica });
          firstPage.drawText((asset.marca || '').substring(0, 20), { x: 335, y: rowY, size: 7, font: helvetica });
          firstPage.drawText('B', { x: 460, y: rowY, size: 7, font: helveticaBold }); // Bueno por defecto
          firstPage.drawText((reason || 'Traslado registrado').substring(0, 22), { x: 494, y: rowY, size: 6.5, font: helvetica });
        }
      });
    }

    // Leyenda de estados
    const legendY = currentY + 20 - tableHeight - 10;
    firstPage.drawText('B: Bueno       R: Regular       D: Dañado', { x: 30, y: legendY, size: 7.5, font: helveticaBold });

    // Actualizar currentY para colocar el cuadro Clausula Compromiso
    currentY = currentY + 20 - tableHeight - 25; // 25px abajo del final de la tabla

    // Cuadro Clausula Compromiso (INDICO QUE)
    currentY -= 55;
    firstPage.drawRectangle({
      x: 30,
      y: currentY,
      width: 552,
      height: 55,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    firstPage.drawText('INDICO QUÉ', { x: 275, y: currentY + 46, size: 8, font: helveticaBold });
    
    const disclaimer1 = "Recibo los activos y/o inventarios relacionados en la presenta acta y sus anexos los cuales estarán bajo mi responsabilidad, les daré el uso y trato adecuado al desempeño de mis funciones y la destinación prevista para cada uno de ellos. Me comprometo a informar oportunamente al área de activos fijos sobre cualquier desplazamiento, siniestro, reparación, traslado, cambio de responsables, por medio de los formatos respectivos.";
    const disclaimer2 = "En caso de existir faltantes al momento de hacer la entrega del paz y salvo de los Activos Fijos que están bajo mi responsabilidad, y que firmé en señal de aceptación se adelantarán las disposiciones que dicté el Reglamento Interno de Trabajo.";
    
    firstPage.drawText(disclaimer1.substring(0, 142), { x: 35, y: currentY + 34, size: 6.2, font: helvetica });
    firstPage.drawText(disclaimer1.substring(142, 280), { x: 35, y: currentY + 25, size: 6.2, font: helvetica });
    firstPage.drawText(disclaimer1.substring(280), { x: 35, y: currentY + 16, size: 6.2, font: helvetica });
    firstPage.drawText(disclaimer2.substring(0, 140), { x: 35, y: currentY + 7, size: 6.2, font: helvetica });

    // Firmas
    currentY -= 45;
    firstPage.drawRectangle({ x: 30, y: currentY, width: 260, height: 35, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    firstPage.drawRectangle({ x: 322, y: currentY, width: 260, height: 35, borderColor: rgb(0, 0, 0), borderWidth: 1 });

    firstPage.drawText('FIRMA DE QUIEN ENTREGA', { x: 35, y: currentY + 8, size: 7, font: helveticaBold });
    firstPage.drawText('N° CÉDULA: ________________', { x: 35, y: currentY + 1, size: 7, font: helvetica });

    firstPage.drawText('FIRMA DE QUIEN RECIBE', { x: 327, y: currentY + 8, size: 7, font: helveticaBold });
    firstPage.drawText('N° CÉDULA: ________________', { x: 327, y: currentY + 1, size: 7, font: helvetica });

    // Firma de origen estampada si existe
    if (firma_origen && firma_origen.startsWith('data:image')) {
      try {
        const signatureBytes = Buffer.from(firma_origen.split(',')[1], 'base64');
        const signatureImg = await pdfDoc.embedPng(signatureBytes);
        firstPage.drawImage(signatureImg, {
          x: 140,
          y: currentY + 12,
          width: 80,
          height: 20
        });
      } catch (sigErr) {
        console.error('Error al insertar firma:', sigErr);
      }
    }

    const finalPdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview_FR-GA-57.pdf"');
    return res.send(Buffer.from(finalPdfBytes));

  } catch (err) {
    console.error('Error al generar previsualización del PDF oficial:', err);
    return res.status(500).json({ error: 'No se pudo generar la previsualización del PDF oficial.' });
  }
}

module.exports = {
  getMovements,
  createMovement,
  previewPDF
};
