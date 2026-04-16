import type { Env } from "../types";
import { readJsonBody } from "../utils/json";
import {
  badRequestResponse,
  jsonResponse,
  unauthorizedResponse,
} from "../utils/response";
import { generateOtp, LottoAuthError, validateOtp } from "../utils/lottoAuth";
import { getRequestAuthContext } from "../utils/requestAuth";

interface GenerateOtpRequestBody {
  idNumber: string;
  phoneNumber: string;
}

interface ValidateOtpRequestBody {
  idNumber: string;
  phoneNumber: string;
  otpCode: string;
}

export async function handleAuthRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/lotto/otp/generate" && request.method === "POST") {
    try {
      const body = await readJsonBody<GenerateOtpRequestBody>(request);

      await generateOtp({
        idNumber: body.idNumber,
        phoneNumber: body.phoneNumber,
      });

      return jsonResponse({ ok: true });
    } catch (error) {
      if (error instanceof LottoAuthError) {
        return badRequestResponse(error.message);
      }

      return badRequestResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (pathname === "/lotto/otp/validate" && request.method === "POST") {
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

  if (pathname === "/auth/me" && request.method === "GET") {
    try {
      const ctx = await getRequestAuthContext(request, env);

      return jsonResponse({
        ok: true,
        lottoUserId: ctx.lottoUserId,
        idNumber: ctx.payload.idNumber ?? null,
        email: ctx.payload.email ?? null,
        phone: ctx.payload.phone ?? null,
        firstName: ctx.payload.firstName ?? null,
        lastName: ctx.payload.lastName ?? null,
        isAdmin: ctx.isAdmin,
        iat: ctx.payload.iat ?? null,
        exp: ctx.payload.exp ?? null,
      });
    } catch {
      return unauthorizedResponse();
    }
  }

  return null;
}
