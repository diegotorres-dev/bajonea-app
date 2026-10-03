-- Una cuenta de Mercado Pago (`mp_user_id`) no puede estar activa en dos Dueños a la vez. La columna generada
-- vale el `mp_user_id` solo mientras la fila está activa y NULL si no: el UNIQUE rechaza dos filas activas con
-- la misma cuenta, y las filas inactivas (NULL) conviven sin restricción. Se libera al desvincular. La entidad
-- JPA no mapea esta columna. Antes de aplicarla en una base existente conviene confirmar que no hay duplicados:
-- SELECT mp_user_id, COUNT(*) FROM cuenta_mercado_pago WHERE activa = 1 GROUP BY mp_user_id HAVING COUNT(*) > 1;
ALTER TABLE `cuenta_mercado_pago`
  ADD COLUMN `mp_user_id_activo` varchar(50)
    GENERATED ALWAYS AS (CASE WHEN `activa` = 1 THEN `mp_user_id` ELSE NULL END) STORED,
  ADD UNIQUE KEY `uq_cuenta_mp_user_id_activo` (`mp_user_id_activo`);
