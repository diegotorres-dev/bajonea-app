const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

export function crearInputOtp(container, { onComplete } = {}) {
  container.innerHTML = '';
  container.classList.add('otp-row');

  const boxes = [];
  const inputs = [];

  for (let i = 0; i < 6; i += 1) {
    const box = document.createElement('div');
    box.className = 'otp-box';

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = i === 0 ? 'one-time-code' : 'off';
    input.maxLength = 1;
    input.className = 'otp-input';
    input.setAttribute('aria-label', `Dígito ${i + 1} del código`);
    input.setAttribute('data-testid', `input-codigo-digito-${i + 1}`);

    const check = document.createElement('span');
    check.className = 'otp-box__check';
    check.innerHTML = CHECK_ICON;

    box.appendChild(input);
    box.appendChild(check);
    container.appendChild(box);

    boxes.push(box);
    inputs.push(input);
  }

  let ultimoValorNotificado = null;

  function valor() {
    return inputs.map((input) => input.value).join('');
  }

  function limpiarEstados() {
    boxes.forEach((box) => box.classList.remove('otp-box--error', 'otp-box--exito'));
  }

  function actualizarEstado() {
    const valorActual = valor();
    const completo = valorActual.length === 6;
    if (completo && valorActual !== ultimoValorNotificado) {
      ultimoValorNotificado = valorActual;
      if (onComplete) {
        onComplete(valorActual);
      }
    } else if (!completo) {
      ultimoValorNotificado = null;
    }
  }

  inputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      limpiarEstados();
      if (input.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
      actualizarEstado();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (event) => {
      event.preventDefault();
      const pegado = (event.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!pegado) {
        return;
      }
      limpiarEstados();
      pegado.split('').forEach((digito, i) => {
        if (inputs[i]) {
          inputs[i].value = digito;
        }
      });
      inputs[Math.min(pegado.length, inputs.length - 1)].focus();
      actualizarEstado();
    });
  });

  return {
    getValor: valor,
    focus() {
      inputs[0].focus();
    },
    reset() {
      ultimoValorNotificado = null;
      inputs.forEach((input) => {
        input.value = '';
      });
      limpiarEstados();
      inputs[0].focus();
    },
    marcarError() {
      boxes.forEach((box) => {
        box.classList.remove('otp-box--exito');
        box.classList.add('otp-box--error');
      });
    },
    marcarExito() {
      boxes.forEach((box) => {
        box.classList.remove('otp-box--error');
        box.classList.add('otp-box--exito');
      });
    },
    setDisabled(disabled) {
      inputs.forEach((input) => {
        input.disabled = disabled;
      });
    },
  };
}
