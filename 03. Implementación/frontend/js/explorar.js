import { apiFetch } from './api.js';
import { renderTopBar, renderBottomNav, renderEmptyState } from './catalogo.js';
import { normalizarCampos } from './validators.js';

function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatearPrecio(valor) {
  const entero = Math.round(Number(valor));
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function renderProductoCard(producto) {
  const card = crear('button', 'explore-product-card');
  card.type = 'button';
  card.setAttribute('data-testid', `producto-item-${producto.id}`);
  card.addEventListener('click', () => {
    window.location.href = `comercio-detalle.html?id=${producto.comercioId}&producto=${producto.id}`;
  });

  const thumbWrapper = crear('div', `explore-product-card__thumb${producto.estado === 'AGOTADO' ? ' explore-product-card__thumb--agotado' : ''}`);
  const principal = producto.imagenes.find((imagen) => imagen.esPrincipal) || producto.imagenes[0];
  if (principal) {
    const img = document.createElement('img');
    img.src = principal.url;
    img.alt = '';
    thumbWrapper.appendChild(img);
  }
  card.appendChild(thumbWrapper);

  const body = crear('div', 'explore-product-card__body');

  const nombre = document.createElement('h3');
  nombre.textContent = producto.nombre;
  body.appendChild(nombre);

  const precio = crear('p', 'explore-product-card__price');
  precio.textContent = formatearPrecio(producto.precio);
  body.appendChild(precio);

  const comercio = crear('p', 'explore-product-card__comercio');
  comercio.textContent = producto.nombreComercio;
  body.appendChild(comercio);

  card.appendChild(body);
  return card;
}

const ICON_CHEVRON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const ICON_CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

function construirPaginas(paginaActual, totalPaginas) {
  if (totalPaginas <= 7) {
    const items = [];
    for (let num = 1; num <= totalPaginas; num += 1) {
      items.push({ tipo: 'pagina', num });
    }
    return items;
  }

  const items = [];
  const cercaInicio = paginaActual <= 3;
  const cercaFin = paginaActual >= totalPaginas - 2;

  if (cercaInicio) {
    [1, 2, 3].forEach((num) => items.push({ tipo: 'pagina', num }));
    items.push({ tipo: 'ellipsis' });
    items.push({ tipo: 'pagina', num: totalPaginas });
  } else if (cercaFin) {
    items.push({ tipo: 'pagina', num: 1 });
    items.push({ tipo: 'ellipsis' });
    [totalPaginas - 2, totalPaginas - 1, totalPaginas].forEach((num) => items.push({ tipo: 'pagina', num }));
  } else {
    items.push({ tipo: 'pagina', num: 1 });
    items.push({ tipo: 'ellipsis' });
    [paginaActual - 1, paginaActual, paginaActual + 1].forEach((num) => items.push({ tipo: 'pagina', num }));
    items.push({ tipo: 'ellipsis' });
    items.push({ tipo: 'pagina', num: totalPaginas });
  }

  return items;
}

function renderPaginacion(container, { paginaActual, totalPaginas }, onCambiarPagina) {
  container.innerHTML = '';
  if (totalPaginas <= 1) {
    return;
  }

  const wrapper = crear('div', 'explore-pagination');

  const prevBtn = crear('button', 'explore-pagination__arrow');
  prevBtn.type = 'button';
  prevBtn.setAttribute('data-testid', 'btn-pagina-anterior');
  prevBtn.innerHTML = ICON_CHEVRON_LEFT;
  prevBtn.disabled = paginaActual <= 1;
  prevBtn.addEventListener('click', () => onCambiarPagina(paginaActual - 1));
  wrapper.appendChild(prevBtn);

  construirPaginas(paginaActual, totalPaginas).forEach((item, indice) => {
    if (item.tipo === 'ellipsis') {
      const ellipsis = crear('span', 'explore-pagination__ellipsis');
      ellipsis.setAttribute('data-testid', `pagina-ellipsis-${indice}`);
      ellipsis.textContent = '···';
      wrapper.appendChild(ellipsis);
      return;
    }

    const esActiva = item.num === paginaActual;
    const pageBtn = crear('button', `explore-pagination__page${esActiva ? ' explore-pagination__page--activa' : ''}`);
    pageBtn.type = 'button';
    pageBtn.setAttribute('data-testid', `btn-pagina-${item.num}`);
    pageBtn.textContent = String(item.num);
    if (esActiva) {
      pageBtn.setAttribute('aria-current', 'page');
    } else {
      pageBtn.addEventListener('click', () => onCambiarPagina(item.num));
    }
    wrapper.appendChild(pageBtn);
  });

  const nextBtn = crear('button', 'explore-pagination__arrow');
  nextBtn.type = 'button';
  nextBtn.setAttribute('data-testid', 'btn-pagina-siguiente');
  nextBtn.innerHTML = ICON_CHEVRON_RIGHT;
  nextBtn.disabled = paginaActual >= totalPaginas;
  nextBtn.addEventListener('click', () => onCambiarPagina(paginaActual + 1));
  wrapper.appendChild(nextBtn);

  container.appendChild(wrapper);
}

export async function initExplorar() {
  const topBarSlot = document.getElementById('top-bar-slot');
  renderTopBar(topBarSlot, { mostrarPerfil: false, centrarLogo: true });

  const bottomNavSlot = document.getElementById('bottom-nav-slot');
  renderBottomNav(bottomNavSlot, 'explorar');

  const buscadorInput = document.getElementById('buscador-input');
  const chipRowCategorias = document.getElementById('chip-row-categorias');
  const chipRowTags = document.getElementById('chip-row-tags');
  const listContainer = document.getElementById('producto-list');
  const paginationSlot = document.getElementById('pagination-slot');

  const filtros = await apiFetch('/catalogo/filtros', { auth: false });

  let categoriaActiva = null;
  const tagsActivos = new Set();
  let busqueda = '';
  let paginaActual = 1;
  let busquedaTimeoutId = null;
  let solicitudActual = 0;

  async function cargarYPintar() {
    const solicitudId = ++solicitudActual;

    const params = new URLSearchParams();
    if (categoriaActiva !== null) params.set('categoriaId', categoriaActiva);
    tagsActivos.forEach((tagId) => params.append('tagIds', tagId));
    if (busqueda) params.set('q', busqueda);
    params.set('pagina', paginaActual);

    const resultado = await apiFetch(`/catalogo/productos?${params.toString()}`, { auth: false });
    resultado.productos.forEach((producto) => normalizarCampos(producto, ['nombre', 'nombreComercio']));

    if (solicitudId !== solicitudActual) {
      return;
    }

    listContainer.innerHTML = '';
    paginationSlot.innerHTML = '';

    const hayFiltrosActivos = busqueda || categoriaActiva !== null || tagsActivos.size > 0;

    if (resultado.totalProductos === 0) {
      const titulo = hayFiltrosActivos ? 'Sin resultados' : 'Todavía no hay productos disponibles';
      const texto = hayFiltrosActivos
        ? 'Probá con otro filtro o con otra búsqueda para ver más productos.'
        : 'Estamos incorporando negocios locales en Tierra del Fuego. Volvé a revisar pronto.';
      renderEmptyState(listContainer, titulo, texto);
      return;
    }

    listContainer.className = 'comercio-list';
    resultado.productos.forEach((producto) => listContainer.appendChild(renderProductoCard(producto)));

    renderPaginacion(paginationSlot, resultado, (nuevaPagina) => {
      paginaActual = nuevaPagina;
      cargarYPintar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function pintarChipsCategorias() {
    chipRowCategorias.innerHTML = '';

    const chipTodas = crear('button', 'chip');
    chipTodas.type = 'button';
    chipTodas.setAttribute('data-testid', 'chip-categoria-todas');
    chipTodas.textContent = 'Todas';
    chipTodas.setAttribute('aria-pressed', String(categoriaActiva === null));
    chipTodas.addEventListener('click', () => {
      categoriaActiva = null;
      paginaActual = 1;
      pintarChipsCategorias();
      cargarYPintar();
    });
    chipRowCategorias.appendChild(chipTodas);

    filtros.categorias.forEach((categoria) => {
      const chip = crear('button', 'chip');
      chip.type = 'button';
      chip.textContent = categoria.nombre;
      chip.setAttribute('data-testid', `chip-categoria-${categoria.id}`);
      chip.setAttribute('aria-pressed', String(categoriaActiva === categoria.id));
      chip.addEventListener('click', () => {
        categoriaActiva = categoriaActiva === categoria.id ? null : categoria.id;
        paginaActual = 1;
        pintarChipsCategorias();
        cargarYPintar();
      });
      chipRowCategorias.appendChild(chip);
    });
  }

  function pintarChipsTags() {
    chipRowTags.innerHTML = '';

    filtros.tags.forEach((tag) => {
      const chip = crear('button', 'chip');
      chip.type = 'button';
      chip.textContent = tag.nombre;
      chip.setAttribute('data-testid', `chip-tag-${tag.id}`);
      chip.setAttribute('aria-pressed', String(tagsActivos.has(tag.id)));
      chip.addEventListener('click', () => {
        if (tagsActivos.has(tag.id)) {
          tagsActivos.delete(tag.id);
        } else {
          tagsActivos.add(tag.id);
        }
        paginaActual = 1;
        pintarChipsTags();
        cargarYPintar();
      });
      chipRowTags.appendChild(chip);
    });
  }

  buscadorInput.addEventListener('input', () => {
    clearTimeout(busquedaTimeoutId);
    busquedaTimeoutId = setTimeout(() => {
      busqueda = buscadorInput.value.trim().toLowerCase();
      paginaActual = 1;
      cargarYPintar();
    }, 300);
  });

  pintarChipsCategorias();
  pintarChipsTags();
  await cargarYPintar();
}
