import { useEffect, useState, useMemo } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getBatches, applyBatchToLotto, refreshBatchStatuses, archiveBatch } from "../../services/api";
import { getAccessToken } from "../../services/secureStorage";

function getStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function getStatusStyle(status: string) {
  switch (status.toLowerCase()) {
    case "confirmed":
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

function getTabBackgroundColor(status: string) {
  switch (status.toLowerCase()) {
    case "generated":
      return "#FFD54A"; // yellow
    case "submitted":
      return "#A5D6A7"; // light green
    case "confirmed":
      return "#4CAF50"; // green
    case "checked":
      return "#81D4FA"; // light blue
    case "archived":
      return "#BDBDBD"; // grey
    default:
      return "#007AFF"; // default blue for "all"
  }
}

function getTabTextColor(status: string) {
  switch (status.toLowerCase()) {
    case "confirmed":
      return "#fff"; // white text on green
    case "generated":
    case "submitted":
    case "checked":
    case "archived":
      return "#333"; // dark text on lighter colors
    default:
      return "#fff"; // white text on blue
  }
}

function parseNumbersJson(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDrawTitle(batch: any) {
  const draw = batch?.linked_draw;
  return draw?.pais_id ?? draw?.draw_id ?? batch?.target_pais_id ?? batch?.target_draw_id ?? null;
}

function getDrawNumbersText(batch: any) {
  const draw = batch?.linked_draw;
  const numbers = parseNumbersJson(draw?.numbers_json);
  if (!numbers.length) return "";

  const strongPart =
    typeof draw?.strong_number === "number"
      ? ` | Strong: ${draw.strong_number}`
      : "";

  return `${numbers.join(", ")}${strongPart}`;
}

export default function BatchesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [applyingBatchId, setApplyingBatchId] = useState<number | null>(null);
  const [archiveBatchId, setArchiveBatchId] = useState<number | null>(null);
  const [refreshingStatuses, setRefreshingStatuses] = useState(false);

  async function loadBatches() {
    try {
      setError("");
      const data = await getBatches(100);
      setBatches(data.batches || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadBatches();
  }, []);

  function onRefresh() {
    setRefreshing(true);
    loadBatches();
  }

  async function handleSaveToArchive(batchId: number){
    Alert.alert(
      "Save to archive",
      "Are you sure you want to move this batch to archived?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Archive",
          onPress: async () => {
            try {
              setArchiveBatchId(batchId);

              const result = await archiveBatch(batchId);

              Alert.alert(
                "Success",
                `Batch archived successfully!`,
                [
                  {
                    text: "OK",
                    onPress: () => loadBatches(),
                  },
                ]
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              Alert.alert("Error", message);
            } finally {
              setArchiveBatchId(null);
            }
          },
        },
      ]
    );
  }

  async function handleApplyToLotto(batchId: number) {
    Alert.alert(
      "Apply to Lotto",
      "Are you sure you want to apply this batch to Lotto? This will purchase the tickets.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Apply",
          onPress: async () => {
            try {
              setApplyingBatchId(batchId);

              const accessToken = await getAccessToken();
              if (!accessToken) {
                Alert.alert("Error", "Please log in first");
                return;
              }

              const result = await applyBatchToLotto(batchId, accessToken);

              Alert.alert(
                "Success",
                `Batch applied successfully! Transaction ID: ${result.transactionId}`,
                [
                  {
                    text: "OK",
                    onPress: () => loadBatches(),
                  },
                ]
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              Alert.alert("Error", message);
            } finally {
              setApplyingBatchId(null);
            }
          },
        },
      ]
    );
  }

  async function handleRefreshStatuses() {
    try {
      setRefreshingStatuses(true);

      const accessToken = await getAccessToken();
      if (!accessToken) {
        Alert.alert("Error", "Please log in first");
        return;
      }

      const result = await refreshBatchStatuses(accessToken);
      const summary = result.summary || {};

      Alert.alert(
        "Refresh complete",
        `Remote tickets: ${summary.remoteTickets ?? 0}
Matched existing: ${summary.matchedExisting ?? 0}
Confirmed existing: ${summary.confirmedExisting ?? 0}
Created missing: ${summary.createdMissing ?? 0}`,
        [
          {
            text: "OK",
            onPress: () => loadBatches(),
          },
        ],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert("Error", message);
    } finally {
      setRefreshingStatuses(false);
    }
  }

  const groupedBatches = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const batch of batches) {
      const status = batch.status || "unknown";
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(batch);
    }
    return groups;
  }, [batches]);

  const allStatuses = useMemo(() => {
    const priority: Record<string, number> = {
      pending: 1,
      new: 2,
      created: 3,
      generated: 4,
      submitted: 5,
      confirmed: 6,
      checked: 7,
      done: 8,
      completed: 9,
      failed: 10,
      error: 11,
    };
    return Object.keys(groupedBatches).sort((a, b) => {
      const aPriority = priority[a.toLowerCase()] ?? 999;
      const bPriority = priority[b.toLowerCase()] ?? 999;
      return aPriority - bPriority;
    });
  }, [groupedBatches]);

  const filteredBatches = useMemo(() => {
    if (selectedTab === "all") {
      return batches;
    }
    return batches.filter((batch) => (batch.status || "").toLowerCase() === selectedTab.toLowerCase());
  }, [batches, selectedTab]);

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
        <Text style={styles.error}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tabsContainer}>
        <Pressable
          style={[
            styles.tab,
            selectedTab === "all" && { backgroundColor: getTabBackgroundColor("all") }
          ]}
          onPress={() => setSelectedTab("all")}
        >
          <Text style={[
            styles.tabText,
            selectedTab === "all" && { color: getTabTextColor("all") }
          ]}>
            All
          </Text>
        </Pressable>
        {allStatuses.map((status) => (
          <Pressable
            key={status}
            style={[
              styles.tab,
              selectedTab === status && { backgroundColor: getTabBackgroundColor(status) }
            ]}
            onPress={() => setSelectedTab(status)}
          >
            <Text style={[
              styles.tabText,
              selectedTab === status && { color: getTabTextColor(status) }
            ]}>
              {getStatusLabel(status)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={handleRefreshStatuses}
          disabled={refreshingStatuses}
          style={[
            styles.refreshButton,
            refreshingStatuses && styles.refreshButtonDisabled,
          ]}
        >
          {refreshingStatuses ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh Statuses</Text>
          )}
        </Pressable>
      </View>

      <FlatList
        data={filteredBatches}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const drawTitle = getDrawTitle(item);
          const drawNumbersText = getDrawNumbersText(item);

          return (
            <View style={styles.card}>
              <Pressable
                style={styles.cardContent}
                onPress={() =>
                  router.push({
                    pathname: "/batch/[id]",
                    params: { id: String(item.id) },
                  })
                }
              >
                <Text style={styles.title}>Batch #{item.id}</Text>
                <Text style={styles.cardText}>Status: {getStatusLabel(item.status ?? "—")}</Text>
                <Text style={styles.cardText}>Created: {item.createdAt || item.created_at || "—"}</Text>
                <Text style={styles.ticketCountText}>
                  Tickets: {item.ticketCount || item.ticket_count || "?"}
                </Text>

                {drawNumbersText ? (
                  <>
                    <Text style={styles.drawText}>
                      Draw: {drawTitle ? `#${drawTitle}` : "—"}
                    </Text>
                    <Text style={styles.drawNumbersText}>
                      Numbers: {drawNumbersText}
                    </Text>
                  </>
                ) : null}
              </Pressable>

              {(item.status ?? "").toLowerCase() === "generated" && (
                <Pressable
                  onPress={() => handleApplyToLotto(item.id)}
                  disabled={applyingBatchId === item.id}
                  style={[
                    styles.applyButton,
                    styles.applyButtonRight,
                    applyingBatchId === item.id && styles.applyButtonDisabled,
                  ]}
                >
                  {applyingBatchId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.applyButtonText}>Pay</Text>
                  )}
                </Pressable>
              )}
              {(item.status ?? "").toLowerCase() === "checked" && (
                <Pressable
                  onPress={() => handleSaveToArchive(item.id)}
                  disabled={applyingBatchId === item.id}
                  style={[
                    styles.archiveButton,
                    styles.applyButtonRight,
                    applyingBatchId === item.id && styles.applyButtonDisabled,
                  ]}
                >
                  {applyingBatchId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.applyButtonText}>Archive</Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.centerBlock}>
            <Text>No batches found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerBlock: {
    padding: 24,
    alignItems: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#e8e8e8",
  },
  tabActive: {
    backgroundColor: "#007AFF",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  tabTextActive: {
    color: "#fff",
  },
  card: {
    flexDirection: "row",
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#f3f3f3",
    alignItems: "center",
  },
  cardContent: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardText: {
    fontSize: 14,
    marginBottom: 2,
  },
  statusSection: {
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
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
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  countText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  viewMoreButton: {
    padding: 12,
    alignItems: "center",
    backgroundColor: "#e8e8e8",
    borderRadius: 8,
  },
  viewMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  ticketCountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    marginTop: 4,
  },
  applyButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
  },
  archiveButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#BDBDBD",
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonRight: {
    marginLeft: 12,
  },
  applyButtonDisabled: {
    backgroundColor: "#999",
  },
  applyButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: "red",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  refreshButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#34C759",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  drawText: {
  fontSize: 13,
  fontWeight: "600",
  marginTop: 8,
  },
  drawNumbersText: {
    fontSize: 13,
    color: "#444",
    marginTop: 2,
  },
});

