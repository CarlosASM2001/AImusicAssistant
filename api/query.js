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
      const data = await req.json();
      query = (data?.query || "").toString().slice(0, 1000);
      // Imagen no soportada vía JSON en este endpoint por simplicidad
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      query = (form.get("query") || "").toString().slice(0, 1000);
      file = form.get("image");
    } else if (contentType.includes("text/plain")) {
      const txt = await req.text();
      query = (txt || "").toString().slice(0, 1000);
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported Media Type. Usa form-data o JSON." }),
        { status: 415, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const parts = [];
    if (query) {
      parts.push({
        text:
          `Rol: Eres un curador musical. Tarea: recomendar 3-5 artistas.
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
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "Responde en español y sé concreto. Prioriza artistas relevantes al criterio del usuario. Evita relleno.",
    });

    const resp = await model.generateContentStream({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.7 },
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of resp.stream) {
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