import { apiFetch, getUsuario } from './api.js';
import { h, crearSvg } from './form-utils.js';
import { abrirHoja } from './hoja.js';
import { logout } from './auth.js';

const MEDIA_ESCRITORIO = '(min-width: 1024px)';
const INTERVALO_INSIGNIAS_MS = 15000;

const ICONOS = {
  panel: [['rect', { x: 3, y: 3, width: 7, height: 9 }], ['rect', { x: 14, y: 3, width: 7, height: 5 }], ['rect', { x: 14, y: 12, width: 7, height: 9 }], ['rect', { x: 3, y: 16, width: 7, height: 5 }]],
  pendientes: [['path', { d: 'M3 9l1.5-5h15L21 9' }], ['path', { d: 'M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' }], ['line', { x1: 3, y1: 9, x2: 21, y2: 9 }]],
  comercios: [['path', { d: 'M3 21h18' }], ['path', { d: 'M5 21V8l7-5 7 5v13' }], ['path', { d: 'M9 21v-6h6v6' }]],
  resolicitudes: [['polyline', { points: '23 4 23 10 17 10' }], ['polyline', { points: '1 20 1 14 7 14' }], ['path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }]],
  documentos: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z' }], ['polyline', { points: '14 2 14 8 20 8' }], ['polyline', { points: '9 15 11 17 15 13' }]],
  soporte: [['path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z' }]],
  reclamos: [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }], ['line', { x1: 12, y1: 9, x2: 12, y2: 13 }], ['line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }]],
  clientes: [['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
  duenos: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  reembolsos: [['polyline', { points: '1 4 1 10 7 10' }], ['path', { d: 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10' }]],
  tarifas: [['line', { x1: 19, y1: 5, x2: 5, y2: 19 }], ['circle', { cx: 6.5, cy: 6.5, r: 2.5 }], ['circle', { cx: 17.5, cy: 17.5, r: 2.5 }]],
  categorias: [['path', { d: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z' }], ['line', { x1: 7, y1: 7, x2: 7.01, y2: 7 }]],
  salir: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['polyline', { points: '16 17 21 12 16 7' }], ['line', { x1: 21, y1: 12, x2: 9, y2: 12 }]],
};

export const ITEMS_NAVEGACION_ADMIN = [
  { clave: 'panel', etiqueta: 'Panel', href: 'admin-dashboard.html' },
  { clave: 'pendientes', etiqueta: 'Comercios pendientes', href: 'admin-comercios-pendientes.html', insignia: (m) => m.comerciosPendientes },
  { clave: 'comercios', etiqueta: 'Comercios', href: 'admin-comercios.html' },
  { clave: 'resolicitudes', etiqueta: 'Re-solicitudes', href: 'admin-resolicitudes.html', insignia: (m) => m.resolicitudesPendientes },
  { clave: 'documentos', etiqueta: 'Documentos', href: 'admin-documentos.html', insignia: (m) => m.documentosPendientes },
  { clave: 'soporte', etiqueta: 'Soporte', href: 'admin-soporte.html', insignia: (m) => m.consultasSoporteEsperando },
  { clave: 'reclamos', etiqueta: 'Reclamos', href: 'admin-reclamos.html', insignia: (m) => m.reclamosPendientes },
  { clave: 'clientes', etiqueta: 'Clientes', href: 'admin-clientes.html' },
  { clave: 'duenos', etiqueta: 'Dueños', href: 'admin-duenos.html' },
  { clave: 'reembolsos', etiqueta: 'Reembolsos', href: 'admin-reembolsos.html', insignia: (m, reembolsos) => reembolsos },
  { clave: 'tarifas', etiqueta: 'Tarifas', href: 'admin-tarifas.html' },
  { clave: 'categorias', etiqueta: 'Categorías y tags', href: 'admin-categorias.html' },
];

const consultaEscritorio = window.matchMedia(MEDIA_ESCRITORIO);

function icono(clave) {
  return crearSvg(ICONOS[clave], { 'aria-hidden': 'true' });
}

function pintarInsignia(nodo, cantidad) {
  const numero = Number(cantidad) || 0;
  nodo.hidden = numero <= 0;
  nodo.textContent = numero > 99 ? '99+' : String(numero);
  nodo.setAttribute('aria-label', `${numero} por atender`);
}

function crearEnlace(item, activo) {
  const etiqueta = h('span', { class: 'barra-admin__texto' });
  etiqueta.textContent = item.etiqueta;
  const hijos = [icono(item.clave), etiqueta];
  if (item.insignia) {
    hijos.push(h('span', { class: 'barra-admin__insignia', hidden: true, 'data-testid': `insignia-nav-admin-${item.clave}` }));
  }
  const enlace = h('a', {
    class: 'barra-admin__item',
    href: item.href,
    'data-testid': `btn-nav-admin-${item.clave}`,
    'aria-current': item.clave === activo ? 'page' : null,
  }, hijos);
  return enlace;
}

function confirmarCierreDeSesion() {
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

async function cantidadDeReembolsos() {
  try {
    const notas = await apiFetch('/administrador/reembolsos', { segundoPlano: true, handleRedGlobally: false, handle5xxGlobally: false });
    return notas.length;
  } catch {
    return 0;
  }
}

function sondearInsignias(enlaces) {
  let consultando = false;
  async function consultar() {
    if (consultando || document.visibilityState === 'hidden') {
      return;
    }
    consultando = true;
    try {
      const [metricas, reembolsos] = await Promise.all([
        apiFetch('/administrador/metricas', { segundoPlano: true, handleRedGlobally: false, handle5xxGlobally: false }),
        cantidadDeReembolsos(),
      ]);
      ITEMS_NAVEGACION_ADMIN.forEach((item) => {
        if (!item.insignia) {
          return;
        }
        const nodo = enlaces.get(item.clave).querySelector('.barra-admin__insignia');
        pintarInsignia(nodo, item.insignia(metricas, reembolsos));
      });
    } catch {
      return;
    } finally {
      consultando = false;
    }
  }
  consultar();
  const intervalo = window.setInterval(consultar, INTERVALO_INSIGNIAS_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      consultar();
    }
  });
  window.addEventListener('beforeunload', () => window.clearInterval(intervalo));
}

export function renderAdminNav(shell, activo) {
  const logo = h('a', { class: 'barra-admin__logo', href: 'admin-dashboard.html', 'data-testid': 'logo-barra-admin' }, [
    h('span', { class: 'barra-admin__marca' }),
    h('span', { class: 'barra-admin__rol' }),
  ]);
  logo.querySelector('.barra-admin__marca').textContent = 'Bajoneá';
  logo.querySelector('.barra-admin__rol').textContent = 'Admin';
  const enlaces = new Map(ITEMS_NAVEGACION_ADMIN.map((item) => [item.clave, crearEnlace(item, activo)]));
  const lista = h('div', { class: 'barra-admin__lista' }, [...enlaces.values()]);
  const salir = h('button', { class: 'barra-admin__salir', type: 'button', 'data-testid': 'btn-lateral-admin-cerrar-sesion' }, [icono('salir'), h('span')]);
  salir.querySelector('span').textContent = 'Cerrar sesión';
  salir.addEventListener('click', confirmarCierreDeSesion);
  const nav = h('nav', { class: 'barra-admin', hidden: true, 'aria-label': 'Navegación del Administrador', 'data-testid': 'barra-admin' }, [logo, lista, h('div', { class: 'barra-admin__pie' }, [salir])]);
  shell.classList.add('app-shell--lateral', 'app-shell--lateral-admin');
  shell.insertBefore(nav, shell.firstChild);
  let sondeando = false;
  function alCambiar(coincide) {
    if (coincide && !sondeando) {
      sondeando = true;
      sondearInsignias(enlaces);
    }
  }
  alCambiar(consultaEscritorio.matches);
  consultaEscritorio.addEventListener('change', (evento) => alCambiar(evento.matches));
  return nav;
}

function enlazarVolver() {
  document.querySelectorAll('[data-volver]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const destino = boton.getAttribute('data-volver');
      if (destino) {
        window.location.href = destino;
      } else {
        window.history.back();
      }
    });
  });
}

function montar() {
  enlazarVolver();
  const usuario = getUsuario();
  const shell = document.querySelector('.app-shell');
  const activo = document.body.getAttribute('data-admin-nav');
  if (shell && activo && usuario && usuario.rol === 'ADMINISTRADOR') {
    renderAdminNav(shell, activo);
  }
}

montar();
