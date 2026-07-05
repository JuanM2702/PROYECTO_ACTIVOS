-- ============================================================================
-- SISTEMA DE CONTROL DE ACTIVOS ("ACTIVOS"): Inicialización de Base de Datos
-- Esquema Normalizado Local para Desarrollo (Migrado de SGCAF MySQL) - ESPAÑOL
-- ============================================================================

-- ==========================================
-- CATÁLOGOS Y TABLAS DE DIMENSIÓN
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

CREATE TABLE IF NOT EXISTS estados_activo (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
);

-- ==========================================
-- ESTRUCTURA GEOGRÁFICA / UBICACIÓN
-- ==========================================

CREATE TABLE IF NOT EXISTS zonas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS oficinas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    zona_id INTEGER REFERENCES zonas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS puntos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    oficina_id INTEGER REFERENCES oficinas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS areas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    punto_id INTEGER REFERENCES puntos(id) ON DELETE CASCADE
);

-- ==========================================
-- ENTIDADES PRINCIPALES
-- ==========================================

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    rol VARCHAR(30) DEFAULT 'VIEWER', -- ADMIN, OPERATOR, VIEWER, etc.
    cargo_id INTEGER REFERENCES cargos(id) ON DELETE SET NULL,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL,
    es_activo BOOLEAN DEFAULT true,
    modulos_permitidos JSONB DEFAULT '["dashboard", "inventory", "movements", "acceptances"]'::jsonb,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- Ej: "ACT-0001"
    serial VARCHAR(100),
    modelo VARCHAR(100),
    psl VARCHAR(100),
    
    tipo_recurso_id INTEGER REFERENCES tipos_recurso(id) ON DELETE RESTRICT,
    marca_id INTEGER REFERENCES marcas(id) ON DELETE SET NULL,
    estado_id INTEGER REFERENCES estados_activo(id) ON DELETE RESTRICT,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE RESTRICT,
    area_id INTEGER REFERENCES areas(id) ON DELETE RESTRICT,
    asignado_a INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    
    estatus VARCHAR(50) NOT NULL DEFAULT 'ACTIVO', -- Ej: "ACTIVO", "BAJA", "PENDIENTE"
    valor NUMERIC(12, 2) DEFAULT 0.00,
    fecha_compra DATE,
    foto_data TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TABLAS TRANSACCIONALES E HISTÓRICOS
-- ==========================================

CREATE TABLE IF NOT EXISTS movimientos_activo (
    id SERIAL PRIMARY KEY,
    activo_id INTEGER REFERENCES activos(id) ON DELETE CASCADE,
    area_origen_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    area_destino_id INTEGER REFERENCES areas(id) ON DELETE RESTRICT,
    usuario_origen_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_destino_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    motivo TEXT NOT NULL,
    estatus VARCHAR(50) DEFAULT 'PENDIENTE', -- PENDIENTE, VALIDADO, CANCELADO
    realizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mantenimientos (
    id SERIAL PRIMARY KEY,
    activo_id INTEGER REFERENCES activos(id) ON DELETE CASCADE,
    fecha_mantenimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_tecnico_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo_mantenimiento VARCHAR(50) NOT NULL, -- PREVENTIVO, CORRECTIVO, PREDICTIVO
    hallazgos TEXT,
    observaciones TEXT
);

CREATE TABLE IF NOT EXISTS aceptaciones_activo (
    id SERIAL PRIMARY KEY,
    activo_id INTEGER REFERENCES activos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha_aceptacion TIMESTAMP,
    estatus VARCHAR(30) DEFAULT 'PENDIENTE', -- PENDIENTE, ACEPTADO, RECHAZADO
    comentarios TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── ÍNDICES PARA OPTIMIZAR BÚSQUEDAS ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activos_codigo ON activos(codigo);
CREATE INDEX IF NOT EXISTS idx_activos_asignado_a ON activos(asignado_a);
CREATE INDEX IF NOT EXISTS idx_activos_area ON activos(area_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_activo ON movimientos_activo(activo_id);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_activo ON mantenimientos(activo_id);
CREATE INDEX IF NOT EXISTS idx_aceptaciones_usuario ON aceptaciones_activo(usuario_id, estatus);
