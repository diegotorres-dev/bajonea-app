ALTER TABLE configuracion_tarifa
    ADD COLUMN tipo_cargo_cliente  ENUM('FIJO', 'PORCENTAJE') NOT NULL DEFAULT 'FIJO' AFTER cargo_cliente,
    ADD COLUMN tipo_cargo_comercio ENUM('FIJO', 'PORCENTAJE') NOT NULL DEFAULT 'PORCENTAJE' AFTER cargo_comercio;

INSERT INTO configuracion_tarifa (administrador_id, cargo_cliente, tipo_cargo_cliente, cargo_comercio, tipo_cargo_comercio, fecha_vigencia)
SELECT a.id, 200.00, 'FIJO', 1.00, 'PORCENTAJE', NOW()
FROM administrador a
JOIN usuario u ON u.id = a.id
WHERE u.email = 'admin@bajonea.com'
LIMIT 1;
