-- Corrección de catálogo (Tramo 16.12): Tolhuin (Tierra del Fuego) no existe en el
-- endpoint /localidades de la API Georef -- solo en /municipios (id 940021, verificado
-- 2026-07-28 contra la API real: apis.datos.gob.ar/georef/api/municipios?nombre=Tolhuin).
-- El ETL (etl-georef.mjs) solo consulta /localidades, así que ninguna reejecución la va a
-- traer nunca -- no es un bug del script, es un gap real de la fuente. Se carga acá como
-- excepción puntual y documentada (ver docs/DECISIONES.md), reutilizando el id de
-- /municipios como PK de localidad.

INSERT INTO localidad (id, nombre, provincia_id)
VALUES ('940021', 'Tolhuin', '94')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), provincia_id = VALUES(provincia_id);
