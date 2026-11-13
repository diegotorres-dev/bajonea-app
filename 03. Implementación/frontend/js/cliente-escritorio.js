import { apiFetch, getNombre, getUsuario } from './api.js';
import { alCambiarEscritorio, montarSaltarAlContenido } from './escritorio.js';
import { pintarImagen } from './imagenes.js';
import { abrirHoja } from './hoja.js';
import { h, crearSvg } from './form-utils.js';
import { consultarComerciosDelEmpleado } from './contexto.js';
import { abrirHojaCambiarCuenta } from './selector-contexto.js';
import { vigilarAvisos } from './sonido-avisos.js';
import { logout } from './auth.js';
import { actualizarContadorCarrito } from './catalogo.js';

export const CLAVE_TIENE_COMERCIOS = 'bajonea_tiene_comercios_empleado';
const INTERVALO_AVISOS_MS = 15000;

const ICONOS = {
  lupa: [['circle', { cx: 11, cy: 11, r: 8 }], ['line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }]],
  carrito: [['circle', { cx: 9, cy: 21, r: 1 }], ['circle', { cx: 20, cy: 21, r: 1 }], ['path', { d: 'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6' }]],
  campana: [['path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }], ['path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }]],
  perfil: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  direcciones: [['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }], ['circle', { cx: 12, cy: 10, r: 3 }]],
  consultas: [['path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z' }]],
  cuentas: [['polyline', { points: '17 1 21 5 17 9' }], ['path', { d: 'M3 11V9a4 4 0 0 1 4-4h14' }], ['polyline', { points: '7 23 3 19 7 15' }], ['path', { d: 'M21 13v2a4 4 0 0 1-4 4H3' }]],
  salir: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['polyline', { points: '16 17 21 12 16 7' }], ['line', { x1: 21, y1: 12, x2: 9, y2: 12 }]],
};

const contadoresAvisos = { valor: 0, oyentes: new Set(), iniciado: false };

function pintarContadorAvisos() {
  contadoresAvisos.oyentes.forEach((oyente) => oyente(contadoresAvisos.valor));
}

async function consultarAvisos(opciones) {
  const contador = await apiFetch('/notificaciones/no-leidas/contador', opciones);
  contadoresAvisos.valor = contador;
  pintarContadorAvisos();
  vigilarAvisos('cliente', contador);
}

export function refrescarAvisosCliente() {
  if (contadoresAvisos.iniciado) {
    consultarAvisos({ segundoPlano: true }).catch(() => {});
  }
}

export function suscribirAvisosCliente(oyente) {
  contadoresAvisos.oyentes.add(oyente);
  oyente(contadoresAvisos.valor);
  if (contadoresAvisos.iniciado) {
    return;
  }
  contadoresAvisos.iniciado = true;
  consultarAvisos().catch(() => {});
  const intervalo = window.setInterval(() => {
    if (!document.hidden) {
      consultarAvisos({ segundoPlano: true }).catch(() => {});
    }
  }, INTERVALO_AVISOS_MS);
  window.addEventListener('pagehide', () => window.clearInterval(intervalo));
}

function inicialDe(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase();
}

function crearAvatar(usuario) {
  const avatar = h('span', { class: 'barra-cliente__avatar', 'aria-hidden': 'true', 'data-testid': 'barra-avatar-imagen' });
  if (usuario.fotoPerfilUrl) {
    const img = document.createElement('img');
    pintarImagen(img, usuario.fotoPerfilUrl, { uso: 'avatar' });
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = inicialDe(getNombre());
  }
  return avatar;
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

function tieneComerciosEnCache(usuarioId) {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_TIENE_COMERCIOS) || 'null');
    return guardado && guardado.usuarioId === usuarioId ? guardado.tiene : null;
  } catch {
    return null;
  }
}

function recordarComercios(usuarioId, tiene) {
  try {
    sessionStorage.setItem(CLAVE_TIENE_COMERCIOS, JSON.stringify({ usuarioId, tiene }));
  } catch {
    return;
  }
}

function crearItem(testid, icono, texto, accion) {
  const contenido = [crearSvg(ICONOS[icono], { 'aria-hidden': 'true' }), h('span', {}, [texto])];
  if (typeof accion === 'string') {
    return h('a', { class: 'barra-cliente__item', role: 'menuitem', tabindex: '-1', href: accion, 'data-testid': testid }, contenido);
  }
  const item = h('button', { type: 'button', class: 'barra-cliente__item', role: 'menuitem', tabindex: '-1', 'data-testid': testid }, contenido);
  item.addEventListener('click', accion);
  return item;
}

function montarMenuDelAvatar(usuario) {
  const boton = h('button', { type: 'button', class: 'barra-cliente__avatar-boton', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'barra-cliente-menu', 'aria-label': 'Mi cuenta', 'data-testid': 'barra-avatar' }, [crearAvatar(usuario)]);
  const menu = h('div', { class: 'barra-cliente__menu', id: 'barra-cliente-menu', role: 'menu', 'aria-label': 'Mi cuenta', hidden: true, 'data-testid': 'barra-menu' });
  const cabecera = h('div', { class: 'barra-cliente__menu-cabecera' }, [h('span', { class: 'barra-cliente__menu-nombre' }, [getNombre() || 'Mi cuenta'])]);
  menu.appendChild(cabecera);
  menu.appendChild(crearItem('barra-menu-perfil', 'perfil', 'Mi perfil', 'perfil.html'));
  menu.appendChild(crearItem('barra-menu-direcciones', 'direcciones', 'Mis direcciones', 'perfil.html?seccion=direcciones'));
  menu.appendChild(crearItem('barra-menu-consultas', 'consultas', 'Mis consultas', 'mis-consultas.html'));
  const cambiar = crearItem('barra-menu-cambiar-cuenta', 'cuentas', 'Cambiar de cuenta', () => {
    cerrar(false);
    abrirHojaCambiarCuenta();
  });
  cambiar.hidden = true;
  menu.appendChild(cambiar);
  const salir = crearItem('barra-menu-cerrar-sesion', 'salir', 'Cerrar sesión', () => {
    cerrar(false);
    confirmarCierreDeSesion();
  });
  salir.classList.add('barra-cliente__item--peligro');
  menu.appendChild(salir);

  const envoltorio = h('div', { class: 'barra-cliente__cuenta' }, [boton, menu]);

  function items() {
    return [...menu.querySelectorAll('[role="menuitem"]')].filter((item) => !item.hidden);
  }

  function abrir() {
    menu.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    const primero = items()[0];
    if (primero) {
      primero.focus();
    }
  }

  function cerrar(devolverFoco = true) {
    if (menu.hidden) {
      return;
    }
    menu.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    if (devolverFoco) {
      boton.focus();
    }
  }

  boton.addEventListener('click', () => {
    if (menu.hidden) {
      abrir();
    } else {
      cerrar();
    }
  });
  boton.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowDown' && menu.hidden) {
      evento.preventDefault();
      abrir();
    }
  });
  menu.addEventListener('keydown', (evento) => {
    const lista = items();
    const actual = lista.indexOf(document.activeElement);
    if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrar();
    } else if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      lista[(actual + 1) % lista.length].focus();
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      lista[(actual - 1 + lista.length) % lista.length].focus();
    } else if (evento.key === 'Home') {
      evento.preventDefault();
      lista[0].focus();
    } else if (evento.key === 'End') {
      evento.preventDefault();
      lista[lista.length - 1].focus();
    } else if (evento.key === 'Tab') {
      cerrar(false);
    }
  });
  document.addEventListener('click', (evento) => {
    if (!menu.hidden && !envoltorio.contains(evento.target)) {
      cerrar(false);
    }
  });

  const enCache = tieneComerciosEnCache(usuario.id);
  if (enCache === true) {
    cambiar.hidden = false;
  } else if (enCache === null) {
    consultarComerciosDelEmpleado()
      .then((comercios) => {
        recordarComercios(usuario.id, comercios.length > 0);
        cambiar.hidden = comercios.length === 0;
      })
      .catch(() => {});
  }
  return envoltorio;
}

function crearIcono({ testid, href, icono, etiqueta, activo, insignia }) {
  const enlace = h('a', { class: 'barra-cliente__icono', href, 'aria-label': etiqueta, 'data-testid': testid }, [crearSvg(ICONOS[icono], { 'aria-hidden': 'true' })]);
  if (activo) {
    enlace.setAttribute('aria-current', 'page');
  }
  if (insignia) {
    enlace.appendChild(insignia);
  }
  return enlace;
}

export function montarBarraCliente({ activo = null } = {}) {
  const shell = document.querySelector('.app-shell');
  if (!shell || shell.querySelector('.barra-cliente')) {
    return null;
  }
  shell.classList.add('app-shell--cliente');
  montarSaltarAlContenido();
  const usuario = getUsuario();
  const sesionCliente = Boolean(usuario) && usuario.rol === 'CLIENTE';

  const enlaces = [
    { clave: 'inicio', texto: 'Inicio', href: 'index.html' },
    { clave: 'explorar', texto: 'Explorar', href: 'explorar.html' },
  ];
  if (sesionCliente) {
    enlaces.push({ clave: 'pedidos', texto: 'Mis pedidos', href: 'pedidos.html' });
  }
  const nav = h('nav', { class: 'barra-cliente__nav', 'aria-label': 'Principal' }, enlaces.map((enlace) => {
    const a = h('a', { class: 'barra-cliente__enlace', href: enlace.href, 'data-testid': `barra-enlace-${enlace.clave}` }, [enlace.texto]);
    if (enlace.clave === activo) {
      a.setAttribute('aria-current', 'page');
    }
    return a;
  }));

  const buscador = h('form', { class: 'barra-cliente__buscador', role: 'search', 'data-testid': 'barra-buscador' }, [
    crearSvg(ICONOS.lupa, { 'aria-hidden': 'true' }),
    h('input', { type: 'search', name: 'q', placeholder: 'Buscar productos', 'aria-label': 'Buscar productos', autocomplete: 'off', maxlength: '80', 'data-testid': 'barra-buscador-input' }),
  ]);
  const parametros = new URLSearchParams(window.location.search);
  if (activo === 'explorar' && parametros.get('q')) {
    buscador.querySelector('input').value = parametros.get('q');
  }
  buscador.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const texto = buscador.querySelector('input').value.trim();
    window.location.href = texto ? `explorar.html?q=${encodeURIComponent(texto)}` : 'explorar.html';
  });

  const derecha = h('div', { class: 'barra-cliente__derecha' });
  if (sesionCliente) {
    const insigniaCarrito = h('span', { class: 'barra-cliente__insignia', id: 'barra-carrito-badge', hidden: true, 'data-testid': 'barra-contador-carrito' }, ['0']);
    derecha.appendChild(crearIcono({ testid: 'barra-carrito', href: 'carrito.html', icono: 'carrito', etiqueta: 'Carrito', activo: activo === 'carrito', insignia: insigniaCarrito }));
    const puntoAvisos = h('span', { class: 'barra-cliente__punto', hidden: true, 'data-testid': 'barra-punto-avisos' });
    derecha.appendChild(crearIcono({ testid: 'barra-avisos', href: 'notificaciones.html', icono: 'campana', etiqueta: 'Avisos', activo: activo === 'avisos', insignia: puntoAvisos }));
    derecha.appendChild(montarMenuDelAvatar(usuario));
    suscribirAvisosCliente((contador) => {
      puntoAvisos.hidden = contador <= 0;
      puntoAvisos.textContent = '';
      derecha.querySelector('[data-testid="barra-avisos"]').setAttribute('aria-label', contador > 0 ? `Avisos, ${contador} sin leer` : 'Avisos');
    });
    actualizarContadorCarrito();
  } else {
    derecha.appendChild(h('a', { class: 'btn btn-primary barra-cliente__ingresar', href: 'login.html', 'data-testid': 'barra-ingresar' }, ['Ingresar']));
  }

  const logo = h('a', { class: 'barra-cliente__logo', href: 'index.html', 'aria-label': 'Bajoneá, inicio', 'data-testid': 'barra-logo' }, [h('img', { src: 'assets/img/bajonea-logo-orange-header.png', alt: 'Bajoneá' })]);
  const barra = h('header', { class: 'barra-cliente', 'data-testid': 'barra-cliente' }, [
    h('div', { class: 'barra-cliente__interior' }, [logo, nav, buscador, derecha]),
  ]);
  shell.insertBefore(barra, shell.firstChild);
  return barra;
}

export function montarBarraClienteEnEscritorio(opciones) {
  let montada = false;
  alCambiarEscritorio((escritorio) => {
    if (escritorio && !montada) {
      montada = true;
      montarBarraCliente(opciones);
    }
  });
}
