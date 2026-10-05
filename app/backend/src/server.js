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
const dictionaryRoutes = require('./routes/dictionaries');
const bajasRoutes = require('./routes/bajas');

const app = express();
const PORT = process.env.PORT || 4002;

// Configuración de CORS con soporte para cookies HttpOnly
app.use(cors({
  origin: true, // Refleja el origen de la petición para evitar bloqueos por IP pública
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
app.use('/api/dictionaries', dictionaryRoutes);
app.use('/api/bajas', bajasRoutes);
app.use('/api', dictionaryRoutes); // Rutas alias directas para compatibilidad (/api/resource-types, /api/brands, etc.)

// Manejador global de errores (TODO: Evitar fugas de traza SQL a usuarios en producción)
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Ha ocurrido un error inesperado en el servidor.' });
});

// Función para sembrar la base de datos si está vacía
async function seedDatabaseIfEmpty() {
  try {
    const userCountResult = await db.query('SELECT COUNT(*) FROM dim_usuarios');
    const count = parseInt(userCountResult.rows[0].count, 10);
    
    if (count === 0) {
      console.log('🌱 [SIEMBRA] Base de datos vacía. Sembrando catálogos y ubicaciones...');

      // Sembrar catálogos esenciales
      const companyRes = await db.query("INSERT INTO empresas (nombre) VALUES ('SEAPTO S.A.') RETURNING id");
      // Los cargos provienen de la tabla 'positions' de la DB centralizada - no se siembra localmente
      const brandRes = await db.query("INSERT INTO marcas (nombre) VALUES ('HP') RETURNING id");
      const resourceRes = await db.query("INSERT INTO tipos_recurso (nombre) VALUES ('TODO EN UNO') RETURNING id");
      const conditionRes = await db.query("INSERT INTO dim_estados_activo (estado) VALUES ('NUEVO') RETURNING id");

      const companyName = 'SEAPTO S.A.';
      const jobName = 'ADMINISTRADOR'; // Valor por defecto para el usuario de prueba (los cargos reales vienen de la DB centralizada)
      const brandName = 'HP';
      const resourceTypeName = 'TODO EN UNO';
      const conditionId = conditionRes.rows[0].id;

      // Sembrar jerarquía de ubicaciones
      const zoneRes = await db.query("INSERT INTO dim_ubicaciones (area, punto_venta, oficina, zona) VALUES ('SISTEMAS', 'OFICINA PRINCIPAL', 'IBAGUE', 'ZONA CENTRO') RETURNING id");
      const areaId = zoneRes.rows[0].id;

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
          `INSERT INTO dim_usuarios (username, password_hash, nombre_completo, email, rol, cargo, empresa)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [u.username, hash, u.fullName, u.email, u.role, jobName, companyName]
        );
        console.log(`  - Creado usuario: ${u.username} [Rol: ${u.role}]`);
      }

      const adminResult = await db.query("SELECT id FROM dim_usuarios WHERE username = 'admin'");
      const adminId = adminResult.rows[0].id;

      console.log('🌱 [SIEMBRA] Sembrando un activo de prueba inicial...');
      
      await db.query(
        `INSERT INTO dim_activos (
          codigo, serial, modelo, psl, tipo_recurso, marca, estado_id, 
          empresa, ubicacion_id, asignado_a, estatus, valor_inicial, fecha_compra
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          'ACT-0001', 'SN-123456', 'EliteDesk 800', 'PSL-999', resourceTypeName, 
          brandName, conditionId, companyName, areaId, adminId, 'ACTIVO', 1500.00, '2026-01-15'
        ]
      );

      console.log('🌱 [SIEMBRA] Inicialización de base de datos finalizada.');
    }
  } catch (err) {
    console.error('❌ Error al verificar/sembrar la base de datos:', err);
  }
}

async function adjustUsersAndAssets() {
  try {
    console.log('🔄 [AJUSTE] Iniciando ajuste de usuarios y asignación de activos...');

    // 0. Ejecutar migración de columnas para firmas y datos
    await db.query(`
      ALTER TABLE aceptaciones_activo 
      ADD COLUMN IF NOT EXISTS firma_origen TEXT,
      ADD COLUMN IF NOT EXISTS cedula_origen VARCHAR(50),
      ADD COLUMN IF NOT EXISTS cargo_origen VARCHAR(100),
      ADD COLUMN IF NOT EXISTS firma_destino TEXT,
      ADD COLUMN IF NOT EXISTS cedula_destino VARCHAR(50),
      ADD COLUMN IF NOT EXISTS cargo_destino VARCHAR(100)
    `);

    await db.query(`
      ALTER TABLE dim_usuarios 
      ADD COLUMN IF NOT EXISTS cedula VARCHAR(50)
    `);

    await db.query(`
      ALTER TABLE dim_usuarios 
      ADD COLUMN IF NOT EXISTS empresa VARCHAR(100)
    `);

    // Migración de clasificación de activos: Activo Fijo (AF) vs Activo de Control (AC)
    await db.query(`
      ALTER TABLE dim_activos 
      ADD COLUMN IF NOT EXISTS clasificacion VARCHAR(50) DEFAULT 'Activo Fijo (AF)';

      ALTER TABLE dim_activos 
      ADD COLUMN IF NOT EXISTS proveedor VARCHAR(200);

      ALTER TABLE dim_activos 
      ADD COLUMN IF NOT EXISTS nit_proveedor VARCHAR(50);

      ALTER TABLE dim_activos 
      ADD COLUMN IF NOT EXISTS codigo_contable VARCHAR(100);

      ALTER TABLE dim_activos 
      ADD COLUMN IF NOT EXISTS factura_url VARCHAR(500);

      ALTER TABLE tipos_recurso 
      ADD COLUMN IF NOT EXISTS vida_util_meses INTEGER DEFAULT 60;

      CREATE TABLE IF NOT EXISTS proveedores (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL UNIQUE,
        nit VARCHAR(100),
        telefono VARCHAR(100),
        email VARCHAR(255),
        direccion VARCHAR(255),
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS motivos_baja (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL UNIQUE,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO motivos_baja (nombre) VALUES 
        ('Obsolescencia tecnológica'),
        ('Daño irreparable / Avería'),
        ('Fin de vida útil'),
        ('Pérdida / Robo'),
        ('Venta'),
        ('Donación'),
        ('Obsolescencia funcional')
      ON CONFLICT (nombre) DO NOTHING;

      CREATE TABLE IF NOT EXISTS bajas_activo (
        id SERIAL PRIMARY KEY,
        activo_id INTEGER NOT NULL REFERENCES dim_activos(id) ON DELETE CASCADE,
        motivo VARCHAR(255) NOT NULL,
        observaciones TEXT,
        documento_baja_url VARCHAR(500) NOT NULL,
        registrado_por INTEGER REFERENCES dim_usuarios(id),
        fecha_baja TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      DROP VIEW IF EXISTS view_activos_depreciacion CASCADE;

      CREATE OR REPLACE VIEW view_activos_depreciacion AS
      SELECT 
          a.id,
          a.codigo,
          a.serial,
          a.modelo,
          a.psl,
          a.tipo_recurso,
          a.marca,
          a.grupo_homogeneo,
          a.vida_util_meses,
          a.valor_inicial,
          a.valor_residual,
          a.fecha_compra,
          a.foto_url,
          a.estado_id,
          a.empresa,
          a.ubicacion_id,
          a.asignado_a,
          a.estatus,
          COALESCE(a.clasificacion, 'Activo Fijo (AF)') as clasificacion,
          a.proveedor,
          a.nit_proveedor,
          a.codigo_contable,
          a.factura_url,
          a.creado_en,
          a.actualizado_en,
          COALESCE(
              LEAST(
                  a.vida_util_meses, 
                  GREATEST(
                      0, 
                      (EXTRACT(year FROM age(CURRENT_DATE, a.fecha_compra)) * 12 + EXTRACT(month FROM age(CURRENT_DATE, a.fecha_compra)))::integer
                  )
              ), 
              0
          ) as meses_transcurridos,
          COALESCE(
              ROUND(
                  (a.valor_inicial - a.valor_residual) / NULLIF(a.vida_util_meses, 0), 
                  2
              ), 
              0.00
          ) as depreciacion_mensual,
          COALESCE(
              ROUND(
                  ((a.valor_inicial - a.valor_residual) / NULLIF(a.vida_util_meses, 0)) * 
                  LEAST(
                      a.vida_util_meses, 
                      GREATEST(
                          0, 
                          (EXTRACT(year FROM age(CURRENT_DATE, a.fecha_compra)) * 12 + EXTRACT(month FROM age(CURRENT_DATE, a.fecha_compra)))::integer
                      )
                  ), 
                  2
              ), 
              0.00
          ) as depreciacion_acumulada,
          COALESCE(
              ROUND(
                  a.valor_inicial - 
                  (((a.valor_inicial - a.valor_residual) / NULLIF(a.vida_util_meses, 0)) * 
                  LEAST(
                      a.vida_util_meses, 
                      GREATEST(
                          0, 
                          (EXTRACT(year FROM age(CURRENT_DATE, a.fecha_compra)) * 12 + EXTRACT(month FROM age(CURRENT_DATE, a.fecha_compra)))::integer
                      )
                  )), 
                  2
              ), 
              a.valor_inicial
          ) as valor_libros
      FROM dim_activos a;
    `);

    // 1. Obtener ID de empresa y cargo para asociar
    const companyName = 'SEAPTO S.A.';
    const jobName = 'ADMINISTRADOR';

    // 2. Definir los tres usuarios requeridos con sus respectivas cédulas
    const targetUsers = [
      {
        username: 'admin',
        email: 'admin@activos.com',
        fullName: 'Administrador',
        role: 'ADMIN',
        password: 'admin_activos_2026',
        cedula: '123456789'
      },
      {
        username: 'operator',
        email: 'operator@activos.com',
        fullName: 'Operador',
        role: 'OPERATOR',
        password: 'operator_activos_2026',
        cedula: '987654321'
      },
      {
        username: 'viewer',
        email: 'viewer@activos.com',
        fullName: 'Consultor',
        role: 'VIEWER',
        password: 'viewer_activos_2026',
        cedula: '111222333'
      }
    ];

    const seededUserIds = [];

    for (const u of targetUsers) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(u.password, salt);

      // Verificamos si ya existe el usuario
      const existRes = await db.query("SELECT id FROM dim_usuarios WHERE username = $1", [u.username]);
      let userId;

      if (existRes.rows.length > 0) {
        userId = existRes.rows[0].id;
        await db.query(
          `UPDATE dim_usuarios 
           SET password_hash = $1, nombre_completo = $2, email = $3, rol = $4, es_activo = true, cedula = $5
           WHERE id = $6`,
          [hash, u.fullName, u.email, u.role, u.cedula, userId]
        );
        console.log(`  - Usuario actualizado: ${u.username}`);
      } else {
        const insertRes = await db.query(
          `INSERT INTO dim_usuarios (username, password_hash, nombre_completo, email, rol, cargo, empresa, es_activo, cedula)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8) RETURNING id`,
          [u.username, hash, u.fullName, u.email, u.role, jobName, companyName, u.cedula]
        );
        userId = insertRes.rows[0].id;
        console.log(`  - Usuario creado: ${u.username}`);
      }

      if (u.username !== 'admin') {
        seededUserIds.push(userId);
      }
    }

    // 3. Garantizar que los 3 usuarios de administración existan sin borrar los usuarios del cliente
    console.log('🔄 [AJUSTE] Cuentas principales de administración verificadas.');
  } catch (err) {
    console.error('❌ Error durante el ajuste de usuarios/activos:', err);
  }
}

async function alterDatabaseSchema() {
  try {
    // Add missing columns to aceptaciones_activo for signature support
    await db.query(`
      ALTER TABLE aceptaciones_activo
      ADD COLUMN IF NOT EXISTS firma_origen TEXT,
      ADD COLUMN IF NOT EXISTS cedula_origen VARCHAR(50),
      ADD COLUMN IF NOT EXISTS cargo_origen VARCHAR(100),
      ADD COLUMN IF NOT EXISTS firma_destino TEXT,
      ADD COLUMN IF NOT EXISTS cedula_destino VARCHAR(50),
      ADD COLUMN IF NOT EXISTS cargo_destino VARCHAR(100),
      ADD COLUMN IF NOT EXISTS minio_key TEXT,
      ADD COLUMN IF NOT EXISTS estado_entrega VARCHAR(50);
    `);
    
    // Add minio_key and estado_entrega to fact_movimientos_activos
    await db.query(`
      ALTER TABLE fact_movimientos_activos
      ADD COLUMN IF NOT EXISTS minio_key TEXT,
      ADD COLUMN IF NOT EXISTS estado_entrega VARCHAR(50);

      CREATE INDEX IF NOT EXISTS idx_fact_movimientos_fecha ON fact_movimientos_activos(fecha_movimiento DESC);
      CREATE INDEX IF NOT EXISTS idx_fact_movimientos_activo ON fact_movimientos_activos(activo_id);
      CREATE INDEX IF NOT EXISTS idx_fact_movimientos_user_orig ON fact_movimientos_activos(usuario_origen_id);
      CREATE INDEX IF NOT EXISTS idx_fact_movimientos_user_dest ON fact_movimientos_activos(usuario_destino_id);
      CREATE INDEX IF NOT EXISTS idx_aceptaciones_activo_user_status ON aceptaciones_activo(activo_id, usuario_id, estatus);
      CREATE INDEX IF NOT EXISTS idx_dim_ubicaciones_oficina_punto ON dim_ubicaciones(oficina, punto_venta);
    `);

    // Crear tabla subtipos_recurso si no existe
    await db.query(`
      CREATE TABLE IF NOT EXISTS subtipos_recurso (
        id SERIAL PRIMARY KEY,
        tipo_recurso_id INTEGER REFERENCES tipos_recurso(id) ON DELETE CASCADE,
        nombre VARCHAR(150) NOT NULL,
        UNIQUE(tipo_recurso_id, nombre)
      );
    `);

    // Crear tabla notificaciones_alertas para alertas administrativas (e.g. inactivación de usuarios con activos)
    await db.query(`
      CREATE TABLE IF NOT EXISTS notificaciones_alertas (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL,
        usuario_id INTEGER REFERENCES dim_usuarios(id) ON DELETE CASCADE,
        mensaje TEXT NOT NULL,
        cantidad_activos INTEGER NOT NULL DEFAULT 0,
        estatus VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sembrar categorías y subcategorías requeridas
    const seedCategories = [
      {
        name: 'TERRENOS',
        subs: ['Lotes', 'Parqueaderos', 'Terrenos urbanos']
      },
      {
        name: 'CONSTRUCCIONES Y EDIFICACIONES',
        subs: ['Oficinas', 'Locales comerciales', 'Casas', 'Apartamentos', 'Bodegas', 'Garajes', 'Centros Logísticos']
      },
      {
        name: 'MAQUINARIA Y EQUIPO',
        subs: [
          'Aire acondicionado', 'Planta eléctrica', 'Paneles solares', 'Inversores', 'Reguladores solares', 'Transformadores',
          'Tableros eléctricos', 'Gabinetes eléctricos', 'Ventiladores', 'Hidrolavadoras', 'Brilladoras', 'Taladros', 'Picadoras',
          'Máquinas contadoras de billetes', 'Máquinas clasificadoras de monedas', 'Detectores de billetes', 'Protectógrafos',
          'Cosedoras industriales', 'Programadores', 'Gatos hidráulicos', 'Grameras', 'Aspiradoras', 'Scooter eléctrico'
        ]
      },
      {
        name: 'EQUIPO DE OFICINA',
        subs: [
          'Escritorios', 'Mesas', 'Sillas', 'Archivadores', 'Gabinetes', 'Casilleros', 'Lockers', 'Estantes', 'Muebles', 'Percheros',
          'Porta revistas', 'Cajones', 'Módulos', 'Cuadros', 'Persianas', 'Cortinas', 'Lámparas', 'Jarrones', 'Avisos', 'Carteleras',
          'Canecas de reciclaje', 'Separadores de fila', 'Pizarras acrílicas', 'Botiquines', 'Camillas', 'Sillas de ruedas',
          'Colchonetas', 'Muebles PUF', 'Bancas', 'Mesas plegables'
        ]
      },
      {
        name: 'EQUIPO DE COMPUTACIÓN Y COMUNICACIÓN',
        subs: [
          'Computadores Todo en Uno', 'CPU', 'Portátiles', 'Mini PC', 'Monitores', 'Tablets', 'Impresoras', 'Multifuncionales',
          'Impresoras de etiquetas', 'Escáneres', 'UPS', 'Reguladores', 'Estabilizadores', 'Discos duros', 'Discos externos',
          'Teclados', 'Mouse', 'Webcams', 'Servidores', 'Firewalls', 'Switches', 'Routers', 'Módems', 'Conversores de fibra',
          'Rack de comunicaciones', 'Rack de servidores', 'VPN', 'Troncal SIP', 'Teléfonos IP', 'Celulares', 'Datafonos',
          'Lectores biométricos', 'Lectores de código de barras', 'Lectores de tarjetas', 'Terminales Android', 'PowerBox'
        ]
      },
      {
        name: 'FLOTA Y EQUIPO DE TRANSPORTE',
        subs: ['Camionetas', 'Automóviles', 'Motocarros', 'Vans', 'Camiones', 'Motociclos']
      },
      {
        name: 'REDES DE PROCESAMIENTO DE DATOS',
        subs: [
          'Cámaras CCTV', 'Cámaras PTZ', 'NVR', 'Antenas', 'Antenas Starlink', 'Antenas magnéticas', 'Radios', 'Enlaces',
          'ODU satelital', 'Módem satelital', 'Router Gen 3', 'POE', 'Bases para cámara', 'Mástiles', 'Cajas negras',
          'Citófonos', 'Timbres inalámbricos'
        ]
      },
      {
        name: 'IMPLEMENTOS DE SEGURIDAD',
        subs: ['Extintores', 'Chalecos antibalas', 'Botiquines', 'Oxímetros', 'Tensiómetros', 'Alcoholímetros', 'Alarmas', 'Cámaras espía']
      }
    ];

    for (const cat of seedCategories) {
      const catRes = await db.query(
        `INSERT INTO tipos_recurso (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
        [cat.name]
      );
      const catId = catRes.rows[0].id;

      for (const sub of cat.subs) {
        await db.query(
          `INSERT INTO subtipos_recurso (tipo_recurso_id, nombre) VALUES ($1, $2) ON CONFLICT (tipo_recurso_id, nombre) DO NOTHING`,
          [catId, sub]
        );
      }
    }

    console.log('✅ [DB] Categorías y subcategorías sembradas y actualizadas en PostgreSQL.');
  } catch (err) {
    console.error('❌ [DB] Error alterando el esquema de la base de datos:', err);
  }
}

const { initMinio } = require('./config/minio');
const { initCentralDb } = require('./config/centralDb');
const { seedProveedores } = require('./services/supplierSeeder');

// Iniciar Servidor posterior a la verificación de la base de datos
app.listen(PORT, async () => {
  console.log(`🚀 Servidor API de Activos ejecutándose en el puerto ${PORT}`);
  
  // Ejecutar siembra automática
  await seedDatabaseIfEmpty();

  // Alterar base de datos para soporte de firma digital
  await alterDatabaseSchema();

  // Sembrar proveedores desde Excel (Hoja 1. REGISTRO DE PROVEEDORES)
  await seedProveedores();

  // Ejecutar ajuste de usuarios y asignación de activos
  await adjustUsersAndAssets();
  
  // Inicializar Minio
  await initMinio();

  // Inicializar Conexión a Base de Datos Centralizada vía SSH
  initCentralDb().catch(err => {
    console.warn('⚠️ [DB CENTRAL] La conexión inicial falló (se reintentará en la primera consulta):', err.message);
  });
});
