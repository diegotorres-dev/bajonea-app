import { esContextoComercio, getUsuario } from './api.js';
import { montarBarraClienteEnEscritorio } from './cliente-escritorio.js';
import { montarBarraLateralCompartida } from './comercio-escritorio.js';
import { renderTopBar } from './catalogo.js';
import { crearSvg, h } from './form-utils.js';
import { enlazarMisConsultas } from './soporte-mis-consultas.js';

const ICONO_FAQ = [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }], ['line', { x1: '12', y1: '17', x2: '12.01', y2: '17' }]];
const ICONO_ESCRIBIR = [['path', { d: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' }], ['polyline', { points: '22,6 12,13 2,6' }]];
const ICONO_CONSULTAS = [['path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z' }]];
const ICONO_DOCUMENTO = [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['polyline', { points: '14 2 14 8 20 8' }], ['line', { x1: '16', y1: '13', x2: '8', y2: '13' }], ['line', { x1: '16', y1: '17', x2: '8', y2: '17' }]];
const ICONO_ESCUDO = [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]];
const FLECHA = [['polyline', { points: '9 18 15 12 9 6' }]];

function icono(trazos) {
  return crearSvg(trazos, { 'aria-hidden': 'true' });
}

function contenidoDeFila(trazos, titulo, contador) {
  const hijos = [icono(trazos), h('span', {}, [titulo])];
  if (contador) {
    hijos.push(h('span', { class: 'profile-link__contador is-hidden', 'data-testid': 'contador-mis-consultas' }));
  }
  hijos.push(icono(FLECHA));
  return hijos;
}

function filaEnlace(trazos, titulo, href, testid) {
  return h('a', { class: 'profile-link', href, 'data-testid': testid }, contenidoDeFila(trazos, titulo, false));
}

export function initAyuda() {
  const usuario = getUsuario();
  if (!usuario) {
    window.location.href = 'login.html';
    return;
  }
  if (usuario.rol === 'ADMINISTRADOR') {
    window.location.href = 'admin-dashboard.html';
    return;
  }
  const destinoPerfil = esContextoComercio() ? 'comercio-perfil.html' : 'perfil.html';
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Ayuda', destinoVolver: destinoPerfil });
  if (esContextoComercio()) {
    montarBarraLateralCompartida('perfil');
  } else if (usuario.rol === 'CLIENTE') {
    montarBarraClienteEnEscritorio({ activo: null });
  }

  const consultas = h('button', { class: 'profile-link', type: 'button', 'data-testid': 'btn-ayuda-mis-consultas' }, contenidoDeFila(ICONO_CONSULTAS, 'Mis consultas a Soporte', true));
  const lista = h('div', { class: 'profile-link-list', 'data-testid': 'lista-ayuda' }, [
    filaEnlace(ICONO_FAQ, 'Preguntas frecuentes', 'faq.html', 'btn-ayuda-faq'),
    filaEnlace(ICONO_ESCRIBIR, 'Escribir a Soporte', 'soporte.html', 'btn-ayuda-escribir-soporte'),
    consultas,
    filaEnlace(ICONO_DOCUMENTO, 'Términos y condiciones', 'terminos.html', 'btn-ayuda-terminos'),
    filaEnlace(ICONO_ESCUDO, 'Política de privacidad', 'privacidad.html', 'btn-ayuda-privacidad'),
  ]);
  document.getElementById('ayuda-contenido').replaceChildren(lista);
  enlazarMisConsultas(consultas);
}
