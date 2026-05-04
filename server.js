const http = require("http");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");

loadEnvFile(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const paypalClientId = process.env.PAYPAL_CLIENT_ID || "sb";
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
const paypalCurrency = process.env.PAYPAL_CURRENCY || "USD";
const pokemonLimit = Number(process.env.POKEMON_LIMIT || 30);
const paypalBaseUrl = "https://api-m.sandbox.paypal.com";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === "/api/config") {
      return sendJson(res, 200, {
        paypalClientId,
        paypalCurrency,
        pokemonLimit,
        paypalServerReady: Boolean(paypalClientId && paypalClientSecret)
      });
    }

    if (requestUrl.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/orders") {
      return handleCreateOrder(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/capture")) {
      const orderId = requestUrl.pathname.split("/")[3];
      return handleCaptureOrder(res, orderId);
    }

    const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.replace(/^\/+/, "");
    const requestedPath = path.normalize(path.join(publicDir, relativePath));

    if (!requestedPath.startsWith(publicDir)) {
      return sendJson(res, 403, { message: "Acceso denegado." });
    }

    const file = await fsPromises.readFile(requestedPath);
    const extension = path.extname(requestedPath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch (error) {
    console.error("Server error:", error);

    if (error && error.code === "ENOENT") {
      sendJson(res, 404, { message: "Recurso no encontrado." });
      return;
    }

    sendJson(res, error.statusCode || 500, {
      message: error.publicMessage || "Error interno del servidor.",
      details: error.details || [],
      debugId: error.debugId || ""
    });
  }
});

server.listen(port, () => {
  console.log(`PokeCards Market disponible en http://localhost:${port}`);
});

async function handleCreateOrder(req, res) {
  ensurePayPalServerConfig();

  const body = await readJsonBody(req);
  const items = normalizeOrderItems(body);

  if (!items.length) {
    return sendJson(res, 400, { message: "Debes enviar al menos una carta valida para crear la orden." });
  }

  const total = items.reduce((sum, item) => sum + item.price, 0);
  const orderTitle = items.length === 1 ? items[0].name : `Carrito de ${items.length} cartas`;
  const customId = items.map((item) => item.id).join(",").slice(0, 120);

  const orderPayload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        description: `PokeCards Market - ${orderTitle}`,
        custom_id: customId || "pokecards-cart",
        amount: {
          currency_code: paypalCurrency,
          value: total.toFixed(2)
        }
      }
    ],
    application_context: {
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW"
    }
  };

  const order = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    body: orderPayload
  });

  sendJson(res, 200, order);
}

async function handleCaptureOrder(res, orderId) {
  ensurePayPalServerConfig();

  if (!orderId) {
    return sendJson(res, 400, { message: "No se recibio un orderId valido." });
  }

  const capture = await paypalRequest(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    body: {}
  });

  sendJson(res, 200, capture);
}

async function paypalRequest(endpoint, { method, body }) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${paypalBaseUrl}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await safeJson(response);

  if (!response.ok) {
    const error = new Error(payload?.message || "PayPal devolvio un error.");
    error.statusCode = response.status;
    error.publicMessage = payload?.message || "PayPal devolvio un error.";
    error.details = payload?.details || [];
    error.debugId = payload?.debug_id || "";
    throw error;
  }

  return payload;
}

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${paypalClientId}:${paypalClientSecret}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const payload = await safeJson(response);

  if (!response.ok || !payload?.access_token) {
    const error = new Error(payload?.error_description || "No se pudo obtener el access token de PayPal.");
    error.statusCode = response.status || 500;
    error.publicMessage = payload?.error_description || "No se pudo autenticar PayPal en el servidor.";
    error.details = payload?.details || [];
    throw error;
  }

  return payload.access_token;
}

function ensurePayPalServerConfig() {
  if (!paypalClientId || !paypalClientSecret) {
    const error = new Error("Falta configurar PayPal en el servidor.");
    error.statusCode = 500;
    error.publicMessage = "Falta PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET para capturar pagos desde el servidor.";
    throw error;
  }
}

function normalizeOrderItems(body) {
  if (Array.isArray(body?.items)) {
    return body.items.filter(isValidOrderItem).map((item) => ({
      id: String(item.id),
      name: item.name.trim(),
      price: Number(item.price)
    }));
  }

  if (isValidOrderItem(body?.card)) {
    return [
      {
        id: String(body.card.id),
        name: body.card.name.trim(),
        price: Number(body.card.price)
      }
    ];
  }

  return [];
}

function isValidOrderItem(item) {
  return Boolean(
    item &&
      (typeof item.id === "number" || typeof item.id === "string") &&
      typeof item.name === "string" &&
      item.name.trim() &&
      Number.isFinite(Number(item.price)) &&
      Number(item.price) > 0
  );
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    const error = new Error("JSON invalido.");
    error.statusCode = 400;
    error.publicMessage = "El cuerpo de la peticion no contiene un JSON valido.";
    throw error;
  }
}

async function safeJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text };
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function loadEnvFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const lines = fileContent.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("No se pudo leer el archivo .env:", error.message);
    }
  }
}
