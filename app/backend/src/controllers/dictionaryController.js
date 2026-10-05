const db = require('../config/db');
const { queryCentral } = require('../config/centralDb');

const ALLOWED_TABLES = new Set([
  'proveedores',
  'marcas',
  'tipos_recurso',
  'estados',
  'dim_estados_activo',

  'empresas',
  'dim_ubicaciones',
  'subtipos_recurso',
  'brands',
  'resource_types',
  'states',
  'companies',
  'oficinas',
  'puntos',
  'areas',
  'ubicaciones',
  'motivos_baja'
]);

// Generic function to get items from a table with pagination & search
async function getAll(req, res, tableName) {
  try {
    const pageStr = req.query.page;
    const limitStr = req.query.limit;
    const search = req.query.search ? req.query.search.trim() : '';

    if (!ALLOWED_TABLES.has(tableName)) {
      return res.status(400).json({ error: 'Tabla de catálogo no válida.' });
    }

    if (pageStr !== undefined && limitStr !== undefined) {
      const page = Math.max(1, parseInt(pageStr, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 15));
      const offset = (page - 1) * limit;

      let countQuery = `SELECT COUNT(*) FROM ${tableName}`;
      let dataQuery = `SELECT * FROM ${tableName}`;
      const params = [];
      const dataParams = [];

      if (search) {
        if (tableName === 'proveedores') {
          const whereClause = ` WHERE LOWER(nombre) LIKE $1 OR LOWER(COALESCE(nit, '')) LIKE $1 OR LOWER(COALESCE(email, '')) LIKE $1 OR LOWER(COALESCE(telefono, '')) LIKE $1 OR LOWER(COALESCE(direccion, '')) LIKE $1`;
          countQuery += whereClause;
          dataQuery += whereClause;
          params.push(`%${search.toLowerCase()}%`);
          dataParams.push(`%${search.toLowerCase()}%`);
        } else {
          const whereClause = ` WHERE LOWER(nombre) LIKE $1`;
          countQuery += whereClause;
          dataQuery += whereClause;
          params.push(`%${search.toLowerCase()}%`);
          dataParams.push(`%${search.toLowerCase()}%`);
        }
      }

      dataQuery += ` ORDER BY nombre ASC LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`;
      dataParams.push(limit, offset);

      const [countRes, dataRes] = await Promise.all([
        db.query(countQuery, params),
        db.query(dataQuery, dataParams)
      ]);

      const total = parseInt(countRes.rows[0].count, 10);
      return res.json({
        success: true,
        data: dataRes.rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1
        }
      });
    }

    let queryStr = `SELECT * FROM ${tableName}`;
    const params = [];
    if (search) {
      if (tableName === 'proveedores') {
        queryStr += ` WHERE LOWER(nombre) LIKE $1 OR LOWER(COALESCE(nit, '')) LIKE $1 OR LOWER(COALESCE(email, '')) LIKE $1`;
      } else {
        queryStr += ` WHERE LOWER(nombre) LIKE $1`;
      }
      params.push(`%${search.toLowerCase()}%`);
    }
    const orderCol = tableName === 'proveedores' ? 'nombre' : 'nombre';
    queryStr += ` ORDER BY ${orderCol} ASC`;

    const result = await db.query(queryStr, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(`Error al obtener datos de ${tableName}:`, err);
    return res.status(500).json({ error: `Error al obtener la lista de ${tableName}.` });
  }
}

// Generic function to create an item
async function create(req, res, tableName) {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }
  try {
    const result = await db.query(
      `INSERT INTO ${tableName} (nombre) VALUES ($1) RETURNING *`,
      [nombre.trim()]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(`Error al insertar en ${tableName}:`, err);
    if (err.code === '23505') {
      return res.status(409).json({ error: `Ya existe un registro con ese nombre en ${tableName}.` });
    }
    return res.status(500).json({ error: `Error al registrar en ${tableName}.` });
  }
}

// Generic function to update an item
async function update(req, res, tableName) {
  const { id } = req.params;
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }
  try {
    const result = await db.query(
      `UPDATE ${tableName} SET nombre = $1 WHERE id = $2 RETURNING *`,
      [nombre.trim(), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(`Error al actualizar ${tableName}:`, err);
    if (err.code === '23505') {
      return res.status(409).json({ error: `Ya existe un registro con ese nombre.` });
    }
    return res.status(500).json({ error: `Error al actualizar en ${tableName}.` });
  }
}

// Generic function to delete an item
async function remove(req, res, tableName) {
  const { id } = req.params;
  try {
    const result = await db.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado.' });
    }
    return res.json({ success: true, message: 'Registro eliminado correctamente.' });
  } catch (err) {
    console.error(`Error al eliminar de ${tableName}:`, err);
    return res.status(500).json({ error: `No se pudo eliminar el registro ya que está siendo utilizado en otra tabla.` });
  }
}

// =============================================
// CRUD para dim_ubicaciones (multi-campo)
// =============================================
async function getUbicaciones(req, res) {
  try {
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    const search = req.query.search ? req.query.search.trim().toLowerCase() : '';

    if (page && limit) {
      const offset = (page - 1) * limit;
      let countQuery = `SELECT COUNT(*) FROM dim_ubicaciones`;
      let dataQuery = `SELECT id, area, punto_venta, oficina, zona FROM dim_ubicaciones`;
      const params = [];
      const dataParams = [];

      if (search) {
        const whereClause = ` WHERE LOWER(area) LIKE $1 OR LOWER(punto_venta) LIKE $1 OR LOWER(oficina) LIKE $1 OR LOWER(zona) LIKE $1`;
        countQuery += whereClause;
        dataQuery += whereClause;
        params.push(`%${search}%`);
        dataParams.push(`%${search}%`);
      }

      dataQuery += ` ORDER BY oficina ASC, punto_venta ASC, area ASC LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`;
      dataParams.push(limit, offset);

      const [countRes, dataRes] = await Promise.all([
        db.query(countQuery, params),
        db.query(dataQuery, dataParams)
      ]);

      const total = parseInt(countRes.rows[0].count, 10);
      return res.json({
        success: true,
        data: dataRes.rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    }

    let queryStr = 'SELECT id, area, punto_venta, oficina, zona FROM dim_ubicaciones';
    const params = [];
    if (search) {
      queryStr += ` WHERE LOWER(area) LIKE $1 OR LOWER(punto_venta) LIKE $1 OR LOWER(oficina) LIKE $1 OR LOWER(zona) LIKE $1`;
      params.push(`%${search}%`);
    }
    queryStr += ' ORDER BY oficina ASC, punto_venta ASC, area ASC';

    const result = await db.query(queryStr, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener ubicaciones:', err);
    return res.status(500).json({ error: 'Error al obtener la lista de ubicaciones.' });
  }
}

async function createUbicacion(req, res) {
  const { area, punto_venta, oficina, zona } = req.body;
  if (!area || !punto_venta || !oficina || !zona) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios: area, punto_venta, oficina, zona.' });
  }
  try {
    const result = await db.query(
      `INSERT INTO dim_ubicaciones (area, punto_venta, oficina, zona) VALUES ($1, $2, $3, $4) RETURNING *`,
      [area.trim(), punto_venta.trim(), oficina.trim(), zona.trim()]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al crear ubicación:', err);
    return res.status(500).json({ error: 'Error al registrar la ubicación.' });
  }
}

async function updateUbicacion(req, res) {
  const { id } = req.params;
  const { area, punto_venta, oficina, zona } = req.body;
  if (!area || !punto_venta || !oficina || !zona) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios: area, punto_venta, oficina, zona.' });
  }
  try {
    const result = await db.query(
      `UPDATE dim_ubicaciones SET area = $1, punto_venta = $2, oficina = $3, zona = $4 WHERE id = $5 RETURNING *`,
      [area.trim(), punto_venta.trim(), oficina.trim(), zona.trim(), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ubicación no encontrada.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar ubicación:', err);
    return res.status(500).json({ error: 'Error al actualizar la ubicación.' });
  }
}

async function deleteUbicacion(req, res) {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM dim_ubicaciones WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ubicación no encontrada.' });
    }
    return res.json({ success: true, message: 'Ubicación eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar ubicación:', err);
    return res.status(500).json({ error: 'No se pudo eliminar la ubicación porque tiene activos o movimientos asociados.' });
  }
}

module.exports = {
  getBrands: (req, res) => getAll(req, res, 'marcas'),
  createBrand: (req, res) => create(req, res, 'marcas'),
  updateBrand: (req, res) => update(req, res, 'marcas'),
  deleteBrand: (req, res) => remove(req, res, 'marcas'),

  getResourceTypes: (req, res) => getAll(req, res, 'tipos_recurso'),
  createResourceType: (req, res) => create(req, res, 'tipos_recurso'),
  updateResourceType: (req, res) => update(req, res, 'tipos_recurso'),
  deleteResourceType: (req, res) => remove(req, res, 'tipos_recurso'),

  getStates: async (req, res) => {
    try {
      const result = await db.query('SELECT id, estado as nombre FROM dim_estados_activo ORDER BY estado ASC');
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('Error al obtener estados:', err);
      return res.status(500).json({ error: 'Error al obtener estados físicos.' });
    }
  },
  createState: async (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del estado es obligatorio.' });
    try {
      const result = await db.query(
        'INSERT INTO dim_estados_activo (estado) VALUES ($1) RETURNING id, estado as nombre',
        [nombre.trim().toUpperCase()]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('Error al crear estado:', err);
      return res.status(500).json({ error: 'Error al registrar el estado físico.' });
    }
  },
  updateState: async (req, res) => {
    const { id } = req.params;
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del estado es obligatorio.' });
    try {
      const result = await db.query(
        'UPDATE dim_estados_activo SET estado = $1 WHERE id = $2 RETURNING id, estado as nombre',
        [nombre.trim().toUpperCase(), id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Estado no encontrado.' });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('Error al actualizar estado:', err);
      return res.status(500).json({ error: 'Error al actualizar el estado físico.' });
    }
  },
  deleteState: async (req, res) => {
    const { id } = req.params;
    try {
      const result = await db.query('DELETE FROM dim_estados_activo WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Estado no encontrado.' });
      return res.json({ success: true, message: 'Estado eliminado correctamente.' });
    } catch (err) {
      console.error('Error al eliminar estado:', err);
      return res.status(500).json({ error: 'No se pudo eliminar el estado porque tiene activos o movimientos asociados.' });
    }
  },

  getCargos: async (req, res) => {
    // Helper DRY: obtener cargos desde dim_usuarios locales como fallback
    const getLocalFallbackCargos = async () => {
      const userCargosRes = await db.query("SELECT DISTINCT cargo FROM dim_usuarios WHERE cargo IS NOT NULL AND cargo != '' ORDER BY cargo ASC");
      return userCargosRes.rows.map((row, idx) => ({ id: idx + 1, nombre: row.cargo }));
    };

    try {
      // Los cargos provienen exclusivamente de la tabla 'positions' de la base de datos centralizada
      const centralRes = await queryCentral('SELECT id, name as nombre FROM positions ORDER BY name ASC');
      if (centralRes.rows.length > 0) {
        return res.json({ success: true, data: centralRes.rows, source: 'centralized' });
      }
      // Fallback: si la DB centralizada no devuelve datos, usar cargos distintos ya asignados a usuarios locales
      const mapped = await getLocalFallbackCargos();
      return res.json({ success: true, data: mapped, source: 'local_fallback' });
    } catch (err) {
      console.error('⚠️ [CARGOS] Error al obtener cargos de la DB centralizada, intentando fallback local:', err.message);
      try {
        const mapped = await getLocalFallbackCargos();
        return res.json({ success: true, data: mapped, source: 'local_fallback' });
      } catch (fallbackErr) {
        console.error('❌ [CARGOS] Error total al obtener cargos:', fallbackErr);
        return res.status(500).json({ error: 'Error al obtener la lista de cargos.' });
      }
    }
  },
  // CRUD de cargos deshabilitado: los cargos son de solo lectura desde la DB centralizada (tabla positions)
  createCargo: (req, res) => res.status(403).json({ error: 'Los cargos provienen de la base de datos centralizada y no pueden ser creados localmente.' }),
  updateCargo: (req, res) => res.status(403).json({ error: 'Los cargos provienen de la base de datos centralizada y no pueden ser modificados localmente.' }),
  deleteCargo: (req, res) => res.status(403).json({ error: 'Los cargos provienen de la base de datos centralizada y no pueden ser eliminados localmente.' }),

  getCompanies: (req, res) => getAll(req, res, 'empresas'),
  createCompany: (req, res) => create(req, res, 'empresas'),
  updateCompany: (req, res) => update(req, res, 'empresas'),
  deleteCompany: (req, res) => remove(req, res, 'empresas'),

  getOficinas: async (req, res) => {
    try {
      const result = await db.query('SELECT DISTINCT oficina FROM dim_ubicaciones ORDER BY oficina ASC');
      const mapped = result.rows.map((row, idx) => ({ id: idx + 1, nombre: row.oficina }));
      return res.json({ success: true, data: mapped });
    } catch (err) {
      return res.status(500).json({ error: 'Error al obtener oficinas de la dimensión.' });
    }
  },
  createOficina: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),
  updateOficina: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),
  deleteOficina: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),

  getPuntos: async (req, res) => {
    try {
      const result = await db.query('SELECT DISTINCT punto_venta FROM dim_ubicaciones ORDER BY punto_venta ASC');
      const mapped = result.rows.map((row, idx) => ({ id: idx + 1, nombre: row.punto_venta }));
      return res.json({ success: true, data: mapped });
    } catch (err) {
      return res.status(500).json({ error: 'Error al obtener puntos de venta de la dimensión.' });
    }
  },
  createPunto: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),
  updatePunto: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),
  deletePunto: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),

  getAreas: async (req, res) => {
    try {
      const result = await db.query('SELECT id, area, punto_venta, oficina, zona FROM dim_ubicaciones ORDER BY area ASC');
      const mapped = result.rows.map(row => ({
        id: row.id,
        nombre: `${row.area} | ${row.punto_venta} (${row.oficina})`,
        area: row.area,
        punto_venta: row.punto_venta,
        oficina: row.oficina,
        zona: row.zona
      }));
      return res.json({ success: true, data: mapped });
    } catch (err) {
      console.error('Error al obtener dim_ubicaciones:', err);
      return res.status(500).json({ error: 'Error al obtener la lista de áreas/ubicaciones.' });
    }
  },
  createArea: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),
  updateArea: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),
  deleteArea: (req, res) => res.status(501).json({ error: 'Use el CRUD de ubicaciones en su lugar.' }),

  // CRUD completo para dim_ubicaciones
  getUbicaciones,
  createUbicacion,
  updateUbicacion,
  deleteUbicacion,

  // CRUD para subtipos_recurso (Subcategorías)
  getSubresourceTypes: async (req, res) => {
    try {
      const result = await db.query(`
        SELECT s.id, s.nombre, s.tipo_recurso_id, t.nombre as tipo_recurso_nombre 
        FROM subtipos_recurso s 
        LEFT JOIN tipos_recurso t ON s.tipo_recurso_id = t.id 
        ORDER BY t.nombre ASC, s.nombre ASC
      `);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('Error al obtener subcategorías:', err);
      return res.status(500).json({ error: 'Error al obtener subcategorías de la base de datos.' });
    }
  },
  createSubresourceType: async (req, res) => {
    const { nombre, tipo_recurso_id } = req.body;
    if (!nombre || !nombre.trim() || !tipo_recurso_id) {
      return res.status(400).json({ error: 'Nombre y tipo_recurso_id son requeridos.' });
    }
    try {
      const result = await db.query(
        `INSERT INTO subtipos_recurso (nombre, tipo_recurso_id) VALUES ($1, $2) RETURNING *`,
        [nombre.trim(), tipo_recurso_id]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('Error al crear subcategoría:', err);
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Ya existe esa subcategoría para la categoría seleccionada.' });
      }
      return res.status(500).json({ error: 'Error al crear la subcategoría en la base de datos.' });
    }
  },
  updateSubresourceType: async (req, res) => {
    const { id } = req.params;
    const { nombre, tipo_recurso_id } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'Nombre es requerido.' });
    }
    try {
      let query = `UPDATE subtipos_recurso SET nombre = $1`;
      let params = [nombre.trim()];
      if (tipo_recurso_id) {
        query += `, tipo_recurso_id = $2 WHERE id = $3 RETURNING *`;
        params.push(tipo_recurso_id, id);
      } else {
        query += ` WHERE id = $2 RETURNING *`;
        params.push(id);
      }
      const result = await db.query(query, params);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Subcategoría no encontrada.' });
      }
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('Error al actualizar subcategoría:', err);
      return res.status(500).json({ error: 'Error al actualizar subcategoría en la base de datos.' });
    }
  },
  deleteSubresourceType: async (req, res) => {
    const { id } = req.params;
    try {
      const result = await db.query('DELETE FROM subtipos_recurso WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Subcategoría no encontrada.' });
      }
      return res.json({ success: true, message: 'Subcategoría eliminada correctamente.' });
    } catch (err) {
      console.error('Error al eliminar subcategoría:', err);
      return res.status(500).json({ error: 'No se pudo eliminar la subcategoría.' });
    }
  },

  // Obtener nombres/modelos de activos estandarizados sugeridos por categoría
  getAssetNamesByCategory: async (req, res) => {
    const { category_id, category_name } = req.query;
    try {
      const query = `
        SELECT DISTINCT nombre FROM (
          SELECT s.nombre 
          FROM subtipos_recurso s
          LEFT JOIN tipos_recurso t ON s.tipo_recurso_id = t.id
          WHERE ($1::int IS NULL OR s.tipo_recurso_id = $1::int)
            AND ($2::text IS NULL OR UPPER(t.nombre) = UPPER($2::text))
          UNION
          SELECT a.modelo as nombre
          FROM dim_activos a
          LEFT JOIN tipos_recurso t ON (UPPER(a.tipo_recurso) = UPPER(t.nombre) OR UPPER(a.grupo_homogeneo) = UPPER(t.nombre))
          WHERE a.modelo IS NOT NULL AND TRIM(a.modelo) != ''
            AND ($1::int IS NULL OR t.id = $1::int)
            AND ($2::text IS NULL OR UPPER(a.tipo_recurso) = UPPER($2::text) OR UPPER(a.grupo_homogeneo) = UPPER($2::text))
        ) sub
        ORDER BY nombre ASC
      `;
      const params = [
        category_id ? parseInt(category_id, 10) : null,
        category_name ? category_name.trim() : null
      ];
      const result = await db.query(query, params);
      return res.json({ success: true, data: result.rows.map(r => r.nombre) });
    } catch (err) {
      console.error('Error al obtener nombres por categoría:', err);
      return res.status(500).json({ error: 'Error al obtener lista de nombres de activos.' });
    }
  },

  // Obtener marcas filtradas por categoría (o todas si no hay restricciones específicas)
  getBrandsByCategory: async (req, res) => {
    const { category_id, category_name } = req.query;
    try {
      if (!category_id && !category_name) {
        const result = await db.query('SELECT * FROM marcas ORDER BY nombre ASC');
        return res.json({ success: true, data: result.rows });
      }

      const result = await db.query(
        `SELECT DISTINCT m.id, m.nombre 
         FROM marcas m
         WHERE EXISTS (
           SELECT 1 FROM dim_activos a 
           LEFT JOIN tipos_recurso tr ON UPPER(a.tipo_recurso) = UPPER(tr.nombre)
           WHERE UPPER(a.marca) = UPPER(m.nombre)
             AND ($1::int IS NULL OR tr.id = $1::int)
             AND ($2::text IS NULL OR UPPER(a.tipo_recurso) = UPPER($2::text))
         )
         ORDER BY m.nombre ASC`,
        [
          category_id ? parseInt(category_id, 10) : null,
          category_name ? category_name.trim() : null
        ]
      );

      if (result.rows.length === 0) {
        const allBrands = await db.query('SELECT * FROM marcas ORDER BY nombre ASC');
        return res.json({ success: true, data: allBrands.rows });
      }

      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('Error al obtener marcas por categoría:', err);
      return res.status(500).json({ error: 'Error al obtener marcas por categoría.' });
    }
  },

  // CRUD para proveedores
  getProveedores: async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM proveedores ORDER BY nombre ASC');
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('Error al obtener proveedores:', err);
      return res.status(500).json({ error: 'Error al obtener la lista de proveedores.' });
    }
  },
  reseedProveedores: async (req, res) => {
    try {
      const { seedProveedores } = require('../services/supplierSeeder');
      const loadedCount = await seedProveedores(null, true);
      return res.json({ success: true, count: loadedCount, message: `Se reimportaron ${loadedCount} proveedores con sus NITs correctamente.` });
    } catch (err) {
      console.error('Error al reimportar proveedores:', err);
      return res.status(500).json({ error: 'Error al reimportar proveedores.' });
    }
  },
  createProveedor: async (req, res) => {
    const { nombre, nit, telefono, email, direccion } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
    }
    try {
      const result = await db.query(
        `INSERT INTO proveedores (nombre, nit, telefono, email, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nombre.trim(), nit ? nit.trim() : null, telefono ? telefono.trim() : null, email ? email.trim() : null, direccion ? direccion.trim() : null]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('Error al crear proveedor:', err);
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Ya existe un proveedor registrado con ese nombre.' });
      }
      return res.status(500).json({ error: 'Error al registrar el proveedor.' });
    }
  },
  updateProveedor: async (req, res) => {
    const { id } = req.params;
    const { nombre, nit, telefono, email, direccion } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
    }
    try {
      const result = await db.query(
        `UPDATE proveedores SET nombre = $1, nit = $2, telefono = $3, email = $4, direccion = $5 WHERE id = $6 RETURNING *`,
        [nombre.trim(), nit ? nit.trim() : null, telefono ? telefono.trim() : null, email ? email.trim() : null, direccion ? direccion.trim() : null, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Proveedor no encontrado.' });
      }
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('Error al actualizar proveedor:', err);
      return res.status(500).json({ error: 'Error al actualizar el proveedor.' });
    }
  },
  deleteProveedor: (req, res) => remove(req, res, 'proveedores'),

  // CRUD para motivos de baja
  getMotivosBaja: (req, res) => getAll(req, res, 'motivos_baja'),
  createMotivoBaja: (req, res) => create(req, res, 'motivos_baja'),
  updateMotivoBaja: (req, res) => update(req, res, 'motivos_baja'),
  deleteMotivoBaja: (req, res) => remove(req, res, 'motivos_baja')
};

