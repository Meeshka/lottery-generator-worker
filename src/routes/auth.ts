import type { Env } from "../types";
import { readJsonBody } from "../utils/json";
import { badRequestResponse, jsonResponse } from "../utils/response";
import { generateOtp, LottoAuthError, validateOtp } from "../utils/lottoAuth";

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
  _env: Env,
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

  return null;
}
