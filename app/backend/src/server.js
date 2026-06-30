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
    const userCountResult = await db.query('SELECT COUNT(*) FROM users');
    const count = parseInt(userCountResult.rows[0].count, 10);
    
    if (count === 0) {
      console.log('🌱 [SIEMBRA] Base de datos vacía. Creando usuarios con contraseñas seguras...');
      
      const usersToSeed = [
        {
          username: 'admin',
          email: 'admin@activos.com',
          fullName: 'Administrador de Activos',
          role: 'ADMIN',
          password: process.env.ADMIN_PASSWORD || 'Admin_Inicial_2026!'
        },
        {
          username: 'operator',
          email: 'operator@activos.com',
          fullName: 'Operador Técnico',
          role: 'OPERATOR',
          password: process.env.OPERATOR_PASSWORD || 'Operator_Inicial_2026!'
        },
        {
          username: 'viewer',
          email: 'viewer@activos.com',
          fullName: 'Consultor Visual',
          role: 'VIEWER',
          password: process.env.VIEWER_PASSWORD || 'Viewer_Inicial_2026!'
        }
      ];

      for (const u of usersToSeed) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(u.password, salt);
        
        await db.query(
          `INSERT INTO users (username, password_hash, full_name, email, role)
           VALUES ($1, $2, $3, $4, $5)`,
          [u.username, hash, u.fullName, u.email, u.role]
        );
        console.log(`  - Creado usuario: ${u.username} [Rol: ${u.role}] (Contraseña omitida por seguridad)`);
      }

      // Obtener IDs de usuarios asignados
      const adminResult = await db.query("SELECT id FROM users WHERE username = 'admin'");
      const operatorResult = await db.query("SELECT id FROM users WHERE username = 'operator'");
      const adminId = adminResult.rows[0].id;
      const operatorId = operatorResult.rows[0].id;

      console.log('🌱 [SIEMBRA] Sembrando activos y actas de aceptación iniciales...');
      const assetsToSeed = [
        {
          code: 'ACT-0001',
          name: 'Servidor Dell PowerEdge R760',
          desc: 'Servidor rack para procesamiento de datos de telemetría IoT',
          cat: 'Hardware',
          status: 'Activo',
          loc: 'Sala de Servidores A',
          val: 7800.00,
          pdate: '2026-01-15',
          userId: adminId
        },
        {
          code: 'ACT-0002',
          name: 'MacBook Pro M3 Max 16"',
          desc: 'Estación de trabajo para desarrollo de firmware IoT',
          cat: 'Hardware',
          status: 'Activo',
          loc: 'Oficina Central - Piso 3',
          val: 3999.00,
          pdate: '2026-02-10',
          userId: operatorId
        },
        {
          code: 'ACT-0003',
          name: 'Licencia Red Hat Enterprise Linux',
          desc: 'Suscripción anual corporativa para servidores de producción',
          cat: 'Software',
          status: 'Activo',
          loc: 'Licenciamiento Digital',
          val: 1800.00,
          pdate: '2026-03-01',
          userId: adminId
        },
        {
          code: 'ACT-0004',
          name: 'Aire Acondicionado Precision LG',
          desc: 'Climatizador inteligente para centro de datos principal',
          cat: 'Mobiliario',
          status: 'Pendiente Aceptación',
          loc: 'Sala de Servidores A',
          val: 5500.00,
          pdate: '2026-04-18',
          userId: operatorId
        },
        {
          code: 'ACT-0005',
          name: 'Camioneta Eléctrica Distribución BYD',
          desc: 'Vehículo para soporte e inspección técnica de antenas en campo',
          cat: 'Vehículos',
          status: 'En Mantenimiento',
          loc: 'Garaje General de Operaciones',
          val: 34500.00,
          pdate: '2025-11-20',
          userId: null
        }
      ];

      for (const a of assetsToSeed) {
        const insertResult = await db.query(
          `INSERT INTO assets (code, name, description, category, status, location, value, purchase_date, assigned_to)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [a.code, a.name, a.desc, a.cat, a.status, a.loc, a.val, a.pdate, a.userId]
        );
        
        // Si el estado es Pendiente Aceptación, crear la bandeja de firmas del usuario asignado
        if (a.status === 'Pendiente Aceptación' && a.userId) {
          await db.query(
            `INSERT INTO asset_acceptances (asset_id, user_id, status)
             VALUES ($1, $2, 'PENDIENTE')`,
            [insertResult.rows[0].id, a.userId]
          );
        }
      }
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
