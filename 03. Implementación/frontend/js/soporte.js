import { apiFetch, getToken, getUsuario } from './api.js';
import { renderTopBar, showToast } from './catalogo.js';
import { h, crearSvg, setLoading } from './form-utils.js';
import { texto } from './admin-hojas.js';
import {
  MIN_MENSAJE, TIPOS_CONSULTA, crearAvisoDeError, erroresPorCampo, limpiarError, mensajeDeApi, mostrarError, textoContadorLargo, tipoValido,
} from './soporte-comun.js';

const CAMPOS_CON_ERROR = ['email', 'tipo', 'mensaje'];

function iconoChevron() {
  return crearSvg([['polyline', { points: '6 9 12 15 18 9' }]], { class: 'select-shell__chevron', 'aria-hidden': 'true' });
}

function iconoCheck() {
  return crearSvg([['path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }], ['polyline', { points: '22 4 12 14.01 9 11.01' }]], { 'aria-hidden': 'true' });
}

function tipoDeLaUrl() {
  const valor = new URLSearchParams(window.location.search).get('tipo');
  return tipoValido(valor) ? valor : '';
}

function crearCampoError(id) {
  return h('div', { class: 'field__error', id: `error-${id}`, role: 'alert', style: 'display:none;', 'data-testid': `error-${id}` });
}

function mostrarErrorDeCampo(id, mensaje) {
  const caja = document.getElementById(`error-${id}`);
  caja.textContent = mensaje;
  caja.style.display = mensaje ? 'flex' : 'none';
}

function limpiarErroresDeCampo() {
  CAMPOS_CON_ERROR.forEach((campo) => mostrarErrorDeCampo(`soporte-${campo}`, ''));
}

async function copiarCodigo(codigo, nodoCodigo) {
  try {
    await navigator.clipboard.writeText(codigo);
    showToast('Código copiado');
  } catch {
    const rango = document.createRange();
    rango.selectNodeContents(nodoCodigo);
    const seleccion = window.getSelection();
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    showToast('No pudimos copiarlo solo. Quedó seleccionado para que lo copies.', 'error');
  }
}

function pintarExito(contenedor, creada, email, conSesion) {
  const codigo = texto('p', 'soporte-codigo', creada.codigo, { 'aria-label': `Código de tu consulta: ${creada.codigo.split('').join(' ')}`, 'data-testid': 'codigo-consulta' });
  const copiar = texto('button', 'btn btn-secondary', 'Copiar código', { type: 'button', 'data-testid': 'btn-copiar-codigo' });
  copiar.addEventListener('click', () => copiarCodigo(creada.codigo, codigo));
  const destino = conSesion
    ? `soporte-consulta.html?id=${creada.id}`
    : `soporte-consulta.html#codigo=${encodeURIComponent(creada.codigo)}&email=${encodeURIComponent(email)}`;
  const ver = texto('a', 'btn btn-primary', 'Ver mi consulta', { href: destino, 'data-testid': 'btn-ver-mi-consulta' });
  const titulo = texto('h1', 'title-lg', 'Recibimos tu consulta', { tabindex: '-1', 'data-testid': 'titulo-consulta-recibida' });
  contenedor.replaceChildren(h('div', { class: 'soporte-exito', 'data-testid': 'consulta-recibida' }, [
    h('div', { class: 'soporte-exito__icono' }, [iconoCheck()]),
    titulo,
    texto('p', 'soporte-intro', 'Guardá este código. Lo necesitás si querés ver la consulta sin iniciar sesión.'),
    codigo,
    texto('p', 'soporte-intro', `También te lo mandamos a ${email}.`, { 'data-testid': 'texto-email-enviado' }),
    h('div', { class: 'soporte-acciones' }, [copiar, ver]),
  ]));
  titulo.focus();
  window.scrollTo({ top: 0 });
}

export function initSoporte() {
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Soporte' });
  const contenedor = document.getElementById('soporte-contenido');
  const usuario = getUsuario();
  const conSesion = Boolean(getToken() && usuario);

  const aviso = crearAvisoDeError('aviso-soporte');
  const email = h('input', {
    type: 'email',
    id: 'soporte-email',
    autocomplete: 'email',
    autocapitalize: 'none',
    spellcheck: 'false',
    maxlength: '254',
    placeholder: 'nombre@ejemplo.com',
    disabled: conSesion,
    'aria-describedby': 'error-soporte-email',
    'data-testid': 'input-soporte-email',
  });
  if (conSesion) email.value = usuario.email;

  const select = h('select', { id: 'soporte-tipo', 'aria-describedby': 'error-soporte-tipo', 'data-testid': 'select-soporte-tipo' }, [
    texto('option', '', 'Elegí una opción', { value: '' }),
    ...TIPOS_CONSULTA.map((tipo) => texto('option', '', tipo.etiqueta, { value: tipo.valor })),
  ]);
  select.value = tipoDeLaUrl();

  const area = h('textarea', {
    id: 'soporte-mensaje',
    maxlength: '1000',
    rows: '6',
    placeholder: 'Escribí con el mayor detalle posible',
    'aria-describedby': 'soporte-mensaje-contador error-soporte-mensaje',
    'data-testid': 'input-soporte-mensaje',
  });
  const contador = texto('span', '', textoContadorLargo(0, { minimo: MIN_MENSAJE }), { id: 'soporte-mensaje-contador', 'data-testid': 'contador-soporte-mensaje' });
  area.addEventListener('input', () => {
    contador.textContent = textoContadorLargo(area.value.length, { minimo: MIN_MENSAJE });
  });

  const privacidad = h('p', { class: 'soporte-privacidad', 'data-testid': 'texto-privacidad' }, [
    'Si tenés dudas sobre tus datos, leé nuestra ',
    texto('a', 'link', 'Política de privacidad', { href: 'privacidad.html', 'data-testid': 'enlace-privacidad' }),
    '.',
  ]);
  const enviar = texto('button', 'btn btn-primary', 'Enviar consulta', { type: 'submit', 'data-testid': 'btn-enviar-consulta' });

  const campoEmail = h('div', { class: 'field' }, [
    texto('label', 'field__label', 'Tu email', { for: 'soporte-email' }),
    h('div', { class: 'input-shell' }, [email]),
    ...(conSesion ? [texto('p', 'field__hint', 'Es el email de tu cuenta.', { 'data-testid': 'ayuda-email-cuenta' })] : []),
    crearCampoError('soporte-email'),
  ]);
  const campoTipo = h('div', { class: 'field' }, [
    texto('label', 'field__label', 'Tipo de consulta', { for: 'soporte-tipo' }),
    h('div', { class: 'select-shell' }, [select, iconoChevron()]),
    crearCampoError('soporte-tipo'),
  ]);
  const campoMensaje = h('div', { class: 'field' }, [
    texto('label', 'field__label', 'Contanos qué pasó', { for: 'soporte-mensaje' }),
    h('div', { class: 'textarea-shell' }, [area]),
    h('div', { class: 'textarea-counter' }, [contador]),
    crearCampoError('soporte-mensaje'),
  ]);
  const formulario = h('form', { class: 'form', novalidate: true, 'data-testid': 'formulario-soporte' }, [campoEmail, campoTipo, campoMensaje, privacidad, aviso, enviar]);

  contenedor.replaceChildren(
    texto('h1', 'title-lg', 'Contactar a Soporte', { 'data-testid': 'titulo-soporte' }),
    texto('p', 'soporte-intro', 'Te respondemos por email.', { 'data-testid': 'texto-soporte-intro' }),
    formulario,
  );

  (conSesion ? select : email).focus();

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviar.disabled) return;
    limpiarError(aviso);
    limpiarErroresDeCampo();
    setLoading(enviar, 'Enviando…', true);
    const tipo = select.value || null;
    const cuerpo = conSesion
      ? { tipo, mensaje: area.value }
      : { email: email.value, tipo, mensaje: area.value };
    try {
      const creada = await apiFetch(conSesion ? '/soporte/consultas' : '/soporte/publico/consultas', {
        method: 'POST',
        auth: conSesion,
        body: cuerpo,
        handle5xxGlobally: false,
        handleRedGlobally: false,
      });
      pintarExito(contenedor, creada, conSesion ? usuario.email : email.value.trim().toLowerCase(), conSesion);
    } catch (error) {
      setLoading(enviar, '', false, 'Enviar consulta');
      const porCampo = erroresPorCampo(error);
      if (porCampo) {
        let primero = null;
        CAMPOS_CON_ERROR.forEach((campo) => {
          if (porCampo[campo]) {
            mostrarErrorDeCampo(`soporte-${campo}`, porCampo[campo]);
            primero = primero || document.getElementById(`soporte-${campo}`);
          }
        });
        if (primero) {
          primero.focus();
          return;
        }
      }
      mostrarError(aviso, mensajeDeApi(error, 'No pudimos enviar tu consulta. Probá de nuevo.'));
    }
  });
}
