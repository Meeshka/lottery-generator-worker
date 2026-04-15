import { jsonResponse } from "./response";

export interface OpenPaisDraw {
  paisId: number | null;
  drawAt: string | null;
  raw: any;
}

export async function fetchOpenPaisDraw(): Promise<OpenPaisDraw> {
  const response = await fetch(
    "https://www.pais.co.il/include/getNextLotteryDate.ashx?type=1",
    {
      headers: {
        "Accept": "application/json",
        "User-Agent": "lotto-worker/1.0",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pais API error: HTTP ${response.status} - ${text}`);
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Invalid response from Pais open draw API");
  }

  const draw = data[0];

  return {
    paisId:
      draw?.LotteryNumber !== undefined && draw?.LotteryNumber !== null
        ? Number(draw.LotteryNumber)
        : null,
    drawAt:
      typeof draw?.nextLottoryDate === "string" ? draw.nextLottoryDate : null,
    raw: draw,
  };
}
