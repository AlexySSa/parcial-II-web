import {
  addCardToCart,
  applyTheme,
  createMessageController,
  escapeHtml,
  formatCurrency,
  formatDate,
  getCartCards,
  getCartTotal,
  getOwnedCards,
  isCardInCart,
  isCardOwned,
  labelType,
  loadCards,
  loadCart,
  loadConfig,
  loadPurchases,
  loadThemePreference,
  pruneCart,
  removeCardFromCart,
  saveCart,
  toggleTheme,
  wireImageFallbacks
} from "./shared.js";

const state = {
  cards: [],
  config: {
    paypalCurrency: "USD",
    pokemonLimit: 30
  },
  purchases: loadPurchases(),
  cart: loadCart(),
  filters: {
    search: "",
    type: "all",
    view: "all"
  },
  theme: loadThemePreference(),
  catalogLoaded: false
};

const dom = {};
let message = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  message = createMessageController(dom.messageBanner);
  applyTheme(state.theme, dom.themeToggle);
  bindEvents();
  message.show("Cargando coleccion desde la PokeAPI...", "info");

  try {
    state.config = await loadConfig();
    state.cards = await loadCards(state.config.pokemonLimit);
    state.cart = pruneCart(state.cart, state.purchases);
    saveCart(state.cart);
    populateTypeFilter();
    state.catalogLoaded = true;
    renderAll();
    message.show("Catalogo listo. Agrega cartas al carrito para comprarlas en una pagina aparte.", "success");
  } catch (error) {
    state.catalogLoaded = true;
    renderAll();
    message.show(error.message || "No se pudo cargar el catalogo.", "error");
  }
}

function cacheDom() {
  dom.messageBanner = document.querySelector("#message-banner");
  dom.themeToggle = document.querySelector("#theme-toggle");
  dom.searchInput = document.querySelector("#search-input");
  dom.typeFilter = document.querySelector("#type-filter");
  dom.viewFilter = document.querySelector("#view-filter");
  dom.cardGrid = document.querySelector("#card-grid");
  dom.emptyState = document.querySelector("#empty-state");
  dom.catalogSummary = document.querySelector("#catalog-summary");
  dom.totalCount = document.querySelector("#total-count");
  dom.cartCount = document.querySelector("#cart-count");
  dom.ownedCount = document.querySelector("#owned-count");
  dom.cartTotal = document.querySelector("#cart-total");
  dom.ownedList = document.querySelector("#owned-list");
  dom.ownedEmpty = document.querySelector("#owned-empty");
  dom.loadingGrid = document.querySelector("#loading-grid");
  dom.cartCountBadges = document.querySelectorAll("[data-cart-count]");
}

function bindEvents() {
  dom.themeToggle?.addEventListener("click", () => {
    state.theme = toggleTheme(state.theme, dom.themeToggle);
  });

  dom.searchInput?.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderCatalog();
  });

  dom.typeFilter?.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderCatalog();
  });

  dom.viewFilter?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");

    if (!button) {
      return;
    }

    state.filters.view = button.dataset.view;
    dom.viewFilter.querySelectorAll("button").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    renderCatalog();
  });

  dom.cardGrid?.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-cart]");
    const removeButton = event.target.closest("[data-remove-cart]");

    if (addButton) {
      handleAddToCart(Number(addButton.dataset.addCart));
      return;
    }

    if (removeButton) {
      handleRemoveFromCart(Number(removeButton.dataset.removeCart));
    }
  });
}

function handleAddToCart(cardId) {
  const card = state.cards.find((item) => item.id === cardId);

  if (!card || isCardOwned(state.purchases, cardId)) {
    return;
  }

  state.cart = addCardToCart(state.cart, cardId);
  saveCart(state.cart);
  renderAll();
  message.show(`${card.name} fue agregado al carrito.`, "success");
}

function handleRemoveFromCart(cardId) {
  const card = state.cards.find((item) => item.id === cardId);

  state.cart = removeCardFromCart(state.cart, cardId);
  saveCart(state.cart);
  renderAll();

  if (card) {
    message.show(`${card.name} fue retirado del carrito.`, "warning");
  }
}

function populateTypeFilter() {
  if (!dom.typeFilter) {
    return;
  }

  const types = [...new Set(state.cards.flatMap((card) => card.types))].sort();

  dom.typeFilter.innerHTML = `
    <option value="all">Todos</option>
    ${types.map((type) => `<option value="${type}">${labelType(type)}</option>`).join("")}
  `;
}

function renderAll() {
  renderCatalog();
  renderOwnedList();
  renderStats();
}

function renderCatalog() {
  if (!dom.cardGrid) {
    return;
  }

  dom.loadingGrid.hidden = state.catalogLoaded;

  const filteredCards = getFilteredCards();
  dom.cardGrid.innerHTML = filteredCards.map(renderCard).join("");
  wireImageFallbacks(dom.cardGrid);

  if (dom.emptyState) {
    dom.emptyState.hidden = filteredCards.length > 0;
  }

  if (dom.catalogSummary) {
    dom.catalogSummary.textContent = `${filteredCards.length} carta${filteredCards.length === 1 ? "" : "s"} en esta vista`;
  }
}

function renderCard(card) {
  const owned = isCardOwned(state.purchases, card.id);
  const inCart = isCardInCart(state.cart, card.id);
  const typeChips = card.types.map((type) => `<span class="type-chip">${labelType(type)}</span>`).join("");
  const statusLabel = owned ? "Comprada" : inCart ? "En carrito" : "Disponible";
  const statusClass = owned ? "state-badge--owned" : inCart ? "state-badge--cart" : "state-badge--locked";
  const actionMarkup = owned
    ? `<span class="owned-label">Ya desbloqueada</span>`
    : inCart
      ? `
        <button class="secondary-button" type="button" data-remove-cart="${card.id}">Quitar</button>
        <a class="select-button select-button--link" href="/cart.html">Ir al carrito</a>
      `
      : `<button class="select-button" type="button" data-add-cart="${card.id}">Agregar</button>`;

  return `
    <article class="pokemon-card ${owned ? "is-owned" : ""} ${inCart ? "is-carted" : ""}" data-type="${card.primaryType}">
      <div class="pokemon-card__top">
        <span class="id-badge">#${String(card.id).padStart(3, "0")}</span>
        <span class="state-badge ${statusClass}">${statusLabel}</span>
      </div>

      <div class="pokemon-card__media">
        <img class="pokemon-art" src="${card.image}" alt="Carta de ${escapeHtml(card.name)}" loading="lazy" data-fallback-src="${card.fallbackImage}" />
      </div>

      <div class="pokemon-card__body">
        <h3>${escapeHtml(card.name)}</h3>
        <p>${escapeHtml(card.rarity)} · ${card.hp} HP · ${escapeHtml(card.typeLabel)}</p>
        <div class="type-row">${typeChips}</div>
        <p class="pokemon-card__description">${escapeHtml(card.description)}</p>
      </div>

      <div class="pokemon-card__footer">
        <strong class="price-tag">${formatCurrency(card.price, state.config.paypalCurrency)}</strong>
        <div class="card-actions">${actionMarkup}</div>
      </div>
    </article>
  `;
}

function renderOwnedList() {
  if (!dom.ownedList) {
    return;
  }

  const ownedCards = getOwnedCards(state.cards, state.purchases).sort((left, right) => {
    const leftDate = state.purchases[String(left.id)]?.purchasedAt || "";
    const rightDate = state.purchases[String(right.id)]?.purchasedAt || "";
    return rightDate.localeCompare(leftDate);
  });

  dom.ownedList.innerHTML = ownedCards
    .map((card) => {
      const purchaseInfo = state.purchases[String(card.id)];

      return `
        <article class="owned-item" data-type="${card.primaryType}">
          <div class="owned-item__thumb">
            <img class="pokemon-art" src="${card.image}" alt="Carta comprada de ${escapeHtml(card.name)}" loading="lazy" data-fallback-src="${card.fallbackImage}" />
          </div>
          <div>
            <h3>${escapeHtml(card.name)}</h3>
            <p>${escapeHtml(card.typeLabel)} · ${formatCurrency(card.price, state.config.paypalCurrency)}</p>
            <div class="owned-item__meta">
              <span class="meta-pill">${escapeHtml(card.rarity)}</span>
              <span class="meta-pill">${formatDate(purchaseInfo?.purchasedAt)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  wireImageFallbacks(dom.ownedList);

  if (dom.ownedEmpty) {
    dom.ownedEmpty.hidden = ownedCards.length > 0;
  }
}

function renderStats() {
  const cartCards = getCartCards(state.cards, state.cart, state.purchases);
  const ownedCards = getOwnedCards(state.cards, state.purchases);
  const cartTotal = getCartTotal(state.cards, state.cart, state.purchases);

  if (dom.totalCount) {
    dom.totalCount.textContent = String(state.cards.length);
  }
  if (dom.cartCount) {
    dom.cartCount.textContent = String(cartCards.length);
  }
  if (dom.ownedCount) {
    dom.ownedCount.textContent = String(ownedCards.length);
  }
  if (dom.cartTotal) {
    dom.cartTotal.textContent = formatCurrency(cartTotal, state.config.paypalCurrency);
  }

  dom.cartCountBadges.forEach((badge) => {
    badge.textContent = String(cartCards.length);
  });
}

function getFilteredCards() {
  return state.cards.filter((card) => {
    const matchesSearch = !state.filters.search || card.name.toLowerCase().includes(state.filters.search);
    const matchesType = state.filters.type === "all" || card.types.includes(state.filters.type);
    const owned = isCardOwned(state.purchases, card.id);
    const inCart = isCardInCart(state.cart, card.id);
    const matchesView =
      state.filters.view === "all" ||
      (state.filters.view === "available" && !owned) ||
      (state.filters.view === "cart" && inCart) ||
      (state.filters.view === "owned" && owned);

    return matchesSearch && matchesType && matchesView;
  });
}
