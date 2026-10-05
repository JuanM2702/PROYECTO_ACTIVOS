const db = require('../config/db');
const { seedProveedores } = require('../services/supplierSeeder');

async function main() {
  console.log('🔄 Re-importando catálogo de proveedores desde el archivo Excel...');
  const count = await seedProveedores(null, true);
  console.log(`✅ ¡Éxito! Se cargaron ${count} proveedores con sus NITs correctamente.`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error durante la reimportación:', err);
  process.exit(1);
});
