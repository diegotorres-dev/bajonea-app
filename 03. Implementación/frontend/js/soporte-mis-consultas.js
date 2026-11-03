import { apiFetch, getToken } from './api.js';
import { renderTopBar } from './catalogo.js';
import { h } from './form-utils.js';
import { texto } from './admin-hojas.js';
import {
  ESTADOS_DE_LA_PERSONA, crearAvisoDeError, crearEstado, etiquetaTipo, fechaLegible, mensajeDeApi, mostrarError,
} from './soporte-comun.js';

const OPCIONES_API = { handle5xxGlobally: false, handleRedGlobally: false };
const ORDEN_ESTADOS = { ESPERA_PERSONA: 0, ESPERA_SOPORTE: 1, CERRADO: 2 };

export async function enlazarMisConsultas(boton) {
  if (!boton) return;
  boton.addEventListener('click', () => {
    window.location.href = 'mis-consultas.html';
  });
  boton.disabled = false;
  const contador = boton.querySelector('[data-testid="contador-mis-consultas"]');
  try {
    const datos = await apiFetch('/soporte/mis-consultas/contador', OPCIONES_API);
    const cantidad = Number(datos.esperandoTuRespuesta) || 0;
    if (cantidad > 0 && contador) {
      contador.textContent = String(cantidad);
      contador.classList.remove('is-hidden');
      boton.setAttribute('aria-label', `Mis consultas a Soporte, ${cantidad} ${cantidad === 1 ? 'espera' : 'esperan'} tu respuesta`);
    }
  } catch {
    return;
  }
}

function ordenar(consultas) {
  return [...consultas].sort((a, b) => {
    const porEstado = (ORDEN_ESTADOS[a.estado] ?? 3) - (ORDEN_ESTADOS[b.estado] ?? 3);
    if (porEstado !== 0) return porEstado;
    return String(b.actualizadoEn).localeCompare(String(a.actualizadoEn));
  });
}

function dibujarFila(consulta) {
  return h('a', {
    class: 'soporte-fila',
    href: `soporte-consulta.html?id=${consulta.id}`,
    'data-testid': `consulta-item-${consulta.id}`,
    'data-estado': consulta.estado,
  }, [
    texto('span', 'soporte-fila__tipo', etiquetaTipo(consulta.tipo), { 'data-testid': 'consulta-item-tipo' }),
    texto('span', 'soporte-fila__fecha', `Enviada el ${fechaLegible(consulta.creadoEn)}`, { 'data-testid': 'consulta-item-fecha' }),
    crearEstado(consulta.estado, ESTADOS_DE_LA_PERSONA, 'consulta-item-estado'),
  ]);
}

function esperar(lista) {
  lista.replaceChildren(...[0, 1, 2].map(() => h('div', { class: 'soporte-fila soporte-fila--espera', 'aria-hidden': 'true' }, [
    h('div', { class: 'skeleton', style: 'height:16px;width:70%;margin-bottom:10px;' }),
    h('div', { class: 'skeleton', style: 'height:12px;width:40%;' }),
  ])));
}

export async function initMisConsultas() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Soporte' });
  const contenedor = document.getElementById('mis-consultas-contenido');
  const aviso = crearAvisoDeError('aviso-mis-consultas');
  const lista = h('div', { class: 'soporte-lista', 'data-testid': 'lista-consultas' });
  const nueva = texto('a', 'btn btn-primary', 'Nueva consulta', { href: 'soporte.html', 'data-testid': 'btn-nueva-consulta' });
  contenedor.replaceChildren(
    texto('h1', 'title-lg', 'Mis consultas a Soporte', { 'data-testid': 'titulo-mis-consultas' }),
    aviso,
    lista,
    nueva,
  );
  esperar(lista);
  try {
    const consultas = await apiFetch('/soporte/mis-consultas', OPCIONES_API);
    if (consultas.length === 0) {
      lista.replaceChildren(h('div', { class: 'soporte-vacio', 'data-testid': 'consultas-vacio' }, [
        texto('p', 'soporte-vacio__titulo', 'Todavía no hiciste ninguna consulta'),
        texto('p', 'soporte-intro', 'Cuando le escribas a Soporte, vas a ver acá la conversación y las respuestas.'),
      ]));
      return;
    }
    lista.replaceChildren(...ordenar(consultas).map(dibujarFila));
  } catch (error) {
    lista.replaceChildren();
    mostrarError(aviso, mensajeDeApi(error, 'No pudimos cargar tus consultas.'), { enfocar: false });
    const reintentar = texto('button', 'btn btn-secondary', 'Reintentar', { type: 'button', 'data-testid': 'btn-reintentar-consultas' });
    reintentar.addEventListener('click', () => window.location.reload());
    lista.appendChild(reintentar);
  }
}
