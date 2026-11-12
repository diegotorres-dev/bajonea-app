import { apiFetch, esContextoDueno, esContextoEmpleado, getComercioActivoId } from './api.js';
import { contarNotificacionesNoLeidasActivo, resolverComercioActivo, suscribirComercios } from './comercio-activo.js';
import { crearSvg } from './form-utils.js';
import { abrirHoja } from './hoja.js';
import { logout } from './auth.js';
import { iniciales, montarFranjaComercio } from './selector-comercio.js';

export const MEDIA_ESCRITORIO = '(min-width: 1024px)';

const consultaEscritorio = window.matchMedia(MEDIA_ESCRITORIO);

export function enEscritorio() {
  return consultaEscritorio.matches;
}

export function alCambiarEscritorio(oyente) {
  oyente(consultaEscritorio.matches);
  consultaEscritorio.addEventListener('change', (evento) => oyente(evento.matches));
}

const ICONOS = {
  panel: [['path', { d: 'M3 10.5 12 3l9 7.5' }], ['path', { d: 'M5 9.5V21h14V9.5' }], ['path', { d: 'M10 21v-6h4v6' }]],
  productos: [['path', { d: 'M21 8 12 3 3 8v8l9 5 9-5Z' }], ['polyline', { points: '3.3 7.5 12 12.5 20.7 7.5' }], ['line', { x1: 12, y1: 22, x2: 12, y2: 12.5 }]],
  pedidos: [['line', { x1: 8, y1: 6, x2: 21, y2: 6 }], ['line', { x1: 8, y1: 12, x2: 21, y2: 12 }], ['line', { x1: 8, y1: 18, x2: 21, y2: 18 }], ['line', { x1: 3, y1: 6, x2: 3.01, y2: 6 }], ['line', { x1: 3, y1: 12, x2: 3.01, y2: 12 }], ['line', { x1: 3, y1: 18, x2: 3.01, y2: 18 }]],
  estadisticas: [['line', { x1: 18, y1: 20, x2: 18, y2: 10 }], ['line', { x1: 12, y1: 20, x2: 12, y2: 4 }], ['line', { x1: 6, y1: 20, x2: 6, y2: 14 }]],
  documentacion: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z' }], ['polyline', { points: '14 2 14 8 20 8' }], ['polyline', { points: '9 15 11 17 15 13' }]],
  equipo: [['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
  avisos: [['path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }], ['path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }]],
  perfil: [['path', { d: 'M3 9l1.5-5h15L21 9' }], ['path', { d: 'M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' }], ['line', { x1: 3, y1: 9, x2: 21, y2: 9 }]],
  salir: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['polyline', { points: '16 17 21 12 16 7' }], ['line', { x1: 21, y1: 12, x2: 9, y2: 12 }]],
};

function crear(etiqueta, clase, atributos = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) {
    nodo.className = clase;
  }
  Object.entries(atributos).forEach(([nombre, valor]) => {
    if (valor !== false && valor !== null && valor !== undefined) {
      nodo.setAttribute(nombre, valor === true ? '' : valor);
    }
  });
  return nodo;
}

function icono(clave) {
  return crearSvg(ICONOS[clave], { 'aria-hidden': 'true' });
}

function crearEnlaceLateral({ clave, etiqueta, href, activo, insignia }) {
  const enlace = crear('a', 'bottom-nav__item', { href, 'data-testid': `btn-nav-${clave}` });
  if (clave === activo) {
    enlace.setAttribute('aria-current', 'page');
  }
  enlace.appendChild(icono(clave));
  const texto = crear('span');
  texto.textContent = etiqueta;
  enlace.appendChild(texto);
  if (insignia) {
    enlace.appendChild(crear('span', 'nav-insignia', { hidden: true, 'data-testid': `insignia-nav-${clave}` }));
  }
  return enlace;
}

let pendientesEnMemoria = 0;
const oyentesDeInsignias = new Set();

function pintarInsignia(nodo, cantidad) {
  if (!nodo) {
    return;
  }
  nodo.hidden = cantidad <= 0 || !enEscritorio();
  nodo.textContent = cantidad > 9 ? '9+' : String(cantidad);
  nodo.setAttribute('aria-label', `${cantidad} sin atender`);
}

export function informarPendientes(cantidad) {
  pendientesEnMemoria = Number(cantidad) || 0;
  oyentesDeInsignias.forEach((oyente) => oyente());
}

function crearMarcaLateral() {
  const marca = crear('div', 'barra-lateral__logo', { hidden: true });
  const logo = crear('img', null, { src: 'assets/img/bajonea-logo-orange-header.png', alt: 'Bajoneá' });
  marca.appendChild(logo);
  return marca;
}

function mostrarModalCerrarSesion() {
  abrirHoja({
    titulo: '¿Cerrar sesión?',
    texto: 'Podés volver a ingresar en cualquier momento.',
    testid: 'modal-confirmar-logout',
    acciones: [
      { etiqueta: 'Sí, cerrar sesión', etiquetaEnviando: 'Cerrando…', variante: 'primaria', testid: 'btn-confirmar-logout', alPulsar: () => logout() },
      { etiqueta: 'Cancelar', variante: 'segura', inicial: true, testid: 'btn-cancelar-logout' },
    ],
  });
}

async function resolverNombrePersona() {
  try {
    if (esContextoEmpleado()) {
      const perfil = await apiFetch('/clientes/perfil', { segundoPlano: true });
      return perfil.nombre || null;
    }
    const comercio = await apiFetch('/comercios/perfil', { segundoPlano: true });
    return (comercio.representante && comercio.representante.nombre) || null;
  } catch {
    return null;
  }
}

function crearPieLateral() {
  const pie = crear('div', 'barra-lateral__pie', { hidden: true });
  const persona = crear('div', 'persona', { 'data-testid': 'persona-lateral' });
  const avatar = crear('span', 'persona__avatar', { 'aria-hidden': 'true' });
  avatar.textContent = '?';
  const textos = crear('span', 'persona__textos');
  const nombre = crear('span', 'persona__nombre', { 'data-testid': 'persona-lateral-nombre' });
  const rol = crear('span', 'persona__rol', { 'data-testid': 'persona-lateral-rol' });
  rol.textContent = esContextoEmpleado() ? 'Empleado' : 'Dueño';
  nombre.textContent = rol.textContent;
  textos.append(nombre, rol);
  persona.append(avatar, textos);
  const salir = crear('button', 'barra-lateral__salir', { type: 'button', 'data-testid': 'btn-lateral-cerrar-sesion' });
  salir.appendChild(icono('salir'));
  const textoSalir = crear('span');
  textoSalir.textContent = 'Cerrar sesión';
  salir.appendChild(textoSalir);
  salir.addEventListener('click', mostrarModalCerrarSesion);
  pie.append(persona, salir);
  resolverComercioActivo().then(resolverNombrePersona).then((nombrePersona) => {
    if (nombrePersona) {
      nombre.textContent = nombrePersona;
      avatar.textContent = iniciales(nombrePersona);
    }
  });
  return pie;
}

function sondearPendientes() {
  if (getComercioActivoId() === null) {
    return;
  }
  apiFetch('/pedidos/comercio/resumen-turno', { segundoPlano: true })
    .then((resumen) => informarPendientes(resumen.cantidadPendientes))
    .catch(() => {});
}

function reubicarFranja(slotFranja, anfitrion) {
  if (!slotFranja) {
    return;
  }
  const origen = { padre: slotFranja.parentNode, siguiente: slotFranja.nextSibling };
  alCambiarEscritorio((escritorio) => {
    if (escritorio) {
      anfitrion.appendChild(slotFranja);
    } else if (origen.padre && slotFranja.parentNode !== origen.padre) {
      origen.padre.insertBefore(slotFranja, origen.siguiente && origen.siguiente.parentNode === origen.padre ? origen.siguiente : null);
    }
  });
}

function aplicarActivo(nav, clave) {
  nav.querySelectorAll('a.bottom-nav__item').forEach((enlace) => {
    const propia = enlace.getAttribute('data-testid').replace('btn-nav-', '');
    if (propia === clave) {
      enlace.setAttribute('aria-current', 'page');
    } else {
      enlace.removeAttribute('aria-current');
    }
  });
}

export function completarBarraLateral(contenedor, nav, activo, { activoLateral = activo, soloEscritorio = false } = {}) {
  const shell = contenedor.closest('.app-shell');
  if (shell) {
    shell.classList.add('app-shell--lateral', 'app-shell--comercio');
  }
  if (soloEscritorio) {
    contenedor.hidden = true;
  }
  const logo = crearMarcaLateral();
  const selector = crear('div', 'barra-lateral__selector', { hidden: true, 'data-testid': 'selector-lateral' });
  contenedor.insertBefore(logo, nav);
  contenedor.insertBefore(selector, nav);
  const slotFranja = document.getElementById('franja-comercio-slot');
  if (slotFranja) {
    reubicarFranja(slotFranja, selector);
  } else {
    let montada = false;
    alCambiarEscritorio((escritorio) => {
      if (escritorio && !montada) {
        montada = true;
        const slotNuevo = crear('div', null, { id: 'franja-comercio-slot' });
        selector.appendChild(slotNuevo);
        montarFranjaComercio(slotNuevo);
      }
    });
  }

  const enlacePerfil = nav.querySelector('[data-testid="btn-nav-perfil"]');
  const enlacePedidos = nav.querySelector('[data-testid="btn-nav-pedidos"]');
  const etiquetaMovil = enlacePerfil.querySelector(':scope > span:not(.bottom-nav__avatar)');
  etiquetaMovil.classList.add('nav-etiqueta-movil');
  const etiquetaEscritorio = crear('span', 'nav-etiqueta-escritorio', { hidden: true });
  etiquetaEscritorio.textContent = 'Perfil del comercio';
  enlacePerfil.appendChild(etiquetaEscritorio);

  const grupo = crear('div', 'nav-grupo-escritorio', { hidden: true });
  const extras = [];
  if (esContextoDueno()) {
    extras.push({ clave: 'estadisticas', etiqueta: 'Estadísticas', href: 'comercio-estadisticas.html' });
    extras.push({ clave: 'documentacion', etiqueta: 'Documentación', href: 'comercio-documentacion.html' });
    extras.push({ clave: 'equipo', etiqueta: 'Equipo', href: 'comercio-perfil.html?seccion=equipo' });
  }
  extras.push({ clave: 'avisos', etiqueta: 'Avisos', href: 'notificaciones.html', insignia: true });
  extras.forEach((item) => grupo.appendChild(crearEnlaceLateral({ ...item, activo })));
  nav.insertBefore(grupo, enlacePerfil);
  if (activoLateral !== activo) {
    alCambiarEscritorio((escritorio) => aplicarActivo(nav, escritorio ? activoLateral : activo));
  }

  const insigniaPedidos = crear('span', 'nav-insignia', { hidden: true, 'data-testid': 'insignia-nav-pedidos' });
  enlacePedidos.appendChild(insigniaPedidos);
  const insigniaAvisos = grupo.querySelector('[data-testid="insignia-nav-avisos"]');

  contenedor.appendChild(crearPieLateral());

  const repintar = () => {
    pintarInsignia(insigniaPedidos, pendientesEnMemoria);
    pintarInsignia(insigniaAvisos, contarNotificacionesNoLeidasActivo());
  };
  oyentesDeInsignias.add(repintar);
  alCambiarEscritorio(repintar);
  let iniciado = false;
  alCambiarEscritorio((escritorio) => {
    if (!escritorio || iniciado) {
      return;
    }
    iniciado = true;
    resolverComercioActivo().then(sondearPendientes).catch(() => {});
    suscribirComercios(() => {
      repintar();
      if (!document.hidden) {
        sondearPendientes();
      }
    });
  });
  repintar();
}

export async function montarBarraLateralCompartida(activo, activoLateral) {
  const shell = document.querySelector('.app-shell');
  if (!shell) {
    return;
  }
  let ranura = document.getElementById('bottom-nav-slot');
  if (!ranura) {
    ranura = crear('div', null, { id: 'bottom-nav-slot' });
    shell.appendChild(ranura);
  }
  const { renderBottomNavComercio } = await import('./comercio.js');
  renderBottomNavComercio(ranura, activo, { activoLateral, soloEscritorio: true });
}

export function agregarAccionEscritorio(ranuraBarra, elemento) {
  const barra = ranuraBarra.querySelector('.top-bar');
  if (!barra) {
    return null;
  }
  const envoltorio = crear('div', 'top-bar__acciones-escritorio', { hidden: true });
  envoltorio.appendChild(elemento);
  barra.appendChild(envoltorio);
  return envoltorio;
}
