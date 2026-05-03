# PokéCards Market

Aplicación web interactiva para explorar, visualizar y comprar cartas digitales inspiradas en Pokémon usando datos reales de la PokéAPI y checkout con PayPal Sandbox.

## Incluye

- Consumo dinámico de PokéAPI con 25+ cartas.
- Catálogo con imagen, nombre, tipo y precio por carta.
- Selección individual de cartas para compra.
- Integración de PayPal Sandbox con validación de pago exitoso.
- Persistencia visual de cartas desbloqueadas en `localStorage`.
- Panel de "Mis compras" para revisar cartas adquiridas.

## Ejecutar

1. Opcionalmente copia `.env.example` como `.env` y cambia `PAYPAL_CLIENT_ID` si quieres usar tu propio sandbox app client id.
2. Inicia el servidor:

```bash
npm start
```

3. Abre `http://localhost:3000`.

## Variables opcionales

```env
PAYPAL_CLIENT_ID=sb
PAYPAL_CURRENCY=USD
POKEMON_LIMIT=30
```

## Nota de PayPal Sandbox

El proyecto funciona en modo sandbox. Por defecto usa `PAYPAL_CLIENT_ID=sb`, que PayPal documenta como atajo de pruebas. Si ya tienes tu app sandbox, puedes reemplazarlo en `.env`.
