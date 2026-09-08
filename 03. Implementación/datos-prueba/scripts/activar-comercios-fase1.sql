UPDATE usuario SET estado = 'ACTIVO'
WHERE email IN (
    'popular@bajonea.com', 'corner@bajonea.com', 'lostroncos@bajonea.com',
    'store54@bajonea.com', 'lasvegas@bajonea.com', 'bigburger@bajonea.com', 'tantesara@bajonea.com'
);

UPDATE comercio c
JOIN dueno d ON c.dueno_id = d.id
JOIN usuario u ON d.id = u.id
SET c.estado = 'APROBADO'
WHERE u.email IN (
    'popular@bajonea.com', 'corner@bajonea.com', 'lostroncos@bajonea.com',
    'store54@bajonea.com', 'lasvegas@bajonea.com', 'bigburger@bajonea.com', 'tantesara@bajonea.com'
);

SELECT u.email, u.estado AS estado_usuario, c.nombre, c.estado AS estado_comercio
FROM usuario u
JOIN dueno d ON d.id = u.id
JOIN comercio c ON c.dueno_id = d.id
WHERE u.email IN (
    'popular@bajonea.com', 'corner@bajonea.com', 'lostroncos@bajonea.com',
    'store54@bajonea.com', 'lasvegas@bajonea.com', 'bigburger@bajonea.com', 'tantesara@bajonea.com'
);
