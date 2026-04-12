export interface Env {
  DB: D1Database;
  ADMIN_KEY: string;
}

export type BatchStatus = "generated" | "checked" | "submitted" | "confirmed" | "archived";

export interface CreateBatchInput {
  batchKey: string;
  targetDrawId?: string | null;
  targetPaisId?: number | null;
  targetDrawAt?: string | null;
  targetDrawSnapshotJson?: string | null;
  generatorVersion?: string | null;
  weightsVersionKey?: string | null;
  ticketCount: number;
}

export interface BatchRow {
  id: number;
  batch_key: string;
  status: BatchStatus;
  target_draw_id: string | null;
  target_pais_id: number | null;
  target_draw_at: string | null;
  target_draw_snapshot_json: string | null;
  generator_version: string | null;
  weights_version_key: string | null;
  ticket_count: number;
  created_at: string;
  checked_at: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  external_ticket_id: string | null;
  last_sync_attempt_at: string | null;
  last_sync_error: string | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface TicketInput {
  ticketIndex: number;
  numbers: number[];
  strong?: number | null;
}

export interface TicketRow {
  id: number;
  batch_id: number;
  ticket_index: number;
  numbers_json: string;
  strong_number: number | null;
  created_at: string;
}

export interface TicketResultInput {
  ticketIndex: number;
  matchCount: number;
  matchedNumbers: number[];
  strongMatch?: boolean | null;
  qualifies3Plus: boolean;
  prize?: number | null;
  prizeTable?: string | null;
}

export interface TicketResultRow {
  id: number;
  ticket_id: number;
  draw_id: number;
  match_count: number;
  matched_numbers_json: string;
  strong_match: number | null;
  qualifies_3plus: number;
  prize: number | null;
  prize_table: string | null;
  checked_at: string;
}

export interface DrawInput {
  drawId: string;
  drawDate: string;
  numbersJson: string;
  strongNumber: number | null;
  rawJson: string | null;
  paisId: number | null;
}
