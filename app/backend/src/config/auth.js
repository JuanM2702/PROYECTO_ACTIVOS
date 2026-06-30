const jwt = require('jsonwebtoken');
const fs = require('fs');
const crypto = require('crypto');

// Resolución segura de la clave secreta para firmar tokens
function getSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'activos_super_secret_jwt_key_2026') {
    return process.env.JWT_SECRET;
  }
  if (fs.existsSync('./jwt_secret.txt')) {
    return fs.readFileSync('./jwt_secret.txt', 'utf-8').trim();
  }
  console.warn("🔒 [SEGURIDAD] Generando clave secreta JWT efímera para esta instancia.");
  const ephemeralSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync('./jwt_secret.txt', ephemeralSecret);
  } catch (err) {
    // No se pudo escribir, usar la efímera en memoria
  }
  return ephemeralSecret;
}

const JWT_SECRET = getSecret();

// Utilidad manual para parsear Cookies sin añadir dependencias adicionales
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [key, ...valParts] = cookie.split('=');
    if (key) {
      cookies[key.trim()] = valParts.join('=').trim();
    }
  });
  return cookies;
}

// Generar token JWT
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// Middleware de Autenticación
function authenticateToken(req, res, next) {
  // 1. Intentar obtener el token de la cookie "token" (Estrategia preferida anti-XSS)
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies.token;

  // 2. Fallback: buscar en la cabecera de Autorización (Útil para pruebas y llamadas directas)
  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Sesión inválida o expirada.' });
  }
}

// Middleware de Autorización por Roles (RBAC)
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos suficientes para realizar esta acción.' });
    }
    
    next();
  };
}

module.exports = {
  generateToken,
  authenticateToken,
  requireRole,
  JWT_SECRET,
};
