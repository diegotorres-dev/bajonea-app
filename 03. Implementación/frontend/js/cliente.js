import { apiFetch, ApiError, getUsuario, clearSesion } from './api.js';
import { logout, construirTelefono } from './auth.js';
import {
  esPasswordSegura,
  esTelefonoValido,
  esNombrePropioValido,
  aplicarFortalezaPassword,
  mostrarErrorCampo,
  limpiarErrorCampo,
  mapearErroresBackend,
  validarCamposSilencioso,
  validarCamposRequeridosSilencioso,
  scrollAlPrimerError,
  normalizarCampos,
} from './validators.js';
import { renderTopBar, renderBottomNav, pintarAvatarUsuario, showToast, manejarBloqueoPorCambioPassword } from './catalogo.js';
import { validarArchivoImagen, subirFotoPerfilUsuario, eliminarFotoPerfilUsuario, CloudinaryUploadError } from './cloudinary.js';
import { abrirEditorRecorte } from './crop.js';

const ICONS = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

function renderBanner(slot, kind, texto) {
  if (!texto) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `<div class="banner banner-${kind}" style="margin-bottom:20px;">${ICONS[kind] || ICONS.warning}<div>${texto}</div></div>`;
}

function setLoading(button, loadingText, isLoading, originalHtml) {
  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = loadingText;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalHtml || originalHtml;
    button.disabled = false;
  }
}

function bindPasswordToggle(toggleBtn, input) {
  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

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

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarPerfil: false, mostrarCampana: false, centrarLogo: true });
  renderBottomNav(document.getElementById('bottom-nav-slot'), 'perfil');

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

  document.getElementById('editar-datos-link').addEventListener('click', () => {
    document.getElementById('editar-nombre').value = cliente.nombre;
    document.getElementById('editar-apellido').value = cliente.apellido;
    document.getElementById('editar-telefono').value = cliente.telefono.replace(/^\+549/, '');
    document.getElementById('editar-email').value = cliente.email;
    document.getElementById('editar-dni').value = cliente.dni;
    renderBanner(document.getElementById('editar-banner-slot'), 'warning', '');
    mostrarVista('view-editar-datos');
  });

  const editarTelefonoInput = document.getElementById('editar-telefono');
  editarTelefonoInput.addEventListener('input', () => {
    editarTelefonoInput.value = editarTelefonoInput.value.replace(/\D/g, '').slice(0, 10);
  });

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

  document.getElementById('cambiar-password-link').addEventListener('click', () => {
    document.getElementById('form-cambiar-password').reset();
    renderBanner(document.getElementById('password-banner-slot'), 'warning', '');
    mostrarVista('view-cambiar-password');
  });

  document.getElementById('cerrar-sesion-link').addEventListener('click', mostrarModalConfirmarLogout);

  document.querySelectorAll('[data-volver-perfil]').forEach((btn) => {
    btn.addEventListener('click', () => mostrarVista('view-principal'));
  });

  const formEditar = document.getElementById('form-editar-datos');
  const bannerEditar = document.getElementById('editar-banner-slot');
  const submitEditarBtn = document.getElementById('guardar-datos-btn');
  formEditar.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerEditar, 'warning', '');
    const camposValidos = validarCamposRequeridosSilencioso([
      { inputId: 'editar-nombre', errorId: 'error-editar-nombre', validador: esNombrePropioValido, mensajeVacio: 'El nombre es obligatorio.', mensajeInvalido: 'Debe contener solo letras, espacios y guiones' },
      { inputId: 'editar-apellido', errorId: 'error-editar-apellido', validador: esNombrePropioValido, mensajeVacio: 'El apellido es obligatorio.', mensajeInvalido: 'Debe contener solo letras, espacios y guiones' },
      { inputId: 'editar-telefono', errorId: 'error-editar-telefono', validador: esTelefonoValido, mensajeVacio: 'Ingresá tu teléfono.', mensajeInvalido: 'Ingresá un teléfono argentino válido (código de área + número).' },
    ]);
    if (!camposValidos) {
      scrollAlPrimerError();
      return;
    }
    setLoading(submitEditarBtn, 'Guardando...', true);
    try {
      const actualizado = await apiFetch('/clientes/perfil', {
        method: 'PUT',
        body: {
          nombre: document.getElementById('editar-nombre').value.trim(),
          apellido: document.getElementById('editar-apellido').value.trim(),
          telefono: construirTelefono(document.getElementById('editar-telefono').value.trim()),
        },
      });
      normalizarCampos(actualizado, ['nombre', 'apellido']);
      cliente.nombre = actualizado.nombre;
      cliente.apellido = actualizado.apellido;
      cliente.telefono = actualizado.telefono;
      document.getElementById('perfil-nombre').textContent = `${actualizado.nombre} ${actualizado.apellido}`;
      mostrarVista('view-principal');
      showToast('Datos actualizados correctamente');
    } catch (error) {
      const mapaErrores = {
        nombre: 'error-editar-nombre',
        apellido: 'error-editar-apellido',
        telefono: 'error-editar-telefono',
      };
      if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, mapaErrores))) {
        renderBanner(bannerEditar, 'error', error instanceof ApiError ? error.message : 'No pudimos guardar tus datos. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(submitEditarBtn, '', false, 'Guardar');
    }
  });

  const formPassword = document.getElementById('form-cambiar-password');
  const bannerPassword = document.getElementById('password-banner-slot');
  const submitPasswordBtn = document.getElementById('guardar-password-btn');
  const passwordActualInput = document.getElementById('password-actual');
  const passwordNuevaInput = document.getElementById('password-nueva');
  const passwordConfirmarInput = document.getElementById('password-confirmar');
  const shellPasswordActual = document.getElementById('shell-password-actual');
  const errorPasswordActual = document.getElementById('error-password-actual');
  bindPasswordToggle(document.getElementById('toggle-password-actual'), passwordActualInput);
  bindPasswordToggle(document.getElementById('toggle-password-nueva'), passwordNuevaInput);
  bindPasswordToggle(document.getElementById('toggle-password-confirmar'), passwordConfirmarInput);
  passwordNuevaInput.addEventListener('input', () => {
    aplicarFortalezaPassword(passwordNuevaInput.value, document.getElementById('strength-bars'), document.getElementById('strength-label'));
  });
  passwordConfirmarInput.addEventListener('input', () => limpiarErrorCampo('error-password-confirmar'));

  formPassword.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerPassword, 'warning', '');
    shellPasswordActual.classList.remove('input-shell--error');
    errorPasswordActual.style.display = 'none';
    const camposValidos = validarCamposSilencioso([
      { inputId: 'password-actual', errorId: 'error-password-actual', mensaje: 'Ingresá tu contraseña actual.' },
      { inputId: 'password-nueva', errorId: 'error-password-nueva', mensaje: 'Ingresá una nueva contraseña.' },
      { inputId: 'password-confirmar', errorId: 'error-password-confirmar', mensaje: 'Repetí tu nueva contraseña.' },
    ]);
    if (!camposValidos) {
      scrollAlPrimerError();
      return;
    }
    if (!esPasswordSegura(passwordNuevaInput.value)) {
      mostrarErrorCampo('error-password-nueva', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-password-nueva');
    if (passwordNuevaInput.value !== passwordConfirmarInput.value) {
      mostrarErrorCampo('error-password-confirmar', 'Las contraseñas ingresadas no coinciden.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-password-confirmar');
    setLoading(submitPasswordBtn, 'Guardando...', true);
    try {
      await apiFetch('/auth/cambiar-password', {
        method: 'POST',
        handle401Globally: false,
        body: {
          passwordActual: passwordActualInput.value,
          passwordNueva: passwordNuevaInput.value,
        },
      });
      formPassword.reset();
      clearSesion();
      window.location.href = 'login.html?passwordActualizada=1';
    } catch (error) {
      if (manejarBloqueoPorCambioPassword(error)) {
        return;
      }
      const mapaErrores = { passwordNueva: 'error-password-nueva' };
      if (error instanceof ApiError && error.status === 401) {
        shellPasswordActual.classList.add('input-shell--error');
        errorPasswordActual.textContent = 'La contraseña actual no es correcta.';
        errorPasswordActual.style.display = 'flex';
        const intentosRestantes = error.data && typeof error.data.intentosRestantes === 'number' ? error.data.intentosRestantes : null;
        if (intentosRestantes === 1) {
          renderBanner(bannerPassword, 'warning', 'Cuidado: si fallás 1 vez más, tu cuenta se bloqueará.');
        }
      } else if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, mapaErrores))) {
        renderBanner(bannerPassword, 'error', error instanceof ApiError ? error.message : 'No pudimos cambiar tu contraseña. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(submitPasswordBtn, '', false, 'Guardar nueva contraseña');
    }
  });
}
