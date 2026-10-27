import { apiFetch, ApiError, getUsuario } from './api.js';
import { exigirContextoCliente, consultarComerciosDelEmpleado } from './contexto.js';
import { abrirHojaCambiarCuenta } from './selector-contexto.js';
import { logout } from './auth.js';
import { normalizarCampos } from './validators.js';
import { renderTopBar, renderBottomNav, pintarAvatarUsuario, showToast } from './catalogo.js';
import { validarArchivoImagen, subirFotoPerfilUsuario, eliminarFotoPerfilUsuario, CloudinaryUploadError } from './cloudinary.js';
import { abrirEditorRecorte } from './crop.js';
import { enlazarEdicionDatosPersonales, enlazarCambioPassword } from './perfil-cuenta.js';
import { initMisDirecciones } from './direcciones.js';

const ICONS = {
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

function mostrarVista(id) {
  document.querySelectorAll('.perfil-view').forEach((view) => {
    view.classList.toggle('is-hidden', view.id !== id);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarModalFotoPerfil({ onEditar, onEliminar }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-testid', 'modal-foto-perfil');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-sheet__title">Foto de perfil</h2>
      <div class="profile-link-list" style="width:100%;margin-bottom:12px;">
        <button class="profile-link" type="button" id="modal-editar-foto-btn" data-testid="btn-editar-foto-perfil">
          ${ICONS.edit}
          <span>Editar foto</span>
        </button>
        <button class="profile-link profile-link--danger" type="button" id="modal-eliminar-foto-btn" data-testid="btn-eliminar-foto-perfil">
          ${ICONS.trash}
          <span>Eliminar foto</span>
        </button>
      </div>
      <button class="btn btn-tertiary" type="button" id="modal-cancelar-foto-btn" style="width:100%;" data-testid="btn-cancelar-foto-perfil">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('modal-editar-foto-btn').addEventListener('click', () => {
    backdrop.remove();
    onEditar();
  });
  document.getElementById('modal-eliminar-foto-btn').addEventListener('click', () => {
    backdrop.remove();
    onEliminar();
  });
  document.getElementById('modal-cancelar-foto-btn').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

function mostrarModalConfirmarLogout() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-testid', 'modal-confirmar-logout');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon">${ICONS.logout}</div>
      <h2 class="modal-sheet__title">¿Cerrar sesión?</h2>
      <p class="modal-sheet__text">Podés volver a ingresar en cualquier momento.</p>
      <button class="btn btn-primary" type="button" id="confirmar-logout-btn" style="margin-bottom:12px;" data-testid="btn-confirmar-logout">Sí, cerrar sesión</button>
      <button class="btn btn-tertiary" type="button" id="cancelar-logout-btn" data-testid="btn-cancelar-logout">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('cancelar-logout-btn').addEventListener('click', () => backdrop.remove());
  document.getElementById('confirmar-logout-btn').addEventListener('click', () => logout());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

export async function initPerfil() {
  const usuarioSesion = getUsuario();
  if (!usuarioSesion) {
    window.location.href = 'login.html';
    return;
  }

  if (usuarioSesion.rol === 'CLIENTE' && !(await exigirContextoCliente())) {
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarPerfil: false, mostrarCampana: false, centrarLogo: true });
  renderBottomNav(document.getElementById('bottom-nav-slot'), 'perfil');

  document.getElementById('cerrar-sesion-link').addEventListener('click', mostrarModalConfirmarLogout);

  const cambiarCuentaLink = document.getElementById('cambiar-cuenta-link');
  cambiarCuentaLink.addEventListener('click', () => abrirHojaCambiarCuenta());
  consultarComerciosDelEmpleado()
    .then((comercios) => {
      if (comercios.length > 0) {
        cambiarCuentaLink.classList.remove('is-hidden');
        cambiarCuentaLink.disabled = false;
      }
    })
    .catch(() => {});

  const cliente = await apiFetch('/clientes/perfil');
  normalizarCampos(cliente, ['nombre', 'apellido']);
  normalizarCampos(cliente.direccion, ['calle']);

  document.getElementById('perfil-nombre').textContent = `${cliente.nombre} ${cliente.apellido}`;
  document.getElementById('perfil-email').textContent = cliente.email;


  const avatarPerfil = document.getElementById('perfil-avatar');
  function actualizarAvatares() {
    const inicial = (cliente.nombre || '?').trim().charAt(0).toUpperCase();
    pintarAvatarUsuario(avatarPerfil, cliente.fotoPerfilUrl, inicial);
    const avatarFooter = document.querySelector('.bottom-nav__item[data-testid="btn-nav-perfil"] .bottom-nav__avatar');
    if (avatarFooter) {
      pintarAvatarUsuario(avatarFooter, cliente.fotoPerfilUrl, inicial);
    }
  }
  actualizarAvatares();

  enlazarEdicionDatosPersonales({
    cliente,
    mostrarVista,
    alActualizarDatos: (actualizado) => {
      document.getElementById('perfil-nombre').textContent = `${actualizado.nombre} ${actualizado.apellido}`;
    },
  });
  enlazarCambioPassword({ mostrarVista });

  const inputAvatar = document.getElementById('input-avatar');
  inputAvatar.addEventListener('change', () => {
    const file = inputAvatar.files[0];
    inputAvatar.value = '';
    if (!file) {
      return;
    }
    const errorValidacion = validarArchivoImagen(file);
    if (errorValidacion) {
      showToast(errorValidacion, 'error');
      return;
    }
    abrirEditorRecorte({
      origen: { file },
      aspectRatio: 1,
      onConfirmar: async (blob) => {
        const archivoRecortado = new File([blob], file.name, { type: 'image/jpeg' });
        try {
          const actualizado = await subirFotoPerfilUsuario(cliente.id, archivoRecortado);
          cliente.fotoPerfilUrl = actualizado.fotoPerfilUrl;
          actualizarAvatares();
          showToast('Foto de perfil actualizada');
        } catch (error) {
          const esErrorConocido = error instanceof CloudinaryUploadError || error instanceof ApiError;
          showToast(esErrorConocido ? error.message : 'No pudimos subir la foto.', 'error');
        }
      },
    });
  });

  avatarPerfil.addEventListener('click', () => {
    if (!cliente.fotoPerfilUrl) {
      inputAvatar.click();
      return;
    }
    mostrarModalFotoPerfil({
      onEditar: () => inputAvatar.click(),
      onEliminar: async () => {
        try {
          const actualizado = await eliminarFotoPerfilUsuario(cliente.id);
          cliente.fotoPerfilUrl = actualizado.fotoPerfilUrl;
          actualizarAvatares();
          showToast('Foto de perfil eliminada');
        } catch (error) {
          showToast(error instanceof ApiError ? error.message : 'No pudimos eliminar la foto.', 'error');
        }
      },
    });
  });

  document.querySelectorAll('[data-volver-perfil]').forEach((btn) => {
    btn.addEventListener('click', () => mostrarVista('view-principal'));
  });

  const parametros = new URLSearchParams(window.location.search);
  const vieneDelCheckout = parametros.get('desde') === 'checkout';
  const misDirecciones = initMisDirecciones({
    contenedor: document.getElementById('direcciones-contenido'),
    enlaceFila: document.getElementById('mis-direcciones-link'),
    mostrarVista,
    idVista: 'view-direcciones',
  });
  document.getElementById('direcciones-volver').addEventListener('click', () => {
    if (vieneDelCheckout) {
      window.location.href = 'checkout.html';
      return;
    }
    mostrarVista('view-principal');
  });
  if (parametros.get('vista') === 'direcciones') {
    misDirecciones.abrir();
  }

  document.getElementById('editar-datos-link').disabled = false;
  document.getElementById('cambiar-password-link').disabled = false;
  avatarPerfil.disabled = false;
}
