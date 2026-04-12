const API_BASE = "https://api.lottosheli.com/api/v1";

export interface GenerateOtpParams {
  idNumber: string;
  phoneNumber: string;
}

export interface ValidateOtpParams {
  idNumber: string;
  phoneNumber: string;
  otpCode: string;
}

export interface ValidateOtpResponse {
  accessToken: string;
  refreshToken: string;
}

export class LottoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LottoAuthError";
  }
}

async function httpJson(
  method: string,
  url: string,
  headers: Record<string, string>,
  bodyObj?: Record<string, unknown>,
): Promise<unknown> {
  const options: RequestInit = {
    method,
    headers,
  };

  if (bodyObj !== undefined) {
    options.body = JSON.stringify(bodyObj);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new LottoAuthError(
      `HTTP ${response.status} ${response.statusText}: ${errorText}`,
    );
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new LottoAuthError(`JSON decode error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function generateOtp(params: GenerateOtpParams): Promise<void> {
  const url = `${API_BASE}/client/otp/generate`;
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "lotto-worker/1.0",
    "Origin": "https://lottosheli.com",
    "Referer": "https://lottosheli.com/",
  };

  await httpJson("POST", url, headers, {
    idNumber: params.idNumber,
    phoneNumber: params.phoneNumber,
  });
}

export async function validateOtp(params: ValidateOtpParams): Promise<ValidateOtpResponse> {
  const url = `${API_BASE}/client/otp/validate`;
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "lotto-worker/1.0",
    "Origin": "https://lottosheli.com",
    "Referer": "https://lottosheli.com/",
  };

  const res = await httpJson("POST", url, headers, {
    idNumber: params.idNumber,
    phoneNumber: params.phoneNumber,
    otpCode: params.otpCode,
  });

  if (
    typeof res !== "object" ||
    res === null ||
    !("accessToken" in res) ||
    typeof res.accessToken !== "string"
  ) {
    throw new LottoAuthError(`Unexpected validate response: ${JSON.stringify(res)}`);
  }

  return {
    accessToken: res.accessToken,
    refreshToken: (res as { refreshToken?: string }).refreshToken ?? "",
  };
}
