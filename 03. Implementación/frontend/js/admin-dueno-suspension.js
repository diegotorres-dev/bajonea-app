import { apiFetch, ApiError } from './api.js';
import { showToast } from './catalogo.js';
import { h, mostrarAvisoFijo, limpiarAvisoFijo } from './form-utils.js';
import { atraparFoco, devolverFoco, mensajeDeError } from './documentos-comun.js';
import { abrirHoja, campoTexto, fechaLegible, plural, texto } from './admin-hojas.js';

const MIN_MOTIVO = 10;

const MOTIVO_QUEDA_COMO_ESTA = {
  SUSPENDIDO: 'Ya estaba suspendido aparte.',
  PENDIENTE: 'Todavía no está aprobado.',
  RECHAZADO: 'Fue rechazado.',
  RECHAZO_DEFINITIVO: 'Fue rechazado.',
  INACTIVO: 'Está inactivo.',
};

export function nombreDelDueno(dueno) {
  return `${dueno.nombre} ${dueno.apellido}`.trim();
}

export function textoComercios(cantidad) {
  return `${cantidad} ${plural(cantidad, 'comercio', 'comercios')}`;
}

function lineaEmpleados(cantidad) {
  return cantidad === 1 ? 'su Empleado' : `sus ${cantidad} Empleados`;
}

export function subtituloDeSuspender(previa) {
  const total = previa.comercios.length;
  const seSuspenden = previa.comercios.filter((comercio) => comercio.efecto === 'SE_SUSPENDE').length;
  if (total === 0) return 'No va a poder ingresar. No tiene comercios.';
  if (seSuspenden === 0) return 'No va a poder ingresar. Sus comercios siguen como están.';
  if (seSuspenden === total) {
    return seSuspenden === 1
      ? 'No va a poder ingresar. Su comercio se suspende.'
      : `No va a poder ingresar. Sus ${seSuspenden} comercios se suspenden.`;
  }
  return `No va a poder ingresar. ${seSuspenden} de sus ${total} comercios ${seSuspenden === 1 ? 'se suspende' : 'se suspenden'}.`;
}

export function lineasDePedidos(comercio, previa) {
  const lineas = [];
  const pendientes = comercio.pedidosPendientesDeConfirmacion;
  const preparacion = comercio.pedidosEnPreparacion;
  const listos = comercio.pedidosListosParaRetirar;
  const camino = comercio.pedidosEnCamino;
  const sinPagar = comercio.pedidosSinPagar;
  if (pendientes > 0) {
    lineas.push(pendientes === 1
      ? '1 pendiente: se rechaza y se reembolsa ahora.'
      : `${pendientes} pendientes: se rechazan y se reembolsan ahora.`);
  }
  if (comercio.atencionDePedidos === 'ATENDIDOS_POR_EMPLEADOS') {
    const quienes = lineaEmpleados(comercio.empleadosActivos);
    const topePreparacion = previa.topePreparacionMinutos;
    const topeRetiro = previa.topeRetiroMinutos;
    if (preparacion > 0 && listos > 0 && topePreparacion === topeRetiro) {
      lineas.push(`${preparacion} en preparación y ${listos} ${plural(listos, 'listo', 'listos')}: los resuelven ${quienes} en hasta ${topePreparacion} min.`);
    } else {
      if (preparacion > 0) {
        lineas.push(`${preparacion} en preparación: los resuelven ${quienes} en hasta ${topePreparacion} min.`);
      }
      if (listos > 0) {
        lineas.push(`${listos} ${plural(listos, 'listo para retirar', 'listos para retirar')}: los resuelven ${quienes} en hasta ${topeRetiro} min.`);
      }
    }
  } else if (comercio.atencionDePedidos === 'SE_ANULAN_AL_INSTANTE') {
    if (preparacion > 0) {
      lineas.push(preparacion === 1
        ? '1 en preparación: se anula y se reembolsa ahora, porque no tiene Empleados activos.'
        : `${preparacion} en preparación: se anulan y se reembolsan ahora, porque no tiene Empleados activos.`);
    }
    if (listos > 0) {
      lineas.push(listos === 1
        ? '1 listo para retirar: se cancela y se reembolsa ahora, porque no tiene Empleados activos.'
        : `${listos} listos para retirar: se cancelan y se reembolsan ahora, porque no tiene Empleados activos.`);
    }
  }
  if (camino > 0) {
    lineas.push(camino === 1 ? '1 en camino sigue igual.' : `${camino} en camino siguen igual.`);
  }
  if (sinPagar > 0) {
    lineas.push(sinPagar === 1 ? '1 sin pagar ya no se puede pagar.' : `${sinPagar} sin pagar ya no se pueden pagar.`);
  }
  if (lineas.length === 0) {
    lineas.push('Sin pedidos en curso.');
  }
  return lineas;
}

function chipDeEfecto(seSuspende) {
  const chip = texto('span', `dueno-comercio__chip ${seSuspende ? 'dueno-comercio__chip--suspende' : 'dueno-comercio__chip--queda'}`, seSuspende ? 'Se suspende' : 'Queda como está');
  chip.setAttribute('data-testid', seSuspende ? 'chip-se-suspende' : 'chip-queda-como-esta');
  return chip;
}

function tarjetaDeComercioASuspender(comercio, previa) {
  const seSuspende = comercio.efecto === 'SE_SUSPENDE';
  const lineas = seSuspende
    ? lineasDePedidos(comercio, previa)
    : [MOTIVO_QUEDA_COMO_ESTA[comercio.estadoActual] || 'No está operativo.'];
  return h('div', { class: 'dueno-comercio', 'data-testid': `previa-comercio-${comercio.comercioId}` }, [
    h('div', { class: 'dueno-comercio__encabezado' }, [texto('h3', 'dueno-comercio__nombre', comercio.nombre), chipDeEfecto(seSuspende)]),
    h('ul', { class: 'dueno-comercio__lineas' }, lineas.map((linea) => texto('li', '', linea))),
  ]);
}

function esperaDeLista(testid) {
  return h('div', { class: 'dueno-comercio dueno-comercio--espera', 'aria-hidden': 'true', 'data-testid': testid }, [
    h('div', { class: 'skeleton', style: 'height:16px;width:50%;margin-bottom:10px;' }),
    h('div', { class: 'skeleton', style: 'height:12px;width:80%;' }),
  ]);
}

function crearHojaDeDueno({ id, titulo, testid, subtitulo }) {
  const subtituloEl = texto('p', 'cliente-modal__sub', subtitulo, { 'data-testid': `${testid}-subtitulo` });
  const lista = h('div', { class: 'dueno-hoja__lista', 'data-testid': `${testid}-comercios` });
  const cuerpo = h('div', { class: 'dueno-hoja__cuerpo' }, [subtituloEl, lista]);
  const pie = h('div', { class: 'dueno-hoja__pie' });
  const formulario = h('form', { class: 'dueno-hoja__form', novalidate: true }, [cuerpo, pie]);
  const { hoja, fondo, overflowPrevio } = abrirHoja({ clase: 'product-modal-sheet dueno-hoja', id, titulo, testid, hijos: [formulario] });
  return { hoja, fondo, overflowPrevio, subtituloEl, lista, cuerpo, pie, formulario };
}

export function abrirHojaSuspenderDueno(dueno, opener, { alExito, alConflicto }) {
  const nombre = nombreDelDueno(dueno);
  const { hoja, fondo, overflowPrevio, subtituloEl, lista, cuerpo, pie, formulario } = crearHojaDeDueno({
    id: 'suspender-dueno',
    titulo: `Suspender a ${nombre}`,
    testid: 'modal-suspender-dueno',
    subtitulo: 'Calculando qué va a pasar…',
  });
  lista.replaceChildren(esperaDeLista('previa-dueno-cargando'));
  const { campo, area } = campoTexto({ id: 'suspender-dueno-motivo', etiqueta: 'Motivo (lo va a ver la persona)', placeholder: 'Contale por qué se suspende la cuenta', minimo: MIN_MOTIVO });
  const aviso = h('div', { 'data-testid': 'aviso-suspender-dueno' });
  cuerpo.append(campo, aviso);
  const confirmar = texto('button', 'btn btn-primary doc-peligro', 'Suspender al Dueño', { type: 'submit', disabled: true, 'data-testid': 'btn-confirmar-suspender-dueno' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-suspender-dueno' });
  pie.append(confirmar, cancelar);

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

  apiFetch(`/administrador/duenos/${dueno.id}/suspension/previa`, { handle5xxGlobally: false, handleRedGlobally: false })
    .then((previa) => {
      if (cerrado) return;
      subtituloEl.textContent = subtituloDeSuspender(previa);
      lista.replaceChildren(...previa.comercios.map((comercio) => tarjetaDeComercioASuspender(comercio, previa)));
    })
    .catch((error) => {
      if (cerrado) return;
      subtituloEl.textContent = 'No va a poder ingresar. Sus comercios se suspenden.';
      lista.replaceChildren();
      mostrarAvisoFijo(aviso, `${mensajeDeError(error, 'No pudimos calcular el detalle.')} Igual podés suspender la cuenta.`);
    });

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
      await apiFetch(`/administrador/duenos/${dueno.id}/suspender`, { method: 'PUT', body: { motivo }, handle5xxGlobally: false, handleRedGlobally: false });
      ocupado = false;
      cerrar(false);
      showToast('Dueño suspendido');
      await alExito();
    } catch (error) {
      ocupado = false;
      cancelar.disabled = false;
      confirmar.textContent = 'Suspender al Dueño';
      confirmar.disabled = area.value.trim().length < MIN_MOTIVO;
      const conflicto = error instanceof ApiError && error.status === 409;
      mostrarAvisoFijo(aviso, conflicto
        ? `${error.message}. Cerrá esta ventana: la lista se actualiza.`
        : mensajeDeError(error, 'No pudimos suspender la cuenta. Probá de nuevo.'));
      if (conflicto) alConflicto();
      confirmar.focus();
    }
  });
}

function filaDeComercioQueVuelve(comercio) {
  return h('div', { class: 'dueno-restauracion__fila', 'data-testid': `vuelve-comercio-${comercio.comercioId}` }, [
    texto('span', 'dueno-restauracion__nombre', comercio.nombre),
    texto('span', 'dueno-restauracion__estado', 'Vuelve'),
  ]);
}

function cajaDeComercioQueSigue(comercio) {
  return h('div', { class: 'dueno-restauracion dueno-restauracion--sigue', 'data-testid': `sigue-comercio-${comercio.comercioId}` }, [
    h('div', { class: 'dueno-restauracion__fila' }, [
      texto('span', 'dueno-restauracion__nombre', comercio.nombre),
      texto('span', 'dueno-restauracion__estado', 'Sigue suspendido'),
    ]),
    texto('p', 'dueno-restauracion__explicacion', 'Se suspendió aparte. Después de levantar al Dueño, lo levantás desde su ficha.'),
  ]);
}

export function abrirHojaLevantarDueno(dueno, opener, { alExito, alConflicto }) {
  const nombre = nombreDelDueno(dueno);
  const desde = dueno.suspendidoDesde ? `Suspendido desde ${fechaLegible(dueno.suspendidoDesde)}` : 'Cuenta suspendida';
  const { hoja, fondo, overflowPrevio, subtituloEl, lista, cuerpo, pie, formulario } = crearHojaDeDueno({
    id: 'levantar-dueno',
    titulo: `Levantar a ${nombre}`,
    testid: 'modal-levantar-dueno',
    subtitulo: '',
  });
  subtituloEl.remove();
  const cajaActual = h('div', { class: 'cliente-modal__caja', 'data-testid': 'levantar-dueno-suspension-actual' }, [
    texto('p', 'cliente-modal__caja-titulo', desde),
    texto('p', 'cliente-modal__caja-motivo', dueno.motivoSuspension || '', { 'data-testid': 'levantar-dueno-motivo-actual' }),
  ]);
  cuerpo.insertBefore(cajaActual, lista);
  lista.replaceChildren(esperaDeLista('levantar-dueno-cargando'));
  const nota = texto('p', 'dueno-hoja__nota', 'Los pedidos que se rechazaron o anularon al suspender no vuelven.', { 'data-testid': 'levantar-dueno-nota' });
  const { campo, area } = campoTexto({ id: 'levantar-dueno-mensaje', etiqueta: 'Mensaje para la persona (opcional)', placeholder: 'Por ejemplo, qué pasó o qué esperamos de ahora en más' });
  const aviso = h('div', { 'data-testid': 'aviso-levantar-dueno' });
  cuerpo.append(nota, campo, aviso);
  const confirmar = texto('button', 'btn btn-primary doc-exito', 'Levantar suspensión', { type: 'submit', 'data-testid': 'btn-confirmar-levantar-dueno' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-levantar-dueno' });
  pie.append(confirmar, cancelar);

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

  apiFetch(`/administrador/duenos/${dueno.id}/suspension/previa`, { handle5xxGlobally: false, handleRedGlobally: false })
    .then((previa) => {
      if (cerrado) return;
      const suspendidos = previa.comercios.filter((comercio) => comercio.estadoActual === 'SUSPENDIDO');
      const vuelven = suspendidos.filter((comercio) => comercio.suspensionOrigen === 'DUENO');
      const siguen = suspendidos.filter((comercio) => comercio.suspensionOrigen !== 'DUENO');
      const bloques = [];
      if (vuelven.length > 0) {
        const titulo = siguen.length > 0
          ? `Se restablecen ${vuelven.length} de ${suspendidos.length} comercios`
          : `Se restablece${vuelven.length === 1 ? '' : 'n'} ${textoComercios(vuelven.length)}`;
        bloques.push(h('div', { class: 'dueno-restauracion dueno-restauracion--vuelve', 'data-testid': 'levantar-dueno-vuelven' }, [
          texto('p', 'dueno-restauracion__titulo', titulo),
          ...vuelven.map(filaDeComercioQueVuelve),
        ]));
      }
      siguen.forEach((comercio) => bloques.push(cajaDeComercioQueSigue(comercio)));
      lista.replaceChildren(...bloques);
    })
    .catch((error) => {
      if (cerrado) return;
      lista.replaceChildren();
      mostrarAvisoFijo(aviso, `${mensajeDeError(error, 'No pudimos calcular el detalle.')} Igual podés levantar la suspensión.`);
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
    confirmar.textContent = 'Levantando…';
    limpiarAvisoFijo(aviso);
    const mensaje = area.value.trim();
    try {
      await apiFetch(`/administrador/duenos/${dueno.id}/levantar-suspension`, {
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

export function abrirHojaAccionesDueno(dueno, opener, handlers) {
  const nombre = nombreDelDueno(dueno);
  const suspendido = dueno.estado === 'SUSPENDIDO';
  const accion = suspendido
    ? texto('button', 'btn btn-primary doc-exito', 'Levantar suspensión', { type: 'button', 'data-testid': 'accion-levantar-dueno' })
    : texto('button', 'btn btn-primary doc-peligro', 'Suspender cuenta', { type: 'button', 'data-testid': 'accion-suspender-dueno' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-acciones-dueno' });
  const { hoja, fondo, overflowPrevio } = abrirHoja({
    id: 'acciones-dueno',
    titulo: nombre,
    testid: 'hoja-acciones-dueno',
    hijos: [texto('p', 'cliente-modal__sub', dueno.email), h('div', { class: 'dueno-hoja__acciones' }, [accion, cancelar])],
  });
  let cerrado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, () => cerrar());
  accion.focus();

  function cerrar(devolver = true) {
    if (cerrado) return;
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
  accion.addEventListener('click', () => {
    cerrar(false);
    if (suspendido) {
      abrirHojaLevantarDueno(dueno, opener, handlers);
    } else {
      abrirHojaSuspenderDueno(dueno, opener, handlers);
    }
  });
}
