const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken } = require('../config/auth');
const { findCentralUserByCedula } = require('../config/centralDb');


// Endpoint de Inicio de Sesión
async function login(req, res) {
  const { username, password } = req.body;

  // Validación básica de entrada
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  try {
    const cleanUser = username.trim().toLowerCase();
    // Buscar usuario en la base de datos (por username, email o cédula)
    const result = await db.query(
      `SELECT id, username, password_hash, nombre_completo as full_name, email, rol as role, cargo, cedula, empresa, es_activo as is_active, modulos_permitidos as allowed_modules 
       FROM dim_usuarios 
       WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR LOWER(cedula) = $1`,
      [cleanUser]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const user = result.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
    }

    // Verificar la contraseña con bcryptjs
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // Validar estado y actualizar cargo desde la DB centralizada (tabla positions) si el usuario posee cédula
    if (user.cedula) {
      try {
        const centralUser = await findCentralUserByCedula(user.cedula);
        if (centralUser) {
          if (!centralUser.isActive) {
            await db.query('UPDATE dim_usuarios SET es_activo = false WHERE id = $1', [user.id]);
            return res.status(403).json({ error: 'Usuario inactivo en la base de datos centralizada. Contacte al administrador.' });
          }
          // Sincronizar cargo si fue actualizado en la base centralizada (tabla positions)
          if (centralUser.cargo && centralUser.cargo !== user.cargo) {
            await db.query('UPDATE dim_usuarios SET cargo = $1 WHERE id = $2', [centralUser.cargo, user.id]);
            user.cargo = centralUser.cargo;
          }
        }
      } catch (centralErr) {
        console.warn('⚠️ [LOGIN] No se pudo verificar la DB centralizada durante el login:', centralErr.message);
      }
    }

    // Asegurar rol por defecto VIEWER si viene nulo
    const userRole = user.role || 'VIEWER';
    const userModules = user.allowed_modules || ["dashboard", "inventory", "movements", "acceptances"];

    // Generar Token JWT
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: userRole,
      full_name: user.full_name
    });

    // Configurar la cookie HttpOnly
    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader(
      'Set-Cookie',
      `token=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax${isProd ? '; Secure' : ''}`
    );

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: userRole,
        cargo: user.cargo || 'Funcionario / Responsable',
        cedula: user.cedula || '',
        empresa: user.empresa || '',
        allowed_modules: userModules
      }
    });

  } catch (err) {
    console.error('Error en login controller:', err);
    return res.status(500).json({ error: 'Error interno del servidor. Por favor, intente más tarde.' });
  }
}

// Endpoint de Cierre de Sesión
function logout(req, res) {
  res.setHeader(
    'Set-Cookie',
    'token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
  );
  return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
}

// Endpoint para obtener datos del usuario actual
async function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  
  try {
    const result = await db.query(
      `SELECT id, username, nombre_completo as full_name, email, rol as role, cargo, cedula, empresa, es_activo as is_active, modulos_permitidos as allowed_modules 
       FROM dim_usuarios WHERE id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0 || result.rows[0].is_active === false) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
    }
    
    const user = result.rows[0];
    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role || 'VIEWER',
        cargo: user.cargo || 'Funcionario / Responsable',
        cedula: user.cedula || '',
        empresa: user.empresa || '',
        allowed_modules: user.allowed_modules || ["dashboard", "inventory", "movements", "acceptances"]
      }
    });
  } catch (err) {
    console.error('Error en me controller:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// Obtener lista básica de usuarios activos (para combos) con su ubicación anclada
async function getUsers(req, res) {
  try {
    const result = await db.query(
      `SELECT 
         u.id, 
         u.username, 
         u.nombre_completo as full_name, 
         u.rol as role,
         u.cargo,
         u.empresa,
         u.cedula,
         COALESCE(
           (SELECT a.ubicacion_id FROM dim_activos a WHERE a.asignado_a = u.id AND a.ubicacion_id IS NOT NULL LIMIT 1),
           (SELECT id FROM dim_ubicaciones ORDER BY id ASC LIMIT 1)
         ) as ubicacion_id,
         COALESCE(
           (SELECT loc.oficina FROM dim_activos a JOIN dim_ubicaciones loc ON a.ubicacion_id = loc.id WHERE a.asignado_a = u.id LIMIT 1),
           (SELECT oficina FROM dim_ubicaciones ORDER BY id ASC LIMIT 1)
         ) as oficina_nombre,
         COALESCE(
           (SELECT loc.punto_venta FROM dim_activos a JOIN dim_ubicaciones loc ON a.ubicacion_id = loc.id WHERE a.asignado_a = u.id LIMIT 1),
           (SELECT punto_venta FROM dim_ubicaciones ORDER BY id ASC LIMIT 1)
         ) as punto_nombre,
         COALESCE(
           (SELECT loc.zona FROM dim_activos a JOIN dim_ubicaciones loc ON a.ubicacion_id = loc.id WHERE a.asignado_a = u.id LIMIT 1),
           (SELECT zona FROM dim_ubicaciones ORDER BY id ASC LIMIT 1)
         ) as zona_nombre
       FROM dim_usuarios u 
       WHERE u.es_activo = true OR u.es_activo IS NULL 
       ORDER BY u.nombre_completo ASC`
    );
    return res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('Error al obtener lista de usuarios con ubicación:', err);
    return res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
  }
}

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

async function getAllUsersAdmin(req, res) {
  try {
    const result = await db.query(
      `SELECT id, username, nombre_completo as full_name, email, rol as role, es_activo as is_active, modulos_permitidos as allowed_modules, creado_en as created_at, cargo, empresa, cedula 
       FROM dim_usuarios ORDER BY creado_en DESC`
    );
    return res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('Error al obtener todos los usuarios:', err);
    return res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
}

async function getCentralUser(req, res) {
  const { cedula } = req.params;
  if (!cedula) {
    return res.status(400).json({ error: 'La cédula es requerida.' });
  }
  try {
    const centralUser = await findCentralUserByCedula(cedula);
    if (!centralUser) {
      return res.status(404).json({ error: `No se encontró ningún usuario con la cédula ${cedula} en la base de datos centralizada.` });
    }
    return res.json({ success: true, user: centralUser });
  } catch (err) {
    console.error('Error al obtener usuario centralizado:', err);
    return res.status(500).json({ error: 'Error al consultar la base de datos centralizada.' });
  }
}

async function createUser(req, res) {
  let { username, password, fullName, email, role, allowed_modules, cargo, empresa, cedula } = req.body;
  
  // La llave para la validación es estrictamente el número de cédula
  if (!cedula || !String(cedula).trim()) {
    return res.status(400).json({ 
      error: 'No es posible crear el usuario: El número de cédula es obligatorio para validar su existencia en la base de datos centralizada.' 
    });
  }

  const cleanCedula = String(cedula).trim();

  try {
    // Validar de forma estricta que la persona existe en la base de datos centralizada
    const centralUser = await findCentralUserByCedula(cleanCedula);
    if (!centralUser) {
      return res.status(400).json({ 
        error: `No es posible crear el usuario: La cédula ${cleanCedula} no existe en la base de datos centralizada.` 
      });
    }

    if (!centralUser.isActive) {
      return res.status(400).json({ 
        error: `No es posible crear el usuario: El usuario ${centralUser.fullName} (CC: ${cleanCedula}) está inactivo en la base de datos centralizada (Estado: ${centralUser.status}).` 
      });
    }

    // Tomar los datos de la persona desde la DB centralizada (los cargos provienen de positions)
    fullName = centralUser.fullName;
    email = centralUser.email;
    username = centralUser.username || cleanCedula;
    cargo = centralUser.cargo;
    empresa = centralUser.empresa;

    if (!username || !fullName || !email) {
      return res.status(400).json({ error: 'Faltan datos obligatorios del usuario provistos por la base centralizada.' });
    }

    // Verificar si ya existe registrado localmente por username, email o cédula
    const existingCheck = await db.query(
      `SELECT id FROM dim_usuarios WHERE LOWER(username) = $1 OR LOWER(email) = $2 OR cedula = $3`,
      [username.trim().toLowerCase(), email.trim().toLowerCase(), cleanCedula]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: `El usuario con cédula ${cleanCedula} ya se encuentra registrado en el sistema local.` });
    }

    const userRole = role || 'VIEWER';
    // Si no se proporciona contraseña, se asigna como clave inicial la misma cédula
    const rawPassword = (password && password.trim()) ? password : cleanCedula;
    
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(rawPassword, salt);
    const mods = allowed_modules ? JSON.stringify(allowed_modules) : JSON.stringify(["dashboard", "inventory", "movements", "acceptances"]);

    const result = await db.query(
      `INSERT INTO dim_usuarios (username, password_hash, nombre_completo, email, rol, modulos_permitidos, cargo, empresa, cedula)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id, username, nombre_completo as full_name, email, rol as role, es_activo as is_active, modulos_permitidos as allowed_modules, cargo, empresa, cedula`,
      [username.trim().toLowerCase(), hash, fullName, email.trim().toLowerCase(), userRole, mods, cargo || null, empresa || null, cleanCedula]
    );

    return res.json({ success: true, user: result.rows[0] });

  } catch (err) {
    console.error('Error creando usuario:', err);
    if (err.constraint === 'dim_usuarios_username_key' || err.constraint === 'dim_usuarios_email_key' || err.constraint === 'usuarios_username_key' || err.constraint === 'usuarios_email_key') {
      return res.status(400).json({ error: 'El usuario o email de esta persona ya está registrado en el sistema local.' });
    }
    return res.status(500).json({ error: 'Error al procesar la creación de usuario.' });
  }
}

async function updateUser(req, res) {
  const { id } = req.params;
  let { username, password, fullName, email, role, allowed_modules, cargo, empresa, cedula } = req.body;
  if (!username || !fullName || !email) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }
  try {
    if (cedula) {
      try {
        const centralUser = await findCentralUserByCedula(cedula);
        if (centralUser) {
          cargo = centralUser.cargo || cargo;
          empresa = centralUser.empresa || empresa;
        }
      } catch (e) {
        console.warn('⚠️ [UPDATE USER] No se pudo verificar la DB centralizada:', e.message);
      }
    }

    const mods = allowed_modules ? JSON.stringify(allowed_modules) : JSON.stringify(["dashboard", "inventory", "movements", "acceptances"]);
    
    let query, params;
    if (password && password.trim()) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      query = `UPDATE dim_usuarios 
               SET username = $1, password_hash = $2, nombre_completo = $3, email = $4, rol = $5, modulos_permitidos = $6, cargo = $7, empresa = $8, cedula = $9
               WHERE id = $10 
               RETURNING id, username, nombre_completo as full_name, email, rol as role, es_activo as is_active, modulos_permitidos as allowed_modules, cargo, empresa, cedula`;
      params = [username.trim().toLowerCase(), hash, fullName, email, role, mods, cargo || null, empresa || null, cedula || null, id];
    } else {
      query = `UPDATE dim_usuarios 
               SET username = $1, nombre_completo = $2, email = $3, rol = $4, modulos_permitidos = $5, cargo = $6, empresa = $7, cedula = $8
               WHERE id = $9 
               RETURNING id, username, nombre_completo as full_name, email, rol as role, es_activo as is_active, modulos_permitidos as allowed_modules, cargo, empresa, cedula`;
      params = [username.trim().toLowerCase(), fullName, email, role, mods, cargo || null, empresa || null, cedula || null, id];
    }

    const result = await db.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar usuario:', err);
    return res.status(500).json({ error: 'Error al actualizar usuario.' });
  }
}

async function updateUserStatus(req, res) {
  const { id } = req.params;
  const { is_active } = req.body;
  
  if (req.user.id === parseInt(id, 10)) {
    return res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
  }

  try {
    // Si se intenta inactivar al usuario, verificar si tiene activos asignados
    if (is_active === false || is_active === 'false') {
      const countRes = await db.query(
        'SELECT COUNT(*)::integer as count FROM dim_activos WHERE asignado_a = $1',
        [id]
      );
      const assetCount = countRes.rows[0]?.count || 0;

      if (assetCount > 0) {
        const userRes = await db.query('SELECT nombre_completo FROM dim_usuarios WHERE id = $1', [id]);
        const userName = userRes.rows[0]?.nombre_completo || 'el usuario';
        const alertMsg = `El usuario ${userName} tiene ${assetCount} activo(s) asignado(s) que deben ser reasignados antes de inactivarlo.`;

        // Insertar o actualizar alerta en notificaciones_alertas
        const existingAlert = await db.query(
          "SELECT id FROM notificaciones_alertas WHERE tipo = 'INACTIVACION_USUARIO' AND usuario_id = $1 AND estatus = 'PENDIENTE'",
          [id]
        );

        if (existingAlert.rows.length > 0) {
          await db.query(
            "UPDATE notificaciones_alertas SET mensaje = $1, cantidad_activos = $2, actualizado_en = NOW() WHERE id = $3",
            [alertMsg, assetCount, existingAlert.rows[0].id]
          );
        } else {
          await db.query(
            "INSERT INTO notificaciones_alertas (tipo, usuario_id, mensaje, cantidad_activos, estatus, creado_en, actualizado_en) VALUES ('INACTIVACION_USUARIO', $1, $2, $3, 'PENDIENTE', NOW(), NOW())",
            [id, alertMsg, assetCount]
          );
        }

        return res.status(400).json({
          error: `No se puede inactivar a ${userName} porque tiene ${assetCount} activo(s) asignado(s). Se ha notificado al administrador en la campana superior sobre los activos a mover.`
        });
      }
    }

    await db.query('UPDATE dim_usuarios SET es_activo = $1 WHERE id = $2', [is_active, id]);
    
    // Si fue reactivado exitosamente, resolver cualquier alerta de inactivación pendiente
    if (is_active === true) {
      await db.query(
        "UPDATE notificaciones_alertas SET estatus = 'RESUELTO', actualizado_en = NOW() WHERE usuario_id = $1 AND tipo = 'INACTIVACION_USUARIO'",
        [id]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error actualizando estado:', err);
    return res.status(500).json({ error: 'Error al actualizar estado del usuario.' });
  }
}

async function updateUserModules(req, res) {
  const { id } = req.params;
  const { allowed_modules, role } = req.body;

  try {
    const result = await db.query(
      `UPDATE dim_usuarios SET modulos_permitidos = $1, rol = $2 WHERE id = $3 
       RETURNING id, username, nombre_completo as full_name, email, rol as role, es_activo as is_active, modulos_permitidos as allowed_modules`,
      [JSON.stringify(allowed_modules), role, id]
    );
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Error actualizando módulos:', err);
    return res.status(500).json({ error: 'Error al actualizar módulos y roles.' });
  }
}

module.exports = {
  login,
  logout,
  me,
  getUsers,
  getAllUsersAdmin,
  getCentralUser,
  createUser,
  updateUser,
  updateUserStatus,
  updateUserModules
};
