import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_POSTMAN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../postman/Bajonea-Local.postman_environment.json');

export function resolverAdminPassword() {
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD;
  }
  if (existsSync(ENV_POSTMAN)) {
    try {
      const entorno = JSON.parse(readFileSync(ENV_POSTMAN, 'utf8'));
      const variable = (entorno.values || []).find((v) => v.key === 'admin_password');
      if (variable && variable.value) {
        return variable.value;
      }
    } catch {
    }
  }
  throw new Error(
    'Falta la contraseña de admin@bajonea.ar en bajonea_test: definí la variable de entorno ADMIN_PASSWORD ' +
      '(o cargá admin_password en postman/Bajonea-Local.postman_environment.json).',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(resolverAdminPassword());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
