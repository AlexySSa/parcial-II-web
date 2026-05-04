import {
  applyTheme,
  clearCart,
  createMessageController,
  createPayPalClientError,
  escapeHtml,
  formatCurrency,
  getCartCards,
  getCartTotal,
  labelType,
  loadCards,
  loadCart,
  loadConfig,
  loadPayPalSdk,
  loadPurchases,
  loadThemePreference,
  pruneCart,
  registerPurchasedCards,
  removeCardFromCart,
  saveCart,
  savePurchases,
  summarizePayPalError,
  toggleTheme,
  validatePurchase,
  wireImageFallbacks
} from "./shared.js";

const state = {
  cards: [],
  config: {
    paypalCurrency: "USD",
    paypalServerReady: false
  },
  purchases: loadPurchases(),
  cart: loadCart(),
  theme: loadThemePreference(),
  sdkLoaded: false,
  sdkError: "",
  paypalButtons: null
};

const dom = {};
let message = null;
let purchaseSuccessTimer = 0;
let purchaseSuccessHideTimer = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  message = createMessageController(dom.messageBanner);
  applyTheme(state.theme, dom.themeToggle);
  bindEvents();
  showBanner("Preparando el carrito y el checkout sandbox...", "info");

  try {
    state.config = await loadConfig();
    state.cards = await loadCards(state.config.pokemonLimit);
    state.cart = pruneCart(state.cart, state.purchases);
    saveCart(state.cart);

    if (state.config.paypalClientId) {
      try {
        state.sdkLoaded = await loadPayPalSdk(state.config.paypalClientId, state.config.paypalCurrency);
      } catch (_error) {
        state.sdkError = "No se pudo cargar el SDK de PayPal.";
      }
    }

    await renderAll();

    if (getCurrentCartCards().length) {
      showBanner("Carrito listo. Puedes quitar cartas o completar la compra total.", "success");
    } else {
      showBanner("Tu carrito esta vacio. Vuelve al catalogo y agrega algunas cartas.", "warning");
    }
  } catch (error) {
    await renderAll();
    showBanner(error.message || "No se pudo cargar el carrito.", "error");
  }
}

function cacheDom() {
  dom.themeToggle = document.querySelector("#theme-toggle");
  dom.messageBanner = document.querySelector("#message-banner");
  dom.purchaseSuccess = document.querySelector("#purchase-success");
  dom.purchaseSuccessTitle = document.querySelector("#purchase-success-title");
  dom.purchaseSuccessCopy = document.querySelector("#purchase-success-copy");
  dom.cartList = document.querySelector("#cart-list");
  dom.cartEmpty = document.querySelector("#cart-empty");
  dom.cartTotal = document.querySelector("#cart-total");
  dom.cartCount = document.querySelector("#cart-count");
  dom.cartSubtotal = document.querySelector("#cart-subtotal");
  dom.checkoutPanel = document.querySelector("#checkout-panel");
  dom.paypalSlot = document.querySelector("#paypal-slot");
  dom.clearCartButton = document.querySelector("#clear-cart");
  dom.cartBadges = document.querySelectorAll("[data-cart-count]");
}

function bindEvents() {
  dom.themeToggle?.addEventListener("click", () => {
    state.theme = toggleTheme(state.theme, dom.themeToggle);
  });

  dom.cartList?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-cart]");

    if (!removeButton) {
      return;
    }

    const cardId = Number(removeButton.dataset.removeCart);
    const card = state.cards.find((item) => item.id === cardId);

    state.cart = removeCardFromCart(state.cart, cardId);
    saveCart(state.cart);
    void renderAll();

    if (card) {
      showBanner(`${card.name} fue retirada del carrito.`, "warning");
    }
  });

  dom.clearCartButton?.addEventListener("click", () => {
    clearCart();
    state.cart = [];
    void renderAll();
    showBanner("Se cancelaron todas las cartas del carrito.", "warning");
  });
}

async function renderAll() {
  renderCartItems();
  renderSummary();
  updateCounts();
  await mountPayPalButton();
}

function renderCartItems() {
  const cartCards = getCurrentCartCards();

  dom.cartList.innerHTML = cartCards
    .map((card) => {
      return `
        <article class="cart-item" data-type="${card.primaryType}">
          <div class="cart-item__media">
            <img class="pokemon-art" src="${card.image}" alt="Carta en carrito de ${escapeHtml(card.name)}" loading="lazy" data-fallback-src="${card.fallbackImage}" />
          </div>
          <div class="cart-item__copy">
            <div class="cart-item__top">
              <div>
                <span class="id-badge">#${String(card.id).padStart(3, "0")}</span>
                <h3>${escapeHtml(card.name)}</h3>
              </div>
              <strong class="price-tag">${formatCurrency(card.price, state.config.paypalCurrency)}</strong>
            </div>
            <p>${escapeHtml(card.description)}</p>
            <div class="type-row">
              ${card.types.map((type) => `<span class="type-chip">${escapeHtml(labelType(type))}</span>`).join("")}
            </div>
            <div class="cart-item__footer">
              <span class="meta-pill">${escapeHtml(card.rarity)}</span>
              <span class="meta-pill">${card.hp} HP</span>
              <button class="secondary-button" type="button" data-remove-cart="${card.id}">Quitar del carrito</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  wireImageFallbacks(dom.cartList);
  dom.cartEmpty.hidden = cartCards.length > 0;
  dom.clearCartButton.hidden = cartCards.length === 0;
}

function renderSummary() {
  const cartCards = getCurrentCartCards();
  const total = getCartTotal(state.cards, state.cart, state.purchases);

  dom.cartCount.textContent = String(cartCards.length);
  dom.cartSubtotal.textContent = formatCurrency(total, state.config.paypalCurrency);
  dom.cartTotal.textContent = formatCurrency(total, state.config.paypalCurrency);

  dom.checkoutPanel.innerHTML = cartCards.length
    ? `
      <div class="purchase-summary">
        <div class="purchase-summary__title">
          <span class="panel-card__title">Resumen del carrito</span>
          <span class="meta-pill">${cartCards.length} carta${cartCards.length === 1 ? "" : "s"}</span>
        </div>
        <div class="summary-lines">
          ${cartCards
            .map(
              (card) => `
                <div class="summary-line">
                  <span>${escapeHtml(card.name)}</span>
                  <strong>${formatCurrency(card.price, state.config.paypalCurrency)}</strong>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="summary-total">
          <span>Total a pagar</span>
          <strong>${formatCurrency(total, state.config.paypalCurrency)}</strong>
        </div>
      </div>

      <div class="purchase-summary">
        <div class="purchase-summary__title">
          <span class="panel-card__title">Checkout del carrito</span>
          <span class="meta-pill">${state.config.paypalServerReady ? "Sandbox listo" : "Falta servidor"}</span>
        </div>
        <div class="payment-method-box payment-method-box--stacked">
          <div class="payment-method-box__copy">
            <span class="eyebrow">Pago agrupado</span>
            <h4>Una sola compra para todas tus cartas</h4>
            <p>PayPal Sandbox abrira una sola orden con el total del carrito. Si el pago se confirma, todas las cartas se desbloquearan a la vez.</p>
          </div>
          <div class="payment-method-box__actions payment-method-box__actions--full">
            <div class="paypal-slot paypal-slot--steam" id="paypal-slot" data-state="loading"></div>
            ${
              state.sdkError
                ? `<p class="payment-method-box__note">${escapeHtml(state.sdkError)}</p>`
                : !state.config.paypalServerReady
                  ? `<p class="payment-method-box__note">Agrega <code>PAYPAL_CLIENT_SECRET</code> al servidor para habilitar la captura desde el backend.</p>`
                  : `<p class="payment-method-box__note">Si cambias de idea, puedes quitar cartas o vaciar todo el carrito antes de pagar.</p>`
            }
          </div>
        </div>
      </div>
    `
    : `
      <div class="empty-state empty-state--small">
        <h3>No tienes cartas en el carrito</h3>
        <p>Regresa al catalogo, agrega tus favoritas y luego vuelve aqui para pagar todo junto.</p>
        <a class="select-button select-button--link" href="/">Volver al catalogo</a>
      </div>
    `;

  dom.paypalSlot = document.querySelector("#paypal-slot");
}

async function mountPayPalButton() {
  await destroyPayPalButton();

  const cartCards = getCurrentCartCards();

  if (!dom.paypalSlot || !cartCards.length) {
    return;
  }

  if (!state.sdkLoaded || !window.paypal) {
    dom.paypalSlot.dataset.state = "error";
    dom.paypalSlot.innerHTML = "<p>No fue posible iniciar PayPal Sandbox en esta pagina.</p>";
    return;
  }

  if (!state.config.paypalServerReady) {
    dom.paypalSlot.dataset.state = "error";
    dom.paypalSlot.innerHTML = "<p>Falta configurar PAYPAL_CLIENT_SECRET en el servidor para completar el checkout.</p>";
    return;
  }

  dom.paypalSlot.dataset.state = "loading";
  dom.paypalSlot.innerHTML = "";

  state.paypalButtons = window.paypal.Buttons({
    style: {
      layout: "horizontal",
      color: "gold",
      shape: "rect",
      label: "paypal",
      tagline: false,
      height: 40
    },

    async createOrder() {
      showBanner(`Creando orden sandbox para ${cartCards.length} cartas...`, "info");

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: cartCards.map((card) => ({
            id: card.id,
            name: card.name,
            price: card.price
          }))
        })
      });

      const orderData = await response.json();

      if (!response.ok || !orderData?.id) {
        throw createPayPalClientError(orderData, "No se pudo crear la orden del carrito.");
      }

      return orderData.id;
    },

    async onApprove(data, actions) {
      try {
        showBanner("Capturando la compra total del carrito...", "info");
        const purchasedTotal = getCartTotal(state.cards, state.cart, state.purchases);

        const response = await fetch(`/api/orders/${data.orderID}/capture`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        });
        const details = await response.json();

        if (response.status === 422 && details?.details?.[0]?.issue === "INSTRUMENT_DECLINED") {
          return actions.restart();
        }

        if (!response.ok) {
          throw createPayPalClientError(details, "No se pudo capturar la compra del carrito.");
        }

        const validation = validatePurchase(details);

        if (!validation.ok) {
          showBanner(
            `PayPal no confirmo la orden completa. Orden: ${validation.orderStatus || "sin estado"} · Captura: ${validation.captureStatus || "sin captura"}.`,
            "error"
          );
          return;
        }

        state.purchases = registerPurchasedCards(cartCards, state.purchases, validation, details);
        savePurchases(state.purchases);
        clearCart();
        state.cart = [];
        await renderAll();
        message.clear();
        showPurchaseSuccess(cartCards, purchasedTotal);
      } catch (error) {
        console.error("PayPal cart capture error:", error);
        showBanner(`PayPal no pudo capturar el carrito: ${summarizePayPalError(error)}.`, "error");
      }
    },

    onCancel() {
      showBanner("La compra del carrito fue cancelada. Tus cartas siguen reservadas aqui.", "warning");
    },

    onError(error) {
      console.error("PayPal cart error:", error);
      showBanner("PayPal encontro un error con el checkout del carrito.", "error");
    }
  });

  try {
    await state.paypalButtons.render("#paypal-slot");
    dom.paypalSlot.dataset.state = "ready";
  } catch (error) {
    console.error("PayPal render error:", error);
    dom.paypalSlot.dataset.state = "error";
    dom.paypalSlot.innerHTML = "<p>No fue posible mostrar el boton de PayPal para el carrito.</p>";
  }
}

async function destroyPayPalButton() {
  if (state.paypalButtons && typeof state.paypalButtons.close === "function") {
    try {
      await state.paypalButtons.close();
    } catch (_error) {
      // noop
    }
  }

  state.paypalButtons = null;
}

function updateCounts() {
  const cartCards = getCurrentCartCards();
  dom.cartBadges.forEach((badge) => {
    badge.textContent = String(cartCards.length);
  });
}

function getCurrentCartCards() {
  return getCartCards(state.cards, state.cart, state.purchases);
}

function showBanner(text, tone = "info") {
  hidePurchaseSuccess(true);
  message.show(text, tone);
}

function showPurchaseSuccess(cards, total) {
  if (!dom.purchaseSuccess || !dom.purchaseSuccessTitle || !dom.purchaseSuccessCopy) {
    return;
  }

  const title =
    cards.length === 1
      ? `${cards[0].name} fue comprada`
      : `Se compraron ${cards.length} cartas`;
  const purchasedNames = summarizePurchasedNames(cards.map((card) => card.name));
  const copy =
    cards.length === 1
      ? `${cards[0].name} ya esta desbloqueada en tu coleccion por ${formatCurrency(total, state.config.paypalCurrency)}.`
      : `${purchasedNames} ya forman parte de tu coleccion por ${formatCurrency(total, state.config.paypalCurrency)} en total.`;

  window.clearTimeout(purchaseSuccessTimer);
  window.clearTimeout(purchaseSuccessHideTimer);

  dom.purchaseSuccessTitle.textContent = title;
  dom.purchaseSuccessCopy.textContent = copy;
  dom.purchaseSuccess.hidden = false;

  window.requestAnimationFrame(() => {
    dom.purchaseSuccess.classList.add("is-visible");
  });

  purchaseSuccessTimer = window.setTimeout(() => {
    hidePurchaseSuccess();
  }, 5000);
}

function hidePurchaseSuccess(immediate = false) {
  if (!dom.purchaseSuccess) {
    return;
  }

  window.clearTimeout(purchaseSuccessTimer);
  window.clearTimeout(purchaseSuccessHideTimer);

  if (immediate) {
    dom.purchaseSuccess.classList.remove("is-visible");
    dom.purchaseSuccess.hidden = true;
    return;
  }

  dom.purchaseSuccess.classList.remove("is-visible");
  purchaseSuccessHideTimer = window.setTimeout(() => {
    dom.purchaseSuccess.hidden = true;
  }, 240);
}

function summarizePurchasedNames(names) {
  if (names.length <= 3) {
    return formatNamesList(names);
  }

  const featured = names.slice(0, 3).join(", ");
  return `${featured} y ${names.length - 3} mas`;
}

function formatNamesList(names) {
  if (names.length <= 1) {
    return names[0] || "Tu carta";
  }

  if (names.length === 2) {
    return `${names[0]} y ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}
