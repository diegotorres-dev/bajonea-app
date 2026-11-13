const USOS = {
  avatar: 160,
  miniatura: 240,
  tarjeta: 640,
  galeria: 960,
  zoom: 1600,
};

const PATRON_CLOUDINARY = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/;

export function urlImagen(url, uso = 'tarjeta') {
  if (typeof url !== 'string') {
    return url;
  }
  const partes = PATRON_CLOUDINARY.exec(url);
  if (!partes) {
    return url;
  }
  const ancho = USOS[uso] || USOS.tarjeta;
  return `${partes[1]}f_auto,q_auto,c_limit,w_${ancho}/${partes[2]}`;
}

export function pintarImagen(img, url, { uso = 'tarjeta', diferida = false } = {}) {
  if (diferida) {
    img.loading = 'lazy';
    img.decoding = 'async';
  }
  img.src = urlImagen(url, uso);
  return img;
}

export function pintarImagenResponsiva(img, url, { uso = 'miniatura', usoGrande = 'tarjeta', tamanos, diferida = false } = {}) {
  pintarImagen(img, url, { uso, diferida });
  if (typeof url === 'string' && PATRON_CLOUDINARY.test(url)) {
    img.srcset = `${urlImagen(url, uso)} ${USOS[uso]}w, ${urlImagen(url, usoGrande)} ${USOS[usoGrande]}w`;
    if (tamanos) {
      img.sizes = tamanos;
    }
  }
  return img;
}
