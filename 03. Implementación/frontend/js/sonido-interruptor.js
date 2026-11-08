import { showToast } from './catalogo.js';
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
