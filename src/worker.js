import { runMvpGateway } from "./core/index.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        ok: true,
        service: "vtdd-v2-worker",
        mode: "mvp"
      });
    }

    if (request.method === "POST" && url.pathname === "/mvp/gateway") {
      const payload = await readJson(request);
      const result = runMvpGateway(payload);
      return json(result.allowed ? 200 : 422, result);
    }

    return json(404, {
      ok: false,
      error: "not_found"
    });
  }
};

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}
