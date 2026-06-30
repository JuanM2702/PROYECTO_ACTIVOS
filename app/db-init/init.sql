-- ============================================================================
-- SISTEMA DE CONTROL DE ACTIVOS ("ACTIVOS"): Inicialización de Base de Datos
-- ============================================================================

-- 1. TABLA: USUARIOS (Preparada para RBAC e integración futura de Directorio Activo)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role VARCHAR(30) DEFAULT 'VIEWER', -- ADMIN, OPERATOR, VIEWER
    is_active BOOLEAN DEFAULT true,
    allowed_modules JSONB DEFAULT '["dashboard", "inventory", "movements", "acceptances"]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA: ACTIVOS
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, -- Ej: "ACT-0001"
    name VARCHAR(150) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,    -- Ej: "Hardware", "Vehículos", "Mobiliario", "Software"
    status VARCHAR(50) NOT NULL,      -- Ej: "Pendiente Aceptación", "Activo", "En Mantenimiento", "Baja"
    location VARCHAR(150) NOT NULL,   -- Ubicación física
    value NUMERIC(12, 2) NOT NULL,    -- Valor monetario
    purchase_date DATE,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    photo_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA: MOVIMIENTOS DE ACTIVOS (Registro histórico/Auditoría)
CREATE TABLE IF NOT EXISTS asset_movements (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    origin_location VARCHAR(150),
    destination_location VARCHAR(150) NOT NULL,
    origin_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    destination_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT NOT NULL,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 4. TABLA: ACEPTACIONES DE ACTIVOS (Flujo de firmas de entrega limpia)
CREATE TABLE IF NOT EXISTS asset_acceptances (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    acceptance_date TIMESTAMP,
    status VARCHAR(30) DEFAULT 'PENDIENTE', -- PENDIENTE, ACEPTADO, RECHAZADO
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── ÍNDICES PARA OPTIMIZAR BÚSQUEDAS ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assets_code ON assets(code);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON assets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_movements_asset ON asset_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_acceptances_user ON asset_acceptances(user_id, status);

-- ─── INSERTAR ALGUNOS ACTIVOS DE PRUEBA INICIALES ─────────────────────────────
-- Nota: Los usuarios se crearán dinámicamente y de forma segura en la inicialización
-- del backend (para aplicar hashing con bcrypt). Una vez que existan los usuarios,
-- el backend asociará estos activos si la tabla está vacía.
