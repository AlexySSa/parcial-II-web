const PURCHASES_KEY = "pokecards-market-purchases";
const CART_KEY = "pokecards-market-cart";
const THEME_KEY = "pokecards-market-theme";
const CATALOG_CACHE_KEY = "pokecards-market-catalog";

const TYPE_LABELS = {
  bug: "Bicho",
  dark: "Siniestro",
  dragon: "Dragon",
  electric: "Electrico",
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
  psychic: "Psiquico",
  rock: "Roca",
  steel: "Acero",
  water: "Agua"
};

export async function loadConfig() {
  const response = await fetch("/api/config");

  if (!response.ok) {
    throw new Error("No pudimos cargar la configuracion local.");
  }

  const config = await response.json();
  return {
    paypalClientId: config.paypalClientId || "sb",
    paypalCurrency: config.paypalCurrency || "USD",
    pokemonLimit: Number(config.pokemonLimit || 30),
    paypalServerReady: Boolean(config.paypalServerReady)
  };
}

export async function loadCards(limit) {
  const safeLimit = Math.max(25, Number(limit || 30));
  const cached = loadCatalogCache(safeLimit);

  if (cached.length) {
    return cached;
  }

  const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${safeLimit}`);

  if (!response.ok) {
    throw new Error("No fue posible consultar la PokeAPI.");
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

  const cards = detailResponses
    .filter((result) => result.status === "fulfilled")
    .map((result) => normalizeCard(result.value))
    .sort((a, b) => a.id - b.id);

  if (!cards.length) {
    throw new Error("No pudimos construir cartas validas desde la PokeAPI.");
  }

  saveCatalogCache(safeLimit, cards);
  return cards;
}

export function loadPurchases() {
  try {
    return JSON.parse(localStorage.getItem(PURCHASES_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

export function savePurchases(purchases) {
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases));
}

export function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed) ? uniqueNumericIds(parsed) : [];
  } catch (_error) {
    return [];
  }
}

export function saveCart(cartIds) {
  localStorage.setItem(CART_KEY, JSON.stringify(uniqueNumericIds(cartIds)));
}

export function pruneCart(cartIds, purchases) {
  return uniqueNumericIds(cartIds).filter((cardId) => !isCardOwned(purchases, cardId));
}

export function addCardToCart(cartIds, cardId) {
  return uniqueNumericIds([...cartIds, Number(cardId)]);
}

export function removeCardFromCart(cartIds, cardId) {
  return uniqueNumericIds(cartIds).filter((currentId) => currentId !== Number(cardId));
}

export function clearCart() {
  saveCart([]);
}

export function isCardOwned(purchases, cardId) {
  return Boolean(purchases[String(cardId)]);
}

export function isCardInCart(cartIds, cardId) {
  return uniqueNumericIds(cartIds).includes(Number(cardId));
}

export function getCartCards(cards, cartIds, purchases) {
  const cleanIds = pruneCart(cartIds, purchases);
  return cleanIds.map((cardId) => cards.find((card) => card.id === cardId)).filter(Boolean);
}

export function getOwnedCards(cards, purchases) {
  return cards.filter((card) => isCardOwned(purchases, card.id));
}

export function getCartTotal(cards, cartIds, purchases) {
  return getCartCards(cards, cartIds, purchases).reduce((sum, card) => sum + card.price, 0);
}

export async function loadPayPalSdk(clientId, currency) {
  const scriptSrc = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons&disable-funding=card`;

  await injectScript(scriptSrc);
  return Boolean(window.paypal);
}

export function validatePurchase(details) {
  const capture = details?.purchase_units?.[0]?.payments?.captures?.[0];
  const captureStatus = capture?.status;
  const orderStatus = details?.status;

  if (captureStatus === "COMPLETED" || orderStatus === "COMPLETED") {
    return {
      ok: true,
      captureId: capture?.id || details?.id || "N/A",
      orderId: details?.id || "N/A",
      captureStatus,
      orderStatus
    };
  }

  return {
    ok: false,
    captureStatus: captureStatus || "",
    orderStatus: orderStatus || ""
  };
}

export function createPayPalClientError(payload, fallbackMessage) {
  const error = new Error(payload?.message || fallbackMessage);
  error.details = Array.isArray(payload?.details) ? payload.details : [];
  error.debugId = payload?.debugId || payload?.debug_id || "";
  error.issue = payload?.details?.[0]?.issue || "";
  return error;
}

export function summarizePayPalError(error) {
  const issue = error?.details?.[0]?.issue || error?.issue || "";
  const description = error?.details?.[0]?.description || error?.message || "";

  if (issue === "INSTRUMENT_DECLINED") {
    return "el metodo de pago fue rechazado. Prueba otra vez o revisa la cuenta sandbox";
  }

  if (issue === "PAYER_ACTION_REQUIRED") {
    return "PayPal requiere una accion adicional del comprador para completar la autorizacion";
  }

  if (description) {
    return error?.debugId ? `${description} (debug_id: ${error.debugId})` : description;
  }

  if (issue) {
    return issue;
  }

  return "error desconocido";
}

export function registerPurchasedCards(cards, purchases, validation, details) {
  const nextPurchases = { ...purchases };
  const payerName = details?.payer?.name
    ? [details.payer.name.given_name, details.payer.name.surname].filter(Boolean).join(" ")
    : "";
  const purchasedAt = new Date().toISOString();

  for (const card of cards) {
    nextPurchases[String(card.id)] = {
      id: card.id,
      name: card.name,
      image: card.image,
      primaryType: card.primaryType,
      price: card.price,
      payerName,
      captureId: validation.captureId,
      orderId: validation.orderId,
      purchasedAt
    };
  }

  return nextPurchases;
}

export function createMessageController(element) {
  return {
    show(message, tone = "info") {
      if (!element) {
        return;
      }

      element.hidden = false;
      element.dataset.tone = tone;
      element.textContent = message;
    },
    clear() {
      if (!element) {
        return;
      }

      element.hidden = true;
      element.textContent = "";
    }
  };
}

export function loadThemePreference() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }
  } catch (_error) {
    // noop
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme, toggleButton) {
  document.body.dataset.theme = theme;
  syncThemeToggle(toggleButton, theme);

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_error) {
    // noop
  }
}

export function toggleTheme(currentTheme, toggleButton) {
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme, toggleButton);
  return nextTheme;
}

export function labelType(type) {
  return TYPE_LABELS[type] || capitalize(type);
}

export function formatCurrency(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-SV", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function wireImageFallbacks(scope) {
  if (!scope) {
    return;
  }

  scope.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    image.removeEventListener("error", applyFallbackImage);
    image.addEventListener("error", applyFallbackImage, { once: true });
  });
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
    description: `${capitalize(pokemon.name)} pertenece al tipo ${labelType(primaryType)} y forma parte de una edicion digital ${rarity.toLowerCase()}.`
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
    return "Epica";
  }
  if (baseExperience >= 70) {
    return "Especial";
  }
  return "Clasica";
}

function resolveCardImage(pokemon, fallbackImage) {
  return (
    pokemon?.sprites?.other?.home?.front_default ||
    pokemon?.sprites?.other?.["official-artwork"]?.front_default ||
    pokemon?.sprites?.other?.dream_world?.front_default ||
    pokemon?.sprites?.front_default ||
    fallbackImage
  );
}

function createFallbackArt(name, primaryType) {
  const colorMap = {
    bug: "#9ecf57",
    dark: "#7b6e6a",
    dragon: "#728cff",
    electric: "#f7cd46",
    fairy: "#f4a7d9",
    fighting: "#de7b67",
    fire: "#ff9b66",
    flying: "#8db7ff",
    ghost: "#8a89d9",
    grass: "#77cf90",
    ground: "#d5ad72",
    ice: "#77dae8",
    normal: "#bcc6d8",
    poison: "#b487ff",
    psychic: "#ff98c1",
    rock: "#cbb46b",
    steel: "#8bb7c9",
    water: "#6faeff"
  };

  const accent = colorMap[primaryType] || "#77cf90";
  const safeName = escapeHtml(name.slice(0, 14));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#18263d" />
          <stop offset="100%" stop-color="#0d1626" />
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="40" fill="url(#bg)" />
      <circle cx="160" cy="112" r="84" fill="${accent}" opacity="0.28" />
      <circle cx="160" cy="112" r="56" fill="${accent}" opacity="0.44" />
      <path d="M92 224c17-28 42-42 68-42s51 14 68 42" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round" />
      <circle cx="135" cy="125" r="10" fill="#eaf3ff" />
      <circle cx="185" cy="125" r="10" fill="#eaf3ff" />
      <path d="M134 164c10 8 19 12 26 12s16-4 26-12" fill="none" stroke="#eaf3ff" stroke-width="10" stroke-linecap="round" />
      <text x="160" y="284" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#f5f8ff">${safeName}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function uniqueNumericIds(ids) {
  return [...new Set(ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function loadCatalogCache(limit) {
  try {
    const cacheKey = `${CATALOG_CACHE_KEY}-${limit}`;
    const parsed = JSON.parse(sessionStorage.getItem(cacheKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveCatalogCache(limit, cards) {
  try {
    const cacheKey = `${CATALOG_CACHE_KEY}-${limit}`;
    sessionStorage.setItem(cacheKey, JSON.stringify(cards));
  } catch (_error) {
    // noop
  }
}

function syncThemeToggle(toggleButton, theme) {
  if (!toggleButton) {
    return;
  }

  const isDark = theme === "dark";
  toggleButton.setAttribute("aria-pressed", String(isDark));
  toggleButton.setAttribute("aria-label", isDark ? "Cambiar a claro" : "Cambiar a oscuro");
  const label = toggleButton.querySelector("[data-theme-label]");
  const hint = toggleButton.querySelector("[data-theme-hint]");

  if (label) {
    label.textContent = isDark ? "Tema oscuro" : "Tema claro";
  }

  if (hint) {
    hint.textContent = isDark ? "Cambiar a claro" : "Cambiar a oscuro";
  }
}

function applyFallbackImage(event) {
  const image = event.currentTarget;
  const fallbackSrc = image.dataset.fallbackSrc;

  if (!fallbackSrc || image.dataset.fallbackApplied === "true") {
    return;
  }

  image.dataset.fallbackApplied = "true";
  image.src = fallbackSrc;
  image.classList.add("is-fallback-art");
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
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
