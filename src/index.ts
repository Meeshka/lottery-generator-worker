import type { Env } from "./types";
import { handleAdminRoute } from "./routes/admin";
import { handleAuthRoute } from "./routes/auth";
import { handleBatchesRoute } from "./routes/batches";
import { handleStatsRoute } from "./routes/stats";
import { countDraws } from "./repositories/drawsRepo";
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

    if (url.pathname === "/admin/recalculate-weights" && request.method === "POST") {
      try {
        // Fetch all draws from database
        const draws = await env.DB
          .prepare(`
            SELECT draw_id, draw_date, numbers_json, strong_number, raw_json
            FROM draws
            ORDER BY draw_date ASC, draw_id ASC
          `)
          .all();

        // Call Python Worker to recalculate weights with draw history via service binding
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

        // Import the recalculated weights to Worker DB
        const weightsJson = JSON.stringify(pythonData.weights);
        const sourceDrawCount = pythonData.weights.n_draws_used;

        const { handleAdminRoute } = await import("./routes/admin");
        const importWeightsRequest = new Request(
          new URL("/admin/import/weights", url),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-key": env.ADMIN_KEY,
            },
            body: JSON.stringify({
              versionKey: new Date().toISOString(),
              weightsJson: weightsJson,
              sourceDrawCount: sourceDrawCount,
            }),
          }
        );

        const importWeightsResponse = await handleAdminRoute(importWeightsRequest, env);
        const importWeightsData = await importWeightsResponse.json();

        // Also import draws to Worker DB
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
                "x-admin-key": env.ADMIN_KEY,
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
          totalDraws: totalDraws,
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
      try {
        //console.log("[update-draws] Starting update-draws request");
        const body = await request.json() as { accessToken?: string };
        const accessToken = body.accessToken;

        //console.log("[update-draws] AccessToken present:", !!accessToken);
        //console.log("[update-draws] AccessToken length:", accessToken?.length);

        if (!accessToken) {
          return jsonResponse({
            ok: false,
            error: "accessToken is required",
          }, 400);
        }

        // Fetch draws from Lotto API using the access token
        //console.log("[update-draws] Fetching from Lotto API");
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

        //console.log("[update-draws] Lotto API response status:", lottoResponse.status);

        if (!lottoResponse.ok) {
          const errorText = await lottoResponse.text();
          console.log("[update-draws] Lotto API error:", errorText);
          return jsonResponse({
            ok: false,
            error: `Failed to fetch draws from Lotto API: HTTP ${lottoResponse.status} - ${errorText}`,
          }, lottoResponse.status);
        }

        const drawsData = await lottoResponse.json();
        //console.log("[update-draws] Draws data received, count:", Array.isArray(drawsData) ? drawsData.length : "not an array");
        
        if (!Array.isArray(drawsData)) {
          return jsonResponse({
            ok: false,
            error: `Invalid response from Lotto API: expected array, got ${typeof drawsData}`,
          }, 500);
        }

        // Transform to match ImportDrawsRequestBody format
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

        //console.log("[update-draws] Transformed draws for import, count:", importDraws.length);

        // Use existing admin import/draws endpoint
        const { handleAdminRoute } = await import("./routes/admin");
        const importRequest = new Request(
          new URL("/admin/import/draws", url),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-key": env.ADMIN_KEY,
            },
            body: JSON.stringify({ draws: importDraws }),
          }
        );

        //console.log("[update-draws] Calling admin/import/draws with ADMIN_KEY:", !!env.ADMIN_KEY);

        const importResponse = await handleAdminRoute(importRequest, env);
        const importData = await importResponse.json();

        //console.log("[update-draws] Import response:", importData);

        // Get actual total count from database
        const totalDraws = await countDraws(env.DB);

        // Return the response with the field names the mobile app expects
        return jsonResponse({
          ok: importData.ok,
          importedCount: importData.count,
          totalDraws: totalDraws,
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
        const body = await request.text();

        const pythonRequest = new Request("https://py-engine/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body,
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
