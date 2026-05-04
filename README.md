# PokeCards Market

Aplicacion web interactiva para explorar cartas digitales inspiradas en Pokemon, agregarlas a un carrito y comprarlas con PayPal Sandbox usando datos reales de la PokeAPI.

## Que incluye

- Consumo dinamico de PokeAPI con 30 cartas por defecto.
- Catalogo con imagen, nombre, tipo y precio.
- Filtros por nombre, tipo y estado.
- Carrito en una pagina aparte.
- Checkout agrupado con PayPal Sandbox.
- Validacion de pago antes de desbloquear cartas.
- Persistencia visual de compras y carrito con `localStorage`.
- Modo oscuro y confirmacion visual al completar la compra.

## Requisitos

- Node.js 18 o superior.
- Conexion a internet para consultar PokeAPI y cargar PayPal Sandbox.
- Credenciales de una app Sandbox de PayPal si quieres probar compras completas.

## Clonar el proyecto

```bash
git clone https://github.com/AlexySSa/parcial-II-web.git
cd parcial-II-web
```

## Configuracion

Este proyecto no usa dependencias externas de npm, asi que puedes ejecutarlo directamente con `npm start`.

Si solo quieres ver el catalogo y la interfaz:

- No hace falta crear `.env`.
- El servidor usara `PAYPAL_CLIENT_ID=sb` por defecto.
- En ese modo el boton de PayPal puede mostrarse, pero la compra no se capturara porque falta el `Client Secret`.

Si quieres probar la compra Sandbox completa:

1. Crea un archivo `.env` a partir de `.env.example`.

En macOS o Linux:

```bash
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

2. Abre `.env` y coloca tus credenciales Sandbox de PayPal Developer:

```env
PAYPAL_CLIENT_ID=TU_CLIENT_ID_SANDBOX
PAYPAL_CLIENT_SECRET=TU_CLIENT_SECRET_SANDBOX
PAYPAL_CURRENCY=USD
POKEMON_LIMIT=30
```

## Ejecutar

```bash
npm start
```

Luego abre:

```text
http://localhost:3000
```

## Como probar la compra

1. Agrega una o varias cartas al carrito.
2. Entra a `http://localhost:3000/cart.html`.
3. Haz clic en el boton de PayPal.
4. Inicia sesion con una cuenta `Personal` de PayPal Sandbox.
5. Acepta el pago.
6. Si PayPal devuelve estado exitoso, las cartas se desbloquean y aparecen en `Mis compras`.

## Estructura principal

- `server.js`: servidor HTTP, archivos estaticos y endpoints de PayPal.
- `public/index.html`: catalogo principal.
- `public/cart.html`: carrito y checkout.
- `public/app.js`: logica del catalogo.
- `public/cart.js`: logica del carrito y compra.
- `public/shared.js`: utilidades compartidas.
- `public/styles.css`: estilos globales.

## Notas importantes

- Las compras se guardan visualmente en `localStorage`, no en una base de datos.
- El proyecto esta pensado para pruebas con PayPal Sandbox, no para cobros reales.
- Si cambias de navegador o borras almacenamiento local, se perdera el estado visual de las cartas desbloqueadas.
