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
import { getBatches, applyBatchToLotto, refreshBatchStatuses, archiveBatch, deleteBatch, validateToken } from "../../services/api";
import { getAccessToken, getAuthProfile } from "../../services/secureStorage";

function getStatusLabel(status: string) {
  return status.replaceAll("_", " ");
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
  return batch?.target_pais_id ?? batch?.targetPaisId ?? batch?.target_draw_id ?? batch?.targetDrawId ?? draw?.pais_id ?? draw?.draw_id ?? null;
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

function getDrawDateText(batch: any) {
  const draw = batch?.linked_draw;
  const batchDate = batch?.target_draw_at ?? batch?.targetDrawAt;
  
  // Try batch date first
  if (batchDate) {
    try {
      const date = new Date(batchDate);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    } catch {
      // Fall through - return raw string if parsing fails
    }
    // Return raw string if we couldn't parse it
    return batchDate;
  }
  
  // Fall back to linked draw date
  const drawDate = draw?.draw_date;
  if (drawDate) {
    try {
      const date = new Date(drawDate);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    } catch {
      return drawDate;
    }
    return drawDate;
  }
  
  return null;
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
  const [deletingBatchId, setDeletingBatchId] = useState<number | null>(null);
  const [refreshingStatuses, setRefreshingStatuses] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  async function loadBatches() {
    try {
      setError("");

      const token = await getAccessToken();
      setIsAuthenticated(!!token && validateToken(token));

      const profile = await getAuthProfile();
      setIsAdmin(!!profile?.isAdmin);

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

              const accessToken = await getAccessToken();
              if (!accessToken) {
                Alert.alert("Error", "Please log in first");
                return;
              }

              const result = await archiveBatch(batchId, accessToken);

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

  async function handleDelete(batchId: number){
    Alert.alert(
      "Delete batch",
      "Are you sure you want to delete this batch?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingBatchId(batchId);

              const accessToken = await getAccessToken();
              if (!accessToken) {
                Alert.alert("Error", "Please log in first");
                return;
              }

              const result = await deleteBatch(batchId, accessToken);

              Alert.alert(
                "Success",
                `Batch deleted successfully!`,
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
              setDeletingBatchId(null);
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
Retargeted generated: ${summary.retargetedGenerated ?? 0}
Retargeted confirmed: ${summary.retargetedConfirmed ?? 0}
Matched existing: ${summary.matchedExisting ?? 0}
Confirmed existing: ${summary.confirmedExisting ?? 0}
Created missing: ${summary.createdMissing ?? 0}
Checked now: ${summary.checkedNow ?? 0}`,
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
      {/* Filter Card */}
      <View style={styles.filterCard}>
        <Text style={styles.filterTitle}>Filter</Text>
        <View style={styles.filterRow}>
          <Pressable
            style={[
              styles.filterChip,
              selectedTab === "all" && styles.filterChipActive,
            ]}
            onPress={() => setSelectedTab("all")}
          >
            <Text style={[
              styles.filterChipText,
              selectedTab === "all" && styles.filterChipTextActive,
            ]}>
              All
            </Text>
          </Pressable>
          {allStatuses.map((status) => (
            <Pressable
              key={status}
              style={[
                styles.filterChip,
                selectedTab === status && { backgroundColor: getTabBackgroundColor(status) }
              ]}
              onPress={() => setSelectedTab(status)}
            >
              <Text style={[
                styles.filterChipText,
                selectedTab === status && { color: getTabTextColor(status) }
              ]}>
                {getStatusLabel(status)}
              </Text>
            </Pressable>
          ))}
        </View>
        {isAdmin && (
          <View style={styles.adminFilterRow}>
            <Text style={styles.adminFilterLabel}>Admin View:</Text>
            <Pressable
              style={[
                styles.adminFilterChip,
                selectedTab === "all" && styles.adminFilterChipActive,
              ]}
              onPress={() => setSelectedTab("all")}
            >
              <Text style={styles.adminFilterChipText}>All</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Refresh Action */}
      {isAuthenticated && (
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
      )}

      <FlatList
        data={filteredBatches}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const drawTitle = getDrawTitle(item);
          const drawNumbersText = getDrawNumbersText(item);
          const drawDateText = getDrawDateText(item);

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
                <View style={styles.cardHeader}>
                  <Text style={styles.title}>Batch #{item.id}</Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: getTabBackgroundColor(item.status ?? "unknown") }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: getTabTextColor(item.status ?? "unknown") }
                    ]}>
                      {getStatusLabel(item.status ?? "—")}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardText}>Created: {item.createdAt || item.created_at || "—"}</Text>
                <Text style={styles.ticketCountText}>
                  Tickets: {item.ticketCount || item.ticket_count || "?"}
                </Text>

                {(drawTitle || drawDateText) ? (
                  <View style={styles.drawInfo}>
                    <Text style={[styles.drawText, { writingDirection: 'auto' }]}>
                      Draw: {drawTitle ? `#${drawTitle}` : "—"}
                    </Text>
                    {drawNumbersText && (
                      <Text style={[styles.drawNumbersText, { writingDirection: 'auto' }]}>
                        Numbers: {drawNumbersText}
                      </Text>
                    )}
                    {drawDateText && (
                      <Text style={[styles.drawDateText, { writingDirection: 'auto' }]}>
                        Date: {drawDateText}
                      </Text>
                    )}
                  </View>
                ) : null}
              </Pressable>

              <View style={styles.cardActions}>
                {isAuthenticated && (item.status ?? "").toLowerCase() === "generated" && (
                  <Pressable
                    onPress={() => handleApplyToLotto(item.id)}
                    disabled={applyingBatchId === item.id}
                    style={[
                      styles.actionButton,
                      applyingBatchId === item.id && styles.actionButtonDisabled,
                    ]}
                  >
                    {applyingBatchId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionButtonText}>Pay</Text>
                    )}
                  </Pressable>
                )}
                {isAdmin && (item.status ?? "").toLowerCase() === "checked" && (
                  <Pressable
                    onPress={() => handleSaveToArchive(item.id)}
                    disabled={archiveBatchId === item.id}
                    style={[
                      styles.actionButton,
                      styles.archiveButton,
                      archiveBatchId === item.id && styles.actionButtonDisabled,
                    ]}
                  >
                    {archiveBatchId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionButtonText}>Archive</Text>
                    )}
                  </Pressable>
                )}
                {isAdmin &&
                  ((item.status ?? "").toLowerCase() === "generated" ||
                    (item.status ?? "").toLowerCase() === "archived") && (
                  <Pressable
                    onPress={() => handleDelete(item.id)}
                    disabled={deletingBatchId === item.id}
                    style={[
                      styles.actionButton,
                      styles.deleteButton,
                      deletingBatchId === item.id && styles.actionButtonDisabled,
                    ]}
                  >
                    {deletingBatchId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionButtonText}>Delete</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.centerBlock}>
            <Text style={styles.emptyText}>No batches found</Text>
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
    backgroundColor: "#fff",
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
  error: {
    color: "red",
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
  },
  filterCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    color: "#333",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#e0e0e0",
  },
  filterChipActive: {
    backgroundColor: "#007AFF",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  adminFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  adminFilterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  adminFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#e0e0e0",
  },
  adminFilterChipActive: {
    backgroundColor: "#9C27B0",
  },
  adminFilterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
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
  card: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cardContent: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  cardText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  ticketCountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    marginTop: 4,
  },
  drawInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  drawText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  drawNumbersText: {
    fontSize: 13,
    color: "#444",
    marginBottom: 2,
  },
  drawDateText: {
    fontSize: 12,
    color: "#666",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  actionButtonDisabled: {
    backgroundColor: "#999",
  },
  archiveButton: {
    backgroundColor: "#BDBDBD",
  },
  deleteButton: {
    backgroundColor: "#FF5252",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});

