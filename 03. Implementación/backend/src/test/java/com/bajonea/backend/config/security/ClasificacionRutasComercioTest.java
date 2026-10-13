package com.bajonea.backend.config.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.bajonea.backend.enums.RolUsuario;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Prueba de arranque del rol Empleado (tramo E2): recorre todos los mappings de los módulos del Comercio y exige
 * que cada uno esté clasificado a mano en este archivo, de modo que un endpoint nuevo no quede abierto ni
 * cerrado por omisión sin que alguien lo decida.
 * <ul>
 * <li>{@code DELEGABLE}: lo puede usar un Empleado. Tiene que figurar en {@link DelegacionEmpleado} y declarar
 * {@link ComercioActivo}; el Administrador recibe {@code 403}.</li>
 * <li>{@code EXCLUSIVO}: solo el Dueño. Un Cliente (y por lo tanto un Empleado) recibe {@code 403}.</li>
 * <li>{@code PROPIO}: actúa sobre el usuario autenticado, no sobre un comercio.</li>
 * <li>{@code PUBLICO}: público por diseño (callback de OAuth que invoca el navegador, sin JWT).</li>
 * </ul>
 * Falla si hay un mapping sin clasificar, si una clasificación o una entrada de la lista no corresponde a un
 * mapping real, si un delegable no declara {@link ComercioActivo} o si el comportamiento de seguridad real no
 * coincide con la clasificación.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ClasificacionRutasComercioTest {

    private enum Categoria {
        DELEGABLE, EXCLUSIVO, PROPIO, PUBLICO
    }

    private static final List<String> PREFIJOS = List.of("/api/v1/comercios", "/api/v1/productos", "/api/v1/pedidos/comercio",
            "/api/v1/oauth/mercadopago", "/api/v1/notificaciones", "/api/v1/empleados");

    private static final Map<String, Categoria> CLASIFICACION = new TreeMap<>();

    static {
        delegable("GET /api/v1/comercios/perfil");
        delegable("GET /api/v1/productos");
        delegable("GET /api/v1/pedidos/comercio");
        delegable("GET /api/v1/pedidos/comercio/resumen-hoy");

        exclusivo("POST /api/v1/comercios");
        exclusivo("GET /api/v1/comercios/mis-comercios");
        exclusivo("GET /api/v1/comercios/alta-adicional/elegibilidad");
        exclusivo("POST /api/v1/comercios/nuevo/foto/firma");
        exclusivo("GET /api/v1/comercios/{comercioId}/correccion");
        exclusivo("PUT /api/v1/comercios/{comercioId}/resolicitud");
        exclusivo("POST /api/v1/comercios/{comercioId}/correccion/foto/firma");
        exclusivo("PUT /api/v1/comercios/perfil");
        exclusivo("POST /api/v1/comercios/perfil/foto/firma");
        exclusivo("PUT /api/v1/comercios/perfil/foto");
        exclusivo("PUT /api/v1/comercios/cerrar");
        exclusivo("PUT /api/v1/comercios/abrir");
        exclusivo("GET /api/v1/comercios/equipo");
        exclusivo("GET /api/v1/comercios/equipo/actividad");
        exclusivo("POST /api/v1/comercios/equipo/invitaciones");
        exclusivo("POST /api/v1/comercios/equipo/invitaciones/{invitacionId}/reenviar");
        exclusivo("PUT /api/v1/comercios/equipo/invitaciones/{invitacionId}/cancelar");
        exclusivo("GET /api/v1/comercios/redes-sociales");
        exclusivo("POST /api/v1/comercios/redes-sociales");
        exclusivo("PUT /api/v1/comercios/redes-sociales/{id}");
        exclusivo("DELETE /api/v1/comercios/redes-sociales/{id}");

        exclusivo("POST /api/v1/productos");
        exclusivo("PUT /api/v1/productos/{id}");
        exclusivo("PATCH /api/v1/productos/{id}/estado");
        exclusivo("POST /api/v1/productos/{id}/cloudinary/firma");
        exclusivo("POST /api/v1/productos/{id}/imagenes");
        exclusivo("DELETE /api/v1/productos/{id}/imagenes/{imagenId}");
        exclusivo("PATCH /api/v1/productos/{id}/imagenes/{imagenId}/orden");
        exclusivo("POST /api/v1/productos/{id}/imagenes/{imagenId}/recorte/firma");
        exclusivo("PATCH /api/v1/productos/{id}/imagenes/{imagenId}/url");

        exclusivo("GET /api/v1/pedidos/comercio/{id}/pago");
        exclusivo("PUT /api/v1/pedidos/comercio/{id}/aceptar");
        exclusivo("PUT /api/v1/pedidos/comercio/{id}/rechazar");
        exclusivo("PUT /api/v1/pedidos/comercio/{id}/despachar");
        exclusivo("PUT /api/v1/pedidos/comercio/{id}/entregar");
        exclusivo("PUT /api/v1/pedidos/comercio/{id}/anular");

        exclusivo("GET /api/v1/oauth/mercadopago/iniciar");
        exclusivo("GET /api/v1/oauth/mercadopago/desvinculacion/previa");
        exclusivo("DELETE /api/v1/oauth/mercadopago/desvincular");
        exclusivo("GET /api/v1/oauth/mercadopago/cuenta");
        CLASIFICACION.put("GET /api/v1/oauth/mercadopago/callback", Categoria.PUBLICO);

        CLASIFICACION.put("GET /api/v1/notificaciones", Categoria.PROPIO);
        CLASIFICACION.put("PUT /api/v1/notificaciones/{id}/leida", Categoria.PROPIO);
        CLASIFICACION.put("GET /api/v1/notificaciones/no-leidas/contador", Categoria.PROPIO);
        exclusivo("PUT /api/v1/notificaciones/comercio/{comercioId}/leidas");

        CLASIFICACION.put("GET /api/v1/empleados/mis-comercios", Categoria.PROPIO);
    }

    private static void delegable(String clave) {
        CLASIFICACION.put(clave, Categoria.DELEGABLE);
    }

    private static void exclusivo(String clave) {
        CLASIFICACION.put(clave, Categoria.EXCLUSIVO);
    }

    @Autowired
    private RequestMappingHandlerMapping handlerMapping;

    @Autowired
    private MockMvc mockMvc;

    private Map<String, HandlerMethod> mappingsReales() {
        Map<String, HandlerMethod> reales = new TreeMap<>();
        for (Map.Entry<RequestMappingInfo, HandlerMethod> entrada : handlerMapping.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = entrada.getKey();
            if (info.getPathPatternsCondition() == null) {
                continue;
            }
            for (String patron : info.getPathPatternsCondition().getPatternValues()) {
                if (PREFIJOS.stream().noneMatch(prefijo -> patron.equals(prefijo) || patron.startsWith(prefijo + "/"))) {
                    continue;
                }
                Set<org.springframework.web.bind.annotation.RequestMethod> metodos = info.getMethodsCondition().getMethods();
                assertTrue(!metodos.isEmpty(), "El mapping " + patron + " no declara método HTTP: hay que declararlo para clasificarlo");
                for (org.springframework.web.bind.annotation.RequestMethod metodo : metodos) {
                    reales.put(metodo.name() + " " + patron, entrada.getValue());
                }
            }
        }
        return reales;
    }

    @Test
    void todoMappingDelModuloDelComercioEstaClasificado() {
        Set<String> sinClasificar = new TreeSet<>(mappingsReales().keySet());
        sinClasificar.removeAll(CLASIFICACION.keySet());

        assertTrue(sinClasificar.isEmpty(), "Mappings sin clasificar (DELEGABLE, EXCLUSIVO, PROPIO o PUBLICO): " + sinClasificar);
    }

    @Test
    void todaClasificacionCorrespondeAUnMappingReal() {
        Set<String> sobrantes = new TreeSet<>(CLASIFICACION.keySet());
        sobrantes.removeAll(mappingsReales().keySet());

        assertTrue(sobrantes.isEmpty(), "Clasificaciones que no corresponden a ningún mapping real: " + sobrantes);
    }

    @Test
    void laListaBlancaCoincideConLosDelegablesYCadaEntradaEsUnMappingReal() {
        Set<String> delegablesDeLaClasificacion = new TreeSet<>();
        CLASIFICACION.forEach((clave, categoria) -> {
            if (categoria == Categoria.DELEGABLE) {
                delegablesDeLaClasificacion.add(clave);
            }
        });
        Set<String> listaBlanca = new TreeSet<>();
        DelegacionEmpleado.RUTAS.forEach(ruta -> listaBlanca.add(ruta.clave()));

        assertEquals(delegablesDeLaClasificacion, listaBlanca);
        Set<String> inexistentes = new TreeSet<>(listaBlanca);
        inexistentes.removeAll(mappingsReales().keySet());
        assertTrue(inexistentes.isEmpty(), "Entradas de DelegacionEmpleado que no son un mapping real: " + inexistentes);
    }

    @Test
    void todoDelegableDeclaraComercioActivo() {
        Map<String, HandlerMethod> reales = mappingsReales();
        List<String> sinComercioActivo = new ArrayList<>();
        for (DelegacionEmpleado.RutaDelegable ruta : DelegacionEmpleado.RUTAS) {
            HandlerMethod handler = reales.get(ruta.clave());
            boolean declara = handler != null && java.util.Arrays.stream(handler.getMethodParameters())
                    .anyMatch(parametro -> ComercioActivo.class.equals(parametro.getParameterType()));
            if (!declara) {
                sinComercioActivo.add(ruta.clave());
            }
        }

        assertTrue(sinComercioActivo.isEmpty(), "Delegables que no declaran ComercioActivo: " + sinComercioActivo);
    }

    @Test
    void ningunNoDelegableDeclaraComercioActivoSinEstarClasificadoExclusivo() {
        Map<String, HandlerMethod> reales = mappingsReales();
        List<String> incoherentes = new ArrayList<>();
        reales.forEach((clave, handler) -> {
            boolean declara = java.util.Arrays.stream(handler.getMethodParameters())
                    .anyMatch(parametro -> ComercioActivo.class.equals(parametro.getParameterType()));
            Categoria categoria = CLASIFICACION.get(clave);
            if (declara && categoria != Categoria.DELEGABLE && categoria != Categoria.EXCLUSIVO) {
                incoherentes.add(clave + " -> " + categoria);
            }
        });

        assertTrue(incoherentes.isEmpty(), "Rutas con ComercioActivo clasificadas como propias o públicas: " + incoherentes);
    }

    @Test
    void laSeguridadRealCoincideConLaClasificacion() throws Exception {
        List<String> fallos = new ArrayList<>();
        for (Map.Entry<String, Categoria> entrada : CLASIFICACION.entrySet()) {
            String[] partes = entrada.getKey().split(" ", 2);
            HttpMethod metodo = HttpMethod.valueOf(partes[0]);
            String ruta = partes[1].replaceAll("\\{[^}]+}", "1");
            switch (entrada.getValue()) {
                case EXCLUSIVO -> {
                    verificar(fallos, entrada.getKey(), RolUsuario.CLIENTE, metodo, ruta, 403);
                    verificar(fallos, entrada.getKey(), RolUsuario.ADMINISTRADOR, metodo, ruta, 403);
                }
                case DELEGABLE -> {
                    verificar(fallos, entrada.getKey(), RolUsuario.CLIENTE, metodo, ruta, 400);
                    verificar(fallos, entrada.getKey(), RolUsuario.DUENO, metodo, ruta, 400);
                    verificar(fallos, entrada.getKey(), RolUsuario.ADMINISTRADOR, metodo, ruta, 403);
                }
                case PROPIO -> {
                    if (ruta.startsWith("/api/v1/empleados")) {
                        verificar(fallos, entrada.getKey(), RolUsuario.CLIENTE, metodo, ruta, 200);
                        verificar(fallos, entrada.getKey(), RolUsuario.DUENO, metodo, ruta, 403);
                        verificar(fallos, entrada.getKey(), RolUsuario.ADMINISTRADOR, metodo, ruta, 403);
                    }
                }
                case PUBLICO -> {
                }
            }
        }

        assertTrue(fallos.isEmpty(), "La seguridad real no coincide con la clasificación: " + fallos);
    }

    private void verificar(List<String> fallos, String clave, RolUsuario rol, HttpMethod metodo, String ruta, int esperado)
            throws Exception {
        AuthenticatedUser principal = new AuthenticatedUser(1, 1, rol);
        UsernamePasswordAuthenticationToken autenticacion = new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + rol.name())));
        int real = mockMvc.perform(request(metodo, ruta).with(authentication(autenticacion)))
                .andReturn().getResponse().getStatus();
        if (real != esperado) {
            fallos.add(clave + " como " + rol + ": esperado " + esperado + ", real " + real);
        }
        assertNotEquals(401, real, clave + " como " + rol + " no debería pedir autenticación");
    }
}
