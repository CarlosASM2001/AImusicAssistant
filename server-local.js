import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
const upload = multer();
const PORT = process.env.PORT || 8787;

app.post("/api/query", upload.single("image"), async (req, res) => {
  try {
    // Proxy local request to the same handler logic by calling the Vercel function locally is complex.
    // For local testing, we'll call the module directly by emulating the Request expected by handler.
    const mod = await import("./api/query.js");

    // Build a Web Fetch API compatible Request
    const form = new FormData();
    if (req.body?.query) form.append("query", req.body.query);
    if (req.file) {
      form.append("image", req.file.buffer, {
        filename: req.file.originalname || "image.jpg",
        contentType: req.file.mimetype || "image/jpeg",
      });
    }

    // Convert FormData to a fetch Request for the handler
    const request = new Request("http://localhost/api/query", { method: "POST", body: form });

    const response = await mod.default(request);

    // Stream response to client
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));

    if (!response.body) {
      const text = await response.text();
      res.send(text);
      return;
    }

    const reader = response.body.getReader();
    const encoder = new TextEncoder();
    res.setHeader("Transfer-Encoding", "chunked");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error interno");
  }
});

app.options("/api/query", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Local server listening on http://localhost:${PORT}`));
