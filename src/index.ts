export interface Env {
  DB: D1Database;
  ADMIN_KEY: string;
}

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

function isAdmin(request: Request, env: Env): boolean {
  const key = request.headers.get("x-admin-key");
  return !!key && key === env.ADMIN_KEY;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "lottery-generator-worker",
        db: "connected"
      });
    }

    if (url.pathname === "/stats/overview") {
      const drawsCount = await env.DB
        .prepare("SELECT COUNT(*) as count FROM draws")
        .first<{ count: number }>();

      const latestDraw = await env.DB
        .prepare(`
          SELECT draw_id, draw_date
          FROM draws
          ORDER BY draw_date DESC, draw_id DESC
          LIMIT 1
        `)
        .first<{ draw_id: string; draw_date: string }>();

      const currentWeights = await env.DB
        .prepare(`
          SELECT version_key, source_draw_count
          FROM weights
          WHERE is_current = 1
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .first<{ version_key: string; source_draw_count: number }>();

      return Response.json({
        draws_total: drawsCount?.count ?? 0,
        latest_draw_id: latestDraw?.draw_id ?? null,
        latest_draw_date: latestDraw?.draw_date ?? null,
        has_current_weights: !!currentWeights,
        current_weights_version: currentWeights?.version_key ?? null,
        current_weights_draw_count: currentWeights?.source_draw_count ?? null
      });
    }

    if (url.pathname === "/draws/latest") {
      const row = await env.DB
        .prepare(`
          SELECT id, draw_id, draw_date, numbers_json, strong_number, raw_json
          FROM draws
          ORDER BY draw_date DESC, draw_id DESC
          LIMIT 1
        `)
        .first();

      return Response.json(row ?? null);
    }

    if (url.pathname === "/weights/current") {
      const row = await env.DB
        .prepare(`
          SELECT id, version_key, weights_json, source_draw_count, created_at
          FROM weights
          WHERE is_current = 1
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .first();

      return Response.json(row ?? null);
    }

    if (url.pathname === "/admin/import/draws" && request.method === "POST") {
      if (!isAdmin(request, env)) return unauthorized();

      const body = await request.json<unknown>();
      if (!Array.isArray(body)) {
        return Response.json({ ok: false, error: "Expected JSON array" }, { status: 400 });
      }

      let inserted = 0;
      let skipped = 0;

      for (const item of body) {
        if (!item || typeof item !== "object") {
          skipped++;
          continue;
        }

        const draw = item as {
          id?: unknown;
          endsAt?: unknown;
          numbers?: unknown;
          strong?: unknown;
        };

        if (
          typeof draw.id !== "number" ||
          typeof draw.endsAt !== "string" ||
          !Array.isArray(draw.numbers) ||
          draw.numbers.length !== 6 ||
          !draw.numbers.every((n) => typeof n === "number")
        ) {
          skipped++;
          continue;
        }

        const strongNumber =
          typeof draw.strong === "number" ? draw.strong : null;

        const result = await env.DB
          .prepare(`
            INSERT OR IGNORE INTO draws
              (draw_id, draw_date, numbers_json, strong_number, raw_json)
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(
            String(draw.id),
            draw.endsAt,
            JSON.stringify([...draw.numbers].sort((a, b) => a - b)),
            strongNumber,
            JSON.stringify(item)
          )
          .run();

        if ((result.meta.changes ?? 0) > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }

      return Response.json({
        ok: true,
        inserted,
        skipped
      });
    }

    if (url.pathname === "/admin/import/weights" && request.method === "POST") {
      if (!isAdmin(request, env)) return unauthorized();

      const body = await request.json<unknown>();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return Response.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
      }

      const weights = body as {
        n_draws_used?: unknown;
      };

      const versionKey = new Date().toISOString();
      const sourceDrawCount =
        typeof weights.n_draws_used === "number" ? weights.n_draws_used : null;

      await env.DB.prepare(`UPDATE weights SET is_current = 0 WHERE is_current = 1`).run();

      await env.DB
        .prepare(`
          INSERT INTO weights
            (version_key, weights_json, source_draw_count, is_current)
          VALUES (?, ?, ?, 1)
        `)
        .bind(versionKey, JSON.stringify(body), sourceDrawCount)
        .run();

      return Response.json({
        ok: true,
        version_key: versionKey,
        source_draw_count: sourceDrawCount
      });
    }

    if (url.pathname === "/admin/ping") {
      return Response.json({
        ok: true,
        method: request.method,
        path: url.pathname
      });
    }
    
    return new Response("Not found", { status: 404 });
  },

  async scheduled(): Promise<void> {
    console.log("Scheduled job placeholder");
  }
};
