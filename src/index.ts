import type { Env } from "./types";
import { handleAdminRoute } from "./routes/admin";
import { handleAuthRoute } from "./routes/auth";
import { handleBatchesRoute } from "./routes/batches";
import { handleStatsRoute } from "./routes/stats";
import { countDraws } from "./repositories/drawsRepo";
import { getCurrentWeights } from "./repositories/weightsRepo";
import { jsonResponse, notFoundResponse } from "./utils/response";
import { fetchOpenPaisDraw } from "./utils/pais";
import { requireAdminContext } from "./utils/routeGuards";

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

    if (url.pathname === "/draws/all") {
      const rows = await env.DB
        .prepare(`
          SELECT draw_id, draw_date, numbers_json, strong_number, raw_json
          FROM draws
          ORDER BY draw_date ASC, draw_id ASC
        `)
        .all();

      return jsonResponse(rows.results || rows);
    }

    if (url.pathname === "/draws/open") {
      try {
        const openDraw = await fetchOpenPaisDraw();

        return jsonResponse({
          ok: true,
          draw: openDraw.raw,
        });
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500,
        );
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

    if (url.pathname === "/admin/recalculate-weights" && request.method === "POST") {
      const admin = await requireAdminContext(request, env);
      if (!admin.ok) {
        return admin.response;
      }

      try {
        // Fetch all draws from database
        const draws = await env.DB
          .prepare(`
            SELECT draw_id, draw_date, numbers_json, strong_number, raw_json
            FROM draws
            ORDER BY draw_date ASC, draw_id ASC
          `)
          .all();

        const pythonRequest = new Request("https://py-engine/recalculate-weights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ draws: draws.results || draws }),
        });

        const pythonResponse = await env.PY_ENGINE.fetch(pythonRequest);

        if (!pythonResponse.ok) {
          const errorText = await pythonResponse.text();
          return jsonResponse({
            ok: false,
            error: `Failed to recalculate weights in Python Worker: HTTP ${pythonResponse.status} - ${errorText}`,
          }, pythonResponse.status);
        }

        const pythonData = await pythonResponse.json();

        if (!pythonData.ok) {
          return jsonResponse({
            ok: false,
            error: pythonData.error || "Failed to recalculate weights",
          }, 500);
        }

        const weightsJson = JSON.stringify(pythonData.weights);
        const sourceDrawCount = pythonData.weights.n_draws_used;

        const { handleAdminRoute } = await import("./routes/admin");
        const importWeightsRequest = new Request(
          new URL("/admin/import/weights", url),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${admin.ctx.accessToken}`,
            },
            body: JSON.stringify({
              versionKey: new Date().toISOString(),
              weightsJson,
              sourceDrawCount,
            }),
          }
        );

        const importWeightsResponse = await handleAdminRoute(importWeightsRequest, env);
        const importWeightsData = await importWeightsResponse.json();

        const importDraws = pythonData.weights.draw_history?.map((draw: any) => ({
          drawId: String(draw.id),
          drawDate: draw.endsAt,
          numbersJson: JSON.stringify(draw.numbers || []),
          strongNumber: draw.strong || null,
          rawJson: JSON.stringify(draw),
          paisId: draw.paisId || null,
        })) || [];

        if (importDraws.length > 0) {
          const importDrawsRequest = new Request(
            new URL("/admin/import/draws", url),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${admin.ctx.accessToken}`,
              },
              body: JSON.stringify({ draws: importDraws }),
            }
          );

          await handleAdminRoute(importDrawsRequest, env);
        }

        const totalDraws = await countDraws(env.DB);

        return jsonResponse({
          ok: true,
          message: "Weights recalculated and imported successfully",
          weights: pythonData.weights,
          importedDraws: importDraws.length,
          totalDraws,
        });
      } catch (error) {
        console.error("[recalculate-weights] Error:", error);
        return jsonResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/admin/update-draws" && request.method === "POST") {
      const admin = await requireAdminContext(request, env);
      if (!admin.ok) {
        return admin.response;
      }

      try {
        const accessToken = admin.ctx.accessToken;

        const lottoResponse = await fetch("https://api.lottosheli.com/api/v1/client/draws/DRAW_LOTTO?type=null", {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "Authorization": `otp ${accessToken}`,
            "User-Agent": "lotto-worker/1.0",
            "Origin": "https://lottosheli.com",
            "Referer": "https://lottosheli.com/",
          },
        });

        if (!lottoResponse.ok) {
          const errorText = await lottoResponse.text();
          return jsonResponse({
            ok: false,
            error: `Failed to fetch draws from Lotto API: HTTP ${lottoResponse.status} - ${errorText}`,
          }, lottoResponse.status);
        }

        const drawsData = await lottoResponse.json();

        if (!Array.isArray(drawsData)) {
          return jsonResponse({
            ok: false,
            error: `Invalid response from Lotto API: expected array, got ${typeof drawsData}`,
          }, 500);
        }

        const importDraws = drawsData.map((draw: any) => {
          const results = draw.results || {};
          return {
            drawId: String(draw.id),
            drawDate: draw.endsAt,
            numbersJson: JSON.stringify(results.numbers || []),
            strongNumber: results.strongNumber || null,
            rawJson: JSON.stringify(draw),
            paisId: draw.paisId || null,
          };
        });

        const { handleAdminRoute } = await import("./routes/admin");
        const importRequest = new Request(
          new URL("/admin/import/draws", url),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${admin.ctx.accessToken}`,
            },
            body: JSON.stringify({ draws: importDraws }),
          }
        );

        const importResponse = await handleAdminRoute(importRequest, env);
        const importData = await importResponse.json();

        const totalDraws = await countDraws(env.DB);

        return jsonResponse({
          ok: importData.ok,
          importedCount: importData.count,
          totalDraws,
        });
      } catch (error) {
        console.error("[update-draws] Error:", error);
        return jsonResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/tickets/generate" && request.method === "POST") {
      try {
        const incoming = await request.json() as Record<string, unknown>;

        const currentWeights = await getCurrentWeights(env.DB);

        const confirmedTicketsResult = await env.DB
          .prepare(`
            SELECT t.numbers_json
            FROM tickets t
            INNER JOIN ticket_batches b ON b.id = t.batch_id
            WHERE b.status = 'confirmed'
              AND b.deleted_at IS NULL
            ORDER BY b.confirmed_at DESC, b.id DESC, t.ticket_index ASC, t.id ASC
          `)
          .all<{ numbers_json: string }>();

        const historyTickets = (confirmedTicketsResult.results ?? [])
          .map((row) => {
            try {
              const parsed = JSON.parse(row.numbers_json) as unknown;
              if (!Array.isArray(parsed) || parsed.length !== 6) {
                return null;
              }

              const nums = parsed.map((x) => Number(x)).sort((a, b) => a - b);
              if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 37)) {
                return null;
              }
              if (new Set(nums).size !== 6) {
                return null;
              }

              return nums;
            } catch {
              return null;
            }
          })
          .filter((nums): nums is number[] => Array.isArray(nums));

        const pythonBody = {
          ...incoming,
          weights: currentWeights?.weights_json
            ? JSON.parse(currentWeights.weights_json)
            : null,
          historyTickets,
          historySource: "confirmed_batches",
        };

        const pythonRequest = new Request("https://py-engine/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(pythonBody),
        });

        const response = await env.PY_ENGINE.fetch(pythonRequest);
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
