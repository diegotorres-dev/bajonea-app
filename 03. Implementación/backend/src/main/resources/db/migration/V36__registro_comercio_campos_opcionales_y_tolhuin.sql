-- Registro de Comercio, Fase 1. Razon social, tipo de sociedad, fecha de inicio de actividades y condicion ante el IVA
-- pasan a ser opcionales (el CUIT y el domicilio fiscal siguen obligatorios), y el email del comercio deja de pedirse:
-- ninguna funcion lo lee, asi que la columna queda NULL-able sin borrarla (los comercios existentes conservan su valor).
-- Los ENUM se repiten exactos como estan en el baseline; un valor omitido truncaria o rechazaria filas.
ALTER TABLE `persona_juridica`
  MODIFY COLUMN `razon_social` varchar(150) NULL,
  MODIFY COLUMN `condicion_iva` enum('RESPONSABLE_INSCRIPTO','EXENTO','NO_INSCRIPTO','MONOTRIBUTO','RESPONSABLE_NACIONAL') NULL,
  MODIFY COLUMN `tipo_sociedad` enum('SA','SRL','SAS','SC','SCS','SCRL','SCSA','SCCS','CC','CS','CCSA','CA','SP','ST','ACP','EMP','EU','UTE') NULL,
  MODIFY COLUMN `fecha_inicio_actividades` date NULL;

ALTER TABLE `comercio`
  MODIFY COLUMN `email` varchar(150) NULL;

-- Tolhuin no viene del endpoint /localidades de Georef (el ETL solo consulta ese). Su id oficial como localidad es
-- 94011010 (localidad censal, verificado contra la API de Georef); el 940021 de la V16 de la cadena anterior es el id del
-- municipio. Idempotente: si la fila ya existe no hace nada.
INSERT INTO `localidad` (`id`, `nombre`, `provincia_id`)
VALUES ('94011010', 'Tolhuin', '94')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`), `provincia_id` = VALUES(`provincia_id`);
