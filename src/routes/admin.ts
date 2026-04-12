import type { Env, TicketInput, TicketResultInput, DrawInput } from "../types";
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
  markBatchAsSubmitted,
  syncBatchConfirmation,
} from "../services/batchService";
import {
  getBatchResults,
  importBatchResults,
} from "../services/resultService";
import { upsertDraw } from "../repositories/drawsRepo";
import { generateOtp, validateOtp, LottoAuthError } from "../utils/lottoAuth";

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

interface ImportDrawsRequestBody {
  draws: DrawInput[];
}

interface SyncConfirmationRequestBody {
  token: string;
}

interface GenerateOtpRequestBody {
  idNumber: string;
  phoneNumber: string;
}

interface ValidateOtpRequestBody {
  idNumber: string;
  phoneNumber: string;
  otpCode: string;
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

  if (pathname === "/admin/import/draws" && request.method === "POST") {
    try {
      const body = await readJsonBody<ImportDrawsRequestBody>(request);

      const draws = body.draws ?? [];
      const upsertedDraws = await Promise.all(
        draws.map((draw) =>
          upsertDraw(env.DB, {
            drawId: draw.drawId,
            drawDate: draw.drawDate,
            numbersJson: draw.numbersJson,
            strongNumber: draw.strongNumber ?? null,
            rawJson: draw.rawJson ?? null,
            paisId: draw.paisId ?? null,
          }),
        ),
      );

      return jsonResponse({
        ok: true,
        count: upsertedDraws.length,
        draws: upsertedDraws,
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

  if (pathname.endsWith("/mark-submitted") && request.method === "POST") {
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
    const batchId = parseBatchIdFromPath(pathname, "/sync-confirmation");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const body = await readJsonBody<SyncConfirmationRequestBody>(request);

      const result = await syncBatchConfirmation(env.DB, batchId, body.token);
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
    const batchId = parseBatchIdFromPath(pathname, "/submit-and-sync");
    if (!batchId) {
      return notFoundResponse();
    }

    try {
      const body = await readJsonBody<SyncConfirmationRequestBody>(request);

      // First mark as submitted
      const batch = await markBatchAsSubmitted(env.DB, batchId);

      // Then sync confirmation
      const syncResult = await syncBatchConfirmation(env.DB, batchId, body.token);

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

  if (pathname === "/admin/lotto/otp/generate" && request.method === "POST") {
    try {
      const body = await readJsonBody<GenerateOtpRequestBody>(request);

      await generateOtp({
        idNumber: body.idNumber,
        phoneNumber: body.phoneNumber,
      });

      return jsonResponse({
        ok: true,
      });
    } catch (error) {
      if (error instanceof LottoAuthError) {
        return badRequestResponse(error.message);
      }
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname === "/admin/lotto/otp/validate" && request.method === "POST") {
    try {
      const body = await readJsonBody<ValidateOtpRequestBody>(request);

      const result = await validateOtp({
        idNumber: body.idNumber,
        phoneNumber: body.phoneNumber,
        otpCode: body.otpCode,
      });

      return jsonResponse({
        ok: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (error) {
      if (error instanceof LottoAuthError) {
        return badRequestResponse(error.message);
      }
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return null;
}
