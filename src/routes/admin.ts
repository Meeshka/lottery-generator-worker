import type { Env, TicketInput, TicketResultInput, DrawInput } from "../types";
import { readJsonBody } from "../utils/json";
import {
  badRequestResponse,
  jsonResponse,
  notFoundResponse,
} from "../utils/response";
import { requireAdminContext } from "../utils/routeGuards";
import {
  getBatchWithTicketsById,
  getLatestBatchWithTickets,
  getLatestGeneratedBatchWithTickets,
  getBatches,
  archiveBatchById,
  archiveCheckedBatch,
  deleteBatchById,
  checkMissingBatchResults,
} from "../services/batchService";
import {
  getBatchResults,
  importBatchResults,
  calculateAndImportBatchResults,
} from "../services/resultService";
import { upsertDraw, getDrawByDrawId } from "../repositories/drawsRepo";
import { insertWeights } from "../repositories/weightsRepo";

interface ImportResultsRequestBody {
  drawId?: string | null;
  prizeTable?: string | null;
  results?: TicketResultInput[];
  auto?: boolean;
}

interface ImportDrawsRequestBody {
  draws: DrawInput[];
}

interface ImportWeightsRequestBody {
  versionKey: string;
  weightsJson: string;
  sourceDrawCount: number | null;
}


function parseBatchIdFromPath(pathname: string, suffix?: string): number | null {
  const base = "/admin/batches/";
  if (!pathname.startsWith(base)) {
    return null;
  }

  const rest = pathname.slice(base.length);

  if (suffix) {
    if (!rest.endsWith(suffix)) {
      return null;
    }
    const idPart = rest.slice(0, -suffix.length);
    const value = Number(idPart);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  const value = Number(rest);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function handleAdminRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!pathname.startsWith("/admin/")) {
    return null;
  }

  const admin = await requireAdminContext(request, env);
  if (!admin.ok) {
    return admin.response;
  }

  if (pathname === "/admin/import/draws" && request.method === "POST") {
    try {
      const body = await readJsonBody<ImportDrawsRequestBody>(request);

      const draws = body.draws ?? [];
      const upsertedDraws: any[] = [];
      let newDrawsCount = 0;

      for (const draw of draws) {
        const existing = await getDrawByDrawId(env.DB, draw.drawId);
        if (!existing) {
          newDrawsCount++;
        }
        const upserted = await upsertDraw(env.DB, {
          drawId: draw.drawId,
          drawDate: draw.drawDate,
          numbersJson: draw.numbersJson,
          strongNumber: draw.strongNumber ?? null,
          rawJson: draw.rawJson ?? null,
          paisId: draw.paisId ?? null,
        });
        upsertedDraws.push(upserted);
      }

      return jsonResponse({
        ok: true,
        count: newDrawsCount,
        draws: upsertedDraws,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname === "/admin/import/weights" && request.method === "POST") {
    try {
      const body = await readJsonBody<ImportWeightsRequestBody>(request);

      const inserted = await insertWeights(env.DB, {
        versionKey: body.versionKey,
        weightsJson: body.weightsJson,
        sourceDrawCount: body.sourceDrawCount ?? null,
      });

      return jsonResponse({
        ok: true,
        weights: inserted,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname === "/admin/batches/latest" && request.method === "GET") {
    const latest = await getLatestBatchWithTickets(env.DB);

    return jsonResponse({
      ok: true,
      batch: latest?.batch ?? null,
      tickets: latest?.tickets ?? [],
    });
  }

  if (pathname === "/admin/batches/latest-generated" && request.method === "GET") {
    const latest = await getLatestGeneratedBatchWithTickets(env.DB);

    return jsonResponse({
      ok: true,
      batch: latest?.batch ?? null,
      tickets: latest?.tickets ?? [],
    });
  }

  if (pathname === "/admin/batches" && request.method === "GET") {
    const limitParam = url.searchParams.get("limit");
    const statusParam = url.searchParams.get("status");

    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const status = statusParam || undefined;

    const batches = await getBatches(env.DB, { limit, status });

    return jsonResponse({
      ok: true,
      batches,
    });
  }

  if (pathname.endsWith("/tickets") && request.method === "GET") {
    const batchId = parseBatchIdFromPath(pathname, "/tickets");
    if (!batchId) {
      return notFoundResponse();
    }

    const data = await getBatchWithTicketsById(env.DB, batchId);
    if (!data) {
      return notFoundResponse();
    }

    return jsonResponse({
      ok: true,
      batch: data.batch,
      tickets: data.tickets,
    });
  }

  if (pathname.endsWith("/results/import") && request.method === "POST") {
    const batchId = parseBatchIdFromPath(pathname, "/results/import");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const bodyText = await request.text();
      const body: ImportResultsRequestBody = bodyText
        ? JSON.parse(bodyText)
        : {};

      const hasExplicitResults =
        Array.isArray(body.results) && body.results.length > 0;

      const result = hasExplicitResults
        ? await importBatchResults(env.DB, {
            batchId,
            drawId: body.drawId ?? null,
            prizeTable: body.prizeTable ?? null,
            results: body.results ?? [],
          })
        : await calculateAndImportBatchResults(env.DB, {
            batchId,
            prizeTable: body.prizeTable ?? "regular",
          });

      return jsonResponse({
        ok: true,
        ...result,
        mode: hasExplicitResults ? "imported" : "calculated",
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname.endsWith("/results") && request.method === "GET") {
    const batchId = parseBatchIdFromPath(pathname, "/results");
    if (!batchId) {
      return notFoundResponse();
    }

    const results = await getBatchResults(env.DB, batchId);

    return jsonResponse({
      ok: true,
      batchId,
      results,
    });
  }

  if (pathname.endsWith("/archive") && request.method === "POST") {
    const batchId = parseBatchIdFromPath(pathname, "/archive");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      await archiveBatchById(env.DB, batchId);
      return jsonResponse({
        ok: true,
        batchId,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname.endsWith("/archive-checked") && request.method === "POST") {
    const batchId = parseBatchIdFromPath(pathname, "/archive-checked");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const batch = await archiveCheckedBatch(env.DB, batchId);
      return jsonResponse({
        ok: true,
        batch,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (request.method === "DELETE") {
    const batchId = parseBatchIdFromPath(pathname);
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      await deleteBatchById(env.DB, batchId);
      return jsonResponse({
        ok: true,
        batchId,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname === "/admin/batches/check-missing-results" && request.method === "POST") {
    try {
      const result = await checkMissingBatchResults(env.DB);

      return jsonResponse({
        ok: true,
        ...result,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return null;
}
