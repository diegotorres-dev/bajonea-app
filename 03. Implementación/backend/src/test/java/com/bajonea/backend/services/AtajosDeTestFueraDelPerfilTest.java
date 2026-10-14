package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.controllers.TestController;
import com.bajonea.backend.enums.RolUsuario;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.core.env.Environment;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Los atajos de {@code /api/v1/test/**} no existen fuera del perfil {@code test}, con dos protecciones
 * independientes: no hay bean que atienda la ruta, y el matcher público de {@code SecurityConfig} solo se
 * registra con el perfil {@code test} activo (sin él, anónimo da {@code 401} y autenticado da {@code 404}). El
 * contexto se levanta sin ese perfil (solo la base de pruebas, para poder arrancar).
 * <p>
 * La lista de atajos sale por reflexión de {@link TestController}: un atajo nuevo queda cubierto sin tocar este
 * test, y ninguna otra clase puede llevar {@code @Profile("test")} sin que falle.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:mysql://localhost:3306/bajonea_test",
        "spring.datasource.username=${DB_USER:root}",
        "spring.datasource.password=${DB_PASSWORD:}",
        "email.envio-habilitado=false"})
@AutoConfigureMockMvc
class AtajosDeTestFueraDelPerfilTest {

    private static final String BASE = "/api/v1/test";
    private static final int ATAJOS_MINIMOS = 14;

    @Autowired
    private ApplicationContext contexto;

    @Autowired
    private Environment entorno;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RequestMappingHandlerMapping handlerMapping;

    private record Atajo(HttpMethod metodo, String ruta) {
        @Override
        public String toString() {
            return metodo + " " + ruta;
        }
    }

    private static List<Atajo> atajosDelControlador() {
        RequestMapping base = AnnotationUtils.findAnnotation(TestController.class, RequestMapping.class);
        assertEquals(BASE, base.value()[0]);
        List<Atajo> atajos = new ArrayList<>();
        for (Method metodo : TestController.class.getDeclaredMethods()) {
            RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(metodo, RequestMapping.class);
            if (mapping == null) {
                continue;
            }
            String[] rutas = mapping.path().length > 0 ? mapping.path() : mapping.value();
            assertEquals(1, rutas.length, "El atajo " + metodo.getName() + " debe declarar una sola ruta");
            assertEquals(1, mapping.method().length, "El atajo " + metodo.getName() + " debe declarar un solo método HTTP");
            RequestMethod verbo = mapping.method()[0];
            atajos.add(new Atajo(HttpMethod.valueOf(verbo.name()), (BASE + rutas[0]).replaceAll("\\{[^}]+}", "1")));
        }
        return atajos;
    }

    @Test
    void sinElPerfilTestNoHayControllerNiServicioDeAtajos() {
        assertFalse(Arrays.asList(entorno.getActiveProfiles()).contains("test"));
        assertEquals(0, contexto.getBeansOfType(TestController.class).size());
        assertEquals(0, contexto.getBeansOfType(TestSupportService.class).size());
    }

    @Test
    void seDescubrenTodosLosAtajosPorReflexion() {
        assertTrue(atajosDelControlador().size() >= ATAJOS_MINIMOS, "Se esperaban al menos " + ATAJOS_MINIMOS + " atajos: " + atajosDelControlador());
    }

    @Test
    void ningunMappingBajoApiV1TestEstaRegistrado() {
        List<String> registrados = new ArrayList<>();
        handlerMapping.getHandlerMethods().forEach((info, handler) -> {
            if (info.getPathPatternsCondition() != null) {
                for (String patron : info.getPathPatternsCondition().getPatternValues()) {
                    if (patron.equals(BASE) || patron.startsWith(BASE + "/")) {
                        registrados.add(patron + " -> " + handler);
                    }
                }
            }
        });
        assertTrue(registrados.isEmpty(), "Hay mappings de atajos registrados sin el perfil test: " + registrados);
    }

    @Test
    void soloElControladorYElServicioDeAtajosLlevanElPerfilTest() {
        ClassPathScanningCandidateComponentProvider escaner = new ClassPathScanningCandidateComponentProvider(false);
        StandardEnvironment conPerfilTestActivo = new StandardEnvironment();
        conPerfilTestActivo.setActiveProfiles("test");
        escaner.setEnvironment(conPerfilTestActivo);
        escaner.addIncludeFilter(new AnnotationTypeFilter(Profile.class));
        Set<String> conPerfilTest = new TreeSet<>();
        for (BeanDefinition definicion : escaner.findCandidateComponents("com.bajonea.backend")) {
            conPerfilTest.add(definicion.getBeanClassName());
        }
        assertEquals(Set.of(TestController.class.getName(), TestSupportService.class.getName()), conPerfilTest,
                "Solo TestController y TestSupportService pueden llevar @Profile");
    }

    @Test
    void cadaAtajoSinTokenRespondeNoAutenticadoYNuncaDaDatos() throws Exception {
        List<String> fallos = new ArrayList<>();
        for (Atajo atajo : atajosDelControlador()) {
            int estado = mockMvc.perform(request(atajo.metodo(), atajo.ruta())).andReturn().getResponse().getStatus();
            if (estado != 401) {
                fallos.add(atajo + " sin token: esperado 401, real " + estado);
            }
        }
        assertTrue(fallos.isEmpty(), "Atajos accesibles sin autenticar: " + fallos);
    }

    @Test
    void cadaAtajoAutenticadoRespondeNotFoundPorqueNoHayHandler() throws Exception {
        List<String> fallos = new ArrayList<>();
        for (RolUsuario rol : RolUsuario.values()) {
            AuthenticatedUser principal = new AuthenticatedUser(1, 1, rol);
            UsernamePasswordAuthenticationToken autenticacion = new UsernamePasswordAuthenticationToken(principal, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + rol.name())));
            for (Atajo atajo : atajosDelControlador()) {
                int estado = mockMvc.perform(request(atajo.metodo(), atajo.ruta()).with(authentication(autenticacion)))
                        .andReturn().getResponse().getStatus();
                if (estado != 404) {
                    fallos.add(atajo + " como " + rol + ": esperado 404, real " + estado);
                }
            }
        }
        assertTrue(fallos.isEmpty(), "Atajos que responden sin el perfil test: " + fallos);
    }
}
