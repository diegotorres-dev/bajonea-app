import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.output.MigrateResult;

/**
 * Aplica las migraciones de Flyway pendientes sobre una base, sin levantar la aplicación. Misma librería, mismos
 * archivos y mismas opciones que el arranque normal de Spring Boot ({@code baseline-on-migrate=true},
 * {@code baseline-version=1}, validación de checksums de lo ya aplicado), pero sin arrancar el resto del backend: así no
 * corren los jobs programados (timeouts de pedidos, avisos) contra la base, y los datos solo cambian por lo que hacen
 * las migraciones. Uso (desde backend/, con el classpath de runtime en un archivo):
 * {@code java -cp "<jars>" scripts/migrar-flyway/MigrarFlyway.java <jdbcUrl> <usuario> <password> <carpetaDeMigraciones>}
 * Con {@code --info} como quinto argumento solo lista el estado, sin migrar.
 */
public class MigrarFlyway {

    public static void main(String[] args) {
        String url = args[0];
        String usuario = args[1];
        String password = args.length > 2 ? args[2] : "";
        String carpeta = args[3];
        boolean soloInfo = args.length > 4 && "--info".equals(args[4]);

        Flyway flyway = Flyway.configure()
                .dataSource(url, usuario, password)
                .locations("filesystem:" + carpeta)
                .baselineOnMigrate(true)
                .baselineVersion("1")
                .validateOnMigrate(true)
                .load();

        System.out.println("Pendientes antes:");
        for (MigrationInfo info : flyway.info().pending()) {
            System.out.println("  V" + info.getVersion() + " " + info.getDescription());
        }
        if (soloInfo) {
            return;
        }
        MigrateResult resultado = flyway.migrate();
        System.out.println("Migraciones aplicadas: " + resultado.migrationsExecuted + " (version final " + resultado.targetSchemaVersion + ")");
    }
}
