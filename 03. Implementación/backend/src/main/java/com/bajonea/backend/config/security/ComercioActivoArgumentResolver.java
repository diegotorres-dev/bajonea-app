package com.bajonea.backend.config.security;

import com.bajonea.backend.services.ComercioActivoService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Entrega un {@link ComercioActivo} a los controllers que lo declaran como parámetro. Solo lee
 * el header {@code X-Comercio-Id} y el principal autenticado; toda la regla de resolución vive
 * en {@link ComercioActivoService}. Los endpoints que no declaran el parámetro nunca pasan por
 * acá, así que ignoran el header por completo.
 */
@Component
@RequiredArgsConstructor
public class ComercioActivoArgumentResolver implements HandlerMethodArgumentResolver {

    private final ComercioActivoService comercioActivoService;

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return ComercioActivo.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser usuario)) {
            throw new IllegalStateException("ComercioActivo requiere un usuario autenticado");
        }
        String header = webRequest.getHeader(ComercioActivoService.HEADER_COMERCIO_ID);
        return comercioActivoService.resolver(usuario.userId(), header);
    }
}
