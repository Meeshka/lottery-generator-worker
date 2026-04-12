const API_BASE = "https://api.lottosheli.com/api/v1/client";

export interface LottoTicketRecord {
  id: string;
  status: string;
  drawId?: number;
  paisId?: number;
  tables: number[][];
  purchasedAt?: string;
  totalPrice?: number;
}

export interface LottoActiveTicketsMeta {
  count: number;
  pages: number;
  take: number;
  skip: number;
}

export interface LottoActiveTicketsResponse {
  tickets: LottoTicketRecord[];
  meta: LottoActiveTicketsMeta | null;
}

interface RawLottoTableNumbers {
  regularNumbers?: number[];
  strongNumbers?: number[];
}

interface RawLottoTicketRecord {
  id: number | string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  details?: {
    tablesNumbers?: RawLottoTableNumbers[];
  };
  draw?: {
    id?: number;
    paisId?: number;
  };
  ticketPrice?: {
    price?: number;
    total?: number;
    commission?: number;
  };
}

interface RawLottoActiveTicketsResponse {
  records?: RawLottoTicketRecord[];
  meta?: LottoActiveTicketsMeta;
}

function normalizeOtpToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.toLowerCase().startsWith("otp ")) {
    return trimmed;
  }
  return `otp ${trimmed}`;
}

function normalizeTable(table: RawLottoTableNumbers): number[] {
  const regular = Array.isArray(table.regularNumbers)
    ? [...table.regularNumbers].map(Number).sort((a, b) => a - b)
    : [];

  const strong =
    Array.isArray(table.strongNumbers) && table.strongNumbers.length > 0
      ? Number(table.strongNumbers[0])
      : null;

  return strong !== null ? [...regular, strong] : regular;
}

function normalizeRecord(record: RawLottoTicketRecord): LottoTicketRecord {
  const tablesNumbers = Array.isArray(record.details?.tablesNumbers)
    ? record.details!.tablesNumbers!
    : [];

  const normalizedTables = tablesNumbers.map(normalizeTable);

  return {
    id: String(record.id),
    status: record.status ?? "",
    drawId: record.draw?.id,
    paisId: record.draw?.paisId,
    tables: normalizedTables,
    purchasedAt: record.createdAt ?? record.updatedAt,
    totalPrice: record.ticketPrice?.total,
  };
}

export async function fetchActiveTickets(
  otpToken: string,
  skip = 0,
  take = 100,
): Promise<LottoActiveTicketsResponse> {
  const url = `${API_BASE}/user/tickets/active`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": normalizeOtpToken(otpToken),
      "Content-Type": "application/json",
      "User-Agent": "lotto-worker/1.0",
      "Origin": "https://lottosheli.com",
      "Referer": "https://lottosheli.com/",
    },
    body: JSON.stringify({
      skip,
      take,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Lotto API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = (await response.json()) as RawLottoActiveTicketsResponse;

  if (!Array.isArray(data.records)) {
    throw new Error(
      `Invalid response format: expected records array, got ${typeof data.records}`,
    );
  }

  return {
    tickets: data.records.map(normalizeRecord),
    meta: data.meta ?? null,
  };
}

function normalizeTicketNumbers(tables: number[][]): number[][] {
  return [...tables]
    .map((table) => [...table].sort((a, b) => a - b))
    .sort((a, b) => a.join(",").localeCompare(b.join(",")));
}

export function ticketsMatch(
  localTables: number[][],
  externalTables: number[][],
): boolean {
  const normalizedLocal = normalizeTicketNumbers(localTables);
  const normalizedExternal = normalizeTicketNumbers(externalTables);

  if (normalizedLocal.length !== normalizedExternal.length) {
    return false;
  }

  for (let i = 0; i < normalizedLocal.length; i++) {
    if (normalizedLocal[i].length !== normalizedExternal[i].length) {
      return false;
    }

    for (let j = 0; j < normalizedLocal[i].length; j++) {
      if (normalizedLocal[i][j] !== normalizedExternal[i][j]) {
        return false;
      }
    }
  }

  return true;
}