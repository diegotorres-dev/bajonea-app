import { apiFetch, ApiError } from './api.js';
import { showToast } from './catalogo.js';
import { h, mostrarAvisoFijo, limpiarAvisoFijo } from './form-utils.js';
import { atraparFoco, devolverFoco, mensajeDeError } from './documentos-comun.js';
import { abrirHoja, cajaInformativa, campoTexto, fechaLegible, texto } from './admin-hojas.js';

const MIN_MOTIVO = 10;
const ESTADOS_SUSPENDIBLES = ['APROBADO', 'APTO_VENTA', 'CERRADO_TEMPORALMENTE'];
const EXPLICACION_ORIGEN_DUENO = 'No se puede levantar solo este comercio. Para reactivarlo hay que levantar la suspensión del Dueño.';
const EXPLICACION_DUENO_SUSPENDIDO = 'El Dueño tiene la cuenta suspendida. Primero levantá la suspensión del Dueño; después podés levantar este comercio.';
const AYUDA_SUSPENDER_APARTE = 'Va a seguir suspendido aunque levanten la suspensión del Dueño. Después lo vas a poder levantar desde acá.';
const AVISO_SUSPENDER_APARTE = 'Va a seguir suspendido aunque levanten la suspensión del Dueño.';

export function lineasDeLaVistaPrevia(previa) {
  const lineas = ['Deja de aparecer en el catálogo.'];
  const pendientes = previa.pedidosPendientesDeConfirmacion;
  const preparacion = previa.pedidosEnPreparacion;
  const listos = previa.pedidosListosParaRetirar;
  const camino = previa.pedidosEnCamino;
  const sinPagar = previa.pedidosSinPagar;
  if (pendientes > 0) {
    lineas.push(pendientes === 1 ? '1 pedido pendiente: se rechaza ahora y se reembolsa. No se puede deshacer.' : `${pendientes} pedidos pendientes: se rechazan ahora y se reembolsan. No se puede deshacer.`);
  }
  if (preparacion > 0) {
    lineas.push(preparacion === 1
      ? `1 pedido en preparación: tiene ${previa.topePreparacionMinutos} minutos para despacharlo o se cancela con reembolso.`
      : `${preparacion} pedidos en preparación: tiene ${previa.topePreparacionMinutos} minutos para despacharlos o se cancelan con reembolso.`);
  }
  if (listos > 0) {
    lineas.push(listos === 1
      ? `1 pedido listo para retirar: tiene ${previa.topeRetiroMinutos} minutos para entregarlo o se cierra como no retirado.`
      : `${listos} pedidos listos para retirar: tiene ${previa.topeRetiroMinutos} minutos para entregarlos o se cierran como no retirados.`);
  }
  if (camino > 0) {
    lineas.push(camino === 1 ? '1 pedido en camino sigue igual.' : `${camino} pedidos en camino siguen igual.`);
  }
  if (sinPagar > 0) {
    lineas.push(sinPagar === 1 ? '1 pedido sin pagar no se puede pagar.' : `${sinPagar} pedidos sin pagar no se pueden pagar.`);
  }
  if (pendientes + preparacion + listos + camino + sinPagar === 0) {
    lineas.push('No tiene pedidos en curso.');
  }
  return lineas;
}

function abrirModalSuspender(comercio, opener, { alExito, alConflicto }, { aparte = false } = {}) {
  const { caja, items } = cajaInformativa('Qué va a pasar', [], 'suspender-comercio-que-va-a-pasar');
  if (aparte) {
    items.appendChild(texto('li', '', AVISO_SUSPENDER_APARTE));
  } else {
    items.appendChild(texto('li', 'cliente-modal__espera', 'Cargando…', { 'data-testid': 'suspender-comercio-previa-cargando' }));
  }
  const { campo, area } = campoTexto({
    id: 'suspender-comercio-motivo',
    etiqueta: 'Motivo (lo va a ver el Dueño)',
    placeholder: 'Contale al Dueño por qué se suspende el comercio',
    minimo: MIN_MOTIVO,
  });
  const aviso = h('div', { 'data-testid': 'aviso-suspender-comercio' });
  const confirmar = texto('button', 'btn btn-primary doc-peligro', 'Suspender comercio', { type: 'submit', disabled: true, 'data-testid': 'btn-confirmar-suspender-comercio' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-suspender-comercio' });
  const formulario = h('form', { class: 'form', novalidate: true }, [campo, aviso, confirmar, cancelar]);
  const { hoja, fondo, overflowPrevio } = abrirHoja({
    id: 'suspender-comercio',
    titulo: aparte ? 'Suspender solo este comercio' : `Suspender ${comercio.nombre}`,
    testid: 'modal-suspender-comercio',
    hijos: [caja, formulario],
  });
  let ocupado = false;
  let cerrado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, () => cerrar());
  area.focus();

  function cerrar(devolver = true) {
    if (ocupado || cerrado) return;
    cerrado = true;
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (devolver) devolverFoco(opener);
  }

  if (!aparte) {
    apiFetch(`/administrador/comercios/${comercio.id}/suspension/previa`, { handle5xxGlobally: false, handleRedGlobally: false })
      .then((previa) => {
        if (cerrado) return;
        items.replaceChildren(...lineasDeLaVistaPrevia(previa).map((linea) => texto('li', '', linea)));
      })
      .catch((error) => {
        if (cerrado) return;
        items.replaceChildren(texto('li', '', 'Deja de aparecer en el catálogo.'));
        mostrarAvisoFijo(aviso, `${mensajeDeError(error, 'No pudimos calcular el detalle.')} Igual podés suspender el comercio.`);
      });
  }

  area.addEventListener('input', () => {
    confirmar.disabled = ocupado || area.value.trim().length < MIN_MOTIVO;
  });
  cancelar.addEventListener('click', () => cerrar());
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) cerrar();
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const motivo = area.value.trim();
    if (ocupado || motivo.length < MIN_MOTIVO) return;
    ocupado = true;
    confirmar.disabled = true;
    cancelar.disabled = true;
    confirmar.textContent = 'Suspendiendo…';
    limpiarAvisoFijo(aviso);
    try {
      await apiFetch(`/administrador/comercios/${comercio.id}/suspender`, { method: 'PUT', body: { motivo }, handle5xxGlobally: false, handleRedGlobally: false });
      ocupado = false;
      cerrar(false);
      showToast('Comercio suspendido');
      await alExito();
    } catch (error) {
      ocupado = false;
      cancelar.disabled = false;
      confirmar.textContent = 'Suspender comercio';
      confirmar.disabled = area.value.trim().length < MIN_MOTIVO;
      const conflicto = error instanceof ApiError && error.status === 409;
      mostrarAvisoFijo(aviso, conflicto
        ? `${error.message}. Cerrá esta ventana: la lista se actualiza.`
        : mensajeDeError(error, 'No pudimos suspender el comercio. Probá de nuevo.'));
      if (conflicto) alConflicto();
      confirmar.focus();
    }
  });
}

function abrirModalLevantar(comercio, opener, { alExito, alConflicto }) {
  const desde = comercio.suspendidoDesde ? `Suspendido desde ${fechaLegible(comercio.suspendidoDesde)}` : 'Comercio suspendido';
  const motivoCaja = h('div', { class: 'cliente-modal__caja', 'data-testid': 'levantar-comercio-suspension-actual' }, [
    texto('p', 'cliente-modal__caja-titulo', desde),
    texto('p', 'cliente-modal__caja-motivo', comercio.motivoSuspension || '', { 'data-testid': 'levantar-comercio-motivo-actual' }),
  ]);
  const { caja } = cajaInformativa('Qué va a pasar', [
    'Vuelve a vender si tiene cuenta de cobro activa y documentación aprobada. Si no, queda aprobado sin poder vender.',
  ], 'levantar-comercio-que-va-a-pasar');
  const { campo, area } = campoTexto({ id: 'levantar-comercio-mensaje', etiqueta: 'Mensaje para el Dueño (opcional)', placeholder: 'Por ejemplo, qué pasó o qué esperamos de ahora en más' });
  const aviso = h('div', { 'data-testid': 'aviso-levantar-comercio' });
  const confirmar = texto('button', 'btn btn-primary', 'Levantar suspensión', { type: 'submit', 'data-testid': 'btn-confirmar-levantar-comercio' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-levantar-comercio' });
  const formulario = h('form', { class: 'form', novalidate: true }, [campo, aviso, confirmar, cancelar]);
  const { hoja, fondo, overflowPrevio } = abrirHoja({
    id: 'levantar-comercio',
    titulo: 'Levantar suspensión',
    testid: 'modal-levantar-suspension-comercio',
    hijos: [texto('p', 'cliente-modal__sub', comercio.nombre), motivoCaja, caja, formulario],
  });
  let ocupado = false;
  let cerrado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, () => cerrar());
  area.focus();

  function cerrar(devolver = true) {
    if (ocupado || cerrado) return;
    cerrado = true;
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (devolver) devolverFoco(opener);
  }

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
    confirmar.textContent = 'Levantando…';
    limpiarAvisoFijo(aviso);
    const mensaje = area.value.trim();
    try {
      await apiFetch(`/administrador/comercios/${comercio.id}/levantar-suspension`, {
        method: 'PUT',
        body: mensaje ? { motivo: mensaje } : {},
        handle5xxGlobally: false,
        handleRedGlobally: false,
      });
      ocupado = false;
      cerrar(false);
      showToast('Suspensión levantada');
      await alExito();
    } catch (error) {
      ocupado = false;
      cancelar.disabled = false;
      confirmar.disabled = false;
      confirmar.textContent = 'Levantar suspensión';
      const conflicto = error instanceof ApiError && error.status === 409;
      mostrarAvisoFijo(aviso, conflicto
        ? `${error.message}. Cerrá esta ventana: la lista se actualiza.`
        : mensajeDeError(error, 'No pudimos levantar la suspensión. Probá de nuevo.'));
      if (conflicto) alConflicto();
      confirmar.focus();
    }
  });
}

function enlaceAlDueno(comercio) {
  const enlace = texto('a', 'comercio-suspension__enlace-dueno', 'Ir al Dueño', { href: `admin-duenos.html?id=${comercio.duenoUsuarioId}`, 'data-testid': 'enlace-ir-al-dueno' });
  return enlace;
}

function pintarBloque(bloque, comercio, recargarComercio) {
  const chip = h('span', { class: 'status-badge status-badge--pendiente', 'data-testid': 'suspension-comercio-estado' });
  chip.textContent = 'Suspendido';
  const encabezado = h('div', { class: 'comercio-suspension__encabezado' }, [chip]);
  if (comercio.suspendidoDesde) {
    encabezado.appendChild(texto('span', 'comercio-suspension__desde', `desde ${fechaLegible(comercio.suspendidoDesde)}`, { 'data-testid': 'suspension-comercio-desde' }));
  }
  const hijos = [encabezado];
  if (comercio.suspensionOrigen === 'DUENO') {
    hijos.push(texto('p', 'comercio-suspension__motivo', 'Suspendido junto con el Dueño', { 'data-testid': 'suspension-comercio-junto-dueno' }));
  }
  if (comercio.motivoSuspension) {
    hijos.push(texto('p', 'comercio-suspension__motivo', comercio.motivoSuspension, { 'data-testid': 'suspension-comercio-motivo' }));
  }
  if (comercio.suspensionOrigen === 'DUENO') {
    hijos.push(texto('p', 'comercio-suspension__explicacion', EXPLICACION_ORIGEN_DUENO, { id: 'suspension-comercio-explicacion', 'data-testid': 'suspension-comercio-explicacion' }));
    hijos.push(enlaceAlDueno(comercio));
  } else if (comercio.duenoSuspendido) {
    hijos.push(h('div', { class: 'comercio-suspension__aviso-dueno', 'data-testid': 'aviso-dueno-suspendido' }, [
      texto('p', '', EXPLICACION_DUENO_SUSPENDIDO, { id: 'aviso-dueno-suspendido-texto' }),
      enlaceAlDueno(comercio),
    ]));
  }
  if (comercio.ultimoEmailAvisoFallido) {
    const reenviar = texto('button', 'btn btn-secondary comercio-suspension__reenviar', 'Reenviar', { type: 'button', 'data-testid': 'btn-reenviar-email-comercio' });
    reenviar.addEventListener('click', async () => {
      reenviar.disabled = true;
      reenviar.textContent = 'Reenviando…';
      let exito = false;
      try {
        await apiFetch(`/administrador/comercios/${comercio.id}/suspension/reenviar-email`, { method: 'POST', handle5xxGlobally: false, handleRedGlobally: false });
        exito = true;
        showToast('Email reenviado');
      } catch (error) {
        showToast(mensajeDeError(error, 'No pudimos reenviar el email. Probá de nuevo.'), 'error');
      }
      try {
        const fresco = await recargarComercio();
        if (fresco) {
          Object.assign(comercio, fresco);
        }
      } catch {
        if (exito) {
          comercio.ultimoEmailAvisoFallido = false;
        }
      }
      pintarBloque(bloque, comercio, recargarComercio);
      const nuevo = bloque.querySelector('[data-testid="btn-reenviar-email-comercio"]');
      if (nuevo) nuevo.focus();
    });
    hijos.push(h('div', { class: 'comercio-suspension__email' }, [
      texto('p', 'cliente-admin-row__aviso', 'No se envió el email', { 'data-testid': 'email-fallido-comercio' }),
      reenviar,
    ]));
  }
  bloque.replaceChildren(...hijos);
}

export function crearControlesSuspension(comercio, { alExito, alConflicto, recargarComercio }) {
  const controles = { bloque: null, aparte: null, botones: [] };
  if (comercio.estado === 'SUSPENDIDO') {
    controles.bloque = h('div', { class: 'comercio-suspension', 'data-testid': 'suspension-comercio' });
    pintarBloque(controles.bloque, comercio, recargarComercio);
    const levantar = texto('button', 'btn btn-primary', 'Levantar suspensión', { type: 'button', 'data-testid': 'btn-levantar-suspension-comercio' });
    if (comercio.suspensionOrigen === 'DUENO') {
      levantar.disabled = true;
      levantar.setAttribute('aria-describedby', 'suspension-comercio-explicacion');
      const suspenderAparte = texto('button', 'btn btn-secondary doc-peligro-borde', 'Suspender solo este comercio', { type: 'button', 'aria-describedby': 'suspension-comercio-aparte-ayuda', 'data-testid': 'btn-suspender-solo-comercio' });
      suspenderAparte.addEventListener('click', () => abrirModalSuspender(comercio, suspenderAparte, { alExito, alConflicto }, { aparte: true }));
      controles.aparte = h('div', { class: 'comercio-suspension__aparte' }, [
        suspenderAparte,
        texto('p', 'comercio-suspension__aparte-ayuda', AYUDA_SUSPENDER_APARTE, { id: 'suspension-comercio-aparte-ayuda', 'data-testid': 'suspension-comercio-aparte-ayuda' }),
      ]);
    } else if (comercio.duenoSuspendido) {
      levantar.disabled = true;
      levantar.setAttribute('aria-describedby', 'aviso-dueno-suspendido-texto');
    } else {
      levantar.addEventListener('click', () => abrirModalLevantar(comercio, levantar, { alExito, alConflicto }));
    }
    controles.botones.push(levantar);
  } else if (ESTADOS_SUSPENDIBLES.includes(comercio.estado)) {
    const suspender = texto('button', 'btn btn-secondary doc-peligro-borde', 'Suspender', { type: 'button', 'data-testid': 'btn-suspender-comercio' });
    suspender.addEventListener('click', () => abrirModalSuspender(comercio, suspender, { alExito, alConflicto }));
    controles.botones.push(suspender);
  }
  return controles;
}
