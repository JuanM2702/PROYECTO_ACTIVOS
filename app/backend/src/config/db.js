const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db-activos',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'activos',
  password: process.env.DB_PASSWORD || 'activos_dev_2026',
  database: process.env.DB_NAME || 'activos_db',
});

// Registrar eventos del pool para diagnosticar problemas
pool.on('error', (err) => {
  console.error('Error inesperado en el cliente de base de datos ocioso:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
