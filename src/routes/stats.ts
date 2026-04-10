import type { Env } from "../types";
import { jsonResponse } from "../utils/response";
import { getOverview } from "../services/overviewService";

export async function handleStatsRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/stats/overview" && request.method === "GET") {
    const overview = await getOverview(env.DB);
    return jsonResponse(overview);
  }

  return null;
}
