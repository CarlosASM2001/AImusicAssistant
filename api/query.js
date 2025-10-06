import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Friendly usage for GET requests in browser
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Este endpoint acepta POST.",
        usage: {
          preferred: {
            method: "POST",
            contentType: "multipart/form-data",
            fields: { query: "string", image: "archivo opcional" },
          },
          alternative: {
            method: "POST",
            contentType: "application/json",
            body: { query: "string" },
          },
        },
      }),
      { headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  try {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    let query = "";
    let file = null;

    if (contentType.includes("application/json")) {
      const data = await req.json().catch(() => ({}));
      query = (data?.query || "").toString().slice(0, 1000);
      // Imagen no soportada vía JSON en este endpoint por simplicidad
    } else if (contentType.includes("multipart/form-data")) {
      // Algunos clientes envían partes sin nombre; capturamos error y devolvemos 400 entendible
      let form;
      try {
        form = await req.formData();
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "FormData inválido. Asegúrate de nombrar los campos (query, image)." }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }
        );
      }
      const maybeQuery = form.get("query");
      query = (maybeQuery ?? "").toString().slice(0, 1000);
      file = form.get("image");
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      const params = new URLSearchParams(body);
      query = (params.get("query") || "").toString().slice(0, 1000);
    } else if (contentType.includes("text/plain")) {
      const txt = await req.text();
      query = (txt || "").toString().slice(0, 1000);
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported Media Type. Usa form-data, JSON o x-www-form-urlencoded." }),
        { status: 415, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const parts = [];
    if (query) {
      parts.push({
        text:
          `Rol: Eres un curador musical. Tarea: recomendar artistas basados en el contexto del usuario.
        Contexto del usuario: ${query}
        Criterio: letras, estética/imagen, subgénero, época, similares.
        Formato: lista breve con artista + por qué.`,
      });
    }

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const mimeType = file.type || "image/jpeg";
      const bytes = await file.arrayBuffer();
      const base64 = base64FromArrayBuffer(bytes);
      parts.push({ inlineData: { mimeType, data: base64 } });
    }

    if (parts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Falta 'query' o 'image'." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response("Falta configurar GEMINI_API_KEY", { status: 500, headers: cors });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-latest",
      "gemini-2.5-flash-8b",
      "gemini-2.5-pro",
      "gemini-2.5-pro-latest",
      "gemini-pro",
    ];

    let streamSource = null;
    let lastUnsupportedErr = null;

    for (const modelName of candidateModels) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction:
          "Responde en español y sé concreto. Prioriza artistas relevantes al criterio del usuario. Evita relleno.",
      });
      try {
        const s = await model.generateContentStream({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.7 },
        });
        streamSource = s.stream;
        break;
      } catch (e) {
        const msg = String(e?.message || "");
        if (msg.includes("not found") || msg.includes("not supported") || msg.includes("ListModels")) {
          lastUnsupportedErr = e;
          continue; // intenta siguiente modelo
        }
        const message = e?.message || "Error llamando al proveedor";
        const status = e?.status || 502;
        return new Response(
          JSON.stringify({ error: "Proveedor no disponible", detail: message }),
          { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }
        );
      }
    }

    // Si no hay soporte de streaming tras intentar candidatos, intentar descubrir modelos soportados vía ListModels
    if (!streamSource) {
      try {
        const discovered = await discoverModelsViaList(apiKey, true);
        for (const modelName of discovered) {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction:
              "Responde en español y sé concreto. Prioriza artistas relevantes al criterio del usuario. Evita relleno.",
          });
          try {
            const s = await model.generateContentStream({
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.7 },
            });
            streamSource = s.stream;
            break;
          } catch (e) {
            // Continua probando
          }
        }
      } catch {
        // ignorar errores de descubrimiento y seguir con fallback sin streaming
      }
    }

    // Si aún no hay soporte de streaming, intenta no-stream y envía en un solo chunk
    if (!streamSource) {
      let text = "";
      let picked = null;
      let lastErr = lastUnsupportedErr;
      // Primero intenta con cualquier modelo descubierto que soporte generateContent
      let genCandidates = [];
      try {
        genCandidates = await discoverModelsViaList(apiKey, false);
      } catch {
        // si falla, usa candidatos predefinidos
        genCandidates = candidateModels;
      }
      for (const modelName of genCandidates) {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction:
            "Responde en español y sé concreto. Prioriza artistas relevantes al criterio del usuario. Evita relleno.",
        });
        try {
          const resp = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.7 },
          });
          text = resp?.response?.text?.() ?? "";
          picked = modelName;
          break;
        } catch (e) {
          lastErr = e;
          continue;
        }
      }

      if (!picked) {
        const message = lastErr?.message || "Modelos no disponibles para esta clave/región";
        const status = lastErr?.status || 502;
        return new Response(
          JSON.stringify({ error: "Proveedor no disponible", detail: message }),
          { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(text));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of streamSource) {
          controller.enqueue(encoder.encode(chunk.text()));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error(err);
    return new Response("Error interno", { status: 500, headers: cors });
  }
}

function base64FromArrayBuffer(ab) {
  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Descubre modelos disponibles para la API key actual usando REST
// Si streamPreferred=true, prioriza modelos con "streamGenerateContent" en supportedGenerationMethods
async function discoverModelsViaList(apiKey, streamPreferred) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models";
  const res = await fetch(url + `?key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
  const data = await res.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  const supports = (m, method) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes(method);

  const names = models.map((m) => m?.name?.split("/").pop()).filter(Boolean);

  if (streamPreferred) {
    // Filtra por soporte de streamGenerateContent; cae a generateContent si no hay
    const streamable = models
      .filter((m) => supports(m, "streamGenerateContent"))
      .map((m) => m.name.split("/").pop());
    if (streamable.length > 0) return streamable;
  }

  const generatable = models
    .filter((m) => supports(m, "generateContent"))
    .map((m) => m.name.split("/").pop());
  return generatable.length > 0 ? generatable : names;
}