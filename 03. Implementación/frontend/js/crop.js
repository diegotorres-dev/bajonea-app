function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function cargarImagen(origen) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (origen.url) {
      img.crossOrigin = 'anonymous';
      img.src = origen.url;
    } else {
      img.src = URL.createObjectURL(origen.file);
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No pudimos cargar la imagen.'));
  });
}

export function abrirEditorRecorte({ origen, aspectRatio, onConfirmar, onCancelar }) {
  const frameW = aspectRatio >= 1 ? 320 : Math.round(320 * aspectRatio);
  const frameH = Math.round(frameW / aspectRatio);

  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-recorte-imagen');
  const sheet = crear('div', 'crop-modal');
  sheet.innerHTML = `
    <h2 class="title-md">Ajustá el encuadre</h2>
    <p class="subtitle">Arrastrá para mover y usá el control para hacer zoom.</p>
    <div class="crop-stage" style="width:${frameW}px;height:${frameH}px;">
      <canvas class="crop-canvas" width="${frameW}" height="${frameH}" data-testid="canvas-recorte"></canvas>
    </div>
    <input type="range" class="crop-zoom" min="1" max="3" step="0.01" value="1" data-testid="input-zoom-recorte" />
    <div class="crop-actions">
      <button type="button" class="btn btn-tertiary" id="crop-cancelar" data-testid="btn-cancelar-recorte">Cancelar</button>
      <button type="button" class="btn btn-primary" id="crop-confirmar" data-testid="btn-confirmar-recorte">Confirmar</button>
    </div>
  `;
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const canvas = sheet.querySelector('.crop-canvas');
  const ctx = canvas.getContext('2d');
  const zoomInput = sheet.querySelector('.crop-zoom');
  const cancelarBtn = sheet.querySelector('#crop-cancelar');
  const confirmarBtn = sheet.querySelector('#crop-confirmar');

  let img = null;
  let baseScale = 1;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let arrastrando = false;
  let inicioPointerX = 0;
  let inicioPointerY = 0;
  let inicioOffsetX = 0;
  let inicioOffsetY = 0;

  function limites(scale) {
    return {
      minX: frameW - img.naturalWidth * scale,
      maxX: 0,
      minY: frameH - img.naturalHeight * scale,
      maxY: 0,
    };
  }

  function clamp(valor, minimo, maximo) {
    return Math.min(Math.max(valor, minimo), maximo);
  }

  function dibujar() {
    const scale = baseScale * zoom;
    const { minX, maxX, minY, maxY } = limites(scale);
    offsetX = clamp(offsetX, minX, maxX);
    offsetY = clamp(offsetY, minY, maxY);
    ctx.clearRect(0, 0, frameW, frameH);
    ctx.drawImage(img, offsetX, offsetY, img.naturalWidth * scale, img.naturalHeight * scale);
  }

  function cerrar() {
    backdrop.remove();
  }

  cancelarBtn.addEventListener('click', () => {
    cerrar();
    if (onCancelar) onCancelar();
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      cerrar();
      if (onCancelar) onCancelar();
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    arrastrando = true;
    inicioPointerX = event.clientX;
    inicioPointerY = event.clientY;
    inicioOffsetX = offsetX;
    inicioOffsetY = offsetY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!arrastrando) return;
    offsetX = inicioOffsetX + (event.clientX - inicioPointerX);
    offsetY = inicioOffsetY + (event.clientY - inicioPointerY);
    dibujar();
  });
  canvas.addEventListener('pointerup', () => {
    arrastrando = false;
  });
  canvas.addEventListener('pointercancel', () => {
    arrastrando = false;
  });

  zoomInput.addEventListener('input', () => {
    const centroX = frameW / 2;
    const centroY = frameH / 2;
    const puntoImagenX = (centroX - offsetX) / (baseScale * zoom);
    const puntoImagenY = (centroY - offsetY) / (baseScale * zoom);
    zoom = Number(zoomInput.value);
    offsetX = centroX - puntoImagenX * baseScale * zoom;
    offsetY = centroY - puntoImagenY * baseScale * zoom;
    dibujar();
  });

  confirmarBtn.addEventListener('click', () => {
    const scale = baseScale * zoom;
    const sourceX = -offsetX / scale;
    const sourceY = -offsetY / scale;
    const sourceW = frameW / scale;
    const sourceH = frameH / scale;

    const outputW = Math.min(1200, Math.round(sourceW));
    const outputH = Math.round(outputW / aspectRatio);

    const salida = document.createElement('canvas');
    salida.width = outputW;
    salida.height = outputH;
    const salidaCtx = salida.getContext('2d');
    salidaCtx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, outputW, outputH);

    salida.toBlob((blob) => {
      cerrar();
      onConfirmar(blob);
    }, 'image/jpeg', 0.92);
  });

  cargarImagen(origen).then((imagenCargada) => {
    img = imagenCargada;
    baseScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
    zoom = 1;
    offsetX = (frameW - img.naturalWidth * baseScale) / 2;
    offsetY = (frameH - img.naturalHeight * baseScale) / 2;
    dibujar();
  }).catch(() => {
    cerrar();
    if (onCancelar) onCancelar();
  });
}
