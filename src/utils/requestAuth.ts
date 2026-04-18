import type { Env } from "../types";
import { isAdminLottoUser } from "../repositories/userRolesRepo";

export interface LottoJwtPayload {
  id?: number | string;
  idNumber?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  abTesting?: boolean;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export interface RequestAuthContext {
  accessToken: string;
  payload: LottoJwtPayload;
  lottoUserId: string;
  isAdmin: boolean;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder("utf-8").decode(bytes);
}

function extractBearerToken(request: Request): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new Error("Missing or invalid Authorization header");
  }

  return match[1].trim();
}

export function decodeJwtPayload(token: string): LottoJwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  try {
    const payloadJson = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadJson) as LottoJwtPayload;

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid JWT payload");
    }

    return payload;
  } catch {
    throw new Error("Failed to decode JWT payload");
  }
}

export async function getRequestAuthContext(
  request: Request,
  env: Env,
): Promise<RequestAuthContext> {
  const accessToken = extractBearerToken(request);
  const payload = decodeJwtPayload(accessToken);

  if (payload.id === undefined || payload.id === null) {
    throw new Error("Token payload does not contain user id");
  }

  const lottoUserId = String(payload.id);
  const isAdmin = await isAdminLottoUser(env.DB, lottoUserId);

  return {
    accessToken,
    payload,
    lottoUserId,
    isAdmin,
  };
}
