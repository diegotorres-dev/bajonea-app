-- Amplía cuenta_mercado_pago.access_token/refresh_token de VARCHAR(255) a VARCHAR(500).
-- Motivo: a partir de este tramo (ver docs/DECISIONES.md, "Cifrado de
-- access_token/refresh_token de CuentaMercadoPago") ambas columnas dejan de guardar el token
-- de MercadoPago en texto plano y pasan a guardar Base64(IV de 12 bytes + AES-256-GCM(token) +
-- tag de 16 bytes) — el cifrado infla el largo original (~1.53x + 28 bytes antes de Base64),
-- así que 255 ya no alcanza con margen seguro para un token real. 500 deja headroom generoso
-- incluso para un access_token/refresh_token más largo de lo habitual.
--
-- NOT NULL se repite explícitamente porque MODIFY COLUMN redefine la columna completa.
ALTER TABLE cuenta_mercado_pago MODIFY COLUMN access_token VARCHAR(500) NOT NULL;
ALTER TABLE cuenta_mercado_pago MODIFY COLUMN refresh_token VARCHAR(500) NOT NULL;
