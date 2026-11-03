import { apiFetch, ApiError, getUsuario } from './api.js';
import { renderTopBar, showToast } from './catalogo.js';
import { h, setLoading } from './form-utils.js';
import { atraparFoco, devolverFoco, elementoQueAbrio, tiempoRelativo } from './documentos-comun.js';
import { abrirHoja, plural, texto } from './admin-hojas.js';
import {
  ESTADOS_DE_SOPORTE, crearAvisoDeError, crearCabecera, crearCajaRespuesta, crearEstado, crearHilo, crearLinea, etiquetaTipo,
  fechaHoraLegible, limpiarError, mensajeDeApi, mostrarError,
} from './soporte-comun.js';

const OPCIONES_API = { handle5xxGlobally: false, handleRedGlobally: false };
const LIMITE_LISTA = 200;

const FILTROS = [
  { clave: 'ESPERAN', etiqueta: 'Esperan', testid: 'filtro-soporte-esperan' },
  { clave: 'RESPONDIDAS', etiqueta: 'Respondidas', testid: 'filtro-soporte-respondidas' },
  { clave: 'CERRADAS', etiqueta: 'Cerradas', testid: 'filtro-soporte-cerradas' },
];

const ROLES_TEXTO = { CLIENTE: 'Cliente', DUENO: 'Dueño', ADMINISTRADOR: 'Administrador' };
const ESTADOS_CUENTA = {
  PENDIENTE: 'Pendiente', ACTIVO: 'Activo', BLOQUEADO: 'Bloqueado', SUSPENDIDO: 'Suspendido', INACTIVO: 'Inactivo',
};

function idDeLaUrl() {
  const valor = new URLSearchParams(window.location.search).get('id');
  return valor && /^\d+$/.test(valor) ? Number(valor) : null;
}

function emailCortable(email) {
  const valor = String(email || '');
  const arroba = valor.indexOf('@');
  const parrafo = h('p', { class: 'soporte-fila__email' });
  if (arroba <= 0) {
    parrafo.textContent = valor;
    return parrafo;
  }
  parrafo.append(valor.slice(0, arroba), document.createElement('wbr'), valor.slice(arroba));
  return parrafo;
}

function destinoDeLaCuenta(cuenta) {
  if (cuenta.rol === 'DUENO') return `admin-duenos.html?id=${cuenta.usuarioId}`;
  if (cuenta.rol === 'CLIENTE') return `admin-clientes.html?id=${cuenta.usuarioId}`;
  return null;
}

function dibujarFila(consulta) {
  const marcas = [];
  if (consulta.cuentaSuspendida) {
    marcas.push(texto('span', 'soporte-fila__marca', 'Cuenta suspendida', { 'data-testid': 'marca-cuenta-suspendida' }));
  }
  if (consulta.emailPendienteDeReenvio) {
    marcas.push(texto('span', 'soporte-fila__marca', 'No se envió el email', { 'data-testid': 'marca-email-fallido' }));
  }
  return h('a', {
    class: 'soporte-fila',
    href: `admin-soporte.html?id=${consulta.id}`,
    'data-testid': `soporte-item-${consulta.id}`,
  }, [
    texto('span', 'soporte-fila__tipo', etiquetaTipo(consulta.tipo), { 'data-testid': 'soporte-item-tipo' }),
    emailCortable(consulta.email),
    texto('span', 'soporte-fila__fecha', tiempoRelativo(consulta.actualizadoEn), { 'data-testid': 'soporte-item-hace' }),
    ...(marcas.length > 0 ? [h('span', { class: 'soporte-fila__marcas' }, marcas)] : []),
  ]);
}

async function pintarBandeja(contenedor) {
  const estado = { filtro: 'ESPERAN', listas: { ESPERAN: [], RESPONDIDAS: [], CERRADAS: [] } };
  const aviso = crearAvisoDeError('aviso-bandeja');
  const contador = texto('p', 'cliente-contador', '', { role: 'status', 'aria-live': 'polite', 'data-testid': 'contador-bandeja' });
  const lista = h('div', { class: 'soporte-lista', id: 'soporte-lista', 'data-testid': 'bandeja-soporte' });

  const chips = FILTROS.map((filtro) => {
    const chip = texto('button', 'chip', filtro.etiqueta, { type: 'button', 'aria-pressed': String(filtro.clave === estado.filtro), 'data-testid': filtro.testid });
    chip.addEventListener('click', () => {
      estado.filtro = filtro.clave;
      dibujar();
    });
    return chip;
  });
  const filtros = h('div', { class: 'chip-row chip-row--wrap cliente-filtros', role: 'group', 'aria-label': 'Filtrar consultas', 'data-testid': 'filtros-soporte' }, chips);

  function cantidadDe(clave) {
    const cantidad = estado.listas[clave].length;
    return cantidad >= LIMITE_LISTA ? `${LIMITE_LISTA}+` : String(cantidad);
  }

  function dibujar() {
    chips.forEach((chip, indice) => {
      const filtro = FILTROS[indice];
      chip.textContent = `${filtro.etiqueta} ${cantidadDe(filtro.clave)}`;
      chip.setAttribute('aria-pressed', String(filtro.clave === estado.filtro));
    });
    const mostradas = estado.listas[estado.filtro];
    contador.textContent = `Mostrando ${mostradas.length} ${plural(mostradas.length, 'consulta', 'consultas')}`;
    if (mostradas.length === 0) {
      lista.replaceChildren(texto('p', 'cliente-vacio', {
        ESPERAN: 'No hay consultas esperando tu respuesta.',
        RESPONDIDAS: 'No hay consultas respondidas esperando a la persona.',
        CERRADAS: 'Todavía no cerraste ninguna consulta.',
      }[estado.filtro], { 'data-testid': 'bandeja-vacia' }));
      return;
    }
    lista.replaceChildren(...mostradas.map(dibujarFila));
  }

  contenedor.replaceChildren(
    texto('h1', 'title-lg', 'Soporte', { 'data-testid': 'titulo-admin-soporte' }),
    filtros, contador, aviso, lista,
  );
  lista.replaceChildren(...[0, 1, 2].map(() => h('div', { class: 'soporte-fila soporte-fila--espera', 'aria-hidden': 'true' }, [
    h('div', { class: 'skeleton', style: 'height:16px;width:60%;margin-bottom:10px;' }),
    h('div', { class: 'skeleton', style: 'height:12px;width:80%;' }),
  ])));
  try {
    const resultados = await Promise.all(FILTROS.map((filtro) => apiFetch(`/administrador/soporte?estado=${filtro.clave}&limite=${LIMITE_LISTA}`, OPCIONES_API)));
    FILTROS.forEach((filtro, indice) => {
      estado.listas[filtro.clave] = resultados[indice];
    });
    dibujar();
  } catch (error) {
    lista.replaceChildren();
    mostrarError(aviso, mensajeDeApi(error, 'No pudimos cargar las consultas.'), { enfocar: false });
    const reintentar = texto('button', 'btn btn-secondary', 'Reintentar', { type: 'button', 'data-testid': 'btn-reintentar-bandeja' });
    reintentar.addEventListener('click', () => window.location.reload());
    lista.appendChild(reintentar);
  }
}

function abrirModalCerrar(consulta, opener, alCerrarConsulta) {
  const aviso = crearAvisoDeError('aviso-cerrar-consulta');
  const confirmar = texto('button', 'btn btn-primary doc-peligro', 'Cerrar consulta', { type: 'submit', 'data-testid': 'btn-confirmar-cerrar' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-cerrar' });
  const formulario = h('form', { class: 'form', novalidate: true }, [
    texto('p', 'soporte-intro', 'La persona no va a poder escribir más en esta consulta. Si necesita algo más, tiene que enviar una consulta nueva.', { 'data-testid': 'texto-cerrar-consulta' }),
    aviso, confirmar, cancelar,
  ]);
  const { hoja, fondo, overflowPrevio } = abrirHoja({ id: 'cerrar-consulta', titulo: 'Cerrar consulta', testid: 'modal-cerrar-consulta', hijos: [formulario] });
  let ocupado = false;
  let cerrado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, () => cerrar());
  cancelar.focus();

  function cerrar(devolver = true) {
    if (ocupado || cerrado) return;
    cerrado = true;
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (devolver) devolverFoco(opener);
  }

  cancelar.addEventListener('click', () => cerrar());
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    ocupado = true;
    limpiarError(aviso);
    setLoading(confirmar, 'Cerrando…', true);
    cancelar.disabled = true;
    try {
      const actualizada = await apiFetch(`/administrador/soporte/${consulta.id}/cerrar`, { ...OPCIONES_API, method: 'PUT' });
      ocupado = false;
      cerrar(false);
      showToast('Consulta cerrada');
      alCerrarConsulta(actualizada);
    } catch (error) {
      ocupado = false;
      setLoading(confirmar, '', false, 'Cerrar consulta');
      cancelar.disabled = false;
      mostrarError(aviso, mensajeDeApi(error, 'No pudimos cerrar la consulta. Probá de nuevo.'));
    }
  });
}

function crearBloqueCuenta(cuenta) {
  const destino = destinoDeLaCuenta(cuenta);
  const nombre = `${cuenta.nombre} ${cuenta.apellido}`.trim();
  const rol = cuenta.esEmpleado ? 'Cliente y Empleado' : ROLES_TEXTO[cuenta.rol] || 'Cuenta';
  const hijos = [
    texto('p', 'soporte-cuenta__titulo', 'Cuenta asociada'),
    texto('p', 'soporte-cuenta__nombre', nombre, { 'data-testid': 'cuenta-nombre' }),
    texto('p', 'soporte-cuenta__linea', `${rol} · ${ESTADOS_CUENTA[cuenta.estado] || 'Estado no disponible'}`, { 'data-testid': 'cuenta-estado' }),
  ];
  if (destino) {
    hijos.push(texto('a', 'link', 'Ver cuenta', { href: destino, 'data-testid': 'enlace-ver-cuenta' }));
  }
  return h('section', { class: 'soporte-cuenta', 'aria-label': 'Cuenta asociada', 'data-testid': 'cuenta-asociada' }, hijos);
}

function pintarDetalle(contenedor, consulta, avisoInicial = null) {
  const lineas = [
    crearLinea(consulta.email, 'consulta-email'),
    crearLinea(`Enviada el ${fechaHoraLegible(consulta.creadoEn)}`, 'consulta-fecha'),
  ];
  const cabecera = crearCabecera({ titulo: etiquetaTipo(consulta.tipo), lineas, estado: crearEstado(consulta.estado, ESTADOS_DE_SOPORTE) });
  const hijos = [cabecera];
  if (consulta.cuentaAsociada) {
    hijos.push(crearBloqueCuenta(consulta.cuentaAsociada));
  }
  hijos.push(crearHilo(consulta.mensajes || [], { autorPropio: 'SOPORTE', rotuloPropio: 'Soporte', rotuloAjeno: 'Persona' }));

  if (consulta.emailPendienteDeReenvio) {
    const aviso = crearAvisoDeError('aviso-reenvio-email');
    const reenviar = texto('button', 'btn btn-secondary', 'Reenviar email', { type: 'button', 'data-testid': 'btn-reenviar-email' });
    reenviar.addEventListener('click', async () => {
      if (reenviar.disabled) return;
      limpiarError(aviso);
      setLoading(reenviar, 'Reenviando…', true);
      try {
        const actualizada = await apiFetch(`/administrador/soporte/${consulta.id}/reenviar-email`, { ...OPCIONES_API, method: 'POST' });
        if (actualizada.emailPendienteDeReenvio) {
          setLoading(reenviar, '', false, 'Reenviar email');
          mostrarError(aviso, 'No se pudo enviar el email. Probá de nuevo.');
          return;
        }
        showToast('Email reenviado');
        pintarDetalle(contenedor, actualizada);
        document.querySelector('[data-testid="hilo-consulta"]').scrollIntoView({ block: 'end' });
      } catch (error) {
        setLoading(reenviar, '', false, 'Reenviar email');
        mostrarError(aviso, mensajeDeApi(error, 'No pudimos reenviar el email. Probá de nuevo.'));
      }
    });
    hijos.push(h('section', { class: 'banner banner-warning soporte-email-fallido', 'data-testid': 'bloque-email-fallido' }, [
      h('div', {}, [
        texto('p', 'soporte-email-fallido__titulo', 'No se envió el email'),
        texto('p', 'soporte-intro', 'La persona no recibió tu última respuesta por email. Podés reenviarlo.'),
        reenviar,
        aviso,
      ]),
    ]));
  }

  if (consulta.estado === 'CERRADO') {
    hijos.push(h('div', { class: 'soporte-cerrada', 'data-testid': 'consulta-cerrada' }, [
      texto('p', 'soporte-cerrada__texto', 'Consulta cerrada.', { 'data-testid': 'texto-consulta-cerrada' }),
    ]));
  } else {
    const restantes = Math.max(consulta.maxMensajes - consulta.cantidadMensajes, 0);
    let ultima = consulta;
    const caja = crearCajaRespuesta({
      textoDeshabilitada: consulta.puedeResponder ? null : 'Esperando la respuesta de la persona.',
      restantes,
      textoBoton: 'Responder',
      prefijo: 'respuesta-admin',
      enviar: async (textoRespuesta) => {
        ultima = await apiFetch(`/administrador/soporte/${consulta.id}/mensajes`, { ...OPCIONES_API, method: 'POST', body: { texto: textoRespuesta } });
      },
      alEnviado: async () => {
        showToast('Respuesta enviada');
        pintarDetalle(contenedor, ultima);
        document.querySelector('[data-testid="hilo-consulta"]').scrollIntoView({ block: 'end' });
      },
      alFallar: async (error) => {
        if (error instanceof ApiError && error.status === 409) {
          try {
            pintarDetalle(contenedor, await apiFetch(`/administrador/soporte/${consulta.id}`, OPCIONES_API), mensajeDeApi(error));
          } catch {
            return;
          }
        }
      },
    });
    hijos.push(caja.elemento);
    const cerrar = texto('button', 'btn btn-secondary doc-peligro-borde', 'Cerrar consulta', { type: 'button', 'data-testid': 'btn-cerrar-consulta' });
    cerrar.addEventListener('click', () => abrirModalCerrar(consulta, elementoQueAbrio() || cerrar, (actualizada) => {
      pintarDetalle(contenedor, actualizada);
    }));
    hijos.push(cerrar);
  }
  contenedor.replaceChildren(...hijos);
  if (avisoInicial) {
    const slot = contenedor.querySelector('[data-testid="aviso-respuesta-admin"]');
    if (slot) mostrarError(slot, avisoInicial, { enfocar: false });
  }
}

async function iniciarDetalle(contenedor, id) {
  contenedor.replaceChildren(
    h('div', { class: 'skeleton', style: 'height:96px;margin-bottom:16px;', 'aria-hidden': 'true' }),
    h('div', { class: 'skeleton', style: 'height:64px;width:70%;margin-bottom:12px;', 'aria-hidden': 'true' }),
  );
  try {
    pintarDetalle(contenedor, await apiFetch(`/administrador/soporte/${id}`, OPCIONES_API));
  } catch (error) {
    const aviso = crearAvisoDeError('aviso-detalle-soporte');
    const volver = texto('a', 'btn btn-primary', 'Volver a Soporte', { href: 'admin-soporte.html', 'data-testid': 'btn-volver-bandeja' });
    contenedor.replaceChildren(aviso, volver);
    mostrarError(aviso, error instanceof ApiError && error.status === 404
      ? 'No encontramos esa consulta.'
      : mensajeDeApi(error, 'No pudimos cargar la consulta.'), { enfocar: false });
  }
}

export function initAdminSoporte() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'ADMINISTRADOR') {
    window.location.href = 'login.html';
    return;
  }
  const id = idDeLaUrl();
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: id === null ? 'Soporte' : 'Consulta' });
  const contenedor = document.getElementById('admin-soporte-contenido');
  if (id !== null) {
    iniciarDetalle(contenedor, id);
    return;
  }
  pintarBandeja(contenedor);
}
