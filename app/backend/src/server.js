const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./config/db');

// Importar Enrutadores
const authRoutes = require('./routes/auth');
const assetsRoutes = require('./routes/assets');
const movementsRoutes = require('./routes/movements');
const acceptancesRoutes = require('./routes/acceptances');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 4002;

// Configuración de CORS con soporte para cookies HttpOnly
app.use(cors({
  origin: true, // Refleja el origen de la petición para evitar bloqueos por IP pública
  credentials: true
}));

app.use(express.json());

// Log de peticiones entrantes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Endpoint de salud básico
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Registrar Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/movements', movementsRoutes);
app.use('/api/acceptances', acceptancesRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Manejador global de errores (TODO: Evitar fugas de traza SQL a usuarios en producción)
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Ha ocurrido un error inesperado en el servidor.' });
});

// Función para sembrar la base de datos si está vacía
async function seedDatabaseIfEmpty() {
  try {
    const userCountResult = await db.query('SELECT COUNT(*) FROM usuarios');
    const count = parseInt(userCountResult.rows[0].count, 10);
    
    if (count === 0) {
      console.log('🌱 [SIEMBRA] Base de datos vacía. Sembrando catálogos y ubicaciones...');

      // Sembrar catálogos esenciales
      const companyRes = await db.query("INSERT INTO empresas (nombre) VALUES ('SEAPTO S.A.') RETURNING id");
      const jobRes = await db.query("INSERT INTO cargos (nombre) VALUES ('ADMINISTRADOR') RETURNING id");
      const brandRes = await db.query("INSERT INTO marcas (nombre) VALUES ('HP') RETURNING id");
      const resourceRes = await db.query("INSERT INTO tipos_recurso (nombre) VALUES ('TODO EN UNO') RETURNING id");
      const conditionRes = await db.query("INSERT INTO estados_activo (nombre) VALUES ('NUEVO') RETURNING id");

      const companyId = companyRes.rows[0].id;
      const jobId = jobRes.rows[0].id;
      const brandId = brandRes.rows[0].id;
      const resourceTypeId = resourceRes.rows[0].id;
      const conditionId = conditionRes.rows[0].id;

      // Sembrar jerarquía de ubicaciones
      const zoneRes = await db.query("INSERT INTO zonas (nombre) VALUES ('ZONA CENTRO') RETURNING id");
      const officeRes = await db.query("INSERT INTO oficinas (nombre, zona_id) VALUES ('IBAGUE', $1) RETURNING id", [zoneRes.rows[0].id]);
      const pointRes = await db.query("INSERT INTO puntos (nombre, oficina_id) VALUES ('OFICINA PRINCIPAL', $1) RETURNING id", [officeRes.rows[0].id]);
      const areaRes = await db.query("INSERT INTO areas (nombre, punto_id) VALUES ('SISTEMAS', $1) RETURNING id", [pointRes.rows[0].id]);
      const areaId = areaRes.rows[0].id;

      console.log('🌱 [SIEMBRA] Creando usuarios con contraseñas seguras...');
      
      const usersToSeed = [
        {
          username: 'admin',
          email: 'admin@activos.com',
          fullName: 'Administrador de Activos',
          role: 'ADMIN',
          password: process.env.ADMIN_PASSWORD || 'Admin_Inicial_2026!'
        }
      ];

      for (const u of usersToSeed) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(u.password, salt);
        
        await db.query(
          `INSERT INTO usuarios (username, password_hash, nombre_completo, email, rol, cargo_id, empresa_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [u.username, hash, u.fullName, u.email, u.role, jobId, companyId]
        );
        console.log(`  - Creado usuario: ${u.username} [Rol: ${u.role}]`);
      }

      const adminResult = await db.query("SELECT id FROM usuarios WHERE username = 'admin'");
      const adminId = adminResult.rows[0].id;

      console.log('🌱 [SIEMBRA] Sembrando un activo de prueba inicial...');
      
      await db.query(
        `INSERT INTO activos (
          codigo, serial, modelo, psl, tipo_recurso_id, marca_id, estado_id, 
          empresa_id, area_id, asignado_a, estatus, valor, fecha_compra
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          'ACT-0001', 'SN-123456', 'EliteDesk 800', 'PSL-999', resourceTypeId, 
          brandId, conditionId, companyId, areaId, adminId, 'ACTIVO', 1500.00, '2026-01-15'
        ]
      );

      console.log('🌱 [SIEMBRA] Inicialización de base de datos finalizada.');
    }
  } catch (err) {
    console.error('❌ Error al verificar/sembrar la base de datos:', err);
  }
}

// Iniciar Servidor posterior a la verificación de la base de datos
app.listen(PORT, async () => {
  console.log(`🚀 Servidor API de Activos ejecutándose en el puerto ${PORT}`);
  
  // Ejecutar siembra automática
  await seedDatabaseIfEmpty();
});
