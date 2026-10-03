-- Agrega `HAMBURGUESERIA` al ENUM de `comercio.tipo_comercio` (pedido explícito de Diego).
-- Mismo patrón que V12 (agregar APTO_VENTA a comercio.estado): MySQL no tiene ALTER TYPE
-- incremental, se repite la lista completa de valores del ENUM.
ALTER TABLE `comercio`
  MODIFY COLUMN `tipo_comercio` enum('RESTAURANTE','EMPRENDIMIENTO','ROTISERIA','HELADERIA','CAFETERIA','PANADERIA','PIZZERIA','PARRILLA','BAR','KIOSCO','FOOD_TRUCK','HAMBURGUESERIA','OTRO') NOT NULL;
