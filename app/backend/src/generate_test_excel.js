/**
 * Generador de Archivo Excel de Prueba para Carga Masiva de Activos
 * Genera 50 registros realistas compatibles con los catálogos de SEAPTO S.A.
 * Incluye Código de Activo y Clasificación (AF o AC).
 */

const XLSX = require('xlsx');

const rawItems = [
  { name: "Portatil Lenovo ThinkPad T14 Gen 3", val: 3850000, cat: "COMPUTADOR PORTÁTIL", brand: "Lenovo", status: "Activo", loc: "SISTEMAS", sn: "PF38K110", psl: "PSL-2026-101", date: "2024-02-15", resp: "admin", af: true },
  { name: "Portatil HP EliteBook 840 G8", val: 4200000, cat: "COMPUTADOR PORTÁTIL", brand: "HP", status: "Activo", loc: "CONTABILIDAD", sn: "5CD142099", psl: "PSL-2026-102", date: "2024-01-20", resp: "operator", af: true },
  { name: "Portatil Dell Latitude 5420 i7", val: 3900000, cat: "COMPUTADOR PORTÁTIL", brand: "Dell", status: "Activo", loc: "RECURSOS HUMANOS", sn: "8J39XK10", psl: "PSL-2026-103", date: "2024-03-10", resp: "viewer", af: true },
  { name: "Portatil Apple MacBook Air M2 13\"", val: 5600000, cat: "COMPUTADOR PORTÁTIL", brand: "Apple", status: "Activo", loc: "GERENCIA", sn: "C02XYZ123", psl: "PSL-2026-104", date: "2024-04-01", resp: "admin", af: true },
  { name: "Portatil Asus ZenBook Pro 15", val: 3500000, cat: "COMPUTADOR PORTÁTIL", brand: "Asus", status: "Activo", loc: "VENTAS", sn: "AS992100", psl: "PSL-2026-105", date: "2023-11-12", resp: "operator", af: true },
  { name: "Computador All-in-One HP 24-df", val: 2800000, cat: "TODO EN UNO", brand: "HP", status: "Activo", loc: "OFICINA PRINCIPAL", sn: "HP881920", psl: "PSL-2026-106", date: "2023-08-05", resp: "viewer", af: true },
  { name: "Computador All-in-One Lenovo IdeaCentre 3", val: 2650000, cat: "TODO EN UNO", brand: "Lenovo", status: "Activo", loc: "RECEPCION", sn: "LN449102", psl: "PSL-2026-107", date: "2023-09-18", resp: "admin", af: true },
  { name: "Computador de Escritorio Dell OptiPlex 7090", val: 3400000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Dell", status: "Activo", loc: "SISTEMAS", sn: "DL773019", psl: "PSL-2026-108", date: "2023-06-25", resp: "operator", af: true },
  { name: "Servidor Rack Dell PowerEdge R640 Xeon", val: 18500000, cat: "SERVIDORES", brand: "Dell", status: "Activo", loc: "CENTRO DE COMPUTO", sn: "PE882109", psl: "PSL-2026-109", date: "2022-12-01", resp: "admin", af: true },
  { name: "Servidor HP ProLiant DL380 Gen10", val: 21000000, cat: "SERVIDORES", brand: "HP", status: "Activo", loc: "CENTRO DE COMPUTO", sn: "HP380011", psl: "PSL-2026-110", date: "2022-10-15", resp: "admin", af: true },
  { name: "Monitor Samsung 27 Curvo FHD", val: 780000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Samsung", status: "Activo", loc: "SISTEMAS", sn: "SM279011", psl: "PSL-2026-111", date: "2024-01-10", resp: "viewer", af: false },
  { name: "Monitor LG UltraWide 29 Pulgadas", val: 1150000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "LG", status: "Activo", loc: "CONTABILIDAD", sn: "LG290014", psl: "PSL-2026-112", date: "2023-11-20", resp: "operator", af: false },
  { name: "Monitor Dell Professional 24 Pulgadas", val: 650000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Dell", status: "Activo", loc: "VENTAS", sn: "DL240981", psl: "PSL-2026-113", date: "2024-02-18", resp: "admin", af: false },
  { name: "Impresora Multifuncional Epson EcoTank L3250", val: 920000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Epson", status: "Activo", loc: "RECURSOS HUMANOS", sn: "EP325010", psl: "PSL-2026-114", date: "2023-07-14", resp: "viewer", af: true },
  { name: "Impresora Laser HP LaserJet Pro MFP M428fdw", val: 2450000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "HP", status: "Activo", loc: "OFICINA PRINCIPAL", sn: "HP428019", psl: "PSL-2026-115", date: "2023-05-19", resp: "admin", af: true },
  { name: "Impresora Termica Zebra ZD220 Codigo Barras", val: 1350000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "BODEGA PRINCIPAL", sn: "ZB220911", psl: "PSL-2026-116", date: "2023-09-02", resp: "operator", af: false },
  { name: "Switch Cisco Catalyst 2960-X 48 Puertos", val: 6200000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Cisco", status: "Activo", loc: "CENTRO DE COMPUTO", sn: "CS296048", psl: "PSL-2026-117", date: "2023-01-11", resp: "admin", af: true },
  { name: "Router Cisco ISR 4331 Gigabit", val: 8900000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Cisco", status: "Activo", loc: "CENTRO DE COMPUTO", sn: "CS433109", psl: "PSL-2026-118", date: "2022-11-28", resp: "admin", af: true },
  { name: "Punto de Acceso Cisco Catalyst 9115 Wi-Fi 6", val: 2100000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Cisco", status: "Activo", loc: "OFICINA PRINCIPAL", sn: "CS911501", psl: "PSL-2026-119", date: "2023-04-16", resp: "operator", af: false },
  { name: "UPS Online APC Smart-UPS 3000VA 230V", val: 5400000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "APC", status: "Activo", loc: "CENTRO DE COMPUTO", sn: "APC30001", psl: "PSL-2026-120", date: "2023-02-14", resp: "admin", af: true },
  { name: "UPS Interactiva APC Back-UPS 1500VA", val: 1200000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "APC", status: "Activo", loc: "SISTEMAS", sn: "APC15002", psl: "PSL-2026-121", date: "2023-10-09", resp: "viewer", af: false },
  { name: "Silla Ergonomica Operativa Malla", val: 380000, cat: "MUEBLES Y ENSERES", brand: "GENÉRICO", status: "Activo", loc: "SISTEMAS", sn: "", psl: "PSL-2026-122", date: "2024-02-10", resp: "", af: false },
  { name: "Silla Ergonomica Ejecutiva Cabecero", val: 620000, cat: "MUEBLES Y ENSERES", brand: "GENÉRICO", status: "Activo", loc: "GERENCIA", sn: "", psl: "PSL-2026-123", date: "2024-01-15", resp: "admin", af: false },
  { name: "Escritorio en L Melamina 1.50x1.50m", val: 850000, cat: "MUEBLES Y ENSERES", brand: "GENÉRICO", status: "Activo", loc: "CONTABILIDAD", sn: "", psl: "PSL-2026-124", date: "2023-12-05", resp: "operator", af: false },
  { name: "Archivador Metalico 4 Gavetas", val: 720000, cat: "MUEBLES Y ENSERES", brand: "GENÉRICO", status: "Activo", loc: "RECURSOS HUMANOS", sn: "", psl: "PSL-2026-125", date: "2023-08-20", resp: "viewer", af: false },
  { name: "Mesa de Juntas Ovalada 8 Puestos", val: 1950000, cat: "MUEBLES Y ENSERES", brand: "GENÉRICO", status: "Activo", loc: "OFICINA PRINCIPAL", sn: "", psl: "PSL-2026-126", date: "2023-04-10", resp: "", af: true },
  { name: "Camioneta Chevrolet D-Max 4x4 Diesel", val: 125000000, cat: "VEHÍCULOS", brand: "Chevrolet", status: "Activo", loc: "LOGISTICA Y TRANSPORTE", sn: "CHEV4X499", psl: "PSL-2026-127", date: "2023-03-01", resp: "admin", af: true },
  { name: "Motocicleta Yamaha XTZ 150", val: 12800000, cat: "VEHÍCULOS", brand: "Yamaha", status: "Activo", loc: "MENSAJERIA", sn: "YM150981", psl: "PSL-2026-128", date: "2023-05-15", resp: "operator", af: true },
  { name: "Motocicleta Honda XR 190L", val: 13900000, cat: "VEHÍCULOS", brand: "Honda", status: "Activo", loc: "MENSAJERIA", sn: "HN190331", psl: "PSL-2026-129", date: "2023-06-20", resp: "viewer", af: true },
  { name: "Generador Electrico Diesel Cummins 50kVA", val: 48000000, cat: "MAQUINARIA Y EQUIPO", brand: "Cummins", status: "Activo", loc: "SUBESTACION ELECTRICA", sn: "CM50K991", psl: "PSL-2026-130", date: "2022-09-10", resp: "admin", af: true },
  { name: "Aire Acondicionado Split Inverter LG 24000 BTU", val: 3200000, cat: "MAQUINARIA Y EQUIPO", brand: "LG", status: "Activo", loc: "CENTRO DE COMPUTO", sn: "LG24K901", psl: "PSL-2026-131", date: "2023-02-22", resp: "admin", af: true },
  { name: "Aire Acondicionado Split Samsung 12000 BTU", val: 1850000, cat: "MAQUINARIA Y EQUIPO", brand: "Samsung", status: "Activo", loc: "GERENCIA", sn: "SM12K441", psl: "PSL-2026-132", date: "2023-04-18", resp: "admin", af: false },
  { name: "Camara Domo IP Hikvision 4MP Exterior", val: 420000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "PUNTO DE ACCESO 1", sn: "HK4M0011", psl: "PSL-2026-133", date: "2023-11-05", resp: "", af: false },
  { name: "Camara Bala IP Hikvision 4MP DarkFighter", val: 560000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "PUNTO DE ACCESO 2", sn: "HK4M0012", psl: "PSL-2026-134", date: "2023-11-05", resp: "", af: false },
  { name: "Grabador NVR Hikvision 16 Canales 4K", val: 2100000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "SISTEMAS", sn: "NVR16K09", psl: "PSL-2026-135", date: "2023-10-14", resp: "operator", af: true },
  { name: "Taladro Percutor Inalambrico DeWalt 20V Max", val: 890000, cat: "HERRAMIENTAS", brand: "DeWalt", status: "Activo", loc: "MANTENIMIENTO", sn: "DW20V991", psl: "PSL-2026-136", date: "2023-07-22", resp: "operator", af: false },
  { name: "Pulidora Angular Bosch 4 1/2 Pulgadas 850W", val: 340000, cat: "HERRAMIENTAS", brand: "Bosch", status: "Activo", loc: "MANTENIMIENTO", sn: "BS850110", psl: "PSL-2026-137", date: "2023-09-08", resp: "operator", af: false },
  { name: "Kit Probador y Certificador de Red Fluke", val: 7800000, cat: "HERRAMIENTAS", brand: "GENÉRICO", status: "Activo", loc: "SISTEMAS", sn: "FK991024", psl: "PSL-2026-138", date: "2023-03-30", resp: "admin", af: true },
  { name: "Escalera Tijera Fibra de Vidrio 8 Pasos", val: 650000, cat: "HERRAMIENTAS", brand: "GENÉRICO", status: "Activo", loc: "BODEGA PRINCIPAL", sn: "", psl: "PSL-2026-139", date: "2023-05-12", resp: "", af: false },
  { name: "Tablet iPad 10ma Generacion Wi-Fi 64GB", val: 2400000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Apple", status: "Activo", loc: "GERENCIA", sn: "AP10G001", psl: "PSL-2026-140", date: "2024-01-25", resp: "admin", af: false },
  { name: "Tablet Samsung Galaxy Tab S8 128GB", val: 3100000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Samsung", status: "Activo", loc: "VENTAS", sn: "SMTS8011", psl: "PSL-2026-141", date: "2023-12-10", resp: "viewer", af: false },
  { name: "Telefono IP Cisco 7821 PoE", val: 480000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Cisco", status: "Activo", loc: "RECEPCION", sn: "CS782109", psl: "PSL-2026-142", date: "2023-06-15", resp: "", af: false },
  { name: "Telefono IP Cisco 8845 con Camara HD", val: 1250000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Cisco", status: "Activo", loc: "GERENCIA", sn: "CS884501", psl: "PSL-2026-143", date: "2023-06-15", resp: "admin", af: false },
  { name: "Diadema Inalambrica Jabra Evolve2 65", val: 950000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "CONTABILIDAD", sn: "JB65001", psl: "PSL-2026-144", date: "2024-02-01", resp: "operator", af: false },
  { name: "Diadema Inalambrica Jabra Evolve2 75", val: 1300000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "SISTEMAS", sn: "JB75002", psl: "PSL-2026-145", date: "2024-02-01", resp: "admin", af: false },
  { name: "Televisor Smart TV LG 65 Pulgadas 4K", val: 2900000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "LG", status: "Activo", loc: "SALA DE JUNTAS", sn: "LG65K991", psl: "PSL-2026-146", date: "2023-11-18", resp: "", af: true },
  { name: "Barra de Videoconferencia Logitech Rally Bar", val: 14500000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "SALA DE JUNTAS", sn: "LT990142", psl: "PSL-2026-147", date: "2023-12-05", resp: "admin", af: true },
  { name: "Disco Duro Externo Rugged LaCie 4TB USB-C", val: 780000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "SISTEMAS", sn: "LC4TB001", psl: "PSL-2026-148", date: "2024-01-30", resp: "admin", af: false },
  { name: "Lector Codigo de Barras Zebra DS2208 2D", val: 420000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "GENÉRICO", status: "Activo", loc: "BODEGA PRINCIPAL", sn: "JB65010", psl: "PSL-2026-149", date: "2024-05-15", resp: "viewer", af: false },
  { name: "Videoproyector Laser Epson 1080p", val: 4500000, cat: "EQUIPO DE CÓMPUTO Y COMUNICACIÓN", brand: "Epson", status: "Activo", loc: "GERENCIA", sn: "EP100010", psl: "PSL-2026-150", date: "2023-10-30", resp: "admin", af: true }
];

const testAssets = rawItems.map((item, idx) => ({
  "Código de Activo": `ACT-${String(101 + idx).padStart(4, '0')}`,
  "Nombre *": item.name,
  "Valor Comercial *": item.val,
  "Clasificación (AF o AC)": item.af ? "Activo Fijo (AF)" : "Activo de Control (AC)",
  "Categoria / Tipo Recurso": item.cat,
  "Marca": item.brand,
  "Estado / Condicion": item.status,
  "Ubicacion / Area": item.loc,
  "Serial": item.sn,
  "PSL": item.psl,
  "Fecha Compra (AAAA-MM-DD)": item.date,
  "Responsable (Usuario o Cedula)": item.resp
}));

const targetPath = process.argv[2] || '/app/activos_prueba_masiva.xlsx';

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(testAssets);

// Ajustar anchos de columnas
ws['!cols'] = [
  { wch: 20 }, // Código de Activo
  { wch: 38 }, // Nombre *
  { wch: 18 }, // Valor Comercial *
  { wch: 26 }, // Clasificación (AF o AC)
  { wch: 28 }, // Categoria / Tipo Recurso
  { wch: 18 }, // Marca
  { wch: 20 }, // Estado / Condicion
  { wch: 28 }, // Ubicacion / Area
  { wch: 18 }, // Serial
  { wch: 18 }, // PSL
  { wch: 26 }, // Fecha Compra (AAAA-MM-DD)
  { wch: 32 }  // Responsable (Usuario o Cedula)
];

XLSX.utils.book_append_sheet(wb, ws, "Plantilla Activos");

XLSX.writeFile(wb, targetPath);
console.log(`✅ Archivo Excel generado exitosamente con ${testAssets.length} registros en: ${targetPath}`);
