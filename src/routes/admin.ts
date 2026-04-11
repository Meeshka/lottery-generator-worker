import type { Env, TicketInput, TicketResultInput } from "../types";
import { readJsonBody } from "../utils/json";
import {
  badRequestResponse,
  jsonResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "../utils/response";
import {
  createBatchWithTickets,
  getBatchWithTicketsById,
  getLatestBatchWithTickets,
  getLatestGeneratedBatchWithTickets,
  getBatches,
  archiveBatchById,
} from "../services/batchService";
import {
  getBatchResults,
  importBatchResults,
} from "../services/resultService";

interface CreateBatchRequestBody {
  batchKey: string;
  targetDrawId?: string | null;
  targetPaisId?: number | null;
  targetDrawAt?: string | null;
  targetDrawSnapshotJson?: string | null;
  generatorVersion?: string | null;
  weightsVersionKey?: string | null;
  tickets: TicketInput[];
}

interface ImportResultsRequestBody {
  drawId?: string | null;
  prizeTable?: string | null;
  results: TicketResultInput[];
}

function isAdmin(request: Request, env: Env): boolean {
  const key = request.headers.get("x-admin-key");
  return !!key && key === env.ADMIN_KEY;
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

  if (!isAdmin(request, env)) {
    return unauthorizedResponse();
  }

  if (pathname === "/admin/batches/create" && request.method === "POST") {
    try {
      const body = await readJsonBody<CreateBatchRequestBody>(request);

      const created = await createBatchWithTickets(env.DB, {
        batchKey: body.batchKey,
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
      const body = await readJsonBody<ImportResultsRequestBody>(request);

      const result = await importBatchResults(env.DB, {
        batchId,
        drawId: body.drawId ?? null,
        prizeTable: body.prizeTable ?? null,
        results: body.results ?? [],
      });

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

  return null;
}
