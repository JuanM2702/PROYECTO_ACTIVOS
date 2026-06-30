const db = require('../config/db');

// Obtener inventario de activos con filtros opcionales
async function getAssets(req, res) {
  const { category, status, search } = req.query;
  let queryText = `
    SELECT a.*, u.full_name as assignee_name 
    FROM assets a 
    LEFT JOIN users u ON a.assigned_to = u.id
    WHERE 1=1
  `;
  const queryParams = [];
  let paramIndex = 1;

  if (category) {
    queryText += ` AND a.category = $${paramIndex}`;
    queryParams.push(category);
    paramIndex++;
  }

  if (status) {
    queryText += ` AND a.status = $${paramIndex}`;
    queryParams.push(status);
    paramIndex++;
  }

  if (search) {
    queryText += ` AND (a.name ILIKE $${paramIndex} OR a.code ILIKE $${paramIndex} OR a.location ILIKE $${paramIndex})`;
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  queryText += ' ORDER BY a.code ASC';

  try {
    const result = await db.query(queryText, queryParams);
    return res.json({ success: true, assets: result.rows });
  } catch (err) {
    console.error('Error al obtener activos:', err);
    return res.status(500).json({ error: 'Error al obtener la lista de activos.' });
  }
}

// Obtener un activo específico por ID
async function getAssetById(req, res) {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT a.*, u.full_name as assignee_name, u.username as assignee_username
       FROM assets a 
       LEFT JOIN users u ON a.assigned_to = u.id
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado.' });
    }

    return res.json({ success: true, asset: result.rows[0] });
  } catch (err) {
    console.error('Error al obtener activo por ID:', err);
    return res.status(500).json({ error: 'Error al consultar el detalle del activo.' });
  }
}

// Crear un activo nuevo
async function createAsset(req, res) {
  const { name, description, category, location, value, purchase_date, assigned_to, photo_data } = req.body;

  // Validaciones
  if (!name || !category || !location || !value) {
    return res.status(400).json({ error: 'Faltan campos mandatorios: Nombre, Categoría, Ubicación y Valor son obligatorios.' });
  }

  const numericValue = parseFloat(value);
  if (isNaN(numericValue) || numericValue < 0) {
    return res.status(400).json({ error: 'El valor comercial debe ser un número positivo.' });
  }

  try {
    // Generar un código único secuencial de activo (ej: ACT-0001)
    const countResult = await db.query('SELECT COUNT(*) FROM assets');
    const totalAssets = parseInt(countResult.rows[0].count, 10);
    const code = `ACT-${String(totalAssets + 1).padStart(4, '0')}`;

    // Determinar estado inicial. Si se le asigna a alguien, entra como "Pendiente Aceptación"
    const status = assigned_to ? 'Pendiente Aceptación' : 'Activo';

    // Insertar el activo
    const insertResult = await db.query(
      `INSERT INTO assets (code, name, description, category, status, location, value, purchase_date, assigned_to, photo_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        code,
        name.trim(),
        description ? description.trim() : null,
        category.trim(),
        status,
        location.trim(),
        numericValue,
        purchase_date || null,
        assigned_to || null,
        photo_data || null
      ]
    );

    const newAsset = insertResult.rows[0];

    // Si se asignó a un usuario, disparar el flujo de firma/aceptación
    if (assigned_to) {
      await db.query(
        `INSERT INTO asset_acceptances (asset_id, user_id, status)
         VALUES ($1, $2, 'PENDIENTE')`,
        [newAsset.id, assigned_to]
      );
    }

    return res.status(201).json({ success: true, asset: newAsset });
  } catch (err) {
    console.error('Error al crear activo:', err);
    return res.status(500).json({ error: 'Error al registrar el activo.' });
  }
}

// Actualizar un activo existente
async function updateAsset(req, res) {
  const { id } = req.params;
  const { name, description, category, status, location, value, purchase_date, assigned_to, photo_data } = req.body;

  if (!name || !category || !location || !value || !status) {
    return res.status(400).json({ error: 'Campos requeridos vacíos.' });
  }

  const numericValue = parseFloat(value);
  if (isNaN(numericValue) || numericValue < 0) {
    return res.status(400).json({ error: 'El valor debe ser un número válido.' });
  }

  try {
    // Consultar el estado anterior para detectar reasignaciones
    const oldAssetResult = await db.query('SELECT assigned_to, status, location, photo_data FROM assets WHERE id = $1', [id]);
    if (oldAssetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado.' });
    }
    const oldAsset = oldAssetResult.rows[0];

    // 1. Detectar si cambió el responsable
    let updatedStatus = status;
    const oldAssignee = oldAsset.assigned_to;
    const newAssignee = assigned_to ? parseInt(assigned_to, 10) : null;

    if (newAssignee !== oldAssignee) {
      // Si hay un nuevo responsable, obligar el flujo de aceptación
      if (newAssignee) {
        updatedStatus = 'Pendiente Aceptación';
        // Insertar registro de firma pendiente
        await db.query(
          `INSERT INTO asset_acceptances (asset_id, user_id, status)
           VALUES ($1, $2, 'PENDIENTE')`,
          [id, newAssignee]
        );
      } else {
        updatedStatus = 'Activo';
      }

      // Además, registrar este cambio en el histórico de movimientos de forma automática
      await db.query(
        `INSERT INTO asset_movements (asset_id, origin_location, destination_location, origin_assignee_id, destination_assignee_id, reason, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          oldAsset.location,
          location,
          oldAssignee,
          newAssignee,
          'Reasignación de responsable de activo desde inventario',
          req.user.id
        ]
      );
    } else if (location !== oldAsset.location) {
      // Si solo cambió de ubicación pero mantiene el mismo responsable, registrar el movimiento físico
      await db.query(
        `INSERT INTO asset_movements (asset_id, origin_location, destination_location, origin_assignee_id, destination_assignee_id, reason, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          oldAsset.location,
          location,
          oldAssignee,
          oldAssignee,
          'Traslado físico del equipo desde inventario',
          req.user.id
        ]
      );
    }

    // Actualizar el activo
    const updateResult = await db.query(
      `UPDATE assets 
       SET name = $1, description = $2, category = $3, status = $4, location = $5, value = $6, purchase_date = $7, assigned_to = $8, photo_data = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        name.trim(),
        description ? description.trim() : null,
        category.trim(),
        updatedStatus,
        location.trim(),
        numericValue,
        purchase_date || null,
        newAssignee,
        photo_data !== undefined ? photo_data : oldAsset.photo_data,
        id
      ]
    );

    return res.json({ success: true, asset: updateResult.rows[0] });
  } catch (err) {
    console.error('Error al actualizar activo:', err);
    return res.status(500).json({ error: 'Error al actualizar el activo.' });
  }
}

// Eliminar un activo (Solo ADMIN)
async function deleteAsset(req, res) {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM assets WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activo no encontrado.' });
    }
    return res.json({ success: true, message: 'Activo eliminado permanentemente del sistema.' });
  } catch (err) {
    console.error('Error al eliminar activo:', err);
    return res.status(500).json({ error: 'Error al eliminar el activo. Verifique que no esté enlazado a históricos cruciales.' });
  }
}

module.exports = {
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
};
