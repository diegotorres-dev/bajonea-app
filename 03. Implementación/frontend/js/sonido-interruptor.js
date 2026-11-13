import { showToast } from './catalogo.js';
import { crearSvg } from './form-utils.js';
import { activarAudio, audioBloqueado, fijarSonido, reproducirDing, sonidoActivado, suscribirSonido } from './sonido-avisos.js';

let contador = 0;

function crear(tag, className) {
  const nodo = document.createElement(tag);
  if (className) {
    nodo.className = className;
  }
  return nodo;
}

export function crearInterruptorSonido() {
  contador += 1;
  const idTitulo = `sonido-titulo-${contador}`;
  const idSubtitulo = `sonido-subtitulo-${contador}`;

  const envoltorio = crear('div', 'sonido-avisos');
  envoltorio.setAttribute('data-testid', 'sonido-avisos');

  const tarjeta = crear('div', 'cierre-card sonido-avisos__tarjeta');
  const texto = crear('div', 'cierre-card__texto');
  const titulo = crear('p', 'cierre-card__titulo');
  titulo.id = idTitulo;
  titulo.textContent = 'Sonido de avisos';
  const subtitulo = crear('p', 'cierre-card__subtitulo');
  subtitulo.id = idSubtitulo;
  subtitulo.textContent = 'Suena cuando llega una notificación nueva.';
  texto.append(titulo, subtitulo);

  const boton = crear('button', 'cierre-switch');
  boton.type = 'button';
  boton.setAttribute('role', 'switch');
  boton.setAttribute('aria-labelledby', idTitulo);
  boton.setAttribute('aria-describedby', idSubtitulo);
  boton.setAttribute('data-testid', 'switch-sonido-avisos');
  boton.appendChild(crear('span', 'cierre-switch__perilla'));
  const estadoVisible = crear('span', 'sonido-avisos__estado');
  estadoVisible.setAttribute('data-testid', 'sonido-avisos-estado');
  const iconoActivo = crearSvg([['path', { d: 'M11 5 6 9H2v6h4l5 4V5z' }], ['path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }], ['path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }]], { 'aria-hidden': 'true' });
  const iconoInactivo = crearSvg([['path', { d: 'M11 5 6 9H2v6h4l5 4V5z' }], ['line', { x1: '23', y1: '9', x2: '17', y2: '15' }], ['line', { x1: '17', y1: '9', x2: '23', y2: '15' }]], { 'aria-hidden': 'true' });
  const textoEstado = crear('span');
  estadoVisible.append(iconoActivo, iconoInactivo, textoEstado);
  boton.appendChild(estadoVisible);

  tarjeta.append(texto, boton);

  const ayuda = crear('div', 'sonido-avisos__ayuda');
  ayuda.setAttribute('data-testid', 'ayuda-sonido-bloqueado');
  const ayudaTexto = crear('p', 'sonido-avisos__texto');
  ayudaTexto.textContent = 'Para que suene, tocá una vez en esta pantalla.';
  const activar = crear('button', 'sonido-avisos__activar');
  activar.type = 'button';
  activar.textContent = 'Activar sonido';
  activar.setAttribute('data-testid', 'btn-activar-sonido');
  ayuda.append(ayudaTexto, activar);

  envoltorio.append(tarjeta, ayuda);

  function pintar() {
    const activo = sonidoActivado();
    boton.setAttribute('aria-checked', String(activo));
    textoEstado.textContent = activo ? 'Sonido activado' : 'Sonido desactivado';
    iconoActivo.style.display = activo ? '' : 'none';
    iconoInactivo.style.display = activo ? 'none' : '';
    ayuda.hidden = !(activo && audioBloqueado());
  }

  boton.addEventListener('click', () => {
    const nuevo = !sonidoActivado();
    fijarSonido(nuevo);
    if (nuevo) {
      reproducirDing();
    }
    showToast(nuevo ? 'Sonido de avisos activado' : 'Sonido de avisos desactivado');
  });
  activar.addEventListener('click', async () => {
    await activarAudio();
    reproducirDing();
    pintar();
  });

  suscribirSonido(pintar);
  pintar();
  return envoltorio;
}
