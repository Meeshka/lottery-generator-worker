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
  refreshBatchStatusesFromLotto,
} from "../services/batchService";
import {
  getBatchResults,
  importBatchResults,
} from "../services/resultService";
import { upsertDraw, getDrawByDrawId } from "../repositories/drawsRepo";
import { insertWeights } from "../repositories/weightsRepo";
import { generateOtp, validateOtp, LottoAuthError } from "../utils/lottoAuth";

interface CreateBatchRequestBody {
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

interface ImportWeightsRequestBody {
  versionKey: string;
  weightsJson: string;
  sourceDrawCount: number | null;
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

interface ApplyToLottoRequestBody {
  batchId: number;
  accessToken: string;
}

interface RefreshBatchStatusesRequestBody {
  accessToken: string;
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

  if (pathname === "/admin/batches/apply-to-lotto" && request.method === "POST") {
    try {
      const body = await readJsonBody<ApplyToLottoRequestBody>(request);

      const batchId = body.batchId;
      const accessToken = body.accessToken;
      console.log("[apply-to-lotto] batchId:", batchId);
      console.log("[apply-to-lotto] accessToken present:", !!accessToken);
      console.log(
    "[apply-to-lotto] accessToken tail:",
          accessToken ? accessToken.slice(-8) : null
      );

      // Get batch with tickets
      const batchData = await getBatchWithTicketsById(env.DB, batchId);
      if (!batchData || !batchData.batch || batchData.batch.status !== "generated") {
        return badRequestResponse("Batch not found or not in generated status");
      }

      const tickets = batchData.tickets;
      if (!tickets || tickets.length === 0) {
        return badRequestResponse("Batch has no tickets");
      }

      console.log("[apply-to-lotto] batch status:", batchData.batch.status);
      console.log("[apply-to-lotto] tickets count:", tickets.length);
      console.log("[apply-to-lotto] raw tickets:", JSON.stringify(tickets));

      // Step 1: Calculate price
      const calculatePayload = {
        drawType: "DRAW_LOTTO",
        ticketType: "REGULAR",
        tables: tickets.length,
        hasExtra: false,
        numberOfDraws: 1,
      };

      console.log("[apply-to-lotto] calculate payload:", JSON.stringify(calculatePayload));

      const calculateResponse = await fetch("https://api.lottosheli.com/api/v1/client/tickets/calculate", {
        method: "POST",
        headers: {
          "Authorization": `otp ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(calculatePayload),
      });

      const calculateText = await calculateResponse.text();
      console.log("[apply-to-lotto] calculate status:", calculateResponse.status);
      console.log("[apply-to-lotto] calculate response:", calculateText);

      if (!calculateResponse.ok) {
        const errorText = await calculateResponse.text();
        return badRequestResponse(`Failed to calculate price: ${errorText}`);
      }

      const calculateData = await calculateResponse.json();
      const totalPrice = calculateData.total;

      // Step 2: Check duplicate combinations
      const tablesNumbers = tickets.map((ticket) => {
        let numbers: number[];
        try {
          numbers = typeof ticket.numbers_json === "string"
            ? JSON.parse(ticket.numbers_json)
            : ticket.numbers_json || [];
        } catch {
          numbers = [];
        }
        return {
          regularNumbers: numbers,
          strongNumbers: [ticket.strong_number || 0],
        };
      });
      console.log("[apply-to-lotto] tablesNumbers:", JSON.stringify(tablesNumbers));

      const duplicatePayload = {
        tickets: [
          {
            numberOfDraws: 1,
            autoRenewal: false,
            drawType: "DRAW_LOTTO",
            isExtra: false,
            tablesNumbers,
            ticketType: "REGULAR",
          },
        ],
      };

      console.log("[apply-to-lotto] duplicate payload:", JSON.stringify(duplicatePayload));

      const checkDuplicateResponse = await fetch("https://api.lottosheli.com/api/v1/client/user/tickets/check-duplicate-combination", {
        method: "POST",
        headers: {
          "Authorization": `otp ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(duplicatePayload),
      });

      const duplicateText = await checkDuplicateResponse.text();
      console.log("[apply-to-lotto] duplicate status:", checkDuplicateResponse.status);
      console.log("[apply-to-lotto] duplicate response:", duplicateText);

      if (!checkDuplicateResponse.ok) {
        const errorText = await checkDuplicateResponse.text();
        return badRequestResponse(`Failed to check duplicate: ${errorText}`);
      }

      const checkDuplicateData = await checkDuplicateResponse.json();
      if (checkDuplicateData.isDuplicateCombination === true) {
        return badRequestResponse("Duplicate combination detected");
      }

      // Step 3: Pay for tickets
      const payPayload = {
        transactionType: "PURCHASE",
        tickets: [
          {
            numberOfDraws: 1,
            autoRenewal: false,
            drawType: "DRAW_LOTTO",
            isExtra: false,
            tablesNumbers,
            ticketType: "REGULAR",
          },
        ],
        amountFromCredit: calculateData.total,
        amountFromDeposit: 0,
        clientUrl: "https://lottosheli.co.il",
        apiUrl: "https://api.lottosheli.com",
        useSavedCard: true,
        saveCard: true,
        uiCustomData: {},
      };

      console.log("[apply-to-lotto] pay payload:", JSON.stringify(payPayload));

      const payResponse = await fetch("https://api.lottosheli.com/api/v1/client/payments", {
        method: "POST",
        headers: {
          "Authorization": `otp ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payPayload),
      });

      if (!payResponse.ok) {
        const errorText = await payResponse.text();
        return badRequestResponse(`Failed to pay: ${errorText}`);
      }

      const payText = await payResponse.text();
      console.log("[apply-to-lotto] pay status:", payResponse.status);
      console.log("[apply-to-lotto] pay response:", payText);

      if (!payResponse.ok) {
        return badRequestResponse(`Failed to pay: ${payText}`);
      }

      const payData = await payResponse.json();
      if (!payData.success) {
        return badRequestResponse("Payment failed");
      }

      // Step 4: Mark batch as submitted
      const batch = await markBatchAsSubmitted(env.DB, batchId);

      return jsonResponse({
        ok: true,
        batchId,
        transactionId: payData.transactionId,
        totalPrice,
        status: batch?.status,
      });
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname === "/admin/batches/refresh-statuses" && request.method === "POST") {
    try {
      const body = await readJsonBody<RefreshBatchStatusesRequestBody>(request);

      const result = await refreshBatchStatusesFromLotto(env.DB, body.accessToken);

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
