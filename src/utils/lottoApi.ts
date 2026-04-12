const API_BASE = "https://api.lottosheli.com/api/v1";

export interface LottoTicketRecord {
  id: string;
  status: string;
  drawId?: number;
  paisId?: number;
  tables: number[][];
  purchasedAt?: string;
}

export interface LottoActiveTicketsResponse {
  tickets: LottoTicketRecord[];
}

export async function fetchActiveTickets(otpToken: string): Promise<LottoActiveTicketsResponse> {
  const url = `${API_BASE}/user/tickets/active`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": `otp ${otpToken}`,
      "User-Agent": "lotto-worker/1.0",
      "Origin": "https://lottosheli.com",
      "Referer": "https://lottosheli.com/",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lotto API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as LottoActiveTicketsResponse;
  
  if (!Array.isArray(data.tickets)) {
    throw new Error(`Invalid response format: expected tickets array, got ${typeof data.tickets}`);
  }

  return data;
}

export function normalizeTicketNumbers(tables: number[][]): number[][] {
  return tables.map(table => [...table].sort((a, b) => a - b));
}

export function ticketsMatch(localTables: number[][], externalTables: number[][]): boolean {
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
