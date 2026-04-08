import type { Env } from "./types";
import { handleAdminRoute } from "./routes/admin";
import { jsonResponse, notFoundResponse } from "./utils/response";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "lottery-generator-worker",
        db: "connected",
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

      return jsonResponse({
        draws_total: drawsCount?.count ?? 0,
        latest_draw_id: latestDraw?.draw_id ?? null,
        latest_draw_date: latestDraw?.draw_date ?? null,
        has_current_weights: !!currentWeights,
        current_weights_version: currentWeights?.version_key ?? null,
        current_weights_draw_count: currentWeights?.source_draw_count ?? null,
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

      return jsonResponse(row ?? null);
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

      return jsonResponse(row ?? null);
    }

    const adminResponse = await handleAdminRoute(request, env);
    if (adminResponse) {
      return adminResponse;
    }

    return notFoundResponse();
  },

  async scheduled(): Promise<void> {
    console.log("Scheduled job placeholder");
  },
};