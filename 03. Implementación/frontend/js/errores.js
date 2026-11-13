import { getUsuario, getContextoGuardado, TIPO_CONTEXTO } from './api.js';

export function inicioDelUsuario() {
  const usuario = getUsuario();
  if (!usuario) {
    return { href: 'index.html', etiqueta: 'Volver al inicio' };
  }
  if (usuario.rol === 'ADMINISTRADOR') {
    return { href: 'admin-dashboard.html', etiqueta: 'Volver al panel' };
  }
  if (usuario.rol === 'DUENO') {
    return { href: 'comercio-dashboard.html', etiqueta: 'Volver al panel' };
  }
  const contexto = getContextoGuardado();
  if (contexto && contexto.tipo === TIPO_CONTEXTO.EMPLEADO) {
    return { href: 'comercio-dashboard.html', etiqueta: 'Volver al panel' };
  }
  return { href: 'index.html', etiqueta: 'Volver al inicio' };
}

export function enlazarVolverAlInicio() {
  const { href, etiqueta } = inicioDelUsuario();
  document.querySelectorAll('[data-testid="btn-volver-inicio"]').forEach((enlace) => {
    enlace.setAttribute('href', `../${href}`);
    enlace.textContent = etiqueta;
  });
  return href;
}
