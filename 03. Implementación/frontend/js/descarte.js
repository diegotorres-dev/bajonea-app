import { abrirHoja } from './hoja.js';

export function protegerDescarte(contenedor) {
  let tocado = false;
  let activo = true;

  const marcar = (evento) => {
    if (evento.isTrusted) {
      tocado = true;
    }
  };
  contenedor.addEventListener('input', marcar);
  contenedor.addEventListener('change', marcar);

  const alCerrarPestania = (evento) => {
    if (activo && tocado) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', alCerrarPestania);

  function hayQueConfirmar() {
    return activo && tocado;
  }

  function confirmar(continuar) {
    if (!hayQueConfirmar()) {
      continuar();
      return;
    }
    if (document.querySelector('[data-testid="modal-descartar-registro"]')) {
      return;
    }
    abrirHoja({
      titulo: '¿Descartar los cambios?',
      texto: 'Si salís ahora, se pierde lo que cargaste.',
      testid: 'modal-descartar-registro',
      acciones: [
        {
          etiqueta: 'Descartar',
          etiquetaEnviando: 'Saliendo…',
          variante: 'peligro',
          testid: 'btn-descartar-registro',
          alPulsar: () => {
            activo = false;
            continuar();
          },
        },
        { etiqueta: 'Seguir editando', variante: 'segura', inicial: true, testid: 'btn-seguir-editando-registro' },
      ],
    });
  }

  document.addEventListener(
    'click',
    (evento) => {
      if (!hayQueConfirmar() || evento.defaultPrevented || evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey) {
        return;
      }
      const enlace = evento.target instanceof Element ? evento.target.closest('a[href]') : null;
      if (!enlace || enlace.target === '_blank' || enlace.closest('[data-testid="modal-descartar-registro"]')) {
        return;
      }
      const destino = enlace.getAttribute('href');
      if (!destino || destino.startsWith('#') || destino.startsWith('mailto:')) {
        return;
      }
      evento.preventDefault();
      confirmar(() => {
        window.location.href = enlace.href;
      });
    },
    true,
  );

  return {
    confirmar,
    desactivar() {
      activo = false;
      window.removeEventListener('beforeunload', alCerrarPestania);
    },
  };
}
