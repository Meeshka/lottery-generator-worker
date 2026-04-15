import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getBatchDetails,
  getBatchResults,
  getBatchSummary,
  getBatchTickets,
} from "../../services/api";

type Batch = {
  id?: number;
  batch_key?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

type Summary = {
  batchId?: number;
  batchKey?: string;
  status?: string;
  ticketCount?: number;
  checkedResultsCount?: number;
  ticketsWith3Plus?: number;
  totalPrize?: number;
  drawDbId?: number | null;
  checkedAt?: string | null;
  createdAt?: string;
};

type Ticket = {
  id?: number;
  ticket_index?: number;
  numbers_json?: string;
  strong_number?: number | null;
  created_at?: string;
};

type TicketResult = {
  id?: number;
  ticket_id?: number;
  draw_id?: number;
  match_count?: number;
  matched_numbers_json?: string;
  strong_match?: number | null;
  qualifies_3plus?: number;
  prize?: number | null;
  prize_table?: string | null;
  checked_at?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number") return "0";
  return value.toLocaleString();
}

function getStatusLabel(status?: string) {
  if (!status) return "—";
  return status.replaceAll("_", " ");
}

function getStatusStyle(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "checked":
    case "done":
    case "completed":
      return styles.statusGood;
    case "pending":
    case "new":
    case "created":
    case "generated":
    case "submitted":
      return styles.statusPending;
    case "failed":
    case "error":
      return styles.statusBad;
    default:
      return styles.statusNeutral;
  }
}

function parseNumbersJson(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderNumbers(numbers: number[]) {
  return numbers.length ? numbers.join(", ") : "—";
}

export default function BatchDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const batchId = Number(id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [results, setResults] = useState<TicketResult[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setError("");

        const [batchData, ticketsData, summaryData, resultsData] =
          await Promise.all([
            getBatchDetails(batchId),
            getBatchTickets(batchId),
            getBatchSummary(batchId),
            getBatchResults(batchId),
          ]);

        setBatch(batchData?.batch ?? null);
        setTickets(ticketsData?.tickets ?? []);
        setSummary(summaryData?.summary ?? null);
        setResults(resultsData?.results ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    if (!Number.isFinite(batchId) || batchId <= 0) {
      setError("Invalid batch id");
      setLoading(false);
      return;
    }

    load();
  }, [batchId]);

  const ticketMap = useMemo(() => {
    const map = new Map<number, Ticket>();
    for (const ticket of tickets) {
      if (typeof ticket.id === "number") {
        map.set(ticket.id, ticket);
      }
    }
    return map;
  }, [tickets]);

  const winningResults = useMemo(
    () =>
      results.filter(
        (r) => (r.qualifies_3plus ?? 0) === 1 || (r.prize ?? 0) > 0
      ),
    [results]
  );

  const resultStats = useMemo(() => {
    let strongMatches = 0;
    let prizeWinners = 0;
    let maxMatchCount = 0;

    for (const r of results) {
      if ((r.strong_match ?? 0) === 1) strongMatches += 1;
      if ((r.prize ?? 0) > 0) prizeWinners += 1;
      maxMatchCount = Math.max(maxMatchCount, r.match_count ?? 0);
    }

    return {
      strongMatches,
      prizeWinners,
      maxMatchCount,
    };
  }, [results]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>Ошибка</Text>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroTitle}>Batch #{batch?.id ?? batchId}</Text>
            <View
              style={[
                styles.statusBadge,
                getStatusStyle(summary?.status || batch?.status),
              ]}
            >
              <Text style={styles.statusText}>
                {getStatusLabel(summary?.status || batch?.status)}
              </Text>
            </View>
          </View>

          <Text style={styles.heroSubtext}>
            Key: {summary?.batchKey || batch?.batch_key || "—"}
          </Text>
          <Text style={styles.heroSubtext}>
            Created: {formatDate(summary?.createdAt || batch?.created_at)}
          </Text>
          <Text style={styles.heroSubtext}>
            Checked: {formatDate(summary?.checkedAt)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Summary</Text>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {summary?.ticketCount ?? tickets.length ?? 0}
            </Text>
            <Text style={styles.metricLabel}>Tickets</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {summary?.checkedResultsCount ?? results.length ?? 0}
            </Text>
            <Text style={styles.metricLabel}>Checked</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {summary?.ticketsWith3Plus ?? 0}
            </Text>
            <Text style={styles.metricLabel}>3+ hits</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {formatMoney(summary?.totalPrize)}
            </Text>
            <Text style={styles.metricLabel}>Total prize</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Results overview</Text>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{winningResults.length}</Text>
            <Text style={styles.metricLabel}>Winning tickets</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{resultStats.prizeWinners}</Text>
            <Text style={styles.metricLabel}>Prize winners</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{resultStats.strongMatches}</Text>
            <Text style={styles.metricLabel}>Strong matches</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{resultStats.maxMatchCount}</Text>
            <Text style={styles.metricLabel}>Best match count</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Batch info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Batch ID</Text>
            <Text style={styles.infoValue}>
              {summary?.batchId ?? batch?.id ?? "—"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Draw DB ID</Text>
            <Text style={styles.infoValue}>{summary?.drawDbId ?? "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Winning tickets</Text>

        <View style={styles.infoCard}>
          {winningResults.length === 0 ? (
            <Text style={styles.emptyText}>No winning tickets yet</Text>
          ) : (
            winningResults.map((result, index) => {
              const ticket = result.ticket_id
                ? ticketMap.get(result.ticket_id)
                : undefined;

              return (
                <View
                  key={result.id ? String(result.id) : `win-${index}`}
                  style={[
                    styles.resultRow,
                    index !== winningResults.length - 1 &&
                      styles.ticketRowBorder,
                  ]}
                >
                  <View style={styles.ticketHeader}>
                    <Text style={styles.ticketTitle}>
                      Ticket #{ticket?.ticket_index ?? result.ticket_id ?? "—"}
                    </Text>
                    <Text style={styles.winBadge}>
                      {(result.prize ?? 0) > 0 ? `₪ ${formatMoney(result.prize)}` : "3+ hit"}
                    </Text>
                  </View>

                  <Text style={styles.ticketNumbers}>
                    Ticket:{" "}
                    {renderNumbers(parseNumbersJson(ticket?.numbers_json))}
                  </Text>
                  <Text style={styles.ticketNumbers}>
                    Matched:{" "}
                    {renderNumbers(parseNumbersJson(result.matched_numbers_json))}
                  </Text>
                  <Text style={styles.ticketMeta}>
                    Match count: {result.match_count ?? 0}
                    {" · "}
                    Strong: {(result.strong_match ?? 0) === 1 ? "yes" : "no"}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.sectionTitle}>All results</Text>

        <View style={styles.infoCard}>
          {results.length === 0 ? (
            <Text style={styles.emptyText}>No results found</Text>
          ) : (
            results.map((result, index) => {
              const ticket = result.ticket_id
                ? ticketMap.get(result.ticket_id)
                : undefined;

              return (
                <View
                  key={result.id ? String(result.id) : `result-${index}`}
                  style={[
                    styles.resultRow,
                    index !== results.length - 1 && styles.ticketRowBorder,
                  ]}
                >
                  <View style={styles.ticketHeader}>
                    <Text style={styles.ticketTitle}>
                      Ticket #{ticket?.ticket_index ?? result.ticket_id ?? "—"}
                    </Text>
                    <Text style={styles.ticketStatus}>
                      {result.match_count ?? 0} matches
                    </Text>
                  </View>

                  <Text style={styles.ticketNumbers}>
                    Ticket:{" "}
                    {renderNumbers(parseNumbersJson(ticket?.numbers_json))}
                  </Text>

                  <Text style={styles.ticketNumbers}>
                    Matched:{" "}
                    {renderNumbers(parseNumbersJson(result.matched_numbers_json))}
                  </Text>

                  <Text style={styles.ticketMeta}>
                    Prize: ₪ {formatMoney(result.prize)}
                    {" · "}
                    Strong: {(result.strong_match ?? 0) === 1 ? "yes" : "no"}
                    {" · "}
                    Checked: {formatDate(result.checked_at)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.sectionTitle}>All tickets</Text>

        <View style={styles.infoCard}>
          {tickets.length === 0 ? (
            <Text style={styles.emptyText}>No tickets found</Text>
          ) : (
            tickets.map((ticket, index) => (
              <View
                key={ticket.id ? String(ticket.id) : `ticket-${index}`}
                style={[
                  styles.resultRow,
                  index !== tickets.length - 1 && styles.ticketRowBorder,
                ]}
              >
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketTitle}>
                    Ticket #{ticket.ticket_index ?? index + 1}
                  </Text>
                </View>

                <Text style={styles.ticketNumbers}>
                  Numbers: {renderNumbers(parseNumbersJson(ticket.numbers_json))}
                </Text>

                <Text style={styles.ticketMeta}>
                  Strong: {ticket.strong_number ?? "—"}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    padding: 16,
    paddingBottom: 28,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
  },
  heroCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#f3f4f6",
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    flexShrink: 1,
  },
  heroSubtext: {
    fontSize: 14,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusGood: {
    backgroundColor: "#dff7e6",
  },
  statusPending: {
    backgroundColor: "#fff3d6",
  },
  statusBad: {
    backgroundColor: "#fde2e2",
  },
  statusNeutral: {
    backgroundColor: "#e8e8e8",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
  },
  metricCard: {
    width: "47%",
    minHeight: 100,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 13,
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#f3f4f6",
    marginBottom: 18,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  infoKey: {
    fontSize: 14,
    opacity: 0.75,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
  },
  resultRow: {
    paddingVertical: 10,
  },
  ticketRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  ticketTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  ticketStatus: {
    fontSize: 12,
    opacity: 0.7,
  },
  ticketNumbers: {
    fontSize: 14,
    marginBottom: 4,
  },
  ticketMeta: {
    fontSize: 13,
    opacity: 0.7,
  },
  winBadge: {
    fontSize: 12,
    fontWeight: "700",
  },
});