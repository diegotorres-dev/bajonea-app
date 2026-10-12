import { apiFetch, ApiError, clearSesion } from './api.js';
import { construirTelefono, bindNombreUsuario } from './auth.js';
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
import { showToast, manejarBloqueoPorCambioPassword } from './catalogo.js';

const ICONS = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

export function renderBanner(slot, kind, texto) {
  slot.replaceChildren();
  if (!texto) {
    return;
  }
  const banner = document.createElement('div');
  banner.className = `banner banner-${kind}`;
  banner.style.marginBottom = '20px';
  const icono = document.createElement('span');
  icono.innerHTML = ICONS[kind] || ICONS.warning;
  const contenido = document.createElement('div');
  contenido.textContent = texto;
  banner.append(icono.firstElementChild, contenido);
  slot.appendChild(banner);
}

export function setLoading(button, loadingText, isLoading, originalHtml) {
  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = loadingText;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalHtml || originalHtml;
    button.disabled = false;
  }
}

export function bindPasswordToggle(toggleBtn, input) {
  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}


function mostrarModalConfirmarNombreUsuario({ onConfirmar, onErrorNoPassword }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-testid', 'modal-confirmar-nombre-usuario');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon">${ICONS.lock}</div>
      <h2 class="modal-sheet__title">Confirmá tu contraseña</h2>
      <p class="modal-sheet__text">Por seguridad, ingresá tu contraseña para confirmar el cambio de nombre de usuario.</p>
      <div class="field" style="width:100%;">
        <div class="input-shell" id="shell-password-confirmar-nombre-usuario">
          <input type="password" id="password-confirmar-nombre-usuario" placeholder="Tu contraseña actual" data-testid="input-password-confirmar-nombre-usuario" />
          <button type="button" class="input-shell__toggle" id="toggle-password-confirmar-nombre-usuario" aria-label="Mostrar contraseña" data-testid="btn-mostrar-password-confirmar-nombre-usuario">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div class="field__error" id="error-password-confirmar-nombre-usuario" style="display:none;" data-testid="mensaje-error-password-confirmar-nombre-usuario"></div>
        <p class="field__warning" id="warning-bloqueo-confirmar-nombre-usuario" style="display:none;" data-testid="mensaje-advertencia-bloqueo-confirmar-nombre-usuario">Cuidado: si fallás una vez más, tu cuenta se bloqueará.</p>
      </div>
      <button class="btn btn-primary" type="button" id="confirmar-nombre-usuario-btn" style="width:100%;margin-bottom:12px;margin-top:8px;" data-testid="btn-confirmar-nombre-usuario">Confirmar</button>
      <button class="btn btn-tertiary" type="button" id="cancelar-nombre-usuario-btn" style="width:100%;" data-testid="btn-cancelar-nombre-usuario">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);

  const passwordInput = document.getElementById('password-confirmar-nombre-usuario');
  const shell = document.getElementById('shell-password-confirmar-nombre-usuario');
  const errorEl = document.getElementById('error-password-confirmar-nombre-usuario');
  const warningBloqueo = document.getElementById('warning-bloqueo-confirmar-nombre-usuario');
  const confirmarBtn = document.getElementById('confirmar-nombre-usuario-btn');
  bindPasswordToggle(document.getElementById('toggle-password-confirmar-nombre-usuario'), passwordInput);

  function cerrar() {
    backdrop.remove();
  }

  document.getElementById('cancelar-nombre-usuario-btn').addEventListener('click', cerrar);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      cerrar();
    }
  });

  confirmarBtn.addEventListener('click', async () => {
    shell.classList.remove('input-shell--error');
    errorEl.style.display = 'none';
    warningBloqueo.style.display = 'none';
    if (!passwordInput.value) {
      shell.classList.add('input-shell--error');
      errorEl.textContent = 'Ingresá tu contraseña actual.';
      errorEl.style.display = 'flex';
      return;
    }
    setLoading(confirmarBtn, 'Confirmando...', true);
    try {
      await onConfirmar(passwordInput.value);
      cerrar();
    } catch (error) {
      if (manejarBloqueoPorCambioPassword(error)) {
        cerrar();
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        shell.classList.add('input-shell--error');
        errorEl.textContent = 'La contraseña actual no es correcta.';
        errorEl.style.display = 'flex';
        const intentosRestantes = error.data && typeof error.data.intentosRestantes === 'number' ? error.data.intentosRestantes : null;
        if (intentosRestantes === 1) {
          warningBloqueo.style.display = 'block';
        }
      } else {
        cerrar();
        onErrorNoPassword(error);
      }
    } finally {
      if (document.body.contains(backdrop)) {
        setLoading(confirmarBtn, '', false, 'Confirmar');
      }
    }
  });
}

export function enlazarEdicionDatosPersonales({ cliente, mostrarVista, alActualizarDatos }) {
  const nombreUsuarioCtl = bindNombreUsuario({ inputId: 'editar-nombre-usuario', valorOriginal: () => cliente.nombreUsuario });

  document.getElementById('editar-datos-link').addEventListener('click', () => {
    document.getElementById('editar-nombre').value = cliente.nombre;
    document.getElementById('editar-apellido').value = cliente.apellido;
    document.getElementById('editar-telefono').value = cliente.telefono.replace(/^\+549/, '');
    document.getElementById('editar-nombre-usuario').value = cliente.nombreUsuario;
    nombreUsuarioCtl.reiniciar();
    document.getElementById('editar-email').value = cliente.email;
    document.getElementById('editar-dni').value = cliente.dni;
    renderBanner(document.getElementById('editar-banner-slot'), 'warning', '');
    mostrarVista('view-editar-datos');
  });

  const editarTelefonoInput = document.getElementById('editar-telefono');
  editarTelefonoInput.addEventListener('input', () => {
    editarTelefonoInput.value = editarTelefonoInput.value.replace(/\D/g, '').slice(0, 10);
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
    const nombreUsuarioValido = await nombreUsuarioCtl.validarParaContinuar();
    if (!camposValidos || !nombreUsuarioValido) {
      scrollAlPrimerError();
      return;
    }
    setLoading(submitEditarBtn, 'Guardando...', true);
    let guardadoOk = false;
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
      alActualizarDatos(actualizado);
      guardadoOk = true;
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
    if (!guardadoOk) {
      return;
    }
    if (!nombreUsuarioCtl.haCambiado()) {
      mostrarVista('view-principal');
      showToast('Datos actualizados correctamente');
      return;
    }
    const nuevoNombreUsuario = document.getElementById('editar-nombre-usuario').value.trim().toLowerCase();
    mostrarModalConfirmarNombreUsuario({
      onConfirmar: async (password) => {
        const actualizado = await apiFetch('/clientes/perfil/nombre-usuario', {
          method: 'PUT',
          handle401Globally: false,
          body: { nombreUsuario: nuevoNombreUsuario, passwordActual: password },
        });
        cliente.nombreUsuario = actualizado.nombreUsuario;
        mostrarVista('view-principal');
        showToast('Nombre de usuario actualizado correctamente');
      },
      onErrorNoPassword: (error) => {
        mostrarVista('view-editar-datos');
        const mapaErrores = { nombreUsuario: 'error-editar-nombre-usuario' };
        if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, mapaErrores))) {
          renderBanner(bannerEditar, 'error', error instanceof ApiError ? error.message : 'No pudimos actualizar tu nombre de usuario. Intentá nuevamente.');
        }
        scrollAlPrimerError();
      },
    });
  });
}

export function enlazarCambioPassword({ mostrarVista }) {
  document.getElementById('cambiar-password-link').addEventListener('click', () => {
    document.getElementById('form-cambiar-password').reset();
    renderBanner(document.getElementById('password-banner-slot'), 'warning', '');
    mostrarVista('view-cambiar-password');
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
          renderBanner(bannerPassword, 'warning', 'Cuidado: si fallás una vez más, tu cuenta se bloqueará.');
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
