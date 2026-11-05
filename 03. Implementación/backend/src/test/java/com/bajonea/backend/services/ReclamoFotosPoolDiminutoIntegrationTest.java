package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;

/**
 * Guardar un reclamo con sus tres fotos no retiene una conexión de más (Fase 5, tramo S5; regla 16): la validación y la lectura
 * de los bytes ocurren antes de abrir la transacción y el guardado es una sola transacción con una sola conexión. Con un pool de
 * tres conexiones y espera de 4 segundos, doce envíos simultáneos de tres fotos de un megabyte terminan todos.
 */
@TestPropertySource(properties = {
        "spring.datasource.hikari.maximum-pool-size=3",
        "spring.datasource.hikari.minimum-idle=3",
        "spring.datasource.hikari.connection-timeout=4000"
})
class ReclamoFotosPoolDiminutoIntegrationTest extends ReclamoIntegrationBase {

    private static MockMultipartFile fotoDeUnMega(int numero) {
        byte[] bytes = new byte[1024 * 1024];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        return new MockMultipartFile("fotos", "foto" + numero + ".jpg", "image/jpeg", bytes);
    }

    @Test
    void docePedidosConTresFotosTerminanTodosConUnPoolDeTresConexiones() {
        Dueno dueno = duenoConCuenta();
        List<Integer> pedidos = new ArrayList<>();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            int cliente = datos.registrarCliente();
            int pedidoId = pedidoEntregado(cliente, dueno);
            pedidos.add(pedidoId);
            tareas.add(() -> reclamoService.crear(cliente, pedidoId, reclamoDe(com.bajonea.backend.enums.MotivoReclamo.OTRO),
                    List.of(fotoDeUnMega(1), fotoDeUnMega(2), fotoDeUnMega(3))));
        }

        List<Object> resultados = correrAlMismoTiempo(tareas);

        assertEquals(12, resultados.size());
        for (Integer pedidoId : pedidos) {
            assertEquals(3, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM reclamo_foto WHERE reclamo_id = ?", Integer.class, reclamoId(pedidoId)));
        }
    }
}
