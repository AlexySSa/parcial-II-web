const STORAGE_KEY = "pokecards-market-purchases";
const THEME_KEY = "pokecards-market-theme";

const TYPE_LABELS = {
  bug: "Bicho",
  dark: "Siniestro",
  dragon: "Dragón",
  electric: "Eléctrico",
  fairy: "Hada",
  fighting: "Lucha",
  fire: "Fuego",
  flying: "Volador",
  ghost: "Fantasma",
  grass: "Planta",
  ground: "Tierra",
  ice: "Hielo",
  normal: "Normal",
  poison: "Veneno",
  psychic: "Psíquico",
  rock: "Roca",
  steel: "Acero",
  water: "Agua"
};

const state = {
  cards: [],
  config: {
    paypalClientId: "sb",
    paypalCurrency: "USD",
    pokemonLimit: 30
  },
  purchases: loadPurchases(),
  filters: {
    search: "",
    type: "all",
    view: "all"
  },
  selectedCardId: null,
  modalOpen: false,
  sdkLoaded: false,
  sdkError: "",
  paypalButtons: null,
  theme: loadThemePreference()
};

const dom = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  applyTheme(state.theme);
  bindEvents();
  showMessage("Cargando colección desde PokéAPI...", "info");

  await loadConfig();
  await Promise.allSettled([loadPayPalSdk(), loadCards()]);

  renderAll();

  if (state.cards.length) {
    showMessage("Colección lista. Selecciona una carta para comprarla con PayPal Sandbox.", "success");
  }
}

function cacheDom() {
  dom.cardGrid = document.querySelector("#card-grid");
  dom.catalogSummary = document.querySelector("#catalog-summary");
  dom.detailPanel = document.querySelector("#detail-panel");
  dom.emptyState = document.querySelector("#empty-state");
  dom.loadingGrid = document.querySelector("#loading-grid");
  dom.messageBanner = document.querySelector("#message-banner");
  dom.ownedList = document.querySelector("#owned-list");
  dom.ownedEmpty = document.querySelector("#owned-empty");
  dom.totalCount = document.querySelector("#total-count");
  dom.ownedCount = document.querySelector("#owned-count");
  dom.spentTotal = document.querySelector("#spent-total");
  dom.searchInput = document.querySelector("#search-input");
  dom.typeFilter = document.querySelector("#type-filter");
  dom.viewFilter = document.querySelector("#view-filter");
  dom.themeToggle = document.querySelector("#theme-toggle");
  dom.cardModal = document.querySelector("#card-modal");
  dom.ownedSection = document.querySelector("#owned-section");
}

function bindEvents() {
  dom.themeToggle?.addEventListener("click", toggleTheme);

  dom.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderCatalog();
  });

  dom.typeFilter.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderCatalog();
  });

  dom.viewFilter.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) {
      return;
    }

    state.filters.view = button.dataset.view;
    dom.viewFilter.querySelectorAll("button").forEach((element) => {
      element.classList.toggle("is-active", element === button);
    });
    renderCatalog();
  });

  dom.cardGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-card]");
    if (!button) {
      return;
    }

    selectCard(Number(button.dataset.selectCard), true);
  });

  dom.detailPanel.addEventListener("click", (event) => {
    const closeButton = event.target.closest("[data-scroll-owned]");
    if (closeButton) {
      closeCardModal();
      dom.ownedSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const button = event.target.closest("[data-owned-card]");
    if (!button) {
      return;
    }

    selectCard(Number(button.dataset.ownedCard), true);
  });

  dom.ownedList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-owned-card]");
    if (!button) {
      return;
    }

    selectCard(Number(button.dataset.ownedCard), true);
  });

  dom.cardModal?.addEventListener("click", (event) => {
    if (event.target === dom.cardModal || event.target.closest("[data-close-modal]")) {
      closeCardModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.modalOpen) {
      closeCardModal();
    }
  });
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("No pudimos cargar la configuración local.");
    }

    const config = await response.json();
    state.config = {
      paypalClientId: config.paypalClientId || "sb",
      paypalCurrency: config.paypalCurrency || "USD",
      pokemonLimit: Number(config.pokemonLimit || 30)
    };
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadPayPalSdk() {
  const clientId = state.config.paypalClientId || "sb";
  const currency = state.config.paypalCurrency || "USD";

  try {
    await injectScript(
      `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons&disable-funding=card`
    );
    state.sdkLoaded = Boolean(window.paypal);
  } catch (error) {
    state.sdkError = "No se pudo cargar el SDK de PayPal. Verifica tu conexión o el Client ID sandbox.";
    showMessage(state.sdkError, "error");
  }
}

async function loadCards() {
  dom.loadingGrid.hidden = false;

  try {
    const limit = Math.max(25, state.config.pokemonLimit || 30);
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${limit}`);

    if (!response.ok) {
      throw new Error("No fue posible consultar la PokéAPI.");
    }

    const data = await response.json();
    const detailResponses = await Promise.allSettled(
      data.results.map(async (pokemon) => {
        const detailResponse = await fetch(pokemon.url);
        if (!detailResponse.ok) {
          throw new Error(`No fue posible cargar el detalle de ${pokemon.name}.`);
        }
        return detailResponse.json();
      })
    );

    state.cards = detailResponses
      .filter((result) => result.status === "fulfilled")
      .map((result) => normalizeCard(result.value))
      .sort((a, b) => a.id - b.id);

    if (!state.cards.length) {
      throw new Error("No pudimos construir cartas validas desde PokéAPI.");
    }

    state.selectedCardId = null;
    populateTypeFilter();
  } catch (error) {
    showMessage(error.message, "error");
    dom.catalogSummary.textContent = "No pudimos cargar el catálogo.";
  } finally {
    dom.loadingGrid.hidden = true;
  }
}

function normalizeCard(pokemon) {
  const primaryType = pokemon.types[0]?.type?.name || "normal";
  const translatedTypes = pokemon.types.map((entry) => entry.type.name);
  const hpStat = pokemon.stats.find((stat) => stat.stat.name === "hp")?.base_stat || 50;
  const rarity = getRarity(pokemon.base_experience || 50);
  const fallbackImage = createFallbackArt(capitalize(pokemon.name), primaryType);
  const price = calculatePrice({
    baseExperience: pokemon.base_experience || 50,
    id: pokemon.id,
    typeCount: pokemon.types.length,
    hp: hpStat
  });

  return {
    id: pokemon.id,
    slug: pokemon.name,
    name: capitalize(pokemon.name),
    image: resolveCardImage(pokemon, fallbackImage),
    fallbackImage,
    types: translatedTypes,
    primaryType,
    typeLabel: labelType(primaryType),
    hp: hpStat,
    price,
    rarity,
    description: `${capitalize(pokemon.name)} pertenece al tipo ${labelType(primaryType)} y forma parte de una edición digital ${rarity.toLowerCase()}.`
  };
}

function calculatePrice({ baseExperience, id, typeCount, hp }) {
  const rawPrice = 3.45 + baseExperience * 0.05 + typeCount * 1.65 + (id % 7) * 0.58 + hp * 0.015;
  return Number(rawPrice.toFixed(2));
}

function getRarity(baseExperience) {
  if (baseExperience >= 180) {
    return "Legendaria";
  }
  if (baseExperience >= 110) {
    return "Épica";
  }
  if (baseExperience >= 70) {
    return "Especial";
  }
  return "Clásica";
}

function populateTypeFilter() {
  const types = [...new Set(state.cards.flatMap((card) => card.types))].sort();

  dom.typeFilter.innerHTML = `
    <option value="all">Todos</option>
    ${types
      .map((type) => `<option value="${type}">${labelType(type)}</option>`)
      .join("")}
  `;
}

function renderAll() {
  renderCatalog();
  renderDetailPanel();
  renderOwnedList();
  renderStats();
}

function renderCatalog() {
  const filteredCards = getFilteredCards();

  dom.cardGrid.innerHTML = filteredCards.map(renderCard).join("");
  wireImageFallbacks(dom.cardGrid);
  dom.emptyState.hidden = filteredCards.length > 0;
  dom.catalogSummary.textContent = `${filteredCards.length} carta${filteredCards.length === 1 ? "" : "s"} en esta vista`;

  if (filteredCards.length === 0) {
    state.selectedCardId = null;
  } else if (state.selectedCardId !== null && !filteredCards.some((card) => card.id === state.selectedCardId)) {
    state.selectedCardId = null;
  }

  renderDetailPanel();
  renderStats();
}

function renderCard(card) {
  const owned = isCardOwned(card.id);
  const selected = card.id === state.selectedCardId;
  const typeChips = card.types.map((type) => `<span class="type-chip">${labelType(type)}</span>`).join("");

  return `
    <article class="pokemon-card ${selected ? "is-selected" : ""} ${owned ? "is-owned" : ""}" data-type="${card.primaryType}">
      <div class="pokemon-card__top">
        <span class="id-badge">#${String(card.id).padStart(3, "0")}</span>
        <span class="state-badge ${owned ? "state-badge--owned" : "state-badge--locked"}">
          ${owned ? "Desbloqueada" : "Bloqueada"}
        </span>
      </div>

      <div class="pokemon-card__media">
        <img class="pokemon-art" src="${card.image}" alt="Carta de ${card.name}" loading="lazy" data-fallback-src="${card.fallbackImage}" />
      </div>

      <div class="pokemon-card__body">
        <h3>${card.name}</h3>
        <p>${card.rarity} · ${card.hp} HP · ${card.typeLabel}</p>
        <div class="type-row">${typeChips}</div>
      </div>

      <div class="pokemon-card__footer">
        <strong class="price-tag">${formatCurrency(card.price)}</strong>
        <button class="select-button" type="button" data-select-card="${card.id}">
          ${owned ? "Ver compra" : "Comprar"}
        </button>
      </div>
    </article>
  `;
}

function renderDetailPanel() {
  const card = state.cards.find((item) => item.id === state.selectedCardId);

  if (!card) {
    dom.detailPanel.innerHTML = `
      <div class="detail-panel__placeholder">
        <span class="eyebrow">Selección</span>
        <h3>No has seleccionado ninguna carta</h3>
        <p>Explora el catálogo y presiona comprar para abrir el detalle de la carta que te interese.</p>
      </div>
    `;
    return;
  }

  const owned = isCardOwned(card.id);
  const purchaseInfo = state.purchases[String(card.id)];
  const typeChips = card.types.map((type) => `<span class="type-chip">${labelType(type)}</span>`).join("");

  dom.detailPanel.innerHTML = `
    <div class="detail-panel__content" data-type="${card.primaryType}">
      <span class="eyebrow">Carta seleccionada</span>

      <div class="detail-summary" data-type="${card.primaryType}">
        <div class="detail-panel__hero">
          <div class="detail-artwork">
            <img class="pokemon-art" src="${card.image}" alt="Detalle de ${card.name}" data-fallback-src="${card.fallbackImage}" />
          </div>

          <div class="detail-copy">
            <div class="purchase-summary__title">
              <h3>${card.name}</h3>
              <span class="state-badge ${owned ? "state-badge--owned" : "state-badge--locked"}">
                ${owned ? "Adquirida" : "Disponible"}
              </span>
            </div>
            <p>${card.description}</p>
            <div class="type-row">${typeChips}</div>
            <div class="detail-meta">
              <span class="meta-pill">${card.rarity}</span>
              <span class="meta-pill">${card.hp} HP</span>
              <strong>${formatCurrency(card.price)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="purchase-summary">
        <div class="purchase-summary__title">
          <span class="panel-card__title">Estado de compra</span>
          <span class="meta-pill">${owned ? "Pago validado" : "Pendiente de pago"}</span>
        </div>

        ${
          owned
            ? `
              <div class="purchase-metadata">
                <span class="meta-pill">Comprada el ${formatDate(purchaseInfo.purchasedAt)}</span>
                <span class="meta-pill">Orden ${purchaseInfo.orderId}</span>
              </div>
              <p>
                Compra confirmada${purchaseInfo.payerName ? ` por ${purchaseInfo.payerName}` : ""}. La carta quedó
                desbloqueada y ya aparece en tu sección de compras.
              </p>
              <button class="secondary-button" type="button" data-scroll-owned>Ver en mis compras</button>
            `
            : `
              <div class="payment-method-box">
                <div class="payment-method-box__copy">
                  <span class="eyebrow">Método de pago</span>
                  <h4>Checkout seguro con PayPal</h4>
                  <p>
                    La transacción se autoriza en una ventana segura de PayPal Sandbox. Haz clic en el botón para abrir
                    el checkout y revisar el pedido antes de confirmar el pago.
                  </p>
                  <p>
                    Si el pago falla o se cancela, la carta permanecerá bloqueada.
                  </p>
                </div>

                <div class="payment-method-box__actions">
                  <div class="paypal-slot paypal-slot--steam" id="paypal-slot" data-state="${state.sdkLoaded ? "ready" : "loading"}"></div>
                  ${
                    state.sdkError
                      ? `<p class="payment-method-box__note">${state.sdkError}</p>`
                      : `<p class="payment-method-box__note">Usando PayPal Sandbox en ${state.config.paypalCurrency}. La carta solo se desbloquea si PayPal devuelve la compra como completada.</p>`
                  }
                </div>
              </div>
            `
        }
      </div>
    </div>
  `;

  wireImageFallbacks(dom.detailPanel);

  if (!owned) {
    void mountPayPalButton(card);
  }
}

async function mountPayPalButton(card) {
  const container = document.querySelector("#paypal-slot");

  if (!container) {
    return;
  }

  await destroyPayPalButton();

  if (!state.sdkLoaded || !window.paypal) {
    container.dataset.state = "error";
    container.innerHTML = `
      <p>No fue posible iniciar PayPal Sandbox. Revisa el Client ID o intenta de nuevo con conexión activa.</p>
    `;
    return;
  }

  container.dataset.state = "loading";
  container.innerHTML = "";

  state.paypalButtons = window.paypal.Buttons({
    style: {
      layout: "horizontal",
      color: "gold",
      shape: "rect",
      label: "paypal",
      tagline: false,
      height: 40
    },

    createOrder(_data, actions) {
      showMessage(`Creando orden sandbox para ${card.name}...`, "info");
      return actions.order.create({
        purchase_units: [
          {
            description: `PokéCards Market - ${card.name}`,
            amount: {
              currency_code: state.config.paypalCurrency,
              value: card.price.toFixed(2)
            }
          }
        ],
        application_context: {
          shipping_preference: "NO_SHIPPING"
        }
      });
    },

    async onApprove(_data, actions) {
      try {
        showMessage(`Validando pago de ${card.name}...`, "info");
        const details = await actions.order.capture();
        const validation = validatePurchase(details);

        if (!validation.ok) {
          showMessage(`El pago de ${card.name} no se confirmó correctamente.`, "error");
          return;
        }

        registerPurchase(card, validation, details);
        showMessage(`Compra exitosa: ${card.name} quedó desbloqueada.`, "success");
      } catch (error) {
        console.error(error);
        showMessage(`Ocurrió un error al capturar el pago de ${card.name}.`, "error");
      }
    },

    onCancel() {
      showMessage(`La compra de ${card.name} fue cancelada. La carta sigue bloqueada.`, "warning");
    },

    onError(error) {
      console.error(error);
      showMessage(`El pago de ${card.name} falló y la carta se mantiene bloqueada.`, "error");
    }
  });

  try {
    await state.paypalButtons.render("#paypal-slot");
    container.dataset.state = "ready";
  } catch (error) {
    console.error(error);
    container.dataset.state = "error";
    container.innerHTML = `
      <p>No fue posible renderizar el botón de PayPal para esta carta.</p>
    `;
  }
}

async function destroyPayPalButton() {
  if (state.paypalButtons && typeof state.paypalButtons.close === "function") {
    try {
      await state.paypalButtons.close();
    } catch (_error) {
      // Ignoramos cierres fallidos cuando el usuario cambia de carta rápidamente.
    }
  }

  state.paypalButtons = null;
}

function validatePurchase(details) {
  const capture = details?.purchase_units?.[0]?.payments?.captures?.[0];
  const captureStatus = capture?.status;
  const orderStatus = details?.status;

  if (captureStatus === "COMPLETED" || orderStatus === "COMPLETED") {
    return {
      ok: true,
      captureId: capture?.id || details?.id || "N/A",
      orderId: details?.id || "N/A"
    };
  }

  return { ok: false };
}

function registerPurchase(card, validation, details) {
  const payerName = details?.payer?.name
    ? [details.payer.name.given_name, details.payer.name.surname].filter(Boolean).join(" ")
    : "";

  state.purchases[String(card.id)] = {
    id: card.id,
    name: card.name,
    image: card.image,
    primaryType: card.primaryType,
    price: card.price,
    payerName,
    captureId: validation.captureId,
    orderId: validation.orderId,
    purchasedAt: new Date().toISOString()
  };

  savePurchases();
  renderAll();
}

function renderOwnedList() {
  const ownedCards = getOwnedCards();

  dom.ownedList.innerHTML = ownedCards
    .map((card) => {
      const info = state.purchases[String(card.id)];

      return `
        <button class="owned-item" type="button" data-owned-card="${card.id}" data-type="${card.primaryType}">
          <div class="owned-item__thumb">
            <img class="pokemon-art" src="${card.image}" alt="Carta comprada de ${card.name}" loading="lazy" data-fallback-src="${card.fallbackImage}" />
          </div>
          <div>
            <h3>${card.name}</h3>
            <p>${card.typeLabel} · ${formatCurrency(card.price)}</p>
            <div class="owned-item__meta">
              <span class="meta-pill">${formatDate(info.purchasedAt)}</span>
              <span class="meta-pill">${card.rarity}</span>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  wireImageFallbacks(dom.ownedList);
  dom.ownedEmpty.hidden = ownedCards.length > 0;
}

function renderStats() {
  const ownedCards = getOwnedCards();
  const totalSpent = ownedCards.reduce((sum, card) => sum + (state.purchases[String(card.id)]?.price || 0), 0);

  dom.totalCount.textContent = String(state.cards.length);
  dom.ownedCount.textContent = String(ownedCards.length);
  dom.spentTotal.textContent = formatCurrency(totalSpent);
}

function getFilteredCards() {
  return state.cards.filter((card) => {
    const matchesSearch = !state.filters.search || card.name.toLowerCase().includes(state.filters.search);
    const matchesType = state.filters.type === "all" || card.types.includes(state.filters.type);
    const owned = isCardOwned(card.id);
    const matchesView =
      state.filters.view === "all" ||
      (state.filters.view === "owned" && owned) ||
      (state.filters.view === "locked" && !owned);

    return matchesSearch && matchesType && matchesView;
  });
}

function getOwnedCards() {
  return state.cards.filter((card) => isCardOwned(card.id));
}

function selectCard(cardId, shouldScroll) {
  state.selectedCardId = cardId;
  state.modalOpen = true;
  renderCatalog();
  toggleModalVisibility(true);

  if (shouldScroll && window.innerWidth < 820) {
    dom.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function closeCardModal() {
  if (!state.modalOpen && state.selectedCardId === null) {
    return;
  }

  state.modalOpen = false;
  toggleModalVisibility(false);
  state.selectedCardId = null;
  void destroyPayPalButton();
  renderCatalog();
}

function showMessage(message, tone = "info") {
  dom.messageBanner.hidden = false;
  dom.messageBanner.dataset.tone = tone;
  dom.messageBanner.textContent = message;
}

function toggleModalVisibility(isOpen) {
  dom.cardModal.hidden = !isOpen;
  document.body.classList.toggle("has-modal-open", isOpen);
}

function isCardOwned(cardId) {
  return Boolean(state.purchases[String(cardId)]);
}

function savePurchases() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.purchases));
}

function saveThemePreference(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_error) {
    // Ignoramos fallos de persistencia del tema.
  }
}

function loadPurchases() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function loadThemePreference() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }
  } catch (_error) {
    // Si localStorage no esta disponible, usamos la preferencia del sistema.
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
  const nextTheme = state.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  saveThemePreference(nextTheme);
}

function applyTheme(theme) {
  state.theme = theme;
  document.body.dataset.theme = theme;

  if (!dom.themeToggle) {
    return;
  }

  const isDark = theme === "dark";
  dom.themeToggle.setAttribute("aria-pressed", String(isDark));
  dom.themeToggle.setAttribute("aria-label", isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
  dom.themeToggle.querySelector("[data-theme-label]").textContent = isDark ? "Tema oscuro" : "Tema claro";
  dom.themeToggle.querySelector("[data-theme-hint]").textContent = isDark ? "Cambiar a claro" : "Cambiar a oscuro";
}

function labelType(type) {
  return TYPE_LABELS[type] || capitalize(type);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: state.config.paypalCurrency || "USD"
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-SV", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveCardImage(pokemon, fallbackImage) {
  const homeSprites = pokemon.sprites.other?.home || {};
  const artworkSprites = pokemon.sprites.other?.["official-artwork"] || {};
  const dreamWorldSprites = pokemon.sprites.other?.dream_world || {};

  const candidates = [
    artworkSprites.front_default,
    artworkSprites.front_shiny,
    homeSprites.front_default,
    homeSprites.front_female,
    homeSprites.front_shiny,
    dreamWorldSprites.front_default,
    pokemon.sprites.front_default,
    pokemon.sprites.front_female
  ];

  return candidates.find(Boolean) || fallbackImage;
}

function createFallbackArt(name, primaryType) {
  const palette = {
    grass: ["#7fd98e", "#d9f6de"],
    fire: ["#ff9b6d", "#ffe1cf"],
    water: ["#7db7ff", "#dcecff"],
    electric: ["#ffe169", "#fff8c8"],
    psychic: ["#ff9cc8", "#ffe0ef"],
    poison: ["#c18cff", "#efe0ff"],
    bug: ["#b3dd75", "#f1fadf"],
    ground: ["#ddb781", "#f7ead6"],
    ghost: ["#9d9cff", "#e5e4ff"],
    dragon: ["#7c98ff", "#dce3ff"],
    normal: ["#cfd6e2", "#eff3f8"]
  };

  const colors = palette[primaryType] || ["#8bbcff", "#e7f2ff"];
  const initial = escapeHtml(name.charAt(0).toUpperCase());
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${escapeHtml(name)}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colors[0]}"/>
          <stop offset="100%" stop-color="${colors[1]}"/>
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="42" fill="url(#g)"/>
      <circle cx="160" cy="160" r="92" fill="rgba(255,255,255,0.32)"/>
      <circle cx="160" cy="160" r="68" fill="#ffffff"/>
      <path d="M92 160h136" stroke="#1b3657" stroke-width="14" stroke-linecap="round"/>
      <circle cx="160" cy="160" r="24" fill="#1b3657"/>
      <circle cx="160" cy="160" r="12" fill="#ffffff"/>
      <text x="160" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#1b3657">${initial}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function wireImageFallbacks(scope) {
  if (!scope) {
    return;
  }

  scope.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    if (image.dataset.fallbackBound === "true") {
      return;
    }

    image.dataset.fallbackBound = "true";
    image.addEventListener("error", applyFallbackImage);

    if (image.complete && image.naturalWidth === 0) {
      applyFallbackImage({ currentTarget: image });
    }
  });
}

function applyFallbackImage(event) {
  const image = event.currentTarget;
  const fallbackImage = image.dataset.fallbackSrc;

  if (!fallbackImage || image.dataset.fallbackApplied === "true") {
    return;
  }

  image.dataset.fallbackApplied = "true";
  image.classList.add("is-fallback-art");
  image.src = fallbackImage;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);

    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("No se pudo cargar el recurso externo."));
    document.head.appendChild(script);
  });
}
