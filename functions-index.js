/**
 * EXAMIVO — Secure Backend Entry Point (Firebase Cloud Functions + Standalone HTTP Server)
 * Routes:
 *   POST /api/ai/pipeline       -> 9-Stage Material Analysis, Exam Focus & Question Generation
 *   POST /api/ai/weak-practice  -> Targeted Weak-Area Practice Generation
 *   POST /api/ai/evaluate       -> Open-Ended / Theory Response Evaluation
 *   POST /api/ai/study          -> "Study My Mistakes" Revision Guide & Retest Generation
 *   GET  /api/health            -> Backend AI Readiness Check
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  resolveAIProviderConfig,
  executeFullExaminationPipeline,
  executeWeakAreaPracticePipeline,
  executeOpenResponseEvaluation,
  executeStudyMistakesGeneration
} = require("./functions-ai.js");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(body);
}

function parseRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Unified API Request Handler (Works in both Firebase Cloud Functions & Node HTTP Server)
 */
async function handleApiRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      const cfg = resolveAIProviderConfig();
      return sendJson(res, 200, {
        status: "ok",
        service: "EXAMIVO Intelligence Backend",
        providerConfigured: cfg.provider,
        visionEnabled: cfg.supportsVision
      });
    }

    if (pathname === "/api/ai/pipeline" && req.method === "POST") {
      const body = await parseRequestBody(req);
      const result = await executeFullExaminationPipeline(body);
      return sendJson(res, 200, result);
    }

    if (pathname === "/api/ai/weak-practice" && req.method === "POST") {
      const body = await parseRequestBody(req);
      const result = await executeWeakAreaPracticePipeline(body);
      return sendJson(res, 200, result);
    }

    if (pathname === "/api/ai/evaluate" && req.method === "POST") {
      const body = await parseRequestBody(req);
      const result = await executeOpenResponseEvaluation(body);
      return sendJson(res, 200, result);
    }

    if (pathname === "/api/ai/study" && req.method === "POST") {
      const body = await parseRequestBody(req);
      const result = await executeStudyMistakesGeneration(body);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, {
      error: "not_found",
      userMessage: "Requested EXAMIVO API endpoint was not found."
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendJson(res, status, {
      error: "ai_processing_failed",
      userMessage:
        err.statusCode === 422
          ? err.message
          : "EXAMIVO couldn't complete that request right now. Please try again."
    });
  }
}

// Export for Firebase Cloud Functions (v2 / v1 compatible)
try {
  const { onRequest } = require("firebase-functions/v2/https");
  exports.api = onRequest({ cors: true, timeoutSeconds: 120, memory: "512MiB" }, handleApiRequest);
} catch (_) {
  // firebase-functions not installed in standalone local environment; export handler directly
  exports.api = handleApiRequest;
}

// When executed directly via `node functions-index.js`, start the full HTTP server (API + Static Hosting)
if (require.main === module) {
  const PORT = Number(process.env.PORT) || 8080;
  const ROOT_DIR = __dirname;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname.startsWith("/api/")) {
      return handleApiRequest(req, res);
    }

    if (pathname === "/") {
      pathname = "/index.html";
    }

    // Prevent directory traversal and block sensitive backend files from static serving
    const safeFile = path.basename(pathname);
    const blockedFiles = new Set([
      "functions-index.js",
      "functions-ai.js",
      "firestore.rules",
      "package.json",
      "package-lock.json",
      "examivo.zip"
    ]);

    if (blockedFiles.has(safeFile)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    const filePath = path.join(ROOT_DIR, safeFile);
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html if clean path requested
        const htmlCandidate = path.join(ROOT_DIR, `${safeFile}.html`);
        if (fs.existsSync(htmlCandidate)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          fs.createReadStream(htmlCandidate).pipe(res);
          return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`EXAMIVO platform running on http://0.0.0.0:${PORT}`);
  });
}
