import type { Env } from "../types";
import { jsonResponse, notFoundResponse } from "../utils/response";
import {
  getBatchWithTicketsById,
  getLatestBatchWithTickets,
  getBatches,
  attachLinkedDrawToBatch,
  attachLinkedDrawToBatches,
} from "../services/batchService";
import {
  getBatchResults,
  getBatchSummary,
  getLatestBatchSummary,
} from "../services/resultService";
import { getBatchById } from "../repositories/batchesRepo";


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
