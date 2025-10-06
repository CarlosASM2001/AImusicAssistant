
# AI Artist Finder (React  Vite, Chrome Extension)  Vercel Edge API

Aplicación de asistente musical que recomienda artistas a partir de texto y/o imagen. La UI es una extensión de Chrome construida con React  Vite, y el backend es un endpoint Edge en Vercel que usa la API de Google Gemini.

## Arquitectura
- **Extensión (frontend)**: React 19  Vite  Tailwind. Código principal en `src/App.jsx` y `src/main.jsx`. Manifiesto en `manifest.json`. HTML de popup en `popup.html`.
- **Backend (API)**: Función Edge en `api/query.js` (Vercel) que:
  - Acepta `POST` en `multipart/form-data`, `application/json`, `application/x-www-form-urlencoded` y `text/plain`.
  - Soporta `GET` para mostrar un JSON de uso (útil para ver que está vivo).
  - Hace streaming de texto cuando el modelo lo soporta; si no, responde en un solo bloque.
  - Implementa CORS abierto para facilitar pruebas.

## Requisitos
- Node.js 18 (recomendado LTS)
- npm 10
- Una clave válida de Google Gemini en `GEMINI_API_KEY`

## Instalación
```bash
npm install
```

## Variables de entorno
En producción (Vercel) define `GEMINI_API_KEY` en Project Settings → Environment Variables (Production/Preview/Development) y despliega.

Para pruebas locales del endpoint con Vercel CLI:
```bash
# Instalar Vercel CLI si no lo tienes
npm i -g vercel

# En el proyecto, configura la variable (solo para vercel dev)
vercel env add GEMINI_API_KEY development

# O usa un archivo .env.local para vercel dev
# .env.local
# GEMINI_API_KEY=tu_clave
```

## Comandos útiles
- `npm run build`: compila la extensión (output en `dist/`).
- `npm run dev:ext`: build en modo watch (recargas manuales en Chrome).
- `npm run preview`: servidor estático para revisar `dist/` (no afecta la extensión).

## Cargar la extensión en Chrome
1. Ejecuta `npm run build`.
2. Abre `chrome://extensions` → activa “Modo desarrollador”.
3. “Cargar descomprimida” → selecciona la carpeta `dist/`.
4. Fija la extensión para verla como popup. Cada cambio de código requiere volver a build o usar `npm run dev:ext` y recargar la extensión.

## Configurar el endpoint en el cliente
El frontend usa la constante `BACKEND_URL` en `src/App.jsx`.
- Valor por defecto apunta al deploy de Vercel: `https://a-imusic-assistant.vercel.app/api/query`.
- Si despliegas en otra URL, actualiza ese valor.

## API
- Base: `https://<tu-deploy>.vercel.app/api/query`

### GET /api/query
- Devuelve JSON con información de uso.
- Útil para verificar que el endpoint está activo.

Ejemplo:
```bash
curl -s https://a-imusic-assistant.vercel.app/api/query | jq
```

### POST /api/query
- Entrada admitida:
  - `application/json`: `{ "query": "texto" }`
  - `multipart/form-data`: campos `query` (texto) y `image` (archivo, opcional)
  - `application/x-www-form-urlencoded`: `query=...`
  - `text/plain`: cuerpo como texto
- Respuesta:
  - `text/plain` con streaming cuando el modelo lo permite
  - Si no hay streaming disponible, texto en un único bloque
  - Errores se devuelven en JSON con código apropiado

Ejemplos:

JSON
```bash
curl -N \
  -H 'Content-Type: application/json' \
  -d '{"query":"busco synth-pop femenino 2010s"}' \
  https://a-imusic-assistant.vercel.app/api/query
```

multipart/form-data (con imagen)
```bash
curl -N \
  -F 'query=busco estética gótica Y2K' \
  -F 'image=@/ruta/a/imagen.jpg' \
  https://a-imusic-assistant.vercel.app/api/query
```

x-www-form-urlencoded
```bash
curl -N \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'query=canciones melancólicas con guitarra acústica' \
  https://a-imusic-assistant.vercel.app/api/query
```

## Despliegue en Vercel
1. Conecta el repo a Vercel.
2. Define `GEMINI_API_KEY` en el proyecto.
3. Despliega. Vercel detectará Vite para el build estático y la carpeta `api/` para la función Edge.

## Solución de problemas
- 405 Method Not Allowed: usa `POST` para consultas; `GET` solo muestra uso.
- 400 FormData inválido: en Postman usa claves exactas `query` (Text) y `image` (File). Evita partes sin nombre.
- 415 Unsupported Media Type: ajusta el `Content-Type` a uno de los soportados.
- 500 Falta `GEMINI_API_KEY`: define la variable de entorno en Vercel o en local.
- 502 Proveedor no disponible: el endpoint devuelve `error` y `detail` del proveedor.
- 404 del modelo en Gemini: tu clave/región quizá no tiene ese alias habilitado. El endpoint intenta:
  - Probar modelos candidatos comunes.
  - Hacer `ListModels` y usar uno soportado para streaming; si no hay, usa `generateContent` y responde en un bloque.
  - Si ninguno funciona, revisa en Google AI Studio/Google Cloud qué modelos tienes habilitados para tu proyecto/región.

## Notas
- CORS está abierto (`*`) para facilitar pruebas y uso desde la extensión.
- La respuesta del API es `text/plain`; Postman mostrará el texto acumulado durante el stream.

## Tecnologías
- React 19, Vite 7, Tailwind 4
- CRXJS para empaquetar la extensión
- Vercel Edge Functions (`api/query.js`)
- Google Generative AI (Gemini)

