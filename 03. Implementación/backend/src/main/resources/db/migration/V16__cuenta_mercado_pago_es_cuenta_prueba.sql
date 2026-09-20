-- Tramo MercadoPago 03, correccion de clasificacion sandbox/produccion: el prefijo del
-- access_token (`APP_USR-` vs `TEST-`) no determina el entorno de una cuenta vinculada por OAuth
-- (documentado por MercadoPago), asi que el entorno se guarda como dato propio: el mismo valor que
-- Bajonea manda como `test_token` en el POST /oauth/token. El DEFAULT solo rellena las filas ya
-- existentes (se asumen produccion, que es lo que se pidio en su momento); el codigo siempre
-- setea el valor de forma explicita al vincular.
ALTER TABLE `cuenta_mercado_pago`
  ADD COLUMN `es_cuenta_prueba` tinyint(1) NOT NULL DEFAULT 0 AFTER `activa`;
