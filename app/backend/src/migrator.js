/**
 * ============================================================================
 * MIGRADOR DE DATOS: MySQL (SGCAF Legacy) → PostgreSQL (Nuevo Sistema)
 * ============================================================================
 * Este script se conecta al contenedor mysql-legacy, lee los datos originales
 * y los inserta en la base de datos PostgreSQL (db-activos) con la nueva
 * nomenclatura en español.
 *
 * Uso: docker exec servicio-activos node src/migrator.js
 * ============================================================================
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');

// ─── Configuración de Conexiones ────────────────────────────────────────────

const mysqlConfig = {
  host: process.env.MYSQL_LEGACY_HOST || 'mysql-legacy',
  port: parseInt(process.env.MYSQL_LEGACY_PORT || '3306', 10),
  user: process.env.MYSQL_LEGACY_USER || 'root',
  password: process.env.MYSQL_LEGACY_PASSWORD || 'legacy_root_2026',
  database: process.env.MYSQL_LEGACY_DATABASE || 'sgcaf',
};

const pgPool = new Pool({
  host: process.env.DB_HOST || 'db-activos',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'activos',
  password: process.env.DB_PASSWORD || 'activos_dev_2026',
  database: process.env.DB_NAME || 'activos_db',
});

// ─── Utilidades ─────────────────────────────────────────────────────────────

async function pgQuery(text, params) {
  return pgPool.query(text, params);
}

// Inserta filas en lotes. Si un lote falla (ej. FK inválida), hace fallback a inserción fila por fila.
async function bulkInsert(table, columns, rows, batchSize = 1000) {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map((row, rowIdx) => {
      const offset = rowIdx * columns.length;
      return `(${columns.map((_, colIdx) => `$${offset + colIdx + 1}`).join(', ')})`;
    }).join(', ');
    const values = batch.flat();
    
    try {
      // Intentar inserción masiva primero
      await pgQuery(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO NOTHING`,
        values
      );
      inserted += batch.length;
    } catch (err) {
      // Fallback a inserción individual para ignorar solo los registros huérfanos
      for (const row of batch) {
        try {
          const rowPlaceholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
          await pgQuery(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${rowPlaceholders}) ON CONFLICT (id) DO NOTHING`,
            row
          );
          inserted++;
        } catch (e) {
          // Registro ignorado (usualmente FK inválida)
        }
      }
    }
  }
  return inserted;
}

// ─── Funciones de Migración por Tabla ───────────────────────────────────────

async function migrarEmpresas(mysqlConn) {
  console.log('  📦 Migrando empresas...');
  const [rows] = await mysqlConn.query('SELECT companyId, companyName FROM company');
  const data = rows.map(r => [r.companyId, r.companyName]);
  const count = await bulkInsert('empresas', ['id', 'nombre'], data);
  await pgQuery("SELECT setval('empresas_id_seq', (SELECT COALESCE(MAX(id),0) FROM empresas))");
  console.log(`    ✅ ${count} empresas migradas`);
}

async function migrarCargos(mysqlConn) {
  console.log('  📦 Migrando cargos...');
  const [rows] = await mysqlConn.query('SELECT jobId, jobName FROM job');
  const data = rows.map(r => [r.jobId, r.jobName]);
  const count = await bulkInsert('cargos', ['id', 'nombre'], data);
  await pgQuery("SELECT setval('cargos_id_seq', (SELECT COALESCE(MAX(id),0) FROM cargos))");
  console.log(`    ✅ ${count} cargos migrados`);
}

async function migrarMarcas(mysqlConn) {
  console.log('  📦 Migrando marcas...');
  const [rows] = await mysqlConn.query('SELECT trademarkId, trademarkName FROM trademark');
  const data = rows.map(r => [r.trademarkId, r.trademarkName]);
  const count = await bulkInsert('marcas', ['id', 'nombre'], data);
  await pgQuery("SELECT setval('marcas_id_seq', (SELECT COALESCE(MAX(id),0) FROM marcas))");
  console.log(`    ✅ ${count} marcas migradas`);
}

async function migrarTiposRecurso(mysqlConn) {
  console.log('  📦 Migrando tipos de recurso...');
  const [rows] = await mysqlConn.query('SELECT resourceId, resourceName FROM resource');
  const data = rows.map(r => [r.resourceId, r.resourceName]);
  const count = await bulkInsert('tipos_recurso', ['id', 'nombre'], data);
  await pgQuery("SELECT setval('tipos_recurso_id_seq', (SELECT COALESCE(MAX(id),0) FROM tipos_recurso))");
  console.log(`    ✅ ${count} tipos de recurso migrados`);
}

async function migrarEstadosActivo(mysqlConn) {
  console.log('  📦 Migrando estados de uso (activo)...');
  const [rows] = await mysqlConn.query('SELECT stateUseId, stateUseName FROM stateuse');
  const data = rows.map(r => [r.stateUseId, r.stateUseName]);
  const count = await bulkInsert('estados_activo', ['id', 'nombre'], data);
  await pgQuery("SELECT setval('estados_activo_id_seq', (SELECT COALESCE(MAX(id),0) FROM estados_activo))");
  console.log(`    ✅ ${count} estados migrados`);
}

async function migrarZonas(mysqlConn) {
  console.log('  📦 Migrando zonas...');
  const [rows] = await mysqlConn.query('SELECT zoneId, zoneName FROM zone');
  const data = rows.map(r => [r.zoneId, r.zoneName]);
  const count = await bulkInsert('zonas', ['id', 'nombre'], data);
  await pgQuery("SELECT setval('zonas_id_seq', (SELECT COALESCE(MAX(id),0) FROM zonas))");
  console.log(`    ✅ ${count} zonas migradas`);
}

async function migrarOficinas(mysqlConn) {
  console.log('  📦 Migrando oficinas...');
  const [rows] = await mysqlConn.query('SELECT officeId, officeName, idZoneOffice FROM office');
  const data = rows.map(r => [r.officeId, r.officeName, r.idZoneOffice || null]);
  const count = await bulkInsert('oficinas', ['id', 'nombre', 'zona_id'], data);
  await pgQuery("SELECT setval('oficinas_id_seq', (SELECT COALESCE(MAX(id),0) FROM oficinas))");
  console.log(`    ✅ ${count} oficinas migradas`);
}

async function migrarPuntos(mysqlConn) {
  console.log('  📦 Migrando puntos...');
  const [rows] = await mysqlConn.query('SELECT pointId, pointName, idOfficePoint FROM point');
  const data = rows.map(r => [r.pointId, r.pointName, r.idOfficePoint || null]);
  const count = await bulkInsert('puntos', ['id', 'nombre', 'oficina_id'], data);
  await pgQuery("SELECT setval('puntos_id_seq', (SELECT COALESCE(MAX(id),0) FROM puntos))");
  console.log(`    ✅ ${count} puntos migrados`);
}

async function migrarAreas(mysqlConn) {
  console.log('  📦 Migrando áreas...');
  const [rows] = await mysqlConn.query('SELECT areaId, areaName, idPointArea FROM area');
  const data = rows.map(r => [r.areaId, r.areaName, r.idPointArea || null]);
  const count = await bulkInsert('areas', ['id', 'nombre', 'punto_id'], data);
  await pgQuery("SELECT setval('areas_id_seq', (SELECT COALESCE(MAX(id),0) FROM areas))");
  console.log(`    ✅ ${count} áreas migradas`);
}

async function migrarUsuarios(mysqlConn) {
  console.log('  📦 Migrando usuarios...');
  const [rows] = await mysqlConn.query('SELECT userId, userName, userMail, userPass, idCompanyUser, idJobUser FROM user');
  const data = rows.map(r => [
    r.userId,
    r.userMail ? r.userMail.toLowerCase().replace(/[^a-z0-9@._-]/g, '') : `user_${r.userId}`,
    r.userPass || '$2y$10$placeholder_hash_no_login',
    r.userName || 'SIN NOMBRE',
    r.userMail || `user_${r.userId}@legacy.local`,
    'VIEWER',
    r.idJobUser || null,
    r.idCompanyUser || null,
    true
  ]);
  const count = await bulkInsert('usuarios', ['id', 'username', 'password_hash', 'nombre_completo', 'email', 'rol', 'cargo_id', 'empresa_id', 'es_activo'], data);
  await pgQuery("SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),0) FROM usuarios))");
  console.log(`    ✅ ${count} usuarios migrados`);
}

async function migrarActivos(mysqlConn) {
  console.log('  📦 Migrando activos...');
  const [rows] = await mysqlConn.query(
    `SELECT activeId, activeCode, activeSerial, activeModel, activePsl,
            idUseActive, idTypeActive, idTrademarkActive, idResourceActive,
            idCompanyActive, idUserActive, idAreaActive, idStateActive
     FROM active`
  );
  const data = rows.map(r => [
    r.activeId,
    r.activeCode,
    r.activeSerial || null,
    r.activeModel || null,
    r.activePsl || null,
    r.idResourceActive || null,
    r.idTrademarkActive || null,
    r.idUseActive || null,
    r.idCompanyActive || null,
    r.idAreaActive || null,
    r.idUserActive || null,
    r.idStateActive === 1 ? 'ACTIVO' : 'BAJA'
  ]);
  const count = await bulkInsert('activos', ['id', 'codigo', 'serial', 'modelo', 'psl', 'tipo_recurso_id', 'marca_id', 'estado_id', 'empresa_id', 'area_id', 'asignado_a', 'estatus'], data);
  await pgQuery("SELECT setval('activos_id_seq', (SELECT COALESCE(MAX(id),0) FROM activos))");
  console.log(`    ✅ ${count} activos migrados`);
}

async function migrarMantenimientos(mysqlConn) {
  console.log('  📦 Migrando mantenimientos...');
  const [rows] = await mysqlConn.query(
    `SELECT maintenanceId, maintenanceDate, idUserTechMain, maintenanceFind, maintenanceRemark,
            idActiveMain, idTypeMaintenance
     FROM maintenance`
  );
  const tipoMap = { 1: 'CORRECTIVO', 2: 'PREVENTIVO', 3: 'PREDICTIVO' };
  const data = rows.map(r => [
    r.maintenanceId,
    r.idActiveMain,
    r.maintenanceDate,
    r.idUserTechMain || null,
    tipoMap[r.idTypeMaintenance] || 'PREVENTIVO',
    r.maintenanceFind || null,
    r.maintenanceRemark || null
  ]);
  const count = await bulkInsert('mantenimientos', ['id', 'activo_id', 'fecha_mantenimiento', 'usuario_tecnico_id', 'tipo_mantenimiento', 'hallazgos', 'observaciones'], data);
  await pgQuery("SELECT setval('mantenimientos_id_seq', (SELECT COALESCE(MAX(id),0) FROM mantenimientos))");
  console.log(`    ✅ ${count} mantenimientos migrados`);
}

// ─── Ejecución Principal ────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   MIGRADOR: MySQL (SGCAF) → PostgreSQL (Nuevo Sistema)     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  let mysqlConn;

  try {
    // 1. Conectar a MySQL
    console.log('🔌 Conectando a MySQL Legacy...');
    mysqlConn = await mysql.createConnection(mysqlConfig);
    console.log('   ✅ Conectado a MySQL');

    // 2. Limpiar base de datos destino si existe data parcial
    console.log('🧹 Limpiando base de datos destino...');
    await pgQuery(`
      TRUNCATE TABLE mantenimientos, movimientos_activo, activos, usuarios, 
                     areas, puntos, oficinas, zonas, 
                     empresas, cargos, marcas, tipos_recurso, estados_activo RESTART IDENTITY CASCADE
    `);

    // 3. Migrar en orden (respetar dependencias de FK)
    console.log('');
    console.log('🚀 Iniciando migración de datos...');
    console.log('');

    // Catálogos (sin dependencias)
    await migrarEmpresas(mysqlConn);
    await migrarCargos(mysqlConn);
    await migrarMarcas(mysqlConn);
    await migrarTiposRecurso(mysqlConn);
    await migrarEstadosActivo(mysqlConn);

    // Ubicaciones (jerárquicas)
    await migrarZonas(mysqlConn);
    await migrarOficinas(mysqlConn);
    await migrarPuntos(mysqlConn);
    await migrarAreas(mysqlConn);

    // Entidades principales (dependen de catálogos y ubicaciones)
    await migrarUsuarios(mysqlConn);
    await migrarActivos(mysqlConn);

    // Transaccionales (dependen de activos y usuarios)
    await migrarMantenimientos(mysqlConn);

    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  ✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');

  } catch (err) {
    console.error('');
    console.error('❌ ERROR FATAL EN LA MIGRACIÓN:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (mysqlConn) await mysqlConn.end();
    await pgPool.end();
  }
}

main();
