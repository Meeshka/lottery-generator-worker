export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

export function notFoundResponse(): Response {
  return jsonResponse({ ok: false, error: "Not found" }, { status: 404 });
}

export function unauthorizedResponse(): Response {
  return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function badRequestResponse(message: string): Response {
  return jsonResponse({ ok: false, error: message }, { status: 400 });
}