const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");

loadEnvFile(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const paypalClientId = process.env.PAYPAL_CLIENT_ID || "sb";
const paypalCurrency = process.env.PAYPAL_CURRENCY || "USD";
const pokemonLimit = Number(process.env.POKEMON_LIMIT || 30);

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
        pokemonLimit
      });
    }

    if (requestUrl.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.replace(/^\/+/, "");
    const requestedPath = path.normalize(path.join(publicDir, relativePath));

    if (!requestedPath.startsWith(publicDir)) {
      return sendJson(res, 403, { message: "Acceso denegado." });
    }

    const file = await fs.readFile(requestedPath);
    const extension = path.extname(requestedPath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      sendJson(res, 404, { message: "Recurso no encontrado." });
      return;
    }

    console.error("Server error:", error);
    sendJson(res, 500, { message: "Error interno del servidor." });
  }
});

server.listen(port, () => {
  console.log(`PokéCards Market disponible en http://localhost:${port}`);
});

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function loadEnvFile(filePath) {
  try {
    const fileContent = require("fs").readFileSync(filePath, "utf8");
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
