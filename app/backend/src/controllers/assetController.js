const db = require('../config/db');

// Auxiliar para determinar grupo de depreciación
function determinarDepreciacion(tipoRecurso) {
  const tr = (tipoRecurso || '').toUpperCase();
  if (tr.includes('PORTATIL') || tr.includes('COMPUTADOR') || tr.includes('TODO EN UNO') || 
      tr.includes('SERVIDOR') || tr.includes('IMPRESORA') || tr.includes('PANTALLA') || 
      tr.includes('TECLADO') || tr.includes('MOUSE') || tr.includes('SWITCH') || tr.includes('ROUTER')) {
    return { grupo: 'Equipo de Cómputo y Comunicación', meses: 60 };
  }
  if (tr.includes('VEHICULO') || tr.includes('MOTO') || tr.includes('CARRO') || tr.includes('CAMIONETA')) {
    return { grupo: 'Flota y Equipo de Transporte', meses: 60 };
  }
  if (tr.includes('MAQUINARIA') || tr.includes('PLANTA') || tr.includes('GENERADOR') || tr.includes('HERRAMIENTA')) {
    return { grupo: 'Maquinaria y Equipo', meses: 120 };
  }
  if (tr.includes('SILLA') || tr.includes('ESCRITORIO') || tr.includes('MESA') || 
      tr.includes('ARCHIVADOR') || tr.includes('MUEBLE') || tr.includes('LOCKER')) {
    return { grupo: 'Muebles y Enseres', meses: 84 };
  }
  if (tr.includes('CAMARA') || tr.includes('DVR') || tr.includes('ALARMA') || tr.includes('EXTINTOR') || tr.includes('SEGURIDAD')) {
    return { grupo: 'Implementos de Seguridad', meses: 60 };
  }
  return { grupo: 'Equipo de Cómputo y Comunicación', meses: 60 };
}

// Obtener inventario de activos con filtros y paginación opcionales
async function getAssets(req, res) {
  const { category, status, search, all, cedula, clasificacion } = req.query;
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  let whereClause = ' WHERE 1=1';
  const queryParams = [];
  let paramIndex = 1;

  // RLS: Limit VIEWER / standard users to only view their assigned assets (ADMIN and OPERATOR view all)
  const userRole = (req.user?.role || '').toUpperCase();
  if (userRole !== 'ADMIN' && userRole !== 'OPERATOR') {
    whereClause += ` AND a.asignado_a = $${paramIndex}`;
    queryParams.push(req.user.id);
    paramIndex++;
  }

  if (category && !isNaN(parseInt(category, 10))) {
    whereClause += ` AND tr.id = $${paramIndex}`;
    queryParams.push(parseInt(category, 10));
    paramIndex++;
  }

  if (status) {
    const parsedStatus = parseInt(status, 10);
    if (!isNaN(parsedStatus)) {
      whereClause += ` AND a.estado_id = $${paramIndex}`;
      queryParams.push(parsedStatus);
    } else {
      whereClause += ` AND a.estatus ILIKE $${paramIndex}`;
      queryParams.push(status);
    }
    paramIndex++;
  }

  if (clasificacion) {
    whereClause += ` AND a.clasificacion ILIKE $${paramIndex}`;
    queryParams.push(`%${clasificacion.trim()}%`);
    paramIndex++;
  }

  if (cedula) {
    whereClause += ` AND u.cedula ILIKE $${paramIndex}`;
    queryParams.push(`%${cedula.trim()}%`);
    paramIndex++;
  }

  if (search) {
    whereClause += ` AND (a.modelo ILIKE $${paramIndex} OR a.codigo ILIKE $${paramIndex} OR ar.area ILIKE $${paramIndex} OR u.cedula ILIKE $${paramIndex} OR u.nombre_completo ILIKE $${paramIndex})`;
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  try {
    if (all === 'true') {
      let query = `SELECT a.id, a.codigo as code, COALESCE(a.modelo, 'Activo') as name, COALESCE(ar.area, 'Sede Principal') as location, a.asignado_a as assigned_to
                   FROM dim_activos a LEFT JOIN dim_ubicaciones ar ON a.ubicacion_id = ar.id`;
      const params = [];
      if (userRole !== 'ADMIN' && userRole !== 'OPERATOR') {
        query += ` WHERE a.asignado_a = $1`;
        params.push(req.user.id);
      }
      query += ` ORDER BY a.codigo ASC LIMIT 500`;
      const allResult = await db.query(query, params);
      return res.json({ success: true, assets: allResult.rows });
    }

    const categoryFiltered = category && !isNaN(parseInt(category, 10));
    const tiposRecursoJoin = `LEFT JOIN tipos_recurso tr ON (
      UPPER(a.tipo_recurso) = UPPER(tr.nombre) 
      OR UPPER(a.grupo_homogeneo) = UPPER(tr.nombre)
    )`;

    // Contar total de registros para paginación
    const countQuery = `
      SELECT COUNT(*) 
      FROM view_activos_depreciacion a 
      LEFT JOIN dim_usuarios u ON a.asignado_a = u.id
      LEFT JOIN dim_ubicaciones ar ON a.ubicacion_id = ar.id
      ${categoryFiltered ? tiposRecursoJoin : ''}
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Obtener la página solicitada
    const dataQuery = `
      SELECT 
        a.id,
        a.codigo as code,
        COALESCE(a.modelo, a.tipo_recurso, 'Activo') as name,
        CONCAT_WS(' | ', a.marca, CASE WHEN a.serial IS NOT NULL AND a.serial != '' THEN 'Serial: ' || a.serial END, CASE WHEN a.psl IS NOT NULL AND a.psl != '' THEN 'PSL: ' || a.psl END) as description,
        COALESCE(a.tipo_recurso, 'Hardware') as category,
        a.estatus as status,
        COALESCE(a.clasificacion, 'Activo Fijo (AF)') as clasificacion,
        COALESCE(ar.area, 'Sede Principal') as location,
        COALESCE(a.valor_inicial, 0.00) as value,
        a.fecha_compra as purchase_date,
        a.asignado_a as assigned_to,
        a.foto_url,
        tr.id as tipo_recurso_id,
        m.id as marca_id,
        a.estado_id,
        ar.id as area_id,
        a.serial,
        a.psl,
        a.marca,
        a.empresa,
        u.nombre_completo as assignee_name,
        u.cedula as assignee_cedula,
        u.cargo as assignee_cargo,
        u.email as assignee_email,
        
        -- Datos de depreciación agregados
        a.valor_libros as book_value,
        a.depreciacion_acumulada as accumulated_depreciation,
        a.depreciacion_mensual as monthly_depreciation,
        a.meses_transcurridos,
        a.grupo_homogeneo,
        
        -- Datos de proveedor y contabilidad
        a.proveedor,
        a.nit_proveedor,
        a.codigo_contable,
        a.factura_url
      FROM view_activos_depreciacion a 
      LEFT JOIN dim_usuarios u ON a.asignado_a = u.id
      LEFT JOIN dim_ubicaciones ar ON a.ubicacion_id = ar.id
      ${tiposRecursoJoin}
      LEFT JOIN marcas m ON UPPER(a.marca) = UPPER(m.nombre)
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);

    return res.json({
      success: true,
      assets: dataResult.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('Error al obtener activos:', err);
    return res.status(500).json({ error: 'Error al obtener la lista de activos: ' + err.message });
  }
}

// Obtener un activo específico por ID
async function getAssetById(req, res) {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT 
        a.id,
        a.codigo as code,
        COALESCE(a.modelo, a.tipo_recurso, 'Activo') as name,
        CONCAT_WS(' | ', a.marca, CASE WHEN a.serial IS NOT NULL AND a.serial != '' THEN 'Serial: ' || a.serial END, CASE WHEN a.psl IS NOT NULL AND a.psl != '' THEN 'PSL: ' || a.psl END) as description,
        COALESCE(a.tipo_recurso, 'Hardware') as category,
        a.estatus as status,
        COALESCE(a.clasificacion, 'Activo Fijo (AF)') as clasificacion,
        COALESCE(ar.area, 'Sede Principal') as location,
        COALESCE(a.valor_inicial, 0.00) as value,
        COALESCE(a.valor_residual, 0.00) as valor_residual,
        a.fecha_compra as purchase_date,
        a.asignado_a as assigned_to,
        a.foto_url,
        tr.id as tipo_recurso_id,
        m.id as marca_id,
        a.estado_id,
        ar.id as area_id,
        a.serial,
        a.psl,
        a.marca,
        a.empresa,
        u.nombre_completo as assignee_name,
        u.username as assignee_username,
        u.cedula as assignee_cedula,
        u.cargo as assignee_cargo,
        u.email as assignee_email,
        
        -- Datos de depreciación agregados
        a.valor_libros as book_value,
        a.depreciacion_acumulada as accumulated_depreciation,
        a.depreciacion_mensual as monthly_depreciation,
        a.meses_transcurridos,
        a.grupo_homogeneo,
        a.vida_util_meses,
        
        -- Datos de proveedor y contabilidad
        a.proveedor,
        a.nit_proveedor,
        a.codigo_contable,
        a.factura_url
        FROM view_activos_depreciacion a 
        LEFT JOIN dim_usuarios u ON a.asignado_a = u.id
        LEFT JOIN dim_ubicaciones ar ON a.ubicacion_id = ar.id
        LEFT JOIN tipos_recurso tr ON UPPER(a.tipo_recurso) = UPPER(tr.nombre)
        LEFT JOIN marcas m ON UPPER(a.marca) = UPPER(m.nombre)
        WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado.' });
    }

    const asset = result.rows[0];
    const roleUpper = (req.user.role || '').toUpperCase();
    if (roleUpper !== 'ADMIN' && roleUpper !== 'OPERATOR' && asset.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado: No tiene autorización para visualizar activos asignados a otro funcionario.' });
    }

    return res.json({ success: true, asset });
  } catch (err) {
    console.error('Error al obtener activo por ID:', err);
    return res.status(500).json({ error: 'Error al consultar el detalle del activo.' });
  }
}

// Crear un activo nuevo (Restringido estrictamente a ADMIN)
async function createAsset(req, res) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso denegado: Solo los administradores pueden crear o registrar activos fijos.' });
  }

  const { 
    codigo,
    code: altCode,
    name, 
    clasificacion,
    tipo_recurso_id, 
    marca_id, 
    marca,
    estado_id, 
    area_id, 
    value, 
    purchase_date, 
    assigned_to, 
    photo_url,
    serial,
    psl,
    proveedor,
    nit_proveedor,
    codigo_contable,
    codigo_contable_psl,
    factura_url,
    empresa_id,
    empresa
  } = req.body;

  // Validaciones
  if (!name || !value) {
    return res.status(400).json({ error: 'Faltan campos mandatorios: Nombre y Valor son obligatorios.' });
  }

  const numericValue = parseFloat(value);
  if (isNaN(numericValue) || numericValue < 0) {
    return res.status(400).json({ error: 'El valor comercial debe ser un número positivo.' });
  }

  try {
    // 1. Gestión del Código de Activo (manual o autogenerado)
    let finalCode = (codigo || altCode || '').trim();
    if (finalCode) {
      const codeCheck = await db.query('SELECT id FROM dim_activos WHERE UPPER(codigo) = UPPER($1)', [finalCode]);
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ error: `El código de activo '${finalCode}' ya se encuentra registrado.` });
      }
    } else {
      const maxCodeRes = await db.query(
        "SELECT MAX(CAST(SUBSTRING(codigo FROM 5) AS INTEGER)) as max_num FROM dim_activos WHERE codigo ~ '^ACT-[0-9]+$'"
      );
      const nextSeq = (parseInt(maxCodeRes.rows[0]?.max_num, 10) || 0) + 1;
      finalCode = `ACT-${String(nextSeq).padStart(4, '0')}`;
    }

    // 2. Gestión de la Clasificación (Activo Fijo AF vs Activo de Control AC)
    let finalClasificacion = 'Activo Fijo (AF)';
    if (clasificacion) {
      const clUpper = clasificacion.toUpperCase();
      if (clUpper.includes('AC') || clUpper.includes('CONTROL')) {
        finalClasificacion = 'Activo de Control (AC)';
      } else {
        finalClasificacion = 'Activo Fijo (AF)';
      }
    }

    // Obtener nombres de marcas y tipo recurso
    let tipoRecursoName = 'GENERAL';
    if (tipo_recurso_id) {
      const trRes = await db.query('SELECT nombre FROM tipos_recurso WHERE id = $1', [parseInt(tipo_recurso_id, 10)]);
      if (trRes.rows.length > 0) tipoRecursoName = trRes.rows[0].nombre;
    }

    let marcaName = 'GENÉRICO';
    if (marca_id) {
      const mRes = await db.query('SELECT nombre FROM marcas WHERE id = $1', [parseInt(marca_id, 10)]);
      if (mRes.rows.length > 0) marcaName = mRes.rows[0].nombre;
    } else if (marca && typeof marca === 'string' && marca.trim()) {
      marcaName = marca.trim();
    }

    let empresaName = 'SEAPTO S.A.';
    if (empresa_id) {
      const empRes = await db.query('SELECT nombre FROM empresas WHERE id = $1', [parseInt(empresa_id, 10)]);
      if (empRes.rows.length > 0) empresaName = empRes.rows[0].nombre;
    } else if (empresa && typeof empresa === 'string' && empresa.trim()) {
      empresaName = empresa.trim();
    }

    // Determinar parámetros de depreciación
    const { grupo, meses } = determinarDepreciacion(tipoRecursoName);
    const valorResidual = parseFloat((numericValue * 0.1).toFixed(2)); // Default al 10%

    // Determinar estado_id y estatus (Si se asigna a un usuario, entra directamente a Pendiente Aceptación)
    let finalEstadoId = estado_id ? parseInt(estado_id, 10) : 1;
    let finalEstatus = assigned_to ? 'Pendiente Aceptación' : 'Activo';

    if (finalEstadoId && !assigned_to) {
      const stateResult = await db.query('SELECT estado FROM dim_estados_activo WHERE id = $1 LIMIT 1', [finalEstadoId]);
      if (stateResult.rows.length > 0) {
        finalEstatus = stateResult.rows[0].estado;
      }
    }

    const unifiedCodeVal = (codigo_contable_psl || codigo_contable || psl || '').trim() || null;

    const insertResult = await db.query(
      `INSERT INTO dim_activos (
        codigo, modelo, estatus, valor_inicial, valor_residual, fecha_compra, asignado_a, foto_url,
        tipo_recurso, marca, grupo_homogeneo, vida_util_meses, estado_id, ubicacion_id, serial, psl, empresa, clasificacion,
        proveedor, nit_proveedor, codigo_contable, factura_url
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING id, codigo as code, modelo as name, estatus as status, valor_inicial as value, fecha_compra as purchase_date, asignado_a as assigned_to, foto_url, clasificacion, marca, empresa, serial, psl, codigo_contable`,
      [
        finalCode,
        name.trim(),
        finalEstatus,
        numericValue,
        valorResidual,
        purchase_date || null,
        assigned_to || null,
        photo_url || null,
        tipoRecursoName,
        marcaName,
        grupo,
        meses,
        finalEstadoId,
        area_id ? parseInt(area_id, 10) : 1, // Ubicación
        serial || null,
        unifiedCodeVal,
        empresaName,
        finalClasificacion,
        proveedor || null,
        nit_proveedor || null,
        unifiedCodeVal,
        factura_url || null
      ]
    );

    const newAsset = insertResult.rows[0];

    if (assigned_to) {
      const creatorRes = await db.query('SELECT cedula, cargo, nombre_completo FROM dim_usuarios WHERE id = $1', [req.user.id]);
      const creator = creatorRes.rows[0] || {};

      await db.query(
        `INSERT INTO aceptaciones_activo (activo_id, usuario_id, estatus, cedula_origen, cargo_origen)
         VALUES ($1, $2, 'PENDIENTE', $3, $4)`,
        [newAsset.id, assigned_to, creator.cedula || null, creator.cargo || null]
      );
    }

    return res.status(201).json({ success: true, asset: newAsset });
  } catch (err) {
    console.error('Error al crear activo:', err);
    return res.status(500).json({ error: 'Error al registrar el activo: ' + err.message });
  }
}

// Actualizar un activo existente
async function updateAsset(req, res) {
  const { id } = req.params;
  const { 
    name, 
    clasificacion,
    tipo_recurso_id, 
    marca_id, 
    marca,
    estado_id, 
    area_id, 
    status, 
    value, 
    purchase_date, 
    assigned_to, 
    photo_url,
    serial,
    psl,
    proveedor,
    nit_proveedor,
    codigo_contable,
    codigo_contable_psl,
    factura_url,
    empresa_id,
    empresa
  } = req.body;

  if (!name || !value || !status) {
    return res.status(400).json({ error: 'Campos requeridos vacíos.' });
  }

  const numericValue = parseFloat(value);
  if (isNaN(numericValue) || numericValue < 0) {
    return res.status(400).json({ error: 'El valor debe ser un número válido.' });
  }

  try {
    const oldAssetResult = await db.query('SELECT asignado_a, estatus, foto_url, ubicacion_id, estado_id, clasificacion, empresa FROM dim_activos WHERE id = $1', [id]);
    if (oldAssetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado.' });
    }
    const oldAsset = oldAssetResult.rows[0];

    let updatedStatus = status;
    const oldAssignee = oldAsset.asignado_a;
    const newAssignee = assigned_to ? parseInt(assigned_to, 10) : null;

    // Normalizar clasificación
    let updatedClasificacion = oldAsset.clasificacion || 'Activo Fijo (AF)';
    if (clasificacion) {
      const clUpper = clasificacion.toUpperCase();
      updatedClasificacion = (clUpper.includes('AC') || clUpper.includes('CONTROL')) ? 'Activo de Control (AC)' : 'Activo Fijo (AF)';
    }

    // Obtener nombres de marcas, tipo recurso y empresa
    let tipoRecursoName = null;
    if (tipo_recurso_id) {
      const trRes = await db.query('SELECT nombre FROM tipos_recurso WHERE id = $1', [parseInt(tipo_recurso_id, 10)]);
      if (trRes.rows.length > 0) tipoRecursoName = trRes.rows[0].nombre;
    }

    let marcaName = null;
    if (marca_id) {
      const mRes = await db.query('SELECT nombre FROM marcas WHERE id = $1', [parseInt(marca_id, 10)]);
      if (mRes.rows.length > 0) marcaName = mRes.rows[0].nombre;
    } else if (marca && typeof marca === 'string' && marca.trim()) {
      marcaName = marca.trim();
    }

    let empresaName = oldAsset.empresa || 'SEAPTO S.A.';
    if (empresa_id) {
      const empRes = await db.query('SELECT nombre FROM empresas WHERE id = $1', [parseInt(empresa_id, 10)]);
      if (empRes.rows.length > 0) empresaName = empRes.rows[0].nombre;
    } else if (empresa && typeof empresa === 'string' && empresa.trim()) {
      empresaName = empresa.trim();
    }

    // Sync estatus de dim_estados_activo
    let finalEstadoId = estado_id ? parseInt(estado_id, 10) : oldAsset.estado_id;
    if (estado_id) {
      const stateResult = await db.query('SELECT estado FROM dim_estados_activo WHERE id = $1 LIMIT 1', [parseInt(estado_id, 10)]);
      if (stateResult.rows.length > 0) {
        updatedStatus = stateResult.rows[0].estado;
      }
    }

    if (newAssignee !== oldAssignee) {
      if (newAssignee) {
        updatedStatus = 'Pendiente Aceptación';
        await db.query(
          `INSERT INTO aceptaciones_activo (activo_id, usuario_id, estatus)
           VALUES ($1, $2, 'PENDIENTE')`,
          [id, newAssignee]
        );
      } else {
        updatedStatus = 'Activo';
      }

      const now = new Date();
      const tiempoId = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

      await db.query(
        `INSERT INTO fact_movimientos_activos (
          activo_id, ubicacion_origen_id, ubicacion_destino_id, 
          usuario_origen_id, usuario_destino_id, tiempo_movimiento_id, 
          tipo_movimiento_id, estado_id, motivo, realizado_por, estatus
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VALIDADO')`,
        [
          id,
          oldAsset.ubicacion_id,
          area_id ? parseInt(area_id, 10) : oldAsset.ubicacion_id,
          oldAssignee,
          newAssignee,
          tiempoId,
          2, // TRASLADO INTERNO
          finalEstadoId,
          'Reasignación de responsable de activo desde inventario',
          req.user.id
        ]
      );
    }

    const { grupo, meses } = determinarDepreciacion(tipoRecursoName);
    const valorResidual = parseFloat((numericValue * 0.1).toFixed(2));
    const unifiedCodeVal = (codigo_contable_psl || codigo_contable || psl || '').trim() || null;

    const updateResult = await db.query(
      `UPDATE dim_activos 
       SET modelo = $1, estatus = $2, valor_inicial = $3, valor_residual = $4, fecha_compra = $5, asignado_a = $6, foto_url = $7, 
           tipo_recurso = COALESCE($8, tipo_recurso), marca = COALESCE($9, marca), 
           grupo_homogeneo = COALESCE($10, grupo_homogeneo), vida_util_meses = COALESCE($11, vida_util_meses), 
           estado_id = $12, ubicacion_id = $13, serial = $14, psl = $15, clasificacion = $16,
           proveedor = $17, nit_proveedor = $18, codigo_contable = $19, factura_url = COALESCE($20, factura_url),
           empresa = COALESCE($21, empresa),
           actualizado_en = NOW()
       WHERE id = $22
       RETURNING id, codigo as code, modelo as name, estatus as status, valor_inicial as value, fecha_compra as purchase_date, asignado_a as assigned_to, foto_url, clasificacion, marca, empresa, serial, psl, codigo_contable`,
      [
        name.trim(),
        updatedStatus,
        numericValue,
        valorResidual,
        purchase_date || null,
        newAssignee,
        photo_url !== undefined ? photo_url : oldAsset.foto_url,
        tipoRecursoName,
        marcaName,
        grupo,
        meses,
        finalEstadoId,
        area_id ? parseInt(area_id, 10) : oldAsset.ubicacion_id,
        serial || null,
        unifiedCodeVal,
        updatedClasificacion,
        proveedor || null,
        nit_proveedor || null,
        unifiedCodeVal,
        factura_url !== undefined ? factura_url : null,
        empresaName,
        id
      ]
    );

    return res.json({ success: true, asset: updateResult.rows[0] });
  } catch (err) {
    console.error('Error al actualizar activo:', err);
    return res.status(500).json({ error: 'Error al actualizar el activo: ' + err.message });
  }
}

// Eliminar un activo (Solo ADMIN)
async function deleteAsset(req, res) {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM dim_activos WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado.' });
    }
    return res.json({ success: true, message: 'Activo eliminado permanentemente del sistema.' });
  } catch (err) {
    console.error('Error al eliminar activo:', err);
    return res.status(500).json({ error: 'Error al eliminar el activo. Verifique que no esté enlazado a históricos cruciales.' });
  }
}

// Actualización masiva de activos
async function bulkUpdateAssets(req, res) {
  const { ids, changes } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Debe proporcionar una lista de IDs de activos.' });
  }

  const { estado_id, ubicacion_id, asignado_a } = changes || {};
  if (estado_id === undefined && ubicacion_id === undefined && asignado_a === undefined) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un campo a actualizar.' });
  }

  try {
    let updateFields = [];
    let queryParams = [];
    let paramIndex = 1;

    if (estado_id !== undefined) {
      updateFields.push(`estado_id = $${paramIndex}`);
      queryParams.push(estado_id ? parseInt(estado_id, 10) : null);
      paramIndex++;

      // Si se actualiza el estado_id, sincronizamos el estatus del activo
      if (estado_id) {
        const stateResult = await db.query('SELECT estado FROM dim_estados_activo WHERE id = $1', [parseInt(estado_id, 10)]);
        if (stateResult.rows.length > 0) {
          updateFields.push(`estatus = $${paramIndex}`);
          queryParams.push(stateResult.rows[0].estado);
          paramIndex++;
        }
      }
    }

    if (ubicacion_id !== undefined) {
      updateFields.push(`ubicacion_id = $${paramIndex}`);
      queryParams.push(ubicacion_id ? parseInt(ubicacion_id, 10) : null);
      paramIndex++;
    }

    if (asignado_a !== undefined) {
      updateFields.push(`asignado_a = $${paramIndex}`);
      queryParams.push(asignado_a ? parseInt(asignado_a, 10) : null);
      paramIndex++;
    }

    queryParams.push(ids);
    const query = `
      UPDATE dim_activos 
      SET ${updateFields.join(', ')}, actualizado_en = NOW()
      WHERE id = ANY($${paramIndex})
      RETURNING id
    `;

    const result = await db.query(query, queryParams);

    // Si cambió el asignatario o ubicación, registramos los movimientos en lote
    const now = new Date();
    const tiempoId = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    for (const id of ids) {
      // Registrar un movimiento genérico de edición masiva
      await db.query(
        `INSERT INTO fact_movimientos_activos (
          activo_id, ubicacion_destino_id, usuario_destino_id, tiempo_movimiento_id, 
          tipo_movimiento_id, estado_id, motivo, realizado_por, estatus
        ) VALUES ($1, $2, $3, $4, 6, $5, 'Actualización masiva de inventario', $6, 'VALIDADO')`,
        [
          id,
          ubicacion_id ? parseInt(ubicacion_id, 10) : null,
          asignado_a ? parseInt(asignado_a, 10) : null,
          tiempoId,
          estado_id ? parseInt(estado_id, 10) : 1,
          req.user.id
        ]
      );

      // Si se reasignó un responsable, creamos la aceptación correspondiente
      if (asignado_a) {
        await db.query(
          `INSERT INTO aceptaciones_activo (activo_id, usuario_id, estatus)
           VALUES ($1, $2, 'PENDIENTE') ON CONFLICT DO NOTHING`,
          [id, parseInt(asignado_a, 10)]
        );
      }
    }

    return res.json({ success: true, count: result.rowCount });
  } catch (err) {
    console.error('Error en bulk update de activos:', err);
    return res.status(500).json({ error: 'Error al realizar la actualización masiva.' });
  }
}

// Eliminación masiva de activos (Solo ADMIN)
async function bulkDeleteAssets(req, res) {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Debe proporcionar una lista de IDs de activos.' });
  }

  try {
    const result = await db.query('DELETE FROM dim_activos WHERE id = ANY($1) RETURNING id', [ids]);
    return res.json({ success: true, count: result.rowCount });
  } catch (err) {
    console.error('Error en bulk delete de activos:', err);
    return res.status(500).json({ error: 'Error al realizar la eliminación masiva.' });
  }
}

// Exportación a Excel de activos (usando xlsx)
async function exportAssets(req, res) {
  const XLSX = require('xlsx');
  const { ids, category, status, search, cedula, clasificacion } = req.query;
  
  try {
    let whereClause = ' WHERE 1=1';
    const queryParams = [];
    let paramIndex = 1;

    // RLS: Los usuarios no administradores solo exportan sus propios activos
    if (req.user.role !== 'ADMIN') {
      whereClause += ` AND a.asignado_a = $${paramIndex}`;
      queryParams.push(req.user.id);
      paramIndex++;
    }

    if (ids) {
      const idList = ids.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (idList.length > 0) {
        whereClause += ` AND a.id = ANY($${paramIndex})`;
        queryParams.push(idList);
        paramIndex++;
      }
    }

    if (category) {
      whereClause += ` AND tr.id = $${paramIndex}`;
      queryParams.push(parseInt(category, 10));
      paramIndex++;
    }

    if (status) {
      if (!isNaN(parseInt(status, 10))) {
        whereClause += ` AND a.estado_id = $${paramIndex}`;
        queryParams.push(parseInt(status, 10));
      } else {
        whereClause += ` AND a.estatus ILIKE $${paramIndex}`;
        queryParams.push(status);
      }
      paramIndex++;
    }

    if (clasificacion) {
      whereClause += ` AND a.clasificacion ILIKE $${paramIndex}`;
      queryParams.push(`%${clasificacion.trim()}%`);
      paramIndex++;
    }

    if (cedula) {
      whereClause += ` AND u.cedula ILIKE $${paramIndex}`;
      queryParams.push(`%${cedula.trim()}%`);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (a.modelo ILIKE $${paramIndex} OR a.codigo ILIKE $${paramIndex} OR ar.area ILIKE $${paramIndex} OR u.cedula ILIKE $${paramIndex} OR u.nombre_completo ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Obtenemos los activos filtrados con toda la información de depreciación y dimensiones
    const query = `
      SELECT 
        a.codigo as "Código",
        a.clasificacion as "Clasificación (AF/AC)",
        COALESCE(a.modelo, a.tipo_recurso, 'Activo') as "Nombre / Modelo",
        a.serial as "Serial",
        a.psl as "PSL",
        a.marca as "Marca",
        a.tipo_recurso as "Categoría",
        a.grupo_homogeneo as "Grupo Homogéneo",
        a.vida_util_meses as "Vida Útil (Meses)",
        a.estatus as "Estado de Aceptación",
        COALESCE(da.estado, 'Activo') as "Condición Física",
        COALESCE(ar.area, 'Sede Principal') as "Ubicación / Área",
        
        -- Datos completos del Responsable
        COALESCE(u.cedula, 'Sin Cédula') as "Cédula Responsable",
        COALESCE(u.nombre_completo, 'Sin Asignar') as "Responsable Asignado",
        COALESCE(u.cargo, 'N/A') as "Cargo Responsable",
        COALESCE(u.email, 'N/A') as "Email Responsable",
        COALESCE(u.empresa, 'SEAPTO S.A.') as "Empresa Responsable",
        
        a.proveedor as "Proveedor",
        a.nit_proveedor as "NIT Proveedor",
        COALESCE(a.codigo_contable, a.psl) as "Código Contable / PSL",

        a.valor_inicial as "Valor Inicial ($)",
        a.valor_residual as "Valor Residual ($)",
        a.fecha_compra as "Fecha de Compra",
        a.meses_transcurridos as "Meses Transcurridos",
        a.depreciacion_mensual as "Depreciación Mensual ($)",
        a.depreciacion_acumulada as "Depreciación Acumulada ($)",
        a.valor_libros as "Valor en Libros ($)"
      FROM view_activos_depreciacion a 
      LEFT JOIN dim_usuarios u ON a.asignado_a = u.id
      LEFT JOIN dim_ubicaciones ar ON a.ubicacion_id = ar.id
      LEFT JOIN dim_estados_activo da ON a.estado_id = da.id
      LEFT JOIN tipos_recurso tr ON UPPER(a.tipo_recurso) = UPPER(tr.nombre)
      ${whereClause}
      ORDER BY a.codigo ASC
    `;
    const result = await db.query(query, queryParams);

    // Crear libro de trabajo (workbook)
    const ws = XLSX.utils.json_to_sheet(result.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario de Activos");

    // Generar buffer en formato base64/binary correcto para que el navegador lo detecte como .xlsx real y abra
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="inventario_activos.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.end(buf);

  } catch (err) {
    console.error('Error al exportar activos:', err);
    return res.status(500).json({ error: 'Error al exportar los activos a Excel.' });
  }
}

// Subida de foto a MinIO
const multer = require('multer');
const { minioClient, BUCKET_FOTOS, BUCKET_DOCUMENTOS } = require('../config/minio');
const upload = multer({ storage: multer.memoryStorage() }).single('photo');

async function uploadPhoto(req, res) {
  upload(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ error: 'Error al procesar el archivo subido.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ninguna imagen.' });
    }

    try {
      const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      
      // Subir buffer a MinIO
      await minioClient.putObject(
        BUCKET_FOTOS,
        fileName,
        req.file.buffer,
        req.file.size,
        { 'Content-Type': req.file.mimetype }
      );

      // URL pública accesible (minio corre localmente, el navegador accede a través del endpoint o la IP del servidor)
      const protocol = req.protocol;
      const host = req.get('host'); // En este caso el puerto 4002 de activos
      // Retornar una URL relativa del API para servir el objeto o directa de MinIO
      // Por simplicidad, use presignedGetObject o sirva el archivo estático redireccionado
      const fileUrl = `/api/assets/photos/${fileName}`;

      return res.json({ success: true, url: fileUrl, filename: fileName });
    } catch (uploadErr) {
      console.error('Error subiendo foto a MinIO:', uploadErr);
      return res.status(500).json({ error: 'Error al subir la imagen a la nube de almacenamiento.' });
    }
  });
}

// Servir foto desde MinIO directamente si no es pública de otra forma
async function servePhoto(req, res) {
  const { filename } = req.params;
  try {
    const dataStream = await minioClient.getObject(BUCKET_FOTOS, filename);
    res.setHeader('Content-Type', 'image/jpeg'); // O dinámico basado en extensión
    dataStream.pipe(res);
  } catch (err) {
    res.status(404).send('Archivo no encontrado.');
  }
}

// Subida de factura/orden de compra a MinIO
const uploadDocMulter = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB max
}).single('document');

async function uploadDocument(req, res) {
  uploadDocMulter(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ error: 'Error al procesar el documento subido.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo.' });
    }

    try {
      const fileName = `doc_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      
      await minioClient.putObject(
        BUCKET_DOCUMENTOS,
        fileName,
        req.file.buffer,
        req.file.size,
        { 'Content-Type': req.file.mimetype }
      );

      const fileUrl = `/api/assets/documents/${fileName}`;
      return res.json({ success: true, url: fileUrl, filename: fileName, originalName: req.file.originalname });
    } catch (uploadErr) {
      console.error('Error subiendo documento a MinIO:', uploadErr);
      return res.status(500).json({ error: 'Error al subir el documento a MinIO.' });
    }
  });
}

// Servir documento desde MinIO
async function serveDocument(req, res) {
  const { filename } = req.params;
  try {
    const stat = await minioClient.statObject(BUCKET_DOCUMENTOS, filename);
    const dataStream = await minioClient.getObject(BUCKET_DOCUMENTOS, filename);
    res.setHeader('Content-Type', stat.metaData['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    dataStream.pipe(res);
  } catch (err) {
    res.status(404).send('Documento no encontrado.');
  }
}

// ============================================================================
// CARGA MASIVA DE ACTIVOS (EXCEL) & PLANTILLA
// ============================================================================

// Auxiliar para normalizar cadenas para comparación
function normalizeStr(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Auxiliar para parsear fechas de Excel (Date, serial number, string)
function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parts = trimmed.split(/[/.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  return null;
}

// Auxiliar para extraer valores de fila con claves tolerantes
function getRowField(row, possibleKeys) {
  const rowKeys = Object.keys(row);
  for (const pKey of possibleKeys) {
    const foundKey = rowKeys.find(k => 
      k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '') === pKey
    );
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey];
    }
  }
  return null;
}

// Descargar plantilla estructurada de Excel para carga masiva
async function downloadTemplate(req, res) {
  const XLSX = require('xlsx');
  try {
    // Consultar catálogos actuales para incluirlos en la hoja de referencia
    const [tiposRes, subtiposRes, marcasRes, estadosRes, ubicacionesRes, usuariosRes, empresasRes, proveedoresRes] = await Promise.all([
      db.query('SELECT id, nombre FROM tipos_recurso ORDER BY nombre ASC'),
      db.query('SELECT id, nombre FROM subtipos_recurso ORDER BY nombre ASC'),
      db.query('SELECT id, nombre FROM marcas ORDER BY nombre ASC'),
      db.query('SELECT id, estado FROM dim_estados_activo ORDER BY id ASC'),
      db.query('SELECT id, area, punto_venta, oficina, zona FROM dim_ubicaciones ORDER BY area ASC'),
      db.query('SELECT id, username, nombre_completo, cedula FROM dim_usuarios WHERE es_activo = true ORDER BY nombre_completo ASC'),
      db.query('SELECT id, nombre FROM empresas ORDER BY nombre ASC'),
      db.query('SELECT id, nombre, nit FROM proveedores ORDER BY nombre ASC')
    ]);

    const tipos = tiposRes.rows;
    const subtipos = subtiposRes.rows;
    const marcas = marcasRes.rows;
    const estados = estadosRes.rows;
    const ubicaciones = ubicacionesRes.rows;
    const usuarios = usuariosRes.rows;
    const empresas = empresasRes.rows;
    const proveedores = proveedoresRes.rows;

    const headers = [
      [
        "Código de Activo",
        "Nombre *",
        "Valor Comercial *",
        "Clasificación (AF o AC)",
        "Categoria / Tipo Recurso",
        "Marca",
        "Estado / Condicion",
        "Ubicacion / Area",
        "Empresa",
        "Serial",
        "PSL",
        "Proveedor",
        "NIT Proveedor",
        "Código Contable",
        "Fecha Compra (AAAA-MM-DD)",
        "Responsable (Usuario o Cedula)",
        "Factura / Orden de Compra (URL)"
      ]
    ];

    const wb = XLSX.utils.book_new();

    // Crear Hoja 1: Plantilla Activos
    const wsPlantilla = XLSX.utils.aoa_to_sheet(headers);
    wsPlantilla['!cols'] = [
      { wch: 20 }, // Código de Activo
      { wch: 38 }, // Nombre *
      { wch: 18 }, // Valor Comercial *
      { wch: 26 }, // Clasificación (AF o AC)
      { wch: 28 }, // Categoria / Tipo Recurso
      { wch: 18 }, // Marca
      { wch: 20 }, // Estado / Condicion
      { wch: 28 }, // Ubicacion / Area
      { wch: 22 }, // Empresa
      { wch: 18 }, // Serial
      { wch: 18 }, // PSL
      { wch: 25 }, // Proveedor
      { wch: 18 }, // NIT Proveedor
      { wch: 20 }, // Código Contable
      { wch: 26 }, // Fecha Compra (AAAA-MM-DD)
      { wch: 32 }, // Responsable (Usuario o Cedula)
      { wch: 35 }  // Factura / Orden de Compra (URL)
    ];

    // Data Validations (Listas desplegables en Excel)
    wsPlantilla['!dataValidation'] = [
      { sqref: "B2:B5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$C$2:$C$${Math.max(2, subtipos.length + 1)}`, allowBlank: true },
      { sqref: "D2:D5000", type: "list", operator: "equal", formula1: "'Catalogos de Referencia'!$A$2:$A$3", allowBlank: true },
      { sqref: "E2:E5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$B$2:$B$${Math.max(2, tipos.length + 1)}`, allowBlank: true },
      { sqref: "F2:F5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$D$2:$D$${Math.max(2, marcas.length + 1)}`, allowBlank: true },
      { sqref: "G2:G5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$E$2:$E$${Math.max(2, estados.length + 1)}`, allowBlank: true },
      { sqref: "H2:H5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$F$2:$F$${Math.max(2, ubicaciones.length + 1)}`, allowBlank: true },
      { sqref: "I2:I5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$G$2:$G$${Math.max(2, empresas.length + 1)}`, allowBlank: true },
      { sqref: "L2:L5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$H$2:$H$${Math.max(2, proveedores.length + 1)}`, allowBlank: true },
      { sqref: "P2:P5000", type: "list", operator: "equal", formula1: `'Catalogos de Referencia'!$I$2:$I$${Math.max(2, usuarios.length + 1)}`, allowBlank: true }
    ];
    XLSX.utils.book_append_sheet(wb, wsPlantilla, "Plantilla Activos");

    // Hoja 2: Catálogos de Referencia
    const clasificaciones = ['Activo Fijo (AF)', 'Activo de Control (AC)'];
    const maxLen = Math.max(tipos.length, subtipos.length, marcas.length, estados.length, ubicaciones.length, usuarios.length, empresas.length, proveedores.length, clasificaciones.length);
    const catalogRows = [];
    for (let i = 0; i < maxLen; i++) {
      catalogRows.push({
        "Clasificaciones Validas": clasificaciones[i] || '',
        "Categorias Validas": tipos[i]?.nombre || '',
        "Subcategorias / Nombres Validos": subtipos[i]?.nombre || '',
        "Marcas Validas": marcas[i]?.nombre || '',
        "Estados Validos": estados[i]?.estado || '',
        "Ubicaciones (Areas)": ubicaciones[i] ? `${ubicaciones[i].area} | ${ubicaciones[i].punto_venta} (${ubicaciones[i].oficina})` : '',
        "Empresas Validas": empresas[i]?.nombre || '',
        "Proveedores Validos": proveedores[i]?.nombre || '',
        "Usuarios / Responsables": usuarios[i] ? `${usuarios[i].username} - ${usuarios[i].nombre_completo} (C.C. ${usuarios[i].cedula || 'N/A'})` : ''
      });
    }

    const wsCatalogos = XLSX.utils.json_to_sheet(catalogRows);
    wsCatalogos['!cols'] = [
      { wch: 26 },
      { wch: 30 },
      { wch: 38 },
      { wch: 22 },
      { wch: 22 },
      { wch: 45 },
      { wch: 28 },
      { wch: 32 },
      { wch: 45 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCatalogos, "Catalogos de Referencia");

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_carga_activos.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.end(buf);
  } catch (err) {
    console.error('Error al generar plantilla Excel:', err);
    return res.status(500).json({ error: 'Error al generar la plantilla de activos.' });
  }
}

// Configuración de multer para archivo Excel
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
}).single('file');

// Carga masiva de activos desde Excel (Restringido estrictamente a ADMIN)
async function bulkCreateAssets(req, res) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso denegado: Solo los administradores tienen permiso para realizar carga masiva de activos.' });
  }

  uploadExcel(req, res, async function(err) {
    if (err) {
      return res.status(400).json({ error: 'Error al subir el archivo: ' + err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo Excel (.xlsx / .xls).' });
    }

    const XLSX = require('xlsx');

    try {
      let wb;
      try {
        wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      } catch (readErr) {
        return res.status(400).json({ error: 'El archivo subido no es un Excel válido o está dañado.' });
      }

      const sheetNames = wb.SheetNames;
      if (!sheetNames || sheetNames.length === 0) {
        return res.status(400).json({ error: 'El archivo Excel no contiene hojas de datos.' });
      }

      // Tomar la primera hoja o la que se llame 'Plantilla Activos'
      const targetSheetName = sheetNames.find(s => s.toLowerCase().includes('activo') || s.toLowerCase().includes('plantilla')) || sheetNames[0];
      const ws = wb.Sheets[targetSheetName];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'La hoja de Excel está vacía. Ingrese los activos a crear.' });
      }

      // Cargar catálogos en memoria para resolución ultrarrápida
      const [tiposRes, marcasRes, estadosRes, ubicacionesRes, usuariosRes, empresasRes, existingAssetsRes] = await Promise.all([
        db.query('SELECT id, nombre FROM tipos_recurso'),
        db.query('SELECT id, nombre FROM marcas'),
        db.query('SELECT id, estado FROM dim_estados_activo'),
        db.query('SELECT id, area, punto_venta, oficina FROM dim_ubicaciones'),
        db.query('SELECT id, username, nombre_completo, email, cedula FROM dim_usuarios'),
        db.query('SELECT id, nombre FROM empresas'),
        db.query('SELECT UPPER(TRIM(codigo)) as codigo, UPPER(TRIM(serial)) as serial, UPPER(TRIM(psl)) as psl, UPPER(TRIM(modelo)) as modelo, valor_inicial, ubicacion_id FROM dim_activos')
      ]);

      const tiposList = tiposRes.rows;
      const marcasList = marcasRes.rows;
      const estadosList = estadosRes.rows;
      const ubicacionesList = ubicacionesRes.rows;
      const usuariosList = usuariosRes.rows;
      const empresasList = empresasRes.rows;

      // Conjuntos para detección de duplicados contra la base de datos
      const dbCodes = new Set();
      const dbSerials = new Set();
      const dbPsls = new Set();
      const dbExactSignatures = new Set();

      for (const row of existingAssetsRes.rows) {
        if (row.codigo) dbCodes.add(row.codigo);
        if (row.serial) dbSerials.add(row.serial);
        if (row.psl) dbPsls.add(row.psl);
        if (row.modelo && !row.serial && !row.psl) {
          dbExactSignatures.add(`${row.modelo}|${Number(row.valor_inicial).toFixed(2)}|${row.ubicacion_id}`);
        }
      }

      // Rastreadores para detectar duplicados dentro del mismo archivo Excel
      const fileCodes = new Map();   // codigo -> rowNum
      const fileSerials = new Map(); // serial -> rowNum
      const filePsls = new Map();    // psl -> rowNum

      // Obtener el correlativo numérico actual más alto de dim_activos
      const maxCodeRes = await db.query(
        "SELECT MAX(CAST(SUBSTRING(codigo FROM 5) AS INTEGER)) as max_num FROM dim_activos WHERE codigo ~ '^ACT-[0-9]+$'"
      );
      let nextSeq = (parseInt(maxCodeRes.rows[0]?.max_num, 10) || 0) + 1;

      const allowPartial = req.body.allow_partial === 'true' || req.body.allow_partial === true;
      const validatedRows = [];
      const omitted = [];
      const errors = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2; // Fila en Excel considerando encabezado en fila 1

        const rawCodigo = getRowField(row, ['codigo', 'codigodeactivo', 'codigoactivo', 'code']);
        const rawName = getRowField(row, ['nombre', 'nombredelactivo', 'modelo', 'name']);
        const rawValue = getRowField(row, ['valorcomercial', 'valor', 'valorinicial', 'precio', 'value']);
        const rawClasificacion = getRowField(row, ['clasificacion', 'clasificacionafoac', 'tipoactivo', 'clasificacionactivo', 'categoriaactivo']);
        const rawCategoria = getRowField(row, ['categoria', 'categoriatiporecurso', 'tiporecurso', 'tipoderecurso', 'category']);
        const rawMarca = getRowField(row, ['marca', 'brand']);
        const rawEstado = getRowField(row, ['estado', 'estadocondicion', 'condicion', 'condicionfisica', 'status', 'estadodelactivo']);
        const rawUbicacion = getRowField(row, ['ubicacion', 'ubicacionarea', 'area', 'sede', 'location']);
        const rawEmpresa = getRowField(row, ['empresa', 'nombreempresa', 'company']);
        const rawSerial = getRowField(row, ['serial', 'serie', 'numerodeserie']);
        const rawPsl = getRowField(row, ['psl', 'codigopsl']);
        const rawFecha = getRowField(row, ['fechacompra', 'fechadecompra', 'fechacompradaaammdd', 'fecha', 'purchasedate']);
        const rawResponsable = getRowField(row, ['responsable', 'responsableusuarioocedula', 'usuario', 'asignadoa', 'cedula', 'cedularesponsable']);
        const rawProveedor = getRowField(row, ['proveedor', 'nombreproveedor', 'vendor', 'supplier']);
        const rawNitProveedor = getRowField(row, ['nitproveedor', 'nit', 'nitdelproveedor']);
        const rawCodigoContable = getRowField(row, ['codigocontable', 'cuentacontable', 'cuentacontableactivo', 'codigocuentacontable']);
        const rawFacturaUrl = getRowField(row, ['facturaurl', 'factura', 'ordendecompra', 'ordendecompraurl', 'documentourl']);

        // Si la fila está completamente vacía, saltarla
        if (!rawCodigo && !rawName && !rawValue && !rawCategoria && !rawMarca && !rawSerial) {
          continue;
        }

        // Validación de Nombre
        if (!rawName || !String(rawName).trim()) {
          errors.push({ row: rowNum, error: "El campo 'Nombre' es obligatorio." });
          continue;
        }
        const name = String(rawName).trim();

        // Validación de Valor Comercial
        if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
          errors.push({ row: rowNum, error: "El campo 'Valor Comercial' es obligatorio." });
          continue;
        }
        const cleanValStr = String(rawValue).replace(/[$\s]/g, '').replace(/,/g, '.');
        const numericValue = parseFloat(cleanValStr);
        if (isNaN(numericValue) || numericValue < 0) {
          errors.push({ row: rowNum, error: `El valor comercial '${rawValue}' no es válido o es negativo.` });
          continue;
        }

        // Resolución de Ubicación
        let ubicacionId = ubicacionesList[0]?.id || 1;
        if (rawUbicacion) {
          const normUbic = normalizeStr(rawUbicacion);
          const found = ubicacionesList.find(u => 
            normalizeStr(u.area) === normUbic || 
            normalizeStr(`${u.area} | ${u.punto_venta} (${u.oficina})`) === normUbic ||
            normalizeStr(u.area).includes(normUbic) ||
            String(u.id) === String(rawUbicacion).trim()
          );
          if (found) {
            ubicacionId = found.id;
          }
        }

        // Resolución de Empresa (Catálogo)
        let empresaName = 'SEAPTO S.A.';
        if (rawEmpresa) {
          const normEmp = normalizeStr(rawEmpresa);
          const found = empresasList.find(e => normalizeStr(e.nombre) === normEmp || String(e.id) === String(rawEmpresa).trim());
          if (found) {
            empresaName = found.nombre;
          } else {
            empresaName = String(rawEmpresa).trim();
          }
        }

        // =====================================================================
        // DETECCIÓN Y OMISIÓN DE DUPLICADOS (Código, Serial, PSL o Firma Exacta)
        // =====================================================================
        const codeClean = rawCodigo ? String(rawCodigo).trim() : null;
        const codeUpper = codeClean ? codeClean.toUpperCase() : null;
        const serialClean = rawSerial ? String(rawSerial).trim() : null;
        const pslClean = rawPsl ? String(rawPsl).trim() : null;
        const serialUpper = serialClean ? serialClean.toUpperCase() : null;
        const pslUpper = pslClean ? pslClean.toUpperCase() : null;

        let isDuplicate = false;
        let duplicateReason = '';

        // 1. Verificar duplicidad por Código de Activo (si se especificó)
        if (codeUpper) {
          if (dbCodes.has(codeUpper)) {
            isDuplicate = true;
            duplicateReason = `El código de activo '${codeClean}' ya existe registrado en el inventario.`;
          } else if (fileCodes.has(codeUpper)) {
            isDuplicate = true;
            duplicateReason = `El código de activo '${codeClean}' está repetido en el archivo (fila ${fileCodes.get(codeUpper)}).`;
          }
        }

        // 2. Verificar duplicidad por Serial
        if (!isDuplicate && serialUpper) {
          if (dbSerials.has(serialUpper)) {
            isDuplicate = true;
            duplicateReason = `El serial '${serialClean}' ya existe registrado en el inventario.`;
          } else if (fileSerials.has(serialUpper)) {
            isDuplicate = true;
            duplicateReason = `El serial '${serialClean}' está repetido en el archivo (fila ${fileSerials.get(serialUpper)}).`;
          }
        }

        // 3. Verificar duplicidad por PSL
        if (!isDuplicate && pslUpper) {
          if (dbPsls.has(pslUpper)) {
            isDuplicate = true;
            duplicateReason = `El código PSL '${pslClean}' ya existe registrado en el inventario.`;
          } else if (filePsls.has(pslUpper)) {
            isDuplicate = true;
            duplicateReason = `El código PSL '${pslClean}' está repetido en el archivo (fila ${filePsls.get(pslUpper)}).`;
          }
        }

        // 4. Verificar duplicidad exacta para activos sin Serial ni PSL
        if (!isDuplicate && !codeUpper && !serialUpper && !pslUpper) {
          const signature = `${name.toUpperCase()}|${numericValue.toFixed(2)}|${ubicacionId}`;
          if (dbExactSignatures.has(signature)) {
            isDuplicate = true;
            duplicateReason = `El activo '${name}' con el mismo valor ($${numericValue.toLocaleString('es-CO')}) y ubicación ya se encuentra registrado.`;
          }
        }

        // Si es duplicado, se omite silenciosamente agregándolo al informe
        if (isDuplicate) {
          omitted.push({
            row: rowNum,
            code: codeClean,
            name,
            serial: serialClean,
            psl: pslClean,
            reason: duplicateReason
          });
          continue;
        }

        // Si no es duplicado, registrar en mapas del archivo para evitar repeticiones internas
        if (codeUpper) fileCodes.set(codeUpper, rowNum);
        if (serialUpper) fileSerials.set(serialUpper, rowNum);
        if (pslUpper) filePsls.set(pslUpper, rowNum);

        // Resolución de Clasificación (Activo Fijo AF vs Activo de Control AC)
        let clasificacionName = 'Activo Fijo (AF)';
        if (rawClasificacion) {
          const clUpper = String(rawClasificacion).toUpperCase();
          if (clUpper.includes('AC') || clUpper.includes('CONTROL')) {
            clasificacionName = 'Activo de Control (AC)';
          } else {
            clasificacionName = 'Activo Fijo (AF)';
          }
        }

        // Resolución de Categoría / Tipo de Recurso
        let tipoRecursoName = 'GENERAL';
        let tipoRecursoId = null;
        if (rawCategoria) {
          const normCat = normalizeStr(rawCategoria);
          const found = tiposList.find(t => normalizeStr(t.nombre) === normCat || String(t.id) === String(rawCategoria).trim());
          if (found) {
            tipoRecursoName = found.nombre;
            tipoRecursoId = found.id;
          } else {
            tipoRecursoName = String(rawCategoria).trim();
          }
        }

        // Resolución de Marca
        let marcaName = 'GENÉRICO';
        let marcaId = null;
        if (rawMarca) {
          const normMarca = normalizeStr(rawMarca);
          const found = marcasList.find(m => normalizeStr(m.nombre) === normMarca || String(m.id) === String(rawMarca).trim());
          if (found) {
            marcaName = found.nombre;
            marcaId = found.id;
          } else {
            marcaName = String(rawMarca).trim();
          }
        }

        // Resolución de Estado
        let estadoId = 1;
        let estadoName = 'Activo';
        if (rawEstado) {
          const normEst = normalizeStr(rawEstado);
          const found = estadosList.find(e => normalizeStr(e.estado) === normEst || String(e.id) === String(rawEstado).trim());
          if (found) {
            estadoId = found.id;
            estadoName = found.estado;
          }
        }

        // Resolución de Responsable (Asignado a)
        let assignedUserId = null;
        let assignedUser = null;
        if (rawResponsable) {
          const rawRespStr = String(rawResponsable).trim();
          const normResp = normalizeStr(rawRespStr);
          assignedUser = usuariosList.find(u => 
            normalizeStr(u.username) === normResp ||
            (u.cedula && String(u.cedula).trim() === rawRespStr) ||
            normalizeStr(u.email) === normResp ||
            normalizeStr(u.nombre_completo) === normResp ||
            String(u.id) === rawRespStr
          );
          if (assignedUser) {
            assignedUserId = assignedUser.id;
          } else {
            errors.push({ row: rowNum, error: `El responsable asignado '${rawResponsable}' no coincide con ningún usuario del sistema.` });
            continue;
          }
        }

        // Fecha de Compra
        const purchaseDate = parseExcelDate(rawFecha);

        validatedRows.push({
          rowNum,
          code: codeClean,
          name,
          clasificacionName,
          numericValue,
          tipoRecursoName,
          marcaName,
          empresaName,
          estadoId,
          estadoName,
          ubicacionId,
          assignedUserId,
          purchaseDate,
          serial: serialClean,
          psl: pslClean || (rawCodigoContable ? String(rawCodigoContable).trim() : null),
          proveedor: rawProveedor ? String(rawProveedor).trim() : null,
          nitProveedor: rawNitProveedor ? String(rawNitProveedor).trim() : null,
          codigoContable: (rawCodigoContable ? String(rawCodigoContable).trim() : null) || pslClean,
          facturaUrl: rawFacturaUrl ? String(rawFacturaUrl).trim() : null
        });
      }

      // Si hay errores y no se permite importación parcial, abortar
      if (errors.length > 0 && !allowPartial) {
        return res.status(400).json({
          success: false,
          message: `Se encontraron ${errors.length} error(es) en el archivo Excel. Corrija las filas indicadas o active la opción de importar válidos.`,
          totalRows: rawRows.length,
          validCount: validatedRows.length,
          omittedCount: omitted.length,
          errorCount: errors.length,
          omitted,
          errors
        });
      }

      // Si no hay filas a insertar
      if (validatedRows.length === 0) {
        if (omitted.length > 0 && errors.length === 0) {
          return res.json({
            success: true,
            message: `Todos los ${omitted.length} activo(s) del archivo ya se encuentran registrados en el inventario. No se crearon registros duplicados.`,
            totalRows: rawRows.length,
            createdCount: 0,
            omittedCount: omitted.length,
            errorCount: 0,
            omitted,
            errors: [],
            assets: []
          });
        }

        return res.status(400).json({
          success: false,
          message: 'No se encontraron filas válidas para registrar.',
          totalRows: rawRows.length,
          createdCount: 0,
          omittedCount: omitted.length,
          errorCount: errors.length,
          omitted,
          errors
        });
      }

      // Insertar en base de datos usando transacción
      const client = await db.pool.connect();
      const createdAssets = [];

      try {
        await client.query('BEGIN');

        for (const item of validatedRows) {
          const code = item.code || `ACT-${String(nextSeq++).padStart(4, '0')}`;
          const { grupo, meses } = determinarDepreciacion(item.tipoRecursoName);
          const valorResidual = parseFloat((item.numericValue * 0.1).toFixed(2));
          const finalEstatus = item.assignedUserId ? 'Pendiente Aceptación' : item.estadoName;

          const unifiedBulkCode = item.codigoContable || item.psl || null;

          const insertRes = await client.query(
            `INSERT INTO dim_activos (
              codigo, modelo, estatus, valor_inicial, valor_residual, fecha_compra, asignado_a, foto_url,
              tipo_recurso, marca, grupo_homogeneo, vida_util_meses, estado_id, ubicacion_id, serial, psl, empresa, clasificacion,
              proveedor, nit_proveedor, codigo_contable, factura_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING id, codigo as code, modelo as name, estatus as status, valor_inicial as value, fecha_compra as purchase_date, asignado_a as assigned_to, clasificacion, marca, empresa, serial, psl, codigo_contable`,
            [
              code,
              item.name,
              finalEstatus,
              item.numericValue,
              valorResidual,
              item.purchaseDate,
              item.assignedUserId,
              null,
              item.tipoRecursoName,
              item.marcaName,
              grupo,
              meses,
              item.estadoId,
              item.ubicacionId,
              item.serial,
              unifiedBulkCode,
              item.empresaName || 'SEAPTO S.A.',
              item.clasificacionName,
              item.proveedor,
              item.nitProveedor,
              unifiedBulkCode,
              item.facturaUrl || null
            ]
          );

          const newAsset = insertRes.rows[0];
          createdAssets.push(newAsset);

          if (item.assignedUserId) {
            const creatorRes = await client.query('SELECT cedula, cargo FROM dim_usuarios WHERE id = $1', [req.user.id]);
            const creator = creatorRes.rows[0] || {};

            await client.query(
              `INSERT INTO aceptaciones_activo (activo_id, usuario_id, estatus, cedula_origen, cargo_origen)
               VALUES ($1, $2, 'PENDIENTE', $3, $4)`,
              [newAsset.id, item.assignedUserId, creator.cedula || null, creator.cargo || null]
            );
          }
        }

        await client.query('COMMIT');

        let messageText = `Se crearon exitosamente ${createdAssets.length} activos en el inventario.`;
        if (omitted.length > 0) {
          messageText += ` Se omitieron ${omitted.length} activo(s) por duplicidad.`;
        }

        return res.status(201).json({
          success: true,
          message: messageText,
          totalRows: rawRows.length,
          createdCount: createdAssets.length,
          omittedCount: omitted.length,
          errorCount: errors.length,
          omitted,
          errors,
          assets: createdAssets
        });

      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('Error en transacción de creación masiva:', txErr);
        return res.status(500).json({ error: 'Error al guardar los activos en base de datos: ' + txErr.message });
      } finally {
        client.release();
      }

    } catch (parseErr) {
      console.error('Error general al procesar carga masiva:', parseErr);
      return res.status(500).json({ error: 'Error interno al procesar el archivo Excel: ' + parseErr.message });
    }
  });
}

module.exports = {
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  bulkUpdateAssets,
  bulkDeleteAssets,
  exportAssets,
  uploadPhoto,
  servePhoto,
  uploadDocument,
  serveDocument,
  downloadTemplate,
  bulkCreateAssets
};
