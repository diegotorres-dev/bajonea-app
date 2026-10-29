package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Garantiza que el estado de un usuario cambia en un único lugar ({@code EstadoUsuarioService.cambiar}), que es el que
 * escribe la fila de {@code historial_estado_usuario} en la misma transacción. Recorre el código fuente de
 * producción: ningún otro archivo puede llamar a {@code Usuario.aplicarEstado}, ni asignar el estado de un usuario con
 * un setter, ni escribir {@code usuario.estado} con un {@code UPDATE} propio. Si falla, el cambio de estado nuevo tiene
 * que pasar por el servicio central.
 */
class EstadoUsuarioCentralizadoTest {

    private static final Path FUENTES = Paths.get("src", "main", "java");
    private static final Pattern APLICAR_ESTADO = Pattern.compile("\\.aplicarEstado\\s*\\(");
    private static final Pattern SETTER_DE_ESTADO_DE_USUARIO = Pattern.compile("\\.setEstado\\s*\\(\\s*EstadoUsuario\\b");
    private static final Pattern UPDATE_DE_USUARIO = Pattern.compile("(?i)update\\s+usuario\\s+set[^\"]*\\bestado\\b");

    private static List<Path> archivosJava() throws IOException {
        try (Stream<Path> recorrido = Files.walk(FUENTES)) {
            return recorrido.filter(p -> p.toString().endsWith(".java")).toList();
        }
    }

    private static List<String> coincidencias(Pattern patron, List<String> permitidos) throws IOException {
        List<String> encontrados = new ArrayList<>();
        for (Path archivo : archivosJava()) {
            String nombre = archivo.getFileName().toString();
            if (permitidos.contains(nombre)) {
                continue;
            }
            String contenido = Files.readString(archivo, StandardCharsets.UTF_8);
            if (patron.matcher(contenido).find()) {
                encontrados.add(archivo.toString());
            }
        }
        return encontrados;
    }

    @Test
    void soloElServicioCentralLlamaAAplicarEstado() throws IOException {
        assertEquals(List.of(), coincidencias(APLICAR_ESTADO, List.of("EstadoUsuarioService.java")));
        String servicio = Files.readString(FUENTES.resolve("com/bajonea/backend/services/EstadoUsuarioService.java"), StandardCharsets.UTF_8);
        assertTrue(APLICAR_ESTADO.matcher(servicio).find(), "El servicio central ya no cambia el estado");
    }

    @Test
    void nadieAsignaElEstadoDeUnUsuarioConUnSetter() throws IOException {
        assertEquals(List.of(), coincidencias(SETTER_DE_ESTADO_DE_USUARIO, List.of()));
    }

    @Test
    void nadieEscribeElEstadoDelUsuarioConUnUpdatePropio() throws IOException {
        assertEquals(List.of(), coincidencias(UPDATE_DE_USUARIO, List.of()));
    }

    @Test
    void laEntidadUsuarioNoExponeUnSetterDeEstado() throws IOException {
        String usuario = Files.readString(FUENTES.resolve("com/bajonea/backend/entities/Usuario.java"), StandardCharsets.UTF_8);
        assertTrue(!usuario.contains("setEstado"), "Usuario no puede tener setEstado");
        assertTrue(!Pattern.compile("@Setter\\s+@Enumerated\\(EnumType.STRING\\)\\s+@Column\\(name = \"estado\"").matcher(usuario).find(),
                "El campo estado de Usuario no puede llevar @Setter");
    }
}
