import { apiFetch, ApiError } from './api.js';
import { showToast } from './catalogo.js';
import { h, mostrarAvisoFijo, limpiarAvisoFijo } from './form-utils.js';
import { atraparFoco, devolverFoco, mensajeDeError } from './documentos-comun.js';
import { normalizarCampos } from './validators.js';
import { abrirHoja, cajaInformativa, plural, texto } from './admin-hojas.js';

const LINEAS_QUE_VA_A_PASAR = [
  'Podrá ingresar y comprar de nuevo.',
  'Se anota en su historial que la reactivaste vos.',
];

function esperaDeLista() {
  return h('div', { class: 'dueno-comercio dueno-comercio--espera', 'aria-hidden': 'true', 'data-testid': 'reactivar-previa-cargando' }, [
    h('div', { class: 'skeleton', style: 'height:16px;width:50%;margin-bottom:10px;' }),
    h('div', { class: 'skeleton', style: 'height:12px;width:80%;' }),
  ]);
}

function bloquesDeComercios(comercios) {
  comercios.forEach((comercio) => normalizarCampos(comercio, ['nombre']));
  const vuelven = comercios.filter((comercio) => comercio.resultado === 'VUELVE');
  const siguen = comercios.filter((comercio) => comercio.resultado !== 'VUELVE');
  const bloques = [];
  if (vuelven.length > 0) {
    const titulo = siguen.length > 0
      ? `Se restablecen ${vuelven.length} de ${comercios.length} comercios`
      : `Se restablece${vuelven.length === 1 ? '' : 'n'} ${vuelven.length} ${plural(vuelven.length, 'comercio', 'comercios')}`;
    bloques.push(h('div', { class: 'dueno-restauracion dueno-restauracion--vuelve', 'data-testid': 'reactivar-vuelven' }, [
      texto('p', 'dueno-restauracion__titulo', titulo),
      ...vuelven.map((comercio) => h('div', { class: 'dueno-restauracion__fila', 'data-testid': `reactivar-vuelve-${comercio.comercioId}` }, [
        texto('span', 'dueno-restauracion__nombre', comercio.nombre),
        texto('span', 'dueno-restauracion__estado', 'Vuelve'),
      ])),
    ]));
  }
  siguen.forEach((comercio) => bloques.push(h('div', { class: 'dueno-restauracion dueno-restauracion--sigue', 'data-testid': `reactivar-sigue-${comercio.comercioId}` }, [
    h('div', { class: 'dueno-restauracion__fila' }, [
      texto('span', 'dueno-restauracion__nombre', comercio.nombre),
      texto('span', 'dueno-restauracion__estado', 'Sigue suspendido'),
    ]),
    texto('p', 'dueno-restauracion__explicacion', 'Se suspendió aparte. Hay que levantarlo desde su ficha.'),
  ])));
  return bloques;
}

export function abrirHojaReactivarCuenta({ usuarioId, nombre, opener, alExito, alConflicto, devolverFocoA = null }) {
  const { caja } = cajaInformativa('Qué va a pasar', LINEAS_QUE_VA_A_PASAR, 'reactivar-que-va-a-pasar');
  const lista = h('div', { class: 'dueno-hoja__lista', 'data-testid': 'reactivar-comercios' }, [esperaDeLista()]);
  const aviso = h('div', { 'data-testid': 'aviso-reactivar-cuenta' });
  const cuerpo = h('div', { class: 'dueno-hoja__cuerpo' }, [caja, lista, aviso]);
  const confirmar = texto('button', 'btn btn-primary doc-exito', 'Reactivar cuenta', { type: 'submit', 'data-testid': 'btn-confirmar-reactivar' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-reactivar' });
  const pie = h('div', { class: 'dueno-hoja__pie' }, [confirmar, cancelar]);
  const formulario = h('form', { class: 'dueno-hoja__form', novalidate: true }, [cuerpo, pie]);
  const { hoja, fondo, overflowPrevio } = abrirHoja({
    clase: 'product-modal-sheet dueno-hoja',
    id: 'reactivar-cuenta',
    titulo: `Reactivar a ${nombre}`,
    testid: 'modal-reactivar-cuenta',
    hijos: [formulario],
  });

  let ocupado = false;
  let cerrado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, () => cerrar());
  confirmar.focus();

  function cerrar(devolver = true) {
    if (ocupado || cerrado) return;
    cerrado = true;
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (devolver) devolverFoco(opener, devolverFocoA);
  }

  function mostrarError(mensaje) {
    mostrarAvisoFijo(aviso, mensaje);
    const alerta = aviso.querySelector('[data-testid="aviso-fijo"]');
    if (alerta) {
      alerta.setAttribute('tabindex', '-1');
      alerta.focus();
    }
  }

  apiFetch(`/administrador/cuentas/${usuarioId}/reactivar/previa`, { handle5xxGlobally: false, handleRedGlobally: false })
    .then((previa) => {
      if (cerrado) return;
      lista.replaceChildren(...bloquesDeComercios(previa.comercios || []));
    })
    .catch((error) => {
      if (cerrado) return;
      lista.replaceChildren();
      mostrarError(`${mensajeDeError(error, 'No pudimos calcular el detalle.')} Igual podés reactivar la cuenta.`);
    });

  cancelar.addEventListener('click', () => cerrar());
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) cerrar();
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    ocupado = true;
    confirmar.disabled = true;
    cancelar.disabled = true;
    confirmar.textContent = 'Reactivando…';
    limpiarAvisoFijo(aviso);
    try {
      await apiFetch(`/administrador/cuentas/${usuarioId}/reactivar`, { method: 'PUT', handle5xxGlobally: false, handleRedGlobally: false });
      ocupado = false;
      cerrar(false);
      showToast('Cuenta reactivada');
      await alExito();
    } catch (error) {
      ocupado = false;
      cancelar.disabled = false;
      confirmar.disabled = false;
      confirmar.textContent = 'Reactivar cuenta';
      mostrarError(mensajeDeError(error, 'No pudimos reactivar la cuenta. Probá de nuevo.'));
      if (error instanceof ApiError && error.status === 409) alConflicto();
    }
  });
}
