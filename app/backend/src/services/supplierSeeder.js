const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const db = require('../config/db');

/**
 * Normaliza nombres de encabezado de columnas (remueve saltos de línea, comillas, múltiples espacios y tildes).
 */
function cleanHeader(k) {
  if (!k) return '';
  return String(k)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.\/]/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extrae valores de una fila según el tipo de campo objetivo.
 */
function getRowVal(r, targetType) {
  const keys = Object.keys(r);

  if (targetType === 'nombre') {
    // 1. Coincidencia exacta de nombre o razón social
    for (const k of keys) {
      const c = cleanHeader(k);
      if (c === 'nombre' || c === 'razon social' || c === 'nombre proveedor' || c === 'proveedor') {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== 'N/A') {
          return String(val).trim();
        }
      }
    }
    // 2. Coincidencia parcial que incluya 'proveedor' pero NO 'nit' ni 'cedula'
    for (const k of keys) {
      const c = cleanHeader(k);
      if (c.includes('proveedor') && !c.includes('nit') && !c.includes('cedula')) {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== 'N/A') {
          return String(val).trim();
        }
      }
    }
  }

  if (targetType === 'nit') {
    // 1. Coincidencia exacta de nit
    for (const k of keys) {
      const c = cleanHeader(k);
      if (c === 'nit' || c === 'nit proveedor' || c === 'nitproveedor' || c === 'cedula' || c === 'identificacion' || c === 'documento') {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== 'N/A') {
          return String(val).trim();
        }
      }
    }
    // 2. Coincidencia parcial que contenga 'nit', 'cedula' o 'identificac'
    for (const k of keys) {
      const c = cleanHeader(k);
      if (c.includes('nit') || c.includes('cedula') || c.includes('identificac')) {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== 'N/A') {
          return String(val).trim();
        }
      }
    }
  }

  if (targetType === 'telefono') {
    for (const k of keys) {
      const c = cleanHeader(k);
      if (c.includes('telefono') || c.includes('celular') || c.includes('contacto') || c === 'tel') {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
      }
    }
  }

  if (targetType === 'email') {
    for (const k of keys) {
      const c = cleanHeader(k);
      if (c.includes('email') || c.includes('correo')) {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
      }
    }
  }

  if (targetType === 'direccion') {
    for (const k of keys) {
      const c = cleanHeader(k);
      if (c.includes('direccion') || c.includes('ubicacion')) {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
      }
    }
  }

  return null;
}

async function seedProveedores(customExcelPath = null, clearExisting = true) {
  try {
    let excelPath = customExcelPath;
    if (!excelPath) {
      const p1 = '/home/Plantilla_Carga_Datos_Atlas (1).xlsx';
      const p2 = '/home/Plantilla_Carga_Datos_Atlas.xlsx';
      const p3 = '/app/Plantilla_Carga_Datos_Atlas.xlsx';
      if (fs.existsSync(p1)) excelPath = p1;
      else if (fs.existsSync(p2)) excelPath = p2;
      else if (fs.existsSync(p3)) excelPath = p3;
    }

    if (!excelPath || !fs.existsSync(excelPath)) {
      console.log('⚠️ [Proveedores] No se encontró la plantilla Excel para importar proveedores.');
      return 0;
    }

    // Limpiar tabla existente si se requiere
    if (clearExisting) {
      await db.query('DELETE FROM proveedores;');
      console.log('🗑️ [Proveedores] Tabla de proveedores vaciada antes de la importación limpia.');
    }

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames.find(n => 
      n.includes('REGISTRO DE PROVEEDORES') || n.toLowerCase().includes('proveedor')
    );

    let loadedCount = 0;

    if (sheetName) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      for (const r of rows) {
        const nombre = getRowVal(r, 'nombre');
        if (!nombre) continue;

        const nit = getRowVal(r, 'nit');
        const telefono = getRowVal(r, 'telefono');
        const email = getRowVal(r, 'email');
        const direccion = getRowVal(r, 'direccion');

        await db.query(
          `INSERT INTO proveedores (nombre, nit, telefono, email, direccion)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (nombre) DO UPDATE SET
             nit = COALESCE(EXCLUDED.nit, proveedores.nit),
             telefono = COALESCE(EXCLUDED.telefono, proveedores.telefono),
             email = COALESCE(EXCLUDED.email, proveedores.email),
             direccion = COALESCE(EXCLUDED.direccion, proveedores.direccion)`,
          [nombre, nit || null, telefono || null, email || null, direccion || null]
        );
        loadedCount++;
      }
      console.log(`   ✅ [Proveedores] ${loadedCount} proveedores procesados desde la hoja "${sheetName}".`);
    }

    // Además, extraer proveedores y sus NITs mencionados en la hoja de inventario si existen
    const sheetInventarioName = workbook.SheetNames.find(n => n.includes('INVENTARIO_ACTIVOS_REAL'));
    if (sheetInventarioName) {
      const rowsInv = XLSX.utils.sheet_to_json(workbook.Sheets[sheetInventarioName], { defval: '' });
      let invProvCount = 0;
      for (const r of rowsInv) {
        const keys = Object.keys(r);
        let provName = null;
        let provNit = null;
        for (const k of keys) {
          const cleanK = cleanHeader(k);
          if (cleanK.includes('proveedor') && !cleanK.includes('nit')) {
            const v = r[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') provName = String(v).trim();
          }
          if (cleanK.includes('nitproveedor') || cleanK.includes('nit_proveedor') || (cleanK.includes('nit') && cleanK.includes('proveedor'))) {
            const v = r[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') provNit = String(v).trim();
          }
        }

        if (provName && provName !== '' && provName !== 'N/A') {
          await db.query(
            `INSERT INTO proveedores (nombre, nit) VALUES ($1, $2)
             ON CONFLICT (nombre) DO UPDATE SET
               nit = COALESCE(proveedores.nit, EXCLUDED.nit)`,
            [provName, provNit || null]
          );
          invProvCount++;
        }
      }
    }

    return loadedCount;
  } catch (err) {
    console.error('❌ Error al sembrar proveedores:', err);
    return 0;
  }
}

module.exports = { seedProveedores };
