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
  // mvnw.cmd vive bajo una ruta con espacios y tildes ("03. Implementación") -- se arma el
  // comando completo ya citado a mano en un solo string, en vez de dejar que spawn arme el
  // string internamente (shell:true + args[] rompe la ruta en el primer espacio real).
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
        // El proceso ya puede haber terminado solo -- no es un error real.
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
    // utf8mb4_unicode_ci, no _general_ci: tiene que coincidir con el charset/collation real
    // de bajonea_final (V1__baseline_bajonea_final.sql), no con el de la base vieja `bajonea`
    // (versión anterior de este script, ver docs/DECISIONES.md).
    'Paso 1/4 -- recrear bajonea_test vacía (mismo charset/collation que bajonea_final)',
    `"${mysqlExe}" -u root -e "DROP DATABASE IF EXISTS bajonea_test; CREATE DATABASE bajonea_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`,
  );

  run(
    // V1__baseline_bajonea_final.sql se aplica contra bajonea_final vía el mecanismo de
    // baseline de Flyway (spring.flyway.baseline-on-migrate=true), que NO ejecuta su SQL --
    // asume que el schema físico ya existe y solo marca la versión 1 como aplicada. Para un
    // ambiente nuevo (bajonea_test) el propio archivo documenta en su encabezado que es "el
    // script real para recrear el schema desde cero" -- por eso se corre acá directo con el
    // cliente mysql, no con Flyway, antes del paso 4 (que sí usa Flyway/baseline para V1 en
    // adelante, una vez que el schema físico ya existe).
    'Paso 2/4 -- aplicar el schema físico completo (V1, 41 tablas, sin datos)',
    `"${mysqlExe}" -u root --default-character-set=utf8mb4 bajonea_test < "${baselineSql}"`,
  );

  run(
    // --default-character-set=utf8mb4 es necesario: el cliente mysql.exe de esta máquina
    // arranca con character_set_client=cp850 (heredado del codepage de la consola de
    // Windows, no de la DB), así que sin este flag reinterpreta los bytes UTF-8 del seed
    // como cp850 al importarlo -- corrompe en silencio cualquier nombre con tilde ("Río
    // Grande" -> "R├¡o Grande"). Bug real encontrado corriendo la Fase 17 (specs 02/03/09).
    'Paso 3/4 -- cargar catálogo geográfico (seed real del ETL de Georef, Fase 2bis)',
    `"${mysqlExe}" -u root --default-character-set=utf8mb4 bajonea_test < "${georefSeed}"`,
  );

  await runMavenUntil(
    // Con el schema físico ya creado (Paso 2) y sin fila en flyway_schema_history, Flyway ve
    // un schema no vacío sin historial propio -- baseline-on-migrate=true (application.properties)
    // inserta un marcador de versión 1 sin re-ejecutar V1, y a partir de ahí aplica V2/V3/V4
    // como migraciones normales. Mismo comportamiento real ya verificado contra bajonea_final.
    'Paso 4/5 -- Flyway baselinea V1 y aplica V2-V4 (perfil test, puerto de migración 8091)',
    [
      'spring-boot:run',
      '-Dspring-boot.run.profiles=test',
      `-Dspring-boot.run.arguments=--server.port=${migrationPort}`,
    ],
    'Started BajoneaApplication',
    180_000,
  );

  run(
    // V1__baseline_bajonea_final.sql es schema-only (41 tablas, sin datos): a diferencia de la
    // bajonea vieja, no trae ningún seed de admin@bajonea.ar (V13__seed_admin.sql quedó
    // archivado en db/migration-archivo-bajonea-vieja/, nunca se migró al set nuevo). Sin esta
    // fila, fijarPasswordAdminYLoguear() (helpers/backend.ts) -- que usan casi todos los specs
    // que tocan Administrador -- falla con 404 "Usuario no encontrado". Se inserta acá, fuera
    // de Flyway, con el mismo criterio que el seed geográfico del Paso 3: dato de fixture de
    // bajonea_test, no una migración de schema que bajonea_final también deba aplicar. El hash
    // de password_hash es un valor cualquiera (bcrypt válido pero de contraseña desconocida) --
    // el propio helper de test lo pisa enseguida vía el flujo real de recuperación de
    // contraseña, nunca se usa para loguear directamente.
    'Paso 5/5 -- sembrar admin@bajonea.ar (gap real de V1__baseline_bajonea_final.sql, sin seed propio todavía)',
    `"${mysqlExe}" -u root --default-character-set=utf8mb4 bajonea_test -e "` +
      `INSERT INTO usuario (email, password_hash, rol, estado, intentos_fallidos) VALUES ('admin@bajonea.ar', '$2a$10$0mUU7IYzopUjCwhmxjeNK.yRR/Zq413QmiKkoRVAXZAsQgQuRbS7q', 'ADMINISTRADOR', 'ACTIVO', 0); ` +
      `INSERT INTO persona (id) SELECT id FROM usuario WHERE email = 'admin@bajonea.ar'; ` +
      `INSERT INTO persona_fisica (id, nombre, apellido, dni, fecha_nacimiento, telefono) SELECT id, 'Admin', 'Bajonea', '00000001', '1990-01-01', '+5492964000000' FROM usuario WHERE email = 'admin@bajonea.ar'; ` +
      `INSERT INTO administrador (id) SELECT id FROM usuario WHERE email = 'admin@bajonea.ar';"`,
  );

  console.log('\n== Listo: bajonea_test recreada con el esquema vigente de bajonea_final ==');
}

main().catch((err) => {
  console.error('\nFalló el reset de bajonea_test:', err.message);
  process.exit(1);
});
