import type { Env } from "../types";
import { jsonResponse, notFoundResponse, badRequestResponse } from "../utils/response";
import { readJsonBody } from "../utils/json";
import { requireAuthContext } from "../utils/routeGuards";
import {
  getBatchWithTicketsById,
  getLatestBatchWithTickets,
  getBatches,
  attachLinkedDrawToBatch,
  attachLinkedDrawToBatches,
  createBatchWithTickets,
  markBatchAsSubmitted,
  syncBatchConfirmation,
  refreshBatchStatusesFromLotto,
} from "../services/batchService";
import { applyBatchToLottoByToken } from "../services/lottoPurchaseService";
import {
  getBatchResults,
  getBatchSummary,
  getLatestBatchSummary,
} from "../services/resultService";
import { getBatchById } from "../repositories/batchesRepo";

interface CreateBatchRequestBody {
  targetDrawId?: string | null;
  targetPaisId?: number | null;
  targetDrawAt?: string | null;
  targetDrawSnapshotJson?: string | null;
  generatorVersion?: string | null;
  weightsVersionKey?: string | null;
  tickets: Array<{
    ticketIndex: number;
    numbers: number[];
    strong?: number | null;
  }>;
}

interface ApplyToLottoRequestBody {
  batchId?: number;
}

interface RefreshBatchStatusesRequestBody {
  accessToken?: string;
}

interface SyncConfirmationRequestBody {
  token?: string;
}


function parseBatchIdFromPath(pathname: string, suffix?: string): number | null {
  const base = "/batches/";
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

export async function handleBatchesRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!pathname.startsWith("/batches")) {
    return null;
  }

  if (pathname === "/batches" && request.method === "GET") {
    const limitParam = url.searchParams.get("limit");
    const statusParam = url.searchParams.get("status");

    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const status = statusParam || undefined;

    const batches = await getBatches(env.DB, { limit, status });
    const enrichedBatches = await attachLinkedDrawToBatches(env.DB, batches);

    return jsonResponse({
      ok: true,
      batches: enrichedBatches,
    });
  }

  if (pathname === "/batches/latest" && request.method === "GET") {
    const latest = await getLatestBatchWithTickets(env.DB);
    const batchWithDraw = latest?.batch
      ? await attachLinkedDrawToBatch(env.DB, latest.batch)
      : null;

    return jsonResponse({
      ok: true,
      batch: batchWithDraw,
      tickets: latest?.tickets ?? [],
      linkedDraw: batchWithDraw?.linked_draw ?? null,
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

    const batchWithDraw = await attachLinkedDrawToBatch(env.DB, data.batch);

    return jsonResponse({
      ok: true,
      batch: batchWithDraw,
      tickets: data.tickets,
      linkedDraw: batchWithDraw.linked_draw,
    });
  }

  if (pathname.endsWith("/results") && request.method === "GET") {
    const batchId = parseBatchIdFromPath(pathname, "/results");
    if (!batchId) {
      return notFoundResponse();
    }

    const batch = await getBatchById(env.DB, batchId);
    if (!batch) {
      return notFoundResponse();
    }

    const results = await getBatchResults(env.DB, batchId);

    const batchWithDraw = await attachLinkedDrawToBatch(env.DB, batch);

    return jsonResponse({
      ok: true,
      batch: batchWithDraw,
      results,
      linkedDraw: batchWithDraw.linked_draw,
    });
  }

  if (pathname === "/batches/latest/summary" && request.method === "GET") {
    const summary = await getLatestBatchSummary(env.DB);

    return jsonResponse({
      ok: true,
      summary,
    });
  }

  if (pathname.endsWith("/summary") && request.method === "GET") {
    const batchId = parseBatchIdFromPath(pathname, "/summary");
    if (!batchId) {
      return notFoundResponse();
    }

    const summary = await getBatchSummary(env.DB, batchId);
    if (!summary) {
      return notFoundResponse();
    }

    return jsonResponse({
      ok: true,
      summary,
    });
  }

  if (pathname === "/batches/create" && request.method === "POST") {
    const auth = await requireAuthContext(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    try {
      const body = await readJsonBody<CreateBatchRequestBody>(request);

      const created = await createBatchWithTickets(env.DB, {
        targetDrawId: body.targetDrawId ?? null,
        targetPaisId: body.targetPaisId ?? null,
        targetDrawAt: body.targetDrawAt ?? null,
        targetDrawSnapshotJson: body.targetDrawSnapshotJson ?? null,
        generatorVersion: body.generatorVersion ?? null,
        weightsVersionKey: body.weightsVersionKey ?? null,
        tickets: body.tickets ?? [],
      });

      return jsonResponse({
        ok: true,
        batch: created.batch,
        tickets: created.tickets,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname === "/batches/refresh-statuses" && request.method === "POST") {
    const auth = await requireAuthContext(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    try {
      const result = await refreshBatchStatusesFromLotto(env.DB, auth.ctx.accessToken);

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

  if (pathname.endsWith("/mark-submitted") && request.method === "POST") {
    const auth = await requireAuthContext(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const batchId = parseBatchIdFromPath(pathname, "/mark-submitted");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const batch = await markBatchAsSubmitted(env.DB, batchId);

      return jsonResponse({
        ok: true,
        batchId,
        status: batch?.status,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname.endsWith("/sync-confirmation") && request.method === "POST") {
    const auth = await requireAuthContext(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const batchId = parseBatchIdFromPath(pathname, "/sync-confirmation");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const result = await syncBatchConfirmation(
        env.DB,
        batchId,
        auth.ctx.accessToken,
      );

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

  if (pathname.endsWith("/submit-and-sync") && request.method === "POST") {
    const auth = await requireAuthContext(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const batchId = parseBatchIdFromPath(pathname, "/submit-and-sync");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const batch = await markBatchAsSubmitted(env.DB, batchId);
      const syncResult = await syncBatchConfirmation(
        env.DB,
        batchId,
        auth.ctx.accessToken,
      );

      return jsonResponse({
        ok: true,
        batchId,
        submittedStatus: batch?.status,
        ...syncResult,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname.endsWith("/apply-to-lotto") && request.method === "POST") {
    const auth = await requireAuthContext(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const batchId = parseBatchIdFromPath(pathname, "/apply-to-lotto");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const result = await applyBatchToLottoByToken(
        env.DB,
        batchId,
        auth.ctx.accessToken,
      );

      return jsonResponse(result);
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (request.method === "GET") {
    const batchId = parseBatchIdFromPath(pathname);
    if (!batchId) {
      return null;
    }

    const batch = await getBatchById(env.DB, batchId);
    if (!batch) {
      return notFoundResponse();
    }

    const batchWithDraw = await attachLinkedDrawToBatch(env.DB, batch);

    return jsonResponse({
      ok: true,
      batch: batchWithDraw,
      linkedDraw: batchWithDraw.linked_draw,
    });
  }

  return null;
}
