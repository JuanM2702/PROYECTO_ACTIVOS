const { Client } = require('ssh2');
const { Pool } = require('pg');
const net = require('net');
const fs = require('fs');

let pgPool = null;
let sshClient = null;
let localBridgeServer = null;
let localBridgePort = null;
let isConnecting = false;
let connectionPromise = null;

function getPrivateKey() {
  const keyPath = process.env.SSH_PRIVATE_KEY_PATH || '/app/ssh/id_ed25519';
  const fallbackPath = '/home/id_ed25519';
  
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath);
  }
  throw new Error(`Clave SSH no encontrada en ${keyPath} ni en ${fallbackPath}`);
}

async function initCentralDb() {
  if (pgPool) return pgPool;
  if (isConnecting) return connectionPromise;

  isConnecting = true;
  connectionPromise = new Promise((resolve, reject) => {
    try {
      const sshHost = process.env.SSH_HOST || '185.28.22.70';
      const sshPort = parseInt(process.env.SSH_PORT || '22', 10);
      const sshUser = process.env.SSH_USER || 'nexus_user';

      const dbPort = parseInt(process.env.CENTRAL_DB_PORT || '5434', 10);
      const dbName = process.env.CENTRAL_DB_NAME || 'centralized';
      const dbUser = process.env.CENTRAL_DB_USER || 'iws_user';
      const dbPass = process.env.CENTRAL_DB_PASSWORD || 'ScU0IiR22HiyJm';

      const privateKey = getPrivateKey();

      sshClient = new Client();

      sshClient.on('ready', () => {
        console.log('🔒 [SSH] Conexión SSH autenticada con éxito hacia', sshHost);

        // Crear servidor puente TCP local
        localBridgeServer = net.createServer((socket) => {
          sshClient.forwardOut(
            '127.0.0.1', 
            socket.remotePort || 12345, 
            'localhost', 
            dbPort, 
            (err, stream) => {
              if (err) {
                console.error('❌ [SSH] Error en forwardOut para conexión entrante:', err.message);
                socket.destroy();
                return;
              }
              socket.pipe(stream).pipe(socket);
              socket.on('error', () => stream.destroy());
              stream.on('error', () => socket.destroy());
            }
          );
        });

        // Escuchar en puerto local aleatorio efímero
        localBridgeServer.listen(0, '127.0.0.1', () => {
          localBridgePort = localBridgeServer.address().port;
          console.log(`🌐 [SSH BRIDGE] Túnel local activo en 127.0.0.1:${localBridgePort} -> ${sshHost}:${dbPort}`);

          pgPool = new Pool({
            host: '127.0.0.1',
            port: localBridgePort,
            user: dbUser,
            password: dbPass,
            database: dbName,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
          });

          pgPool.on('error', (err) => {
            console.error('❌ [DB CENTRAL] Error en el pool de conexiones centralizado:', err.message);
          });

          console.log('✅ [DB CENTRAL] Pool PostgreSQL listo y conectado a DB centralizada:', dbName);
          isConnecting = false;
          resolve(pgPool);
        });

        localBridgeServer.on('error', (err) => {
          console.error('❌ [SSH BRIDGE] Error en el servidor puente local:', err);
          isConnecting = false;
          pgPool = null;
          reject(err);
        });
      });

      sshClient.on('error', (err) => {
        console.error('❌ [SSH] Error en cliente SSH:', err.message);
        isConnecting = false;
        pgPool = null;
        reject(err);
      });

      sshClient.on('close', () => {
        console.warn('⚠️ [SSH] Conexión SSH cerrada.');
        if (localBridgeServer) {
          try { localBridgeServer.close(); } catch (e) {}
        }
        pgPool = null;
      });

      sshClient.connect({
        host: sshHost,
        port: sshPort,
        username: sshUser,
        privateKey: privateKey,
        readyTimeout: 20000,
        keepaliveInterval: 10000
      });

    } catch (err) {
      isConnecting = false;
      console.error('❌ [DB CENTRAL] Error de inicialización:', err);
      reject(err);
    }
  });

  return connectionPromise;
}

/**
 * Ejecutar una consulta en la base de datos centralizada
 */
async function queryCentral(text, params) {
  try {
    const pool = await initCentralDb();
    return await pool.query(text, params);
  } catch (err) {
    console.error('❌ [DB CENTRAL] Error ejecutando consulta:', err);
    throw err;
  }
}

/**
let cachedDocCol = null;

/**
 * Buscar usuario en la tabla `users` de la base de datos centralizada por cédula/documento,
 * uniendo con la tabla `positions` para obtener el nombre del cargo.
 */
async function findCentralUserByCedula(cedula) {
  if (!cedula) return null;
  const cleanCedula = String(cedula).trim();

  try {
    const pool = await initCentralDb();
    
    // Determinar la columna de documento (cachear en memoria para evitar redundancia de queries)
    if (!cachedDocCol) {
      try {
        const colsResult = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users'
        `);
        const cols = colsResult.rows.map(r => r.column_name.toLowerCase());
        if (cols.includes('document_number')) cachedDocCol = 'document_number';
        else if (cols.includes('cedula')) cachedDocCol = 'cedula';
        else if (cols.includes('documento')) cachedDocCol = 'documento';
        else if (cols.includes('num_documento')) cachedDocCol = 'num_documento';
        else cachedDocCol = 'document_number';
      } catch (colErr) {
        console.warn('⚠️ [DB CENTRAL] Error al consultar columnas de la tabla users, utilizando default document_number:', colErr.message);
        cachedDocCol = 'document_number';
      }
    }

    const docCol = cachedDocCol || 'document_number';

    console.log(`🔍 [DB CENTRAL] Buscando cédula ${cleanCedula} en u.${docCol} uniendo tabla positions...`);

    const result = await pool.query(
      `SELECT u.*, p.name AS position_name 
       FROM users u 
       LEFT JOIN positions p ON u.position_id = p.id 
       WHERE CAST(u.${docCol} AS VARCHAR) = $1 
       LIMIT 1`,
      [cleanCedula]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const raw = result.rows[0];

    // Construir nombre completo a partir de la respuesta centralizada
    const nameParts = [raw.names, raw.first_last_name, raw.second_last_name].filter(Boolean);
    const fullName = raw.full_name || raw.nombre_completo || (nameParts.length > 0 ? nameParts.join(' ') : null) || raw.name || 'Sin Nombre';
    
    const email = raw.email || raw.correo || `${cleanCedula}@empresa.com`;
    const username = raw.username || raw.user_name || cleanCedula;
    
    // Determinar si el usuario está activo
    const isActive = raw.active === true || String(raw.active).toLowerCase() === 'true' || raw.active === 1;
    const status = raw.status || raw.estado || (isActive ? 'Active' : 'Inactive');
    
    // Extraer cargo obtenido del LEFT JOIN a la tabla positions (p.name -> position_name)
    const cargo = raw.position_name || raw.cargo || raw.position || (raw.position_id ? `Cargo ID: ${raw.position_id}` : 'Funcionario');
    const empresa = raw.empresa || raw.company || 'SEAPTO S.A.';

    return {
      raw,
      cedula: cleanCedula,
      username,
      fullName,
      email,
      status,
      cargo,
      empresa,
      isActive
    };

  } catch (err) {
    console.error(`❌ [DB CENTRAL] Error al buscar usuario por cédula ${cedula}:`, err);
    throw err;
  }
}

module.exports = {
  initCentralDb,
  queryCentral,
  findCentralUserByCedula
};

