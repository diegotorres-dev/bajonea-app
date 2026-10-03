import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '../../../backend');
const mvnwCmd = path.join(backendDir, 'mvnw.cmd');
const mysqlExe = 'C:/xampp/mysql/bin/mysql.exe';
const baselineSql = path.join(backendDir, 'src/main/resources/db/migration/V1__baseline_bajonea_final.sql');
const georefSeed = path.join(backendDir, 'scripts/etl-georef/output/georef-seed.sql');
const migrationPort = 8091;

function run(description, command) {
  console.log(`\n== ${description} ==`);
  console.log(`$ ${command}`);
  execSync(command, { stdio: 'inherit', shell: true });
}

function runMavenUntil(description, args, matchText, timeoutMs) {
  console.log(`\n== ${description} ==`);
  const commandLine = `"${mvnwCmd}" ${args.join(' ')}`;
  return new Promise((resolve, reject) => {
    const proc = spawn(commandLine, [], { cwd: backendDir, shell: true, windowsHide: true });
    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      finish(new Error(`Timeout esperando "${matchText}" (${timeoutMs}ms)`));
    }, timeoutMs);

    function finish(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
      } catch {
      }
      if (err) reject(err);
      else resolve();
    }

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      buffer += text;
      if (buffer.includes(matchText)) finish();
    });
    proc.stderr.on('data', (data) => process.stderr.write(data.toString()));
    proc.on('exit', (code) => {
      if (!settled) finish(new Error(`mvnw terminó antes de ver "${matchText}" (exit code ${code})`));
    });
    proc.on('error', (err) => finish(err));
  });
}

async function main() {
  run(
    'Paso 1/6 -- recrear bajonea_test vacía (mismo charset/collation que bajonea_final)',
    `"${mysqlExe}" -u root -e "DROP DATABASE IF EXISTS bajonea_test; CREATE DATABASE bajonea_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`,
  );

  run(
    'Paso 2/6 -- aplicar el schema físico completo (V1, 41 tablas, sin datos)',
    `"${mysqlExe}" -u root --default-character-set=utf8mb4 bajonea_test < "${baselineSql}"`,
  );

  run(
    'Paso 3/6 -- cargar catálogo geográfico (seed real del ETL de Georef, Fase 2bis)',
    `"${mysqlExe}" -u root --default-character-set=utf8mb4 bajonea_test < "${georefSeed}"`,
  );

  await runMavenUntil(
    'Paso 4/6 -- Flyway baselinea V1 y aplica V2-V4 (perfil test, puerto de migración 8091)',
    [
      'spring-boot:run',
      '-Dspring-boot.run.profiles=test',
      `-Dspring-boot.run.arguments=--server.port=${migrationPort}`,
    ],
    'Started BajoneaApplication',
    180_000,
  );

  run(
    'Paso 5/6 -- sembrar admin@bajonea.ar (gap real de V1__baseline_bajonea_final.sql, sin seed propio todavía)',
    `"${mysqlExe}" -u root --default-character-set=utf8mb4 bajonea_test -e "` +
      `INSERT INTO usuario (nombre_usuario, email, password_hash, rol, estado, intentos_fallidos) VALUES ('adminbajonea', 'admin@bajonea.ar', '$2a$10$0mUU7IYzopUjCwhmxjeNK.yRR/Zq413QmiKkoRVAXZAsQgQuRbS7q', 'ADMINISTRADOR', 'ACTIVO', 0); ` +
      `INSERT INTO persona (id) SELECT id FROM usuario WHERE email = 'admin@bajonea.ar'; ` +
      `INSERT INTO persona_fisica (id, nombre, apellido, dni, fecha_nacimiento, telefono) SELECT id, 'Admin', 'Bajonea', '00000001', '1990-01-01', '+5492964000000' FROM usuario WHERE email = 'admin@bajonea.ar'; ` +
      `INSERT INTO administrador (id) SELECT id FROM usuario WHERE email = 'admin@bajonea.ar';"`,
  );

  run(
    'Paso 6/6 -- sembrar configuracion_tarifa (gap real de V10, que busca un admin que no existe en bajonea_test)',
    `"${mysqlExe}" -u root --default-character-set=utf8mb4 bajonea_test -e "` +
      `INSERT INTO configuracion_tarifa (administrador_id, cargo_cliente, tipo_cargo_cliente, cargo_comercio, tipo_cargo_comercio, fecha_vigencia) ` +
      `SELECT a.id, 200.00, 'FIJO', 1.00, 'PORCENTAJE', NOW() FROM administrador a JOIN usuario u ON u.id = a.id ` +
      `WHERE u.email = 'admin@bajonea.ar' AND NOT EXISTS (SELECT 1 FROM configuracion_tarifa) LIMIT 1;"`,
  );

  console.log('\n== Listo: bajonea_test recreada con el esquema vigente de bajonea_final ==');
}

main().catch((err) => {
  console.error('\nFalló el reset de bajonea_test:', err.message);
  process.exit(1);
});
