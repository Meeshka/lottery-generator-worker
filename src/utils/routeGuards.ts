import type { Env } from "../types";
import { unauthorizedResponse } from "../utils/response";
import { getRequestAuthContext, type RequestAuthContext } from "./requestAuth";

export async function requireAuthContext(
  request: Request,
  env: Env,
): Promise<{ ok: true; ctx: RequestAuthContext } | { ok: false; response: Response }> {
  try {
    const ctx = await getRequestAuthContext(request, env);
    return { ok: true, ctx };
  } catch {
    return { ok: false, response: unauthorizedResponse() };
  }
}

export async function requireAdminContext(
  request: Request,
  env: Env,
): Promise<{ ok: true; ctx: RequestAuthContext } | { ok: false; response: Response }> {
  try {
    const ctx = await getRequestAuthContext(request, env);
    if (!ctx.isAdmin) {
      return { ok: false, response: unauthorizedResponse() };
    }
    return { ok: true, ctx };
  } catch {
    return { ok: false, response: unauthorizedResponse() };
  }
}
