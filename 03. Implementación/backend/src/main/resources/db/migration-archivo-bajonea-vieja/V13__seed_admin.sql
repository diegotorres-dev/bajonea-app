INSERT INTO usuario (email, password_hash, rol, estado, intentos_fallidos)
VALUES ('admin@bajonea.ar', '$2a$10$0mUU7IYzopUjCwhmxjeNK.yRR/Zq413QmiKkoRVAXZAsQgQuRbS7q', 'ADMINISTRADOR', 'ACTIVO', 0);

INSERT INTO persona (id)
SELECT id FROM usuario WHERE email = 'admin@bajonea.ar';

INSERT INTO persona_fisica (id, nombre, apellido, dni, fecha_nacimiento, telefono)
SELECT id, 'Admin', 'Bajonea', '00000001', '1990-01-01', '2964000000'
FROM usuario WHERE email = 'admin@bajonea.ar';

INSERT INTO administrador (id)
SELECT id FROM usuario WHERE email = 'admin@bajonea.ar';
