import type { Env } from "./types";
import { handleAdminRoute } from "./routes/admin";
import { handleAuthRoute } from "./routes/auth";
import { handleBatchesRoute } from "./routes/batches";
import { handleStatsRoute } from "./routes/stats";
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

    const statsResponse = await handleStatsRoute(request, env);
    if (statsResponse) {
      return statsResponse;
    }

    const authResponse = await handleAuthRoute(request, env);
    if (authResponse) {
      return authResponse;
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

    if (url.pathname === "/draws/open") {
      try {
        const response = await fetch("https://www.pais.co.il/include/getNextLotteryDate.ashx?type=1", {
          headers: {
            "Accept": "application/json",
            "User-Agent": "lotto-worker/1.0",
          },
        });

        if (!response.ok) {
          return jsonResponse({
            ok: false,
            error: `HTTP ${response.status} from pais.co.il`,
          }, 500);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
          return jsonResponse({
            ok: false,
            error: "Invalid response from pais.co.il",
          }, 500);
        }

        return jsonResponse({
          ok: true,
          draw: data[0],
        });
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, 500);
      }
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

    if (url.pathname === "/tickets/generate" && request.method === "POST") {
      const pythonWorkerUrl = env.PYTHON_WORKER_URL || "https://lottery-generator-python-engine.ushakov-ma.workers.dev";
      
      try {
        const body = await request.text();
        const response = await fetch(`${pythonWorkerUrl}/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body,
        });

        const responseText = await response.text();
        return new Response(responseText, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    const adminResponse = await handleAdminRoute(request, env);
    if (adminResponse) {
      return adminResponse;
    }

    const batchesResponse = await handleBatchesRoute(request, env);
    if (batchesResponse) {
      return batchesResponse;
    }

    return notFoundResponse();
  },

  async scheduled(): Promise<void> {
    console.log("Scheduled job placeholder");
  },
};
