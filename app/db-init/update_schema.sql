-- 1. Eliminar tablas antiguas
DROP TABLE IF EXISTS asset_acceptances CASCADE;
DROP TABLE IF EXISTS asset_movements CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Asegurar que los usuarios de prueba existan en "usuarios"
INSERT INTO usuarios (username, password_hash, nombre_completo, email, rol, es_activo)
VALUES 
  ('admin', '$2a$10$qudkKR8lclBTVwTJP1UNnemyJhTXpBa96Y5HLQ/8ZONux0aM/8S/y', 'Administrador de Activos', 'admin@activos.com', 'ADMIN', true),
  ('operator', '$2a$10$Vpq.th2TKbJd.iaJ9bxbquNLJNDaEgLaW5jhTXr9jfYsqL.7v.nTy', 'Operador Técnico', 'operator@activos.com', 'OPERATOR', true),
  ('viewer', '$2a$10$x4qTZpw4gnecQkebi8E56eJDuB4Baf36L7EKdZPxKu0ulXNHzfWru', 'Consultor Visual', 'viewer@activos.com', 'VIEWER', true)
ON CONFLICT (username) DO NOTHING;

-- 3. Crear vista de usuarios
CREATE OR REPLACE VIEW users AS
SELECT 
    id,
    username,
    password_hash,
    nombre_completo AS full_name,
    email,
    rol AS role,
    creado_en AS created_at,
    es_activo AS is_active,
    modulos_permitidos AS allowed_modules
FROM usuarios;

-- 4. Crear vista de activos
CREATE OR REPLACE VIEW assets AS
SELECT
    a.id,
    a.codigo AS code,
    COALESCE(tr.nombre, 'Sin Tipo') || ' ' || COALESCE(m.nombre, '') || ' ' || COALESCE(a.modelo, '') AS name,
    'PSL: ' || COALESCE(a.psl, 'N/A') AS description,
    tr.nombre AS category,
    CASE 
        WHEN UPPER(a.estatus) = 'ACTIVO' THEN 'Activo'
        WHEN UPPER(a.estatus) = 'BAJA' THEN 'Baja'
        WHEN UPPER(a.estatus) = 'PENDIENTE ACEPTACIÓN' OR UPPER(a.estatus) = 'PENDIENTE' THEN 'Pendiente Aceptación'
        WHEN UPPER(a.estatus) = 'EN MANTENIMIENTO' THEN 'En Mantenimiento'
        WHEN UPPER(a.estatus) = 'RECHAZADO' THEN 'Rechazado'
        ELSE a.estatus
    END AS status,
    COALESCE(z.nombre, '') || ' - ' || COALESCE(o.nombre, '') || ' - ' || COALESCE(p.nombre, '') || ' - ' || COALESCE(ar.nombre, '') AS location,
    a.valor AS value,
    a.fecha_compra AS purchase_date,
    a.asignado_a AS assigned_to,
    a.creado_en AS created_at,
    a.actualizado_en AS updated_at,
    a.foto_data
FROM activos a
LEFT JOIN tipos_recurso tr ON a.tipo_recurso_id = tr.id
LEFT JOIN marcas m ON a.marca_id = m.id
LEFT JOIN areas ar ON a.area_id = ar.id
LEFT JOIN puntos p ON ar.punto_id = p.id
LEFT JOIN oficinas o ON p.oficina_id = o.id
LEFT JOIN zonas z ON o.zona_id = z.id;

-- 5. Crear vista de movimientos
CREATE OR REPLACE VIEW asset_movements AS
SELECT
    m.id,
    m.activo_id AS asset_id,
    COALESCE(zo.nombre || ' - ' || oo.nombre || ' - ' || po.nombre || ' - ' || ao.nombre, 'Sin Origen') AS origin_location,
    COALESCE(zd.nombre || ' - ' || od.nombre || ' - ' || pd.nombre || ' - ' || ad.nombre, 'Sin Destino') AS destination_location,
    m.usuario_origen_id AS origin_assignee_id,
    m.usuario_destino_id AS destination_assignee_id,
    m.fecha_movimiento AS movement_date,
    m.motivo AS reason,
    m.realizado_por AS performed_by
FROM movimientos_activo m
LEFT JOIN areas ao ON m.area_origen_id = ao.id
LEFT JOIN puntos po ON ao.punto_id = po.id
LEFT JOIN oficinas oo ON po.oficina_id = oo.id
LEFT JOIN zonas zo ON oo.zona_id = zo.id
LEFT JOIN areas ad ON m.area_destino_id = ad.id
LEFT JOIN puntos pd ON ad.punto_id = pd.id
LEFT JOIN oficinas od ON pd.oficina_id = od.id
LEFT JOIN zonas zd ON od.zona_id = zd.id;

-- 6. Crear vista de aceptaciones
CREATE OR REPLACE VIEW asset_acceptances AS
SELECT
    id,
    activo_id AS asset_id,
    usuario_id AS user_id,
    fecha_aceptacion AS acceptance_date,
    estatus AS status,
    comentarios AS comments,
    creado_en AS created_at
FROM aceptaciones_activo;

-- 7. Triggers para insertar, actualizar y eliminar activos en la vista
CREATE OR REPLACE FUNCTION insert_asset_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_id INT;
    v_estado_id INT;
    v_empresa_id INT;
    v_area_id INT;
    v_estatus VARCHAR(50);
BEGIN
    SELECT id INTO v_tipo_id FROM tipos_recurso WHERE UPPER(nombre) = UPPER(NEW.category) LIMIT 1;
    IF v_tipo_id IS NULL THEN
        INSERT INTO tipos_recurso (nombre) VALUES (NEW.category) RETURNING id INTO v_tipo_id;
    END IF;

    SELECT id INTO v_empresa_id FROM empresas LIMIT 1;

    SELECT id INTO v_area_id FROM areas WHERE UPPER(nombre) = UPPER(NEW.location) LIMIT 1;
    IF v_area_id IS NULL THEN
        DECLARE
            v_zone_id INT;
            v_office_id INT;
            v_point_id INT;
        BEGIN
            SELECT id INTO v_zone_id FROM zonas LIMIT 1;
            IF v_zone_id IS NULL THEN
                INSERT INTO zonas (nombre) VALUES ('ZONA GENERAL') RETURNING id INTO v_zone_id;
            END IF;
            SELECT id INTO v_office_id FROM oficinas WHERE zona_id = v_zone_id LIMIT 1;
            IF v_office_id IS NULL THEN
                INSERT INTO oficinas (nombre, zona_id) VALUES ('OFICINA GENERAL', v_zone_id) RETURNING id INTO v_office_id;
            END IF;
            SELECT id INTO v_point_id FROM puntos WHERE oficina_id = v_office_id LIMIT 1;
            IF v_point_id IS NULL THEN
                INSERT INTO puntos (nombre, oficina_id) VALUES ('PUNTO GENERAL', v_office_id) RETURNING id INTO v_point_id;
            END IF;
            INSERT INTO areas (nombre, punto_id) VALUES (NEW.location, v_point_id) RETURNING id INTO v_area_id;
        END;
    END IF;

    v_estatus := CASE 
        WHEN UPPER(NEW.status) = 'ACTIVO' THEN 'ACTIVO'
        WHEN UPPER(NEW.status) = 'BAJA' THEN 'BAJA'
        WHEN UPPER(NEW.status) = 'PENDIENTE ACEPTACIÓN' THEN 'PENDIENTE'
        WHEN UPPER(NEW.status) = 'EN MANTENIMIENTO' THEN 'EN MANTENIMIENTO'
        WHEN UPPER(NEW.status) = 'RECHAZADO' THEN 'RECHAZADO'
        ELSE UPPER(NEW.status)
    END;

    SELECT id INTO v_estado_id FROM estados_activo WHERE UPPER(nombre) = UPPER(v_estatus) LIMIT 1;
    IF v_estado_id IS NULL THEN
        SELECT id INTO v_estado_id FROM estados_activo LIMIT 1;
    END IF;

    INSERT INTO activos (
        codigo, modelo, tipo_recurso_id, estado_id, empresa_id, area_id, asignado_a, estatus, valor, fecha_compra, foto_data
    ) VALUES (
        NEW.code,
        NEW.name,
        v_tipo_id,
        v_estado_id,
        v_empresa_id,
        v_area_id,
        NEW.assigned_to,
        v_estatus,
        NEW.value,
        NEW.purchase_date,
        NEW.photo_data
    ) RETURNING id INTO NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER t_insert_asset
INSTEAD OF INSERT ON assets
FOR EACH ROW EXECUTE FUNCTION insert_asset_trigger();

CREATE OR REPLACE FUNCTION update_asset_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_id INT;
    v_area_id INT;
    v_estatus VARCHAR(50);
BEGIN
    SELECT id INTO v_tipo_id FROM tipos_recurso WHERE UPPER(nombre) = UPPER(NEW.category) LIMIT 1;
    IF v_tipo_id IS NULL THEN
        INSERT INTO tipos_recurso (nombre) VALUES (NEW.category) RETURNING id INTO v_tipo_id;
    END IF;

    SELECT id INTO v_area_id FROM areas WHERE UPPER(nombre) = UPPER(NEW.location) LIMIT 1;
    IF v_area_id IS NULL THEN
        DECLARE
            v_zone_id INT;
            v_office_id INT;
            v_point_id INT;
        BEGIN
            SELECT id INTO v_zone_id FROM zonas LIMIT 1;
            IF v_zone_id IS NULL THEN
                INSERT INTO zonas (nombre) VALUES ('ZONA GENERAL') RETURNING id INTO v_zone_id;
            END IF;
            SELECT id INTO v_office_id FROM oficinas WHERE zona_id = v_zone_id LIMIT 1;
            IF v_office_id IS NULL THEN
                INSERT INTO oficinas (nombre, zona_id) VALUES ('OFICINA GENERAL', v_zone_id) RETURNING id INTO v_office_id;
            END IF;
            SELECT id INTO v_point_id FROM puntos WHERE oficina_id = v_office_id LIMIT 1;
            IF v_point_id IS NULL THEN
                INSERT INTO puntos (nombre, oficina_id) VALUES ('PUNTO GENERAL', v_office_id) RETURNING id INTO v_point_id;
            END IF;
            INSERT INTO areas (nombre, punto_id) VALUES (NEW.location, v_point_id) RETURNING id INTO v_area_id;
        END;
    END IF;

    v_estatus := CASE 
        WHEN UPPER(NEW.status) = 'ACTIVO' THEN 'ACTIVO'
        WHEN UPPER(NEW.status) = 'BAJA' THEN 'BAJA'
        WHEN UPPER(NEW.status) = 'PENDIENTE ACEPTACIÓN' THEN 'PENDIENTE'
        WHEN UPPER(NEW.status) = 'EN MANTENIMIENTO' THEN 'EN MANTENIMIENTO'
        WHEN UPPER(NEW.status) = 'RECHAZADO' THEN 'RECHAZADO'
        ELSE UPPER(NEW.status)
    END;

    UPDATE activos SET
        modelo = NEW.name,
        tipo_recurso_id = v_tipo_id,
        area_id = v_area_id,
        asignado_a = NEW.assigned_to,
        estatus = v_estatus,
        valor = NEW.value,
        fecha_compra = NEW.purchase_date,
        foto_data = NEW.photo_data,
        actualizado_en = NOW()
    WHERE id = OLD.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER t_update_asset
INSTEAD OF UPDATE ON assets
FOR EACH ROW EXECUTE FUNCTION update_asset_trigger();

CREATE OR REPLACE FUNCTION delete_asset_trigger()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM activos WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER t_delete_asset
INSTEAD OF DELETE ON assets
FOR EACH ROW EXECUTE FUNCTION delete_asset_trigger();

-- 8. Trigger para insertar movimientos en la vista
CREATE OR REPLACE FUNCTION insert_movement_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_area_origen_id INT;
    v_area_destino_id INT;
BEGIN
    SELECT id INTO v_area_origen_id FROM areas WHERE UPPER(nombre) = UPPER(NEW.origin_location) LIMIT 1;
    IF v_area_origen_id IS NULL THEN
        SELECT area_id INTO v_area_origen_id FROM activos WHERE id = NEW.asset_id;
    END IF;

    SELECT id INTO v_area_destino_id FROM areas WHERE UPPER(nombre) = UPPER(NEW.destination_location) LIMIT 1;
    IF v_area_destino_id IS NULL THEN
        DECLARE
            v_zone_id INT;
            v_office_id INT;
            v_point_id INT;
        BEGIN
            SELECT id INTO v_zone_id FROM zonas LIMIT 1;
            IF v_zone_id IS NULL THEN
                INSERT INTO zonas (nombre) VALUES ('ZONA GENERAL') RETURNING id INTO v_zone_id;
            END IF;
            SELECT id INTO v_office_id FROM oficinas WHERE zona_id = v_zone_id LIMIT 1;
            IF v_office_id IS NULL THEN
                INSERT INTO oficinas (nombre, zona_id) VALUES ('OFICINA GENERAL', v_zone_id) RETURNING id INTO v_office_id;
            END IF;
            SELECT id INTO v_point_id FROM puntos WHERE oficina_id = v_office_id LIMIT 1;
            IF v_point_id IS NULL THEN
                INSERT INTO puntos (nombre, oficina_id) VALUES ('PUNTO GENERAL', v_office_id) RETURNING id INTO v_point_id;
            END IF;
            INSERT INTO areas (nombre, punto_id) VALUES (NEW.destination_location, v_point_id) RETURNING id INTO v_area_destino_id;
        END;
    END IF;

    INSERT INTO movimientos_activo (
        activo_id,
        area_origen_id,
        area_destino_id,
        usuario_origen_id,
        usuario_destino_id,
        fecha_movimiento,
        motivo,
        realizado_por
    ) VALUES (
        NEW.asset_id,
        v_area_origen_id,
        v_area_destino_id,
        NEW.origin_assignee_id,
        NEW.destination_assignee_id,
        COALESCE(NEW.movement_date, NOW()),
        NEW.reason,
        NEW.performed_by
    ) RETURNING id INTO NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER t_insert_movement
INSTEAD OF INSERT ON asset_movements
FOR EACH ROW EXECUTE FUNCTION insert_movement_trigger();
