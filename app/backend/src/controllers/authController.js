const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken } = require('../config/auth');

// Endpoint de Inicio de Sesión
async function login(req, res) {
  const { username, password } = req.body;

  // Validación básica de entrada
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  try {
    // Buscar usuario en la base de datos
    const result = await db.query(
      'SELECT id, username, password_hash, full_name, email, role, is_active, allowed_modules FROM users WHERE username = $1',
      [username.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
    }

    // Verificar la contraseña con bcryptjs
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // Generar Token JWT (podemos incluir allowed_modules, pero es mejor que el cliente lo tome del payload de login o lo consulte a /me)
    const token = generateToken(user);

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
        role: user.role,
        allowed_modules: user.allowed_modules
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
      'SELECT id, username, full_name, email, role, is_active, allowed_modules FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_active) {
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
        role: user.role,
        allowed_modules: user.allowed_modules
      }
    });
  } catch (err) {
    console.error('Error en me controller:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// Obtener lista básica de usuarios activos (para combos)
async function getUsers(req, res) {
  try {
    const result = await db.query(
      'SELECT id, username, full_name, role FROM users WHERE is_active = true ORDER BY full_name ASC'
    );
    return res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('Error al obtener lista de usuarios:', err);
    return res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
  }
}

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

async function getAllUsersAdmin(req, res) {
  try {
    const result = await db.query(
      'SELECT id, username, full_name, email, role, is_active, allowed_modules, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('Error al obtener todos los usuarios:', err);
    return res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
}

async function createUser(req, res) {
  const { username, password, fullName, email, role, allowed_modules } = req.body;
  if (!username || !password || !fullName || !email || !role) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const mods = allowed_modules ? JSON.stringify(allowed_modules) : JSON.stringify(["dashboard"]);

    const result = await db.query(
      `INSERT INTO users (username, password_hash, full_name, email, role, allowed_modules)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, full_name, email, role, is_active, allowed_modules`,
      [username.trim().toLowerCase(), hash, fullName, email, role, mods]
    );
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Error creando usuario:', err);
    if (err.constraint === 'users_username_key' || err.constraint === 'users_email_key') {
      return res.status(400).json({ error: 'El nombre de usuario o email ya existe.' });
    }
    return res.status(500).json({ error: 'Error al crear usuario.' });
  }
}

async function updateUserStatus(req, res) {
  const { id } = req.params;
  const { is_active } = req.body;
  
  if (req.user.id === parseInt(id, 10)) {
    return res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
  }

  try {
    await db.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error actualizando estado:', err);
    return res.status(500).json({ error: 'Error al actualizar estado.' });
  }
}

async function updateUserModules(req, res) {
  const { id } = req.params;
  const { allowed_modules, role } = req.body;

  try {
    const result = await db.query(
      'UPDATE users SET allowed_modules = $1, role = $2 WHERE id = $3 RETURNING *',
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
  createUser,
  updateUserStatus,
  updateUserModules
};
