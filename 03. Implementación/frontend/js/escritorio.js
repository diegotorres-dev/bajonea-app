export const MEDIA_ESCRITORIO = '(min-width: 1024px)';

const consultaEscritorio = window.matchMedia(MEDIA_ESCRITORIO);

export function enEscritorio() {
  return consultaEscritorio.matches;
}

export function alCambiarEscritorio(oyente) {
  oyente(consultaEscritorio.matches);
  consultaEscritorio.addEventListener('change', (evento) => oyente(evento.matches));
}

export function montarSaltarAlContenido() {
  if (document.querySelector('.saltar-contenido')) {
    return;
  }
  const destino = document.querySelector('main');
  if (!destino) {
    return;
  }
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.hidden = true;
  boton.className = 'saltar-contenido';
  boton.setAttribute('data-testid', 'btn-saltar-contenido');
  boton.textContent = 'Saltar al contenido';
  boton.addEventListener('click', () => {
    destino.setAttribute('tabindex', '-1');
    destino.focus();
    destino.scrollIntoView({ block: 'start' });
  });
  document.body.insertBefore(boton, document.body.firstChild);
}

export function recargarAlCambiarDeModo() {
  const modoInicial = consultaEscritorio.matches;
  consultaEscritorio.addEventListener('change', (evento) => {
    if (evento.matches !== modoInicial) {
      window.location.reload();
    }
  });
}
