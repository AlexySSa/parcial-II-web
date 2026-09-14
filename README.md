# PokéLab · Libreta de campo

Pokédex, constructor de equipos y comparador de estadísticas. HTML, CSS y JavaScript, sin dependencias de npm. El servidor Node incluido sirve los archivos para trabajar localmente.

[Abrir PokéLab](https://alexyssa.github.io/parcial-II-web/) · [Código en GitHub](https://github.com/AlexySSa/parcial-II-web)

## Contenido

- 1,025 especies y 326 variantes: **1,351 entradas** del endpoint `/pokemon` de PokéAPI en el snapshot del 14 de septiembre de 2026 (UTC).
- Búsqueda por nombre o número, tipos, generación de la especie y formas alternativas.
- Páginas de 24 resultados; filtros sobre el catálogo completo, no solo la página visible.
- Fichas con seis estadísticas base, altura, peso, descripción y habilidades.
- Favoritos, equipo actual de hasta seis Pokémon y hasta doce equipos guardados por nombre.
- Análisis defensivo de los 18 tipos y comparación de dos Pokémon.
- Enlace de equipo mediante parámetros de URL. Cargar un enlace no lo añade a la lista de equipos guardados hasta pulsar Guardar equipo.
- Tema claro/oscuro, navegación por teclado y diseño adaptable.

## Uso local

Requiere Node.js 20 o superior. No necesita instalación de paquetes, PayPal ni credenciales.

```powershell
npm start
```

Abre `http://127.0.0.1:3000`. Para otro puerto:

```powershell
$env:PORT=3001
npm start
```

`npm run dev` reinicia el servidor al editarlo. Los archivos de interfaz se actualizan al recargar el navegador.

## Datos y alcance

El catálogo compacto está incluido en `public/data/catalog.json`: nombres, tipos, estadísticas, altura, peso y generación se pueden consultar sin una conexión externa una vez servida la aplicación localmente. Las ilustraciones oficiales necesitan conexión. Si una ilustración falla se intenta el sprite y después se muestra un marcador de imagen no disponible. No se almacenan todas las imágenes en el proyecto.

Las descripciones y habilidades se consultan bajo demanda en PokéAPI y se guardan temporalmente en el navegador por siete días. Si falla la consulta, la ficha mantiene las estadísticas locales y ofrece reintentar. Los nombres de habilidades se conservan como los entrega la API. Se prefiere descripción en español y se indica cuando solo hay texto en inglés.

Se incluyen todas las entradas del endpoint `/pokemon` al actualizar el snapshot, incluidas formas regionales y variantes con registro propio. Las formas exclusivamente cosméticas de `/pokemon-form` son otro conjunto y no se incluyen todas. El filtro de generación corresponde a la especie original, no al debut de la variante. Un peso no disponible en la fuente se muestra como tal.

El análisis de debilidades considera tipos duales y la tabla moderna de tipos (generación VI en adelante). No incluye habilidades, movimientos, objetos, nivel ni entrenamiento; no es un simulador de combate. Seis entradas distintas pueden incluir variantes de una misma especie.

Los favoritos y equipos se guardan únicamente en este navegador. Usar el mismo nombre al guardar actualiza ese equipo. No hay cuentas, sincronización ni base de datos. El enlace compartido incluye solo IDs del equipo y su nombre. Mientras se ejecute en localhost, el enlace solo sirve en el equipo que aloja la aplicación.

## Actualizar el catálogo

```powershell
npm run update:catalog
```

El script descarga tablas CSV oficiales fijadas al commit más reciente de PokeAPI/pokeapi y contrasta IDs y nombres con el índice de la API. Rechaza datos incompletos antes de escribir el archivo. No consulta una ficha por Pokémon. `POKEAPI_REF` permite elegir un commit reproducible. La fecha y el commit usados están guardados dentro del JSON.

Fuentes: [PokéAPI](https://pokeapi.co/docs/v2), [tablas oficiales](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv), [ilustraciones y sprites](https://github.com/PokeAPI/sprites).

## Verificación

```powershell
npm test
```

Pruebas de los 324 enfrentamientos de tipos contra respuestas de PokéAPI guardadas, tipos dobles, inmunidades, límites de equipo, enlaces inválidos, búsqueda y filtros sobre todo el catálogo, integridad de los datos y archivos estáticos.

## Estructura

- `public/index.html`, `styles.css`, `app.js`: interfaz y flujos.
- `public/shared.mjs`: consultas, búsqueda, persistencia y utilidades.
- `public/team.mjs`: lógica pura de equipos y tipos.
- `public/data/catalog.json`: snapshot completo.
- `scripts/update-catalog.mjs`: actualización reproducible de los datos.
- `tests/`: pruebas y respuesta de tipos usada como referencia.
- `server.js`: servidor estático local, sin rutas de pago.

## Publicación

El proyecto se publica en [GitHub Pages](https://alexyssa.github.io/parcial-II-web/). El flujo `.github/workflows/pages.yml` ejecuta las pruebas y publica únicamente la carpeta `public/` después de cada actualización de `main`. El servidor local y los archivos de configuración no forman parte del sitio publicado.

La interfaz usa rutas relativas y no necesita un servidor de pagos. Si en el futuro se requieren funciones de servidor, se podrá usar otro alojamiento conservando el mismo repositorio. En la versión publicada, los enlaces de equipo funcionan desde cualquier dispositivo; los favoritos y equipos guardados siguen siendo locales a cada navegador.

Proyecto educativo de fans, no afiliado a Nintendo, Game Freak o The Pokémon Company. Pokémon y sus ilustraciones pertenecen a sus respectivos titulares. La licencia de código no transfiere derechos sobre esos recursos.
