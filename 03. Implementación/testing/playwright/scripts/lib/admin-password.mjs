import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ARCHIVO_SECRETOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../postman/secretos.local.json');

export function leerSecretosLocales() {
  if (!existsSync(ARCHIVO_SECRETOS)) {
    throw new Error(
      'Falta postman/secretos.local.json (archivo local, ignorado por git) con las contraseñas de las cuentas de prueba de Newman. ' +
        'Crealo con un objeto {"admin_password": "...", "cliente_password": "...", ...}; ver "Secretos de Newman" en testing/playwright/README.md.',
    );
  }
  let secretos;
  try {
    secretos = JSON.parse(readFileSync(ARCHIVO_SECRETOS, 'utf8'));
  } catch (error) {
    throw new Error(`postman/secretos.local.json no es un JSON válido: ${error.message}`);
  }
  if (!secretos || typeof secretos !== 'object' || Array.isArray(secretos)) {
    throw new Error('postman/secretos.local.json tiene que ser un objeto {"variable": "valor"}.');
  }
  return secretos;
}

export function resolverAdminPassword() {
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD;
  }
  const secretos = leerSecretosLocales();
  if (!secretos.admin_password) {
    throw new Error('postman/secretos.local.json no tiene "admin_password" (la contraseña de admin@bajonea.ar en bajonea_test); también se puede definir la variable de entorno ADMIN_PASSWORD.');
  }
  return secretos.admin_password;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(resolverAdminPassword());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
