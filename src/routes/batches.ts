import type { Env } from "../types";
import { jsonResponse, notFoundResponse } from "../utils/response";
import {
  getBatchWithTicketsById,
  getLatestBatchWithTickets,
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

  if (pathname === "/batches/latest" && request.method === "GET") {
    const latest = await getLatestBatchWithTickets(env.DB);

    return jsonResponse({
      ok: true,
      batch: latest?.batch ?? null,
      tickets: latest?.tickets ?? [],
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

    return jsonResponse({
      ok: true,
      batch,
      results,
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

    return jsonResponse({
      ok: true,
      batch,
    });
  }

  return null;
}
