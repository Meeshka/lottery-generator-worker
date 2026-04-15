import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { getBatches, applyBatchToLotto } from "../../services/api";
import { getAccessToken } from "../../services/secureStorage";

export default function BatchesByStatusScreen() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status: string }>();

  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [applyingBatchId, setApplyingBatchId] = useState<number | null>(null);

  async function loadBatches() {
    try {
      setError("");
      const data = await getBatches(100);
      const filteredBatches = (data.batches || []).filter(
        (batch: any) => (batch.status ?? "").toLowerCase() === status.toLowerCase()
      );
      setBatches(filteredBatches);
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
  }, [status]);

  function onRefresh() {
    setRefreshing(true);
    loadBatches();
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

  function getStatusLabel(status: string) {
    return status.replaceAll("_", " ");
  }

  function getStatusStyle(status: string) {
    switch (status.toLowerCase()) {
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={[styles.statusBadge, getStatusStyle(status)]}>
          <Text style={styles.statusText}>{getStatusLabel(status)}</Text>
        </View>
      </View>

      <FlatList
        data={batches}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
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
              <Text>Status: {item.status ?? "—"}</Text>
              <Text>Created: {item.createdAt || item.created_at || "—"}</Text>
              <Text style={styles.ticketCountText}>
                Tickets: {item.ticketCount || item.ticket_count || "?"}
              </Text>
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
                  <Text style={styles.applyButtonText}>Apply</Text>
                )}
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.centerBlock}>
            <Text>No batches with status "{getStatusLabel(status)}"</Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
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
  card: {
    flexDirection: "row",
    padding: 16,
    marginBottom: 12,
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
  applyButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#007AFF",
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
  ticketCountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    marginTop: 4,
  },
  error: {
    color: "red",
  },
});
