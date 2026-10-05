const db = require('../config/db');
const { minioClient, BUCKET_DOCUMENTOS } = require('../config/minio');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const { GANAGANA_LOGO } = require('../assets/logo-base64');

// Función auxiliar para generar el PDF Oficial del Acta de Baja (FR-GA-57)
async function generateActaBajaPDF({ admin, assets, observaciones, firmaBase64 }) {
  try {
    const pdfDoc = await PDFDocument.create();
    const firstPage = pdfDoc.addPage([612, 792]); // Tamaño Carta (puntos)

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 1. Dibujar Cabecera FR-GA-57
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

    // Estampar Logo Corporativo
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
    firstPage.drawText('FORMATO ACTA DE ENTREGA Y/O', { x: 190, y: 746, size: 9, font: fontBold });
    firstPage.drawText('DEVOLUCIÓN DE ACTIVOS', { x: 212, y: 732, size: 9, font: fontBold });

    // Cuadro derecho de metadatos
    firstPage.drawText('CÓDIGO: FR-GA-57', { x: 415, y: 750, size: 8, font: fontBold });
    firstPage.drawLine({ start: { x: 410, y: 744 }, end: { x: 582, y: 744 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawText('VERSIÓN: 6 Del 12/07/2023', { x: 415, y: 734, size: 7.5, font: fontBold });
    firstPage.drawLine({ start: { x: 410, y: 728 }, end: { x: 582, y: 728 }, thickness: 1, color: rgb(0, 0, 0) });
    firstPage.drawText('PÁGINA: 1 de 1', { x: 415, y: 718, size: 7.5, font: fontBold });

    // 2. Cuadro de Información del Retiro / Baja (Y: 600 a 710)
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
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';

    firstPage.drawText('FECHA:', { x: 35, y: 698, size: 8, font: fontBold });
    firstPage.drawText(`DIA: ${day}`, { x: 175, y: 698, size: 8, font: fontRegular });
    firstPage.drawText(`MES: ${month}`, { x: 305, y: 698, size: 8, font: fontRegular });
    firstPage.drawText(`AÑO: ${year}`, { x: 435, y: 698, size: 8, font: fontRegular });

    firstPage.drawText('QUIEN SOLICITA / ENTREGA:', { x: 35, y: 680, size: 8, font: fontBold });
    firstPage.drawText(`${admin.nombre_completo || 'Administrador'} (Cédula: ${admin.cedula || 'N/A'} | Cargo: ${admin.cargo || 'Administrador'})`, { x: 175, y: 680, size: 7.5, font: fontRegular });

    // Determinar nombre del responsable
    const uniqueResponsables = Array.from(new Set(assets.map(a => a.assignee_name).filter(Boolean)));
    const receiverNameStr = uniqueResponsables.length > 0 
      ? uniqueResponsables.join(', ')
      : 'GESTIÓN DE ACTIVOS / BAJA DEFINITIVA';

    firstPage.drawText('QUIEN RECIBE:', { x: 35, y: 662, size: 8, font: fontBold });
    firstPage.drawText(receiverNameStr.substring(0, 65), { x: 175, y: 662, size: 8, font: fontRegular });

    firstPage.drawText('PROCESO QUE RECIBE:', { x: 35, y: 644, size: 8, font: fontBold });
    firstPage.drawText('GESTIÓN Y RETIRO DEFINITIVO DE ACTIVOS', { x: 175, y: 644, size: 8, font: fontRegular });

    firstPage.drawText('ESTADO ENTREGA DE ACTIVO:', { x: 35, y: 608, size: 8, font: fontBold });
    firstPage.drawText('NUEVO: [   ]', { x: 175, y: 608, size: 7.5, font: fontRegular });
    firstPage.drawText('REPARACIÓN: [   ]', { x: 250, y: 608, size: 7.5, font: fontRegular });
    firstPage.drawText('TRASLADO: [   ]', { x: 360, y: 608, size: 7.5, font: fontRegular });
    firstPage.drawText('RETIRO: [ X ]', { x: 440, y: 608, size: 7.5, font: fontBold, color: rgb(0.8, 0, 0) });
    firstPage.drawText('VACACIONES: [   ]', { x: 500, y: 608, size: 7.5, font: fontRegular });

    // 3. HAGO CONSTAR
    firstPage.drawText('HAGO CONSTAR', { x: 260, y: 575, size: 10, font: fontBold });
    firstPage.drawText('Que se retiran y dan de baja definitivamente de Gana Gana / Red Multiservicios los siguientes artículos:', { x: 30, y: 555, size: 8.5, font: fontRegular });

    // 4. TABLA DE ARTÍCULOS DADOS DE BAJA
    let currentY = 510;
    const numRows = Math.min(7, Math.max(1, assets.length));
    const rowHeight = 20;
    const tableHeight = (numRows + 1) * rowHeight;

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
    firstPage.drawText('TIPO ACTIVO', { x: 34, y: currentY + 6, size: 6.5, font: fontBold });
    firstPage.drawText('NOMBRE DE ACTIVO', { x: 130, y: currentY + 6, size: 6.5, font: fontBold });
    firstPage.drawText('ID PLACA ACTIVO', { x: 258, y: currentY + 6, size: 6.5, font: fontBold });
    firstPage.drawText('MARCA / MODELO', { x: 338, y: currentY + 6, size: 6.5, font: fontBold });
    firstPage.drawText('ESTADO (B/R/D)', { x: 442, y: currentY + 6, size: 6.0, font: fontBold });
    firstPage.drawText('OBSERVACIONES', { x: 494, y: currentY + 6, size: 6.5, font: fontBold });

    // Filas Tabla
    assets.forEach((asset, idx) => {
      if (idx < 7) {
        const rowY = currentY - 14 - (idx * rowHeight);
        const tipoStr = (asset.tipo_recurso || 'AF').substring(0, 2).toUpperCase() === 'AC' ? 'AC' : 'AF';
        firstPage.drawText(tipoStr, { x: 34, y: rowY, size: 7, font: fontRegular });
        firstPage.drawText((asset.modelo || asset.nombre || 'Activo').substring(0, 32), { x: 125, y: rowY, size: 7, font: fontRegular });
        firstPage.drawText(asset.codigo || 'N/A', { x: 255, y: rowY, size: 7, font: fontRegular });
        firstPage.drawText(`${(asset.marca || '').substring(0, 12)} / ${(asset.serial || '').substring(0, 10)}`, { x: 335, y: rowY, size: 7, font: fontRegular });
        firstPage.drawText('D', { x: 460, y: rowY, size: 7, font: fontBold, color: rgb(0.8, 0, 0) }); // D: Dañado / Baja
        firstPage.drawText((observaciones || 'Dar de baja').substring(0, 22), { x: 494, y: rowY, size: 6.5, font: fontRegular });
      }
    });

    // Leyenda de estados
    const legendY = currentY + 20 - tableHeight - 10;
    firstPage.drawText('B: Bueno       R: Regular       D: Dañado / Baja Definitiva', { x: 30, y: legendY, size: 7.5, font: fontBold });

    // 5. Cuadro Cláusula Compromiso (INDICO QUÉ)
    currentY = currentY + 20 - tableHeight - 25;
    currentY -= 55;

    firstPage.drawRectangle({
      x: 30,
      y: currentY,
      width: 552,
      height: 55,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    firstPage.drawText('INDICO QUÉ', { x: 275, y: currentY + 46, size: 8, font: fontBold });
    
    const disclaimer1 = "Se procesa el retiro y baja definitiva del activo fijo de los inventarios corporativos. El administrador autorizante y el responsable verificado dan constancia de la salida y desvinculación operativa del bien bajo las políticas vigentes de Gestión de Activos Fijos.";
    const disclaimer2 = "Cualquier disposición posterior del bien se sujetará a los procedimientos de chatarrización, donación o disposición final autorizados por la compañía.";
    
    firstPage.drawText(disclaimer1.substring(0, 142), { x: 35, y: currentY + 34, size: 6.2, font: fontRegular });
    firstPage.drawText(disclaimer1.substring(142, 280), { x: 35, y: currentY + 25, size: 6.2, font: fontRegular });
    firstPage.drawText(disclaimer1.substring(280), { x: 35, y: currentY + 16, size: 6.2, font: fontRegular });
    firstPage.drawText(disclaimer2.substring(0, 140), { x: 35, y: currentY + 7, size: 6.2, font: fontRegular });

    // 6. Firmas
    currentY -= 45;
    firstPage.drawRectangle({ x: 30, y: currentY, width: 260, height: 35, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    firstPage.drawRectangle({ x: 322, y: currentY, width: 260, height: 35, borderColor: rgb(0, 0, 0), borderWidth: 1 });

    firstPage.drawText('FIRMA DE QUIEN AUTORIZA (ADMIN)', { x: 35, y: currentY + 24, size: 7, font: fontBold });
    firstPage.drawText(`NOMBRE: ${(admin.nombre_completo || 'ADMINISTRADOR').substring(0, 30)}`, { x: 35, y: currentY + 12, size: 6.5, font: fontRegular });
    firstPage.drawText(`N° CÉDULA: ${admin.cedula || 'N/A'}`, { x: 35, y: currentY + 3, size: 6.5, font: fontRegular });

    const firstAssignee = assets[0]?.assignee_name || 'GESTIÓN DE ACTIVOS';
    const firstCedula = assets[0]?.assignee_cedula || 'N/A';

    firstPage.drawText('FIRMA / REGISTRO DE QUIEN DÉ DE BAJA', { x: 327, y: currentY + 24, size: 7, font: fontBold });
    firstPage.drawText(`RESPONSABLE: ${firstAssignee.substring(0, 30)}`, { x: 327, y: currentY + 12, size: 6.5, font: fontRegular });
    firstPage.drawText(`N° CÉDULA: ${firstCedula}`, { x: 327, y: currentY + 3, size: 6.5, font: fontRegular });

    // Estampar Firma Digital del Admin si se proporcionó
    if (firmaBase64 && firmaBase64.startsWith('data:image')) {
      try {
        const base64Data = firmaBase64.includes(',') ? firmaBase64.split(',')[1] : firmaBase64;
        const imgBuffer = Buffer.from(base64Data, 'base64');
        let image;
        if (firmaBase64.includes('image/png')) {
          image = await pdfDoc.embedPng(imgBuffer);
        } else {
          image = await pdfDoc.embedJpg(imgBuffer);
        }
        firstPage.drawImage(image, { x: 170, y: currentY + 4, width: 110, height: 28 });
      } catch (imgErr) {
        console.error('Error insertando firma en PDF:', imgErr);
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (err) {
    console.error('Error al generar PDF del acta de baja:', err);
    throw err;
  }
}

// Listar todas las bajas de activos (Solo ADMIN)
async function getBajas(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let baseQuery = `
      SELECT 
        b.id,
        b.activo_id,
        b.motivo,
        b.observaciones,
        b.documento_baja_url,
        b.fecha_baja,
        b.registrado_por,
        a.codigo as activo_codigo,
        a.modelo as activo_nombre,
        a.serial as activo_serial,
        a.psl as activo_psl,
        a.tipo_recurso as activo_tipo_recurso,
        a.marca as activo_marca,
        a.empresa as activo_empresa,
        u.username as registrado_por_username,
        u.nombre_completo as registrado_por_nombre,
        u_resp.nombre_completo as responsable_nombre,
        u_resp.cedula as responsable_cedula
      FROM bajas_activo b
      JOIN dim_activos a ON b.activo_id = a.id
      LEFT JOIN dim_usuarios u ON b.registrado_por = u.id
      LEFT JOIN dim_usuarios u_resp ON a.asignado_a = u_resp.id
      WHERE 1=1
    `;

    const params = [];
    if (search && search.trim()) {
      params.push(`%${search.trim().toUpperCase()}%`);
      baseQuery += ` AND (
        UPPER(a.codigo) LIKE $${params.length} OR 
        UPPER(a.modelo) LIKE $${params.length} OR 
        UPPER(a.serial) LIKE $${params.length} OR 
        UPPER(b.motivo) LIKE $${params.length} OR 
        UPPER(u.nombre_completo) LIKE $${params.length} OR
        UPPER(u_resp.nombre_completo) LIKE $${params.length} OR
        UPPER(u_resp.cedula) LIKE $${params.length}
      )`;
    }

    const countQuery = `SELECT COUNT(*) FROM (${baseQuery}) sub`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    baseQuery += ` ORDER BY b.fecha_baja DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const result = await db.query(baseQuery, params);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('Error al obtener la lista de bajas:', err);
    return res.status(500).json({ error: 'Error al consultar las bajas de activos.' });
  }
}

// Obtener detalle de una baja por ID
async function getBajaById(req, res) {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT 
        b.id,
        b.activo_id,
        b.motivo,
        b.observaciones,
        b.documento_baja_url,
        b.fecha_baja,
        b.registrado_por,
        a.codigo as activo_codigo,
        a.modelo as activo_nombre,
        a.serial as activo_serial,
        a.psl as activo_psl,
        a.valor_inicial as activo_valor_inicial,
        a.tipo_recurso as activo_tipo_recurso,
        a.marca as activo_marca,
        a.empresa as activo_empresa,
        u.username as registrado_por_username,
        u.nombre_completo as registrado_por_nombre,
        u_resp.nombre_completo as responsable_nombre,
        u_resp.cedula as responsable_cedula
      FROM bajas_activo b
      JOIN dim_activos a ON b.activo_id = a.id
      LEFT JOIN dim_usuarios u ON b.registrado_por = u.id
      LEFT JOIN dim_usuarios u_resp ON a.asignado_a = u_resp.id
      WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Registro de baja no encontrado.' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al obtener el detalle de la baja:', err);
    return res.status(500).json({ error: 'Error al consultar la baja.' });
  }
}

// Registrar baja de activo con generación automática de PDF y Firma del Admin (Individual y Masiva)
async function createBaja(req, res) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso denegado: Solo el Administrador puede dar de baja activos.' });
  }

  const { activo_id, activo_ids, observaciones, firma_admin, motivo: reqMotivo, motivo_baja } = req.body;
  const motivo = (reqMotivo || motivo_baja || 'Dar de baja').trim();

  let idsToProcess = [];
  if (Array.isArray(activo_ids) && activo_ids.length > 0) {
    idsToProcess = activo_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  } else if (activo_id) {
    const singleId = parseInt(activo_id, 10);
    if (!isNaN(singleId)) idsToProcess.push(singleId);
  }

  if (idsToProcess.length === 0) {
    return res.status(400).json({ error: 'Debe seleccionar al menos un activo para dar de baja.' });
  }

  if (!firma_admin || !firma_admin.trim()) {
    return res.status(400).json({ error: 'La firma digital del administrador es obligatoria para respaldar el acta de baja.' });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    // 1. Obtener información del Administrador que autoriza la baja
    const adminRes = await client.query(
      'SELECT id, nombre_completo, cedula, cargo FROM dim_usuarios WHERE id = $1',
      [req.user.id]
    );
    const adminInfo = adminRes.rows[0] || { nombre_completo: req.user.username, cedula: 'N/A', cargo: 'ADMINISTRADOR' };

    // 2. Obtener información detallada de los activos a procesar
    const assetsRes = await client.query(
      `SELECT 
        a.id, a.codigo, a.modelo, a.serial, a.psl, a.marca, a.empresa, a.estatus, a.asignado_a,
        u.nombre_completo as assignee_name, u.cedula as assignee_cedula
       FROM dim_activos a
       LEFT JOIN dim_usuarios u ON a.asignado_a = u.id
       WHERE a.id = ANY($1::int[])`,
      [idsToProcess]
    );

    if (assetsRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No se encontraron los activos seleccionados.' });
    }

    const assetsToBaja = assetsRes.rows;
    const alreadyBaja = assetsToBaja.filter(a => a.estatus === 'DADO DE BAJA');

    if (alreadyBaja.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `El activo ${alreadyBaja[0].codigo} ya fue dado de baja anteriormente.` 
      });
    }

    // 3. Generar el PDF Oficial del Acta de Baja automáticamente con pdf-lib
    const pdfBuffer = await generateActaBajaPDF({
      admin: adminInfo,
      assets: assetsToBaja,
      observaciones: observaciones ? observaciones.trim() : null,
      firmaBase64: firma_admin,
      motivo
    });

    // 4. Guardar el PDF generado directamente en MinIO
    const pdfFileName = `acta_baja_${Date.now()}.pdf`;
    await minioClient.putObject(
      BUCKET_DOCUMENTOS,
      pdfFileName,
      pdfBuffer,
      pdfBuffer.length,
      { 'Content-Type': 'application/pdf' }
    );

    const documento_baja_url = `/api/assets/documents/${pdfFileName}`;

    // 5. Registrar cada baja y actualizar estado + notificaciones
    const createdBajas = [];
    for (const asset of assetsToBaja) {
      const bajaRes = await client.query(
        `INSERT INTO bajas_activo (activo_id, motivo, observaciones, documento_baja_url, registrado_por)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [asset.id, motivo, observaciones ? observaciones.trim() : null, documento_baja_url, req.user.id]
      );
      createdBajas.push(bajaRes.rows[0]);

      // Cambiar estatus a DADO DE BAJA
      await client.query(
        "UPDATE dim_activos SET estatus = 'DADO DE BAJA', actualizado_en = CURRENT_TIMESTAMP WHERE id = $1",
        [asset.id]
      );

      // Notificar en la campana al usuario asignado si el activo estaba asignado a alguien
      if (asset.asignado_a) {
        const notifMsg = `Se ha procesado la baja de su activo asignado ${asset.codigo} (${asset.modelo || 'Activo'}).`;
        await client.query(
          `INSERT INTO notificaciones_alertas (tipo, usuario_id, mensaje, cantidad_activos, estatus, creado_en, actualizado_en)
           VALUES ('BAJA_ACTIVO', $1, $2, 1, 'PENDIENTE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [asset.asignado_a, notifMsg]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: `Se dio de baja correctamente ${createdBajas.length} activo(s). El Acta Oficial en PDF fue generada y firmada digitalmente.`,
      documento_url: documento_baja_url,
      count: createdBajas.length,
      data: createdBajas
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al registrar la baja de activos:', err);
    return res.status(500).json({ error: 'Error interno al procesar la baja de los activos: ' + err.message });
  } finally {
    if (client) client.release();
  }
}

// Marcar notificación de baja como leída / resuelta por el usuario asignado
async function markNotificationAsRead(req, res) {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE notificaciones_alertas 
       SET estatus = 'RESUELTO', actualizado_en = CURRENT_TIMESTAMP 
       WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, req.user.id]
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

module.exports = {
  getBajas,
  getBajaById,
  createBaja,
  markNotificationAsRead
};
