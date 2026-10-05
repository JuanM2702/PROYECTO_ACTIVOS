-- ============================================================================
-- SISTEMA DE CONTROL DE ACTIVOS ("ACTIVOS"): Inicialización de Base de Datos
-- Esquema Estrella (Star Schema) con Soporte de Catálogos - ESPAÑOL
-- ============================================================================

-- ==========================================
-- CATÁLOGOS AUXILIARES (Para DICCIONARIOS y FRONTEND)
-- ==========================================

CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS cargos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS marcas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tipos_recurso (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
);

-- ==========================================
-- DIMENSIONES DESNORMALIZADAS (MODELO ESTRELLA)
-- ==========================================

CREATE TABLE IF NOT EXISTS dim_usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    rol VARCHAR(30) DEFAULT 'VIEWER', -- ADMIN, OPERATOR, VIEWER, etc.
    cargo VARCHAR(100),
    empresa VARCHAR(100),
    cedula VARCHAR(50),
    es_activo BOOLEAN DEFAULT true,
    modulos_permitidos JSONB DEFAULT '["dashboard", "inventory", "movements", "acceptances"]'::jsonb,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dim_ubicaciones (
    id SERIAL PRIMARY KEY,
    area VARCHAR(100) NOT NULL,
    punto_venta VARCHAR(100) NOT NULL,
    oficina VARCHAR(100) NOT NULL,
    zona VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_estados_activo (
    id SERIAL PRIMARY KEY,
    estado VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_tipos_movimiento (
    id SERIAL PRIMARY KEY,
    movimiento VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_activos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- Ej: "ACT-0001"
    serial VARCHAR(100),
    modelo VARCHAR(100),
    psl VARCHAR(100),
    
    tipo_recurso VARCHAR(100),
    marca VARCHAR(100),
    grupo_homogeneo VARCHAR(100), -- E.g., 'Equipo de Cómputo y Comunicación'
    vida_util_meses INTEGER DEFAULT 60, -- Vida útil en meses
    
    valor_inicial NUMERIC(12, 2) DEFAULT 0.00,
    valor_residual NUMERIC(12, 2) DEFAULT 0.00,
    fecha_compra DATE,
    foto_url VARCHAR(500),
    
    estado_id INTEGER REFERENCES dim_estados_activo(id) ON DELETE RESTRICT,
    empresa VARCHAR(100),
    ubicacion_id INTEGER REFERENCES dim_ubicaciones(id) ON DELETE RESTRICT,
    asignado_a INTEGER REFERENCES dim_usuarios(id) ON DELETE SET NULL,
    
    estatus VARCHAR(50) NOT NULL DEFAULT 'ACTIVO', -- Ej: "ACTIVO", "BAJA", "PENDIENTE"
    clasificacion VARCHAR(50) DEFAULT 'Activo Fijo (AF)',
    proveedor VARCHAR(200),               -- Nombre del proveedor
    nit_proveedor VARCHAR(50),             -- NIT del proveedor
    codigo_contable VARCHAR(100),          -- Código contable del activo
    factura_url VARCHAR(500),              -- Ruta del archivo de factura/OC en MinIO
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dimensión de Tiempo
CREATE TABLE IF NOT EXISTS dim_tiempo (
    id INT PRIMARY KEY, -- Formato YYYYMMDD (Ej: 20260804)
    fecha DATE UNIQUE NOT NULL,
    anio INT NOT NULL,
    mes INT NOT NULL,
    nombre_mes VARCHAR(20) NOT NULL,
    trimestre INT NOT NULL
);

-- Compatibilidad para endpoints genéricos del frontend
CREATE OR REPLACE VIEW estados_activo AS SELECT id, estado as nombre FROM dim_estados_activo;

-- ==========================================
-- TABLA DE HECHOS Y MÁS TABLAS TRANSACCIONALES
-- ==========================================

CREATE TABLE IF NOT EXISTS fact_movimientos_activos (
    id SERIAL PRIMARY KEY,
    activo_id INTEGER REFERENCES dim_activos(id) ON DELETE CASCADE,
    ubicacion_origen_id INTEGER REFERENCES dim_ubicaciones(id) ON DELETE SET NULL,
    ubicacion_destino_id INTEGER REFERENCES dim_ubicaciones(id) ON DELETE RESTRICT,
    usuario_origen_id INTEGER REFERENCES dim_usuarios(id) ON DELETE SET NULL,
    usuario_destino_id INTEGER REFERENCES dim_usuarios(id) ON DELETE SET NULL,
    tiempo_movimiento_id INTEGER REFERENCES dim_tiempo(id),
    tipo_movimiento_id INTEGER REFERENCES dim_tipos_movimiento(id) ON DELETE RESTRICT,
    estado_id INTEGER REFERENCES dim_estados_activo(id) ON DELETE RESTRICT,
    
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    motivo TEXT NOT NULL,
    estatus VARCHAR(50) DEFAULT 'PENDIENTE', -- PENDIENTE, VALIDADO, CANCELADO
    realizado_por INTEGER REFERENCES dim_usuarios(id) ON DELETE SET NULL,
    minio_key TEXT
);

CREATE TABLE IF NOT EXISTS mantenimientos (
    id SERIAL PRIMARY KEY,
    activo_id INTEGER REFERENCES dim_activos(id) ON DELETE CASCADE,
    fecha_mantenimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_tecnico_id INTEGER REFERENCES dim_usuarios(id) ON DELETE SET NULL,
    tipo_mantenimiento VARCHAR(50) NOT NULL, -- PREVENTIVO, CORRECTIVO, PREDICTIVO
    hallazgos TEXT,
    observaciones TEXT
);

CREATE TABLE IF NOT EXISTS aceptaciones_activo (
    id SERIAL PRIMARY KEY,
    activo_id INTEGER REFERENCES dim_activos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES dim_usuarios(id) ON DELETE CASCADE,
    fecha_aceptacion TIMESTAMP,
    estatus VARCHAR(30) DEFAULT 'PENDIENTE', -- PENDIENTE, ACEPTADO, RECHAZADO
    comentarios TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    firma_origen TEXT,
    cedula_origen VARCHAR(50),
    cargo_origen VARCHAR(100),
    firma_destino TEXT,
    cedula_destino VARCHAR(50),
    cargo_destino VARCHAR(100),
    minio_key TEXT
);

-- ==========================================
-- VISTA DE DEPRECIACIÓN EN TIEMPO REAL
-- ==========================================

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
    a.clasificacion,
    a.proveedor,
    a.nit_proveedor,
    a.codigo_contable,
    a.factura_url,
    a.creado_en,
    a.actualizado_en,
    
    -- Cálculos de depreciación
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

-- ─── ÍNDICES PARA OPTIMIZAR BÚSQUEDAS ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dim_activos_codigo ON dim_activos(codigo);
CREATE INDEX IF NOT EXISTS idx_dim_activos_asignado_a ON dim_activos(asignado_a);
CREATE INDEX IF NOT EXISTS idx_dim_activos_ubicacion ON dim_activos(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_fact_movimientos_activo ON fact_movimientos_activos(activo_id);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_activo ON mantenimientos(activo_id);
CREATE INDEX IF NOT EXISTS idx_aceptaciones_usuario ON aceptaciones_activo(usuario_id, estatus);
