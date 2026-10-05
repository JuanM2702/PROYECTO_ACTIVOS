/**
 * import_client_excel.js
 * Script de Importación Masiva de Datos Reales de ATLAS
 * Carga el archivo: /home/Plantilla_Carga_Datos_Atlas (1).xlsx o /app/Plantilla_Carga_Datos_Atlas.xlsx
 * 
 * Inserción de 29.499 activos fijos, 319 usuarios, 525 sedes/ubicaciones y catálogos estandarizados.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const db = require('./config/db');

// Determinar la ruta del archivo Excel
const defaultPath1 = '/home/Plantilla_Carga_Datos_Atlas (1).xlsx';
const defaultPath2 = '/home/Plantilla_Carga_Datos_Atlas.xlsx';
const defaultPath3 = '/app/Plantilla_Carga_Datos_Atlas.xlsx';

let excelPath = process.argv[2];
if (!excelPath) {
  if (fs.existsSync(defaultPath1)) excelPath = defaultPath1;
  else if (fs.existsSync(defaultPath2)) excelPath = defaultPath2;
  else if (fs.existsSync(defaultPath3)) excelPath = defaultPath3;
  else excelPath = defaultPath3;
}

console.log(`📁 Usando archivo Excel: ${excelPath}`);

// Helper para obtener valor de un objeto fila ignorando saltos de línea y mayúsculas en las columnas
function getRowVal(row, possibleNames) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const k of keys) {
    const cleanKey = k.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    for (const p of possibleNames) {
      const cleanP = p.toLowerCase().trim();
      if (cleanKey === cleanP || cleanKey.includes(cleanP)) {
        const val = row[k];
        if (val !== undefined && val !== null && val !== '') {
          return val;
        }
      }
    }
  }
  return null;
}

// Convertir fechas de Excel (serial number o string) a YYYY-MM-DD
function parseExcelDate(val) {
  if (!val) return '2024-01-01';
  if (typeof val === 'number') {
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed) {
        const yyyy = parsed.y;
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch (e) {}
  }
  const str = String(val).trim();
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
  if (str.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const parts = str.split('/');
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return '2024-01-01';
}

async function bulkInsert(tableName, columns, rows, batchSize = 1000) {
  if (!rows || rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map((row, rowIdx) => {
      const offset = rowIdx * columns.length;
      return `(${columns.map((_, colIdx) => `$${offset + colIdx + 1}`).join(', ')})`;
    }).join(', ');
    const values = batch.flat();
    
    const queryStr = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders}`;
    await db.query(queryStr, values);
    inserted += batch.length;
  }
  return inserted;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CARGA MASIVA REAL ATLAS: Excel → PostgreSQL (Star Schema)  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const workbook = XLSX.readFile(excelPath);
    console.log('📖 Archivo Excel cargado exitosamente. Hojas encontradas:', workbook.SheetNames);

    // ─── PASO 1: LIMPIEZA DE TABLAS DE BASE DE DATOS ─────────────────────────
    console.log('🧹 [1/7] Limpiando tablas de base de datos...');
    await db.query(`
      TRUNCATE TABLE empresas, cargos, marcas, tipos_recurso,
                     aceptaciones_activo, mantenimientos, fact_movimientos_activos, 
                     dim_activos, dim_usuarios, dim_ubicaciones, 
                     dim_estados_activo, dim_tipos_movimiento, dim_tiempo RESTART IDENTITY CASCADE
    `);
    console.log('   ✅ Tablas de base de datos limpiadas.');

    // ─── PASO 2: SEMBRAR ESTADOS Y TIPOS DE MOVIMIENTO ───────────────────────
    console.log('📋 [2/7] Sembrando estados de activo y tipos de movimiento...');
    const estadosBase = ['NUEVO', 'EXCELENTE', 'BUENO', 'REGULAR', 'MALO', 'EN REPARACIÓN', 'DADO DE BAJA', 'PENDIENTE ACEPTACIÓN', 'COMODATO'];
    const estadoMap = {};
    for (const st of estadosBase) {
      const res = await db.query('INSERT INTO dim_estados_activo (estado) VALUES ($1) RETURNING id', [st]);
      estadoMap[st.toUpperCase()] = res.rows[0].id;
    }

    const tiposMov = ['ASIGNACIÓN INICIAL', 'TRASLADO INTERNO', 'MANTENIMIENTO PREVENTIVO', 'MANTENIMIENTO CORRECTIVO', 'BAJA DEFINITIVA', 'REASIGNACIÓN'];
    for (const tm of tiposMov) {
      await db.query('INSERT INTO dim_tipos_movimiento (movimiento) VALUES ($1) ON CONFLICT DO NOTHING', [tm]);
    }

    // ─── PASO 3: EXTRAER Y CARGAR CATÁLOGOS AUXILIARES ───────────────────────
    console.log('📚 [3/7] Procesando e insertando catálogos (Empresas, Cargos, Marcas, Tipos)...');
    
    // Obtener datos de la hoja INVENTARIO
    const sheetInventario = workbook.Sheets['4. INVENTARIO_ACTIVOS_REAL'] || workbook.Sheets['INVENTARIO_ACTIVOS_REAL'];
    const rowsInventario = XLSX.utils.sheet_to_json(sheetInventario || {});
    
    const setEmpresas = new Set(['SEAPTO S.A.']);
    const setMarcas = new Set(['N/A', 'GENÉRICO', 'LENOVO', 'HP', 'DELL', 'EPSON', 'CHEVROLET', 'YAMAHA', 'CISCO', 'APC', 'CUMMINS', 'LG', 'HIKVISION', 'STARLINK', 'ZEBRA', 'DEWALT']);
    const setTipos = new Set(['COMPUTADOR PORTÁTIL', 'SERVIDORES Y RACKS', 'IMPRESORAS Y ESCÁNERES', 'VEHÍCULOS Y MOTOCICLETAS', 'MAQUINARIA Y EQUIPO', 'REDES DE PROCESAMIENTO DE DATOS', 'HERRAMIENTAS', 'EQUIPO DE OFICINA / MUEBLES Y ENSERES', 'DATAFONO']);
    const setCargos = new Set(['ADMINISTRADOR DE SISTEMAS', 'ANALISTA DE INVENTARIOS', 'AUDITOR INTERNO', 'SUPERVISOR DE ZONA', 'TÉCNICO DE SOPORTE']);

    rowsInventario.forEach(r => {
      const emp = getRowVal(r, ['empresa']);
      if (emp) setEmpresas.add(String(emp).trim().toUpperCase());

      const mrc = getRowVal(r, ['marca']);
      if (mrc) setMarcas.add(String(mrc).trim().toUpperCase());

      const tpr = getRowVal(r, ['tipo de recurso', 'tipo recurso']);
      if (tpr) setTipos.add(String(tpr).trim().toUpperCase());
    });

    for (const emp of setEmpresas) {
      await db.query('INSERT INTO empresas (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [emp]);
    }
    for (const mrc of setMarcas) {
      await db.query('INSERT INTO marcas (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [mrc]);
    }
    for (const tpr of setTipos) {
      await db.query('INSERT INTO tipos_recurso (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [tpr]);
    }

    // Cargar proveedores desde la hoja 1. REGISTRO DE PROVEEDORES
    const { seedProveedores } = require('./services/supplierSeeder');
    await seedProveedores(excelPath);

    console.log(`   ✅ Catálogos sembrados: ${setEmpresas.size} empresas, ${setMarcas.size} marcas, ${setTipos.size} tipos de recurso.`);

    // ─── PASO 4: PROCESAR E INSERTAR UBICACIONES ──────────────────────────────
    console.log('📍 [4/7] Procesando ubicaciones (Red Comercial + Sedes)...');
    
    const ubicacionPdvMap = {}; // ID_SITIO_PDV -> id dim_ubicaciones
    const ubicacionRowsToInsert = [];

    // Ubicación por defecto para registros sin PDV específico
    const defaultUbicRes = await db.query(
      'INSERT INTO dim_ubicaciones (area, punto_venta, oficina, zona) VALUES ($1, $2, $3, $4) RETURNING id',
      ['OPERACIONES Y VENTAS', 'OFICINA PRINCIPAL IBAGUÉ', 'PISO 2 - SALA DE SERVIDORES', 'ZONA CENTRO']
    );
    const defaultUbicId = defaultUbicRes.rows[0].id;

    // Procesar Hoja 2.1 Red Comercial
    const sheetRedComercial = workbook.Sheets['2.1 Red Comercial'];
    if (sheetRedComercial) {
      const rowsRed = XLSX.utils.sheet_to_json(sheetRedComercial);
      rowsRed.forEach(r => {
        const pdvId = getRowVal(r, ['id_sitio_pdv', 'pdv']);
        const pdvNombre = getRowVal(r, ['nombre']) || `Sede ${pdvId}`;
        const oficina = getRowVal(r, ['oficina']) || 'Oficina Comercial';
        const zona = getRowVal(r, ['zona']) || 'Zona Centro';
        const municipio = getRowVal(r, ['municipio']) || 'Ibague';

        if (pdvId) {
          ubicacionRowsToInsert.push([
            `ÁREA COMERCIAL (${municipio.toUpperCase()})`,
            String(pdvNombre).toUpperCase(),
            String(oficina).toUpperCase(),
            String(zona).toUpperCase()
          ]);
        }
      });
    }

    // Insertar en lote las ubicaciones
    let insertedUbicCount = 0;
    for (const u of ubicacionRowsToInsert) {
      const res = await db.query(
        'INSERT INTO dim_ubicaciones (area, punto_venta, oficina, zona) VALUES ($1, $2, $3, $4) RETURNING id',
        u
      );
      insertedUbicCount++;
    }

    // Mapear PDV a los IDs creados
    const dbUbicaciones = await db.query('SELECT id, punto_venta FROM dim_ubicaciones');
    dbUbicaciones.rows.forEach(r => {
      ubicacionPdvMap[r.punto_venta] = r.id;
      // Extraer números de PDV si existen
      const match = r.punto_venta.match(/\d+/);
      if (match) {
        ubicacionPdvMap[match[0]] = r.id;
      }
    });

    console.log(`   ✅ ${insertedUbicCount + 1} ubicaciones desnormalizadas registradas.`);

    // ─── PASO 5: PROCESAR E INSERTAR USUARIOS ─────────────────────────────────
    console.log('👤 [5/7] Procesando hoja 1. USUARIOS_Y_PERSONAL...');
    
    const userCedulaMap = {};
    const userUsernameMap = {};

    const defaultPasswordHash = await bcrypt.hash('usuario_atlas_2026', 10);
    const adminHash = await bcrypt.hash('admin_activos_2026', 10);
    const operatorHash = await bcrypt.hash('operator_activos_2026', 10);
    const viewerHash = await bcrypt.hash('viewer_activos_2026', 10);

    // Usuarios del sistema por defecto
    const systemUsers = [
      ['admin', adminHash, 'Administrador del Sistema', 'admin@activos.com', 'ADMIN', 'ADMINISTRADOR DE SISTEMAS', 'SEAPTO S.A.', '123456789'],
      ['operator', operatorHash, 'Operador de Inventario', 'operator@activos.com', 'OPERATOR', 'ANALISTA DE INVENTARIOS', 'SEAPTO S.A.', '987654321'],
      ['viewer', viewerHash, 'Consultor Auditor', 'viewer@activos.com', 'VIEWER', 'AUDITOR INTERNO', 'SEAPTO S.A.', '111222333']
    ];

    for (const su of systemUsers) {
      const res = await db.query(
        `INSERT INTO dim_usuarios (username, password_hash, nombre_completo, email, rol, cargo, empresa, cedula, es_activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id, username, cedula`,
        su
      );
      const row = res.rows[0];
      userUsernameMap[row.username.toLowerCase()] = row.id;
      if (row.cedula) userCedulaMap[String(row.cedula).trim()] = row.id;
    }

    const sheetUsuarios = workbook.Sheets['1. USUARIOS_Y_PERSONAL'];
    if (sheetUsuarios) {
      const rowsUsuarios = XLSX.utils.sheet_to_json(sheetUsuarios);
      let userCount = 0;

      for (const r of rowsUsuarios) {
        const cedula = getRowVal(r, ['cédula', 'cedula']);
        const nombre = getRowVal(r, ['nombre completo', 'nombre']);
        let username = getRowVal(r, ['username']);
        const email = getRowVal(r, ['correo electrónico', 'correo', 'email']) || (username ? `${username}@gana-gana.com` : null);
        let rol = getRowVal(r, ['rol']) || 'VIEWER';
        const cargo = getRowVal(r, ['cargo']) || 'EMPLEADO';
        const empresa = getRowVal(r, ['empresa']) || 'SEAPTO S.A.';

        if (!nombre) continue;

        // Normalizar rol
        rol = String(rol).toUpperCase().trim();
        if (!['ADMIN', 'OPERATOR', 'VIEWER'].includes(rol)) rol = 'VIEWER';

        // Autogenerar username si falta
        if (!username) {
          username = `user_${cedula || Math.floor(Math.random() * 1000000)}`;
        }
        username = String(username).trim().toLowerCase();

        const cleanEmail = email ? String(email).trim().toLowerCase() : `${username}_${Math.floor(Math.random() * 1000)}@gana-gana.com`;
        const cleanCedula = cedula ? String(cedula).trim() : null;

        try {
          const res = await db.query(
            `INSERT INTO dim_usuarios (username, password_hash, nombre_completo, email, rol, cargo, empresa, cedula, es_activo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
             ON CONFLICT (username) DO UPDATE SET nombre_completo = EXCLUDED.nombre_completo RETURNING id, username, cedula`,
            [username, defaultPasswordHash, String(nombre).trim(), cleanEmail, rol, String(cargo).trim(), String(empresa).trim(), cleanCedula]
          );
          const row = res.rows[0];
          userUsernameMap[row.username.toLowerCase()] = row.id;
          if (row.cedula) userCedulaMap[String(row.cedula).trim()] = row.id;
          userCount++;
        } catch (err) {
          // Si hay duplicado en email o cédula, ignorar y continuar
        }
      }
      console.log(`   ✅ ${userCount + 3} usuarios cargados en dim_usuarios.`);
    }

    // ─── PASO 6: SEMBRAR DIMENSIÓN DE TIEMPO ─────────────────────────────────
    console.log('📅 [6/7] Sembrando dimensión de tiempo (2010-2030)...');
    const tiempoRows = [];
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    let currentDate = new Date('2010-01-01');
    const endDate = new Date('2030-12-31');

    while (currentDate <= endDate) {
      const yyyy = currentDate.getFullYear();
      const mm = currentDate.getMonth() + 1;
      const dd = currentDate.getDate();
      const id = yyyy * 10000 + mm * 100 + dd;
      const formatStr = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      const trimestre = Math.ceil(mm / 3);

      tiempoRows.push([id, formatStr, yyyy, mm, mesesNombres[mm - 1], trimestre]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await bulkInsert('dim_tiempo', ['id', 'fecha', 'anio', 'mes', 'nombre_mes', 'trimestre'], tiempoRows, 2000);
    console.log(`   ✅ ${tiempoRows.length} fechas registradas en dim_tiempo.`);

    // ─── PASO 7: PROCESAR E INSERTAR INVENTARIO MASIVO (29.499 ACTIVOS) ──────
    console.log('📦 [7/7] Procesando e insertando 29.499 activos fijos en dim_activos...');
    
    const assetBatchRows = [];
    const usedCodes = new Set();
    let processedCount = 0;

    for (let idx = 0; idx < rowsInventario.length; idx++) {
      const r = rowsInventario[idx];

      let rawCodigo = getRowVal(r, ['código de activo', 'codigo de activo', 'codigo']);
      let baseCode = rawCodigo ? String(rawCodigo).trim() : `ACT-${String(idx + 1).padStart(6, '0')}`;
      if (!baseCode) baseCode = `ACT-${String(idx + 1).padStart(6, '0')}`;

      let codigo = baseCode;
      let dupCounter = 1;
      while (usedCodes.has(codigo)) {
        codigo = `${baseCode}_${dupCounter}`;
        dupCounter++;
      }
      usedCodes.add(codigo);

      const serial = getRowVal(r, ['serial']) || 'N/A';
      const modelo = getRowVal(r, ['modelo']) || 'N/A';
      const psl = getRowVal(r, ['psl / placa', 'psl', 'placa']) || 'N/A';
      const tipoRecurso = getRowVal(r, ['tipo de recurso', 'tipo recurso']) || 'GENERAL';
      const marca = getRowVal(r, ['marca']) || 'GENÉRICO';
      const grupoHomogeneo = getRowVal(r, ['grupo homogéneo', 'grupo homogeneo']) || 'Equipo de Cómputo y Comunicación';

      const vidaUtil = parseInt(getRowVal(r, ['vida útil', 'vida util']) || 60, 10);
      const valorInicial = parseFloat(getRowVal(r, ['valor inicial', 'valor comercial']) || 0.00);
      const valorResidual = parseFloat(getRowVal(r, ['valor residual']) || 0.00);
      const fechaCompra = parseExcelDate(getRowVal(r, ['fecha compra']));

      const estadoStr = String(getRowVal(r, ['estado del activo', 'estado']) || 'BUENO').toUpperCase().trim();
      const estadoId = estadoMap[estadoStr] || estadoMap['BUENO'] || 1;

      const empresa = getRowVal(r, ['empresa']) || 'SEAPTO S.A.';
      const clasificacion = getRowVal(r, ['clasificación', 'clasificacion']) || 'Activo Fijo (AF)';
      const proveedor = getRowVal(r, ['proveedor']) || null;
      const nitProveedor = getRowVal(r, ['nit proveedor', 'nit']) || null;
      const codigoContable = getRowVal(r, ['código contable', 'codigo contable']) || null;

      // Buscar Ubicación por Punto de Venta
      const pdvVal = String(getRowVal(r, ['punto de venta', 'pdv', 'ubicación']) || '').trim();
      const ubicacionId = ubicacionPdvMap[pdvVal] || defaultUbicId;

      // Buscar Responsable Asignado
      const respVal = String(getRowVal(r, ['responsable asignado', 'responsable']) || '').trim();
      let asignadoA = null;
      if (respVal) {
        if (userCedulaMap[respVal]) {
          asignadoA = userCedulaMap[respVal];
        } else if (userUsernameMap[respVal.toLowerCase()]) {
          asignadoA = userUsernameMap[respVal.toLowerCase()];
        }
      }

      // Estatus general del activo
      let estatus = 'ACTIVO';
      if (estadoStr.includes('BAJA')) estatus = 'BAJA';
      else if (estadoStr.includes('REPARACIÓN') || estadoStr.includes('MANTENIMIENTO')) estatus = 'EN MANTENIMIENTO';
      else if (estadoStr.includes('PENDIENTE')) estatus = 'PENDIENTE ACEPTACIÓN';

      assetBatchRows.push([
        codigo,
        String(serial).trim(),
        String(modelo).trim(),
        String(psl).trim(),
        String(tipoRecurso).trim(),
        String(marca).trim(),
        String(grupoHomogeneo).trim(),
        vidaUtil,
        valorInicial,
        valorResidual,
        fechaCompra,
        estadoId,
        String(empresa).trim(),
        ubicacionId,
        asignadoA,
        estatus,
        String(clasificacion).trim(),
        proveedor ? String(proveedor).trim() : null,
        nitProveedor ? String(nitProveedor).trim() : null,
        codigoContable ? String(codigoContable).trim() : null
      ]);

      processedCount++;
    }

    const columnsAsset = [
      'codigo', 'serial', 'modelo', 'psl', 'tipo_recurso', 'marca',
      'grupo_homogeneo', 'vida_util_meses', 'valor_inicial', 'valor_residual',
      'fecha_compra', 'estado_id', 'empresa', 'ubicacion_id', 'asignado_a',
      'estatus', 'clasificacion', 'proveedor', 'nit_proveedor', 'codigo_contable'
    ];

    console.log(`   ⏳ Insertando ${assetBatchRows.length} registros en lotes transaccionales de 2.000...`);
    const totalInsertedAssets = await bulkInsert('dim_activos', columnsAsset, assetBatchRows, 2000);
    console.log(`   ✅ ${totalInsertedAssets} activos insertados exitosamente en dim_activos.`);

    // ─── PASO 8: ACTUALIZACIÓN DE SECUENCIAS ──────────────────────────────────
    console.log('🔄 Actualizando secuencias de clave primaria en PostgreSQL...');
    const sequences = [
      ['dim_activos', 'dim_activos_id_seq'],
      ['dim_usuarios', 'dim_usuarios_id_seq'],
      ['dim_ubicaciones', 'dim_ubicaciones_id_seq'],
      ['empresas', 'empresas_id_seq'],
      ['marcas', 'marcas_id_seq'],
      ['tipos_recurso', 'tipos_recurso_id_seq'],
      ['dim_estados_activo', 'dim_estados_activo_id_seq']
    ];

    for (const [tbl, seq] of sequences) {
      try {
        await db.query(`SELECT setval('${seq}', (SELECT COALESCE(MAX(id), 1) FROM ${tbl}))`);
      } catch (e) {}
    }

    // ─── PASO DE SANEAMIENTO UTF-8 (ATLAS-10) ──────────────────────────────────
    console.log('🧹 Saneando caracteres UTF-8 en usuarios y activos...');
    const replacements = [
      ["ÃƒÂ N", "ÁN"], ["ÃƒÂ", "Á"], ["Ã¡", "á"], ["Ã©", "é"], ["Ã­", "í"], 
      ["Ã³", "ó"], ["Ãº", "ú"], ["Ã±", "ñ"], ["Ã‘", "Ñ"]
    ];
    for (const [corrupt, clean] of replacements) {
      await db.query(
        `UPDATE dim_usuarios SET nombre_completo = REPLACE(nombre_completo, $1, $2) WHERE nombre_completo LIKE $3`,
        [corrupt, clean, `%${corrupt}%`]
      );
      await db.query(
        `UPDATE dim_activos SET modelo = REPLACE(modelo, $1, $2) WHERE modelo LIKE $3`,
        [corrupt, clean, `%${corrupt}%`]
      );
    }
    console.log('   ✅ Saneamiento UTF-8 completado.');

    // ─── RESUMEN DE EJECUCIÓN ────────────────────────────────────────────────
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ CARGA MASIVA COMPLETADA EXITOSAMENTE                  ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║   Activos Fijos Cargados: ${totalInsertedAssets}                                 ║`);
    console.log(`║   Usuarios Registrados:   ${userUsernameMap ? Object.keys(userUsernameMap).length : 0}                                   ║`);
    console.log(`║   Ubicaciones/Sedes:      ${insertedUbicCount + 1}                                   ║`);
    console.log(`║   Empresas:               ${setEmpresas.size}                                     ║`);
    console.log(`║   Marcas:                 ${setMarcas.size}                                    ║`);
    console.log(`║   Tipos de Recurso:       ${setTipos.size}                                     ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('❌ ERROR FATAL DURANTE LA IMPORTACIÓN:', err);
    process.exit(1);
  }
}

main();
