import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { generateTickets, createBatch, getOpenDraw, getCurrentWeights } from "../../services/api";

type Ticket = {
  ticketIndex: number;
  numbers: number[];
  strong: number;
};

type GeneratedBatch = {
  id: string;
  tickets: Ticket[];
  createdAt: string;
  params: {
    count: number;
    maxCommon: number;
    seed?: string;
    clusterTarget?: number;
  };
};

export default function GenerateTicketsScreen() {
  const [count, setCount] = useState("10");
  const [maxCommon, setMaxCommon] = useState("3");
  const [seed, setSeed] = useState("");
  const [clusterTarget, setClusterTarget] = useState("-");
  const [showClusterDropdown, setShowClusterDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<GeneratedBatch | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [clusterDescriptions, setClusterDescriptions] = useState<Record<string, string>>({
    "-": "No ML cluster. Using calculated weights",
    "1": "Lowest grouping - tickets are more spread out across number ranges",
    "2": "Low grouping - balanced spread with moderate clustering",
    "3": "High grouping - tickets tend to cluster together in similar ranges",
    "4": "Highest grouping - tickets are heavily clustered in similar number ranges",
  });

  useEffect(() => {
    fetchClusterDescriptions();
  }, []);

  async function fetchClusterDescriptions() {
    try {
      const weights = await getCurrentWeights();
      if (weights && weights.weights_json) {
        const weightsData = JSON.parse(weights.weights_json);
        if (weightsData.clustering && weightsData.clustering.clusters) {
          const descriptions: Record<string, string> = {
            "-": "No ML cluster. Using calculated weights",
          };
          for (const [key, value] of Object.entries(weightsData.clustering.clusters)) {
            const clusterNum = key.replace("cluster_", "");
            descriptions[clusterNum] = (value as any).description || "";
          }
          setClusterDescriptions(descriptions);
        }
      }
    } catch (err) {
      console.error("Error fetching cluster descriptions:", err);
      // Keep default descriptions on error
    }
  }

  async function handleGenerate() {
    const ticketCount = parseInt(count, 10);
    const maxCommonValue = parseInt(maxCommon, 10);
    const clusterValue = clusterTarget ? parseInt(clusterTarget, 10) : undefined;

    if (isNaN(ticketCount) || ticketCount < 1) {
      setError("Count must be at least 1");
      return;
    }

    if (isNaN(maxCommonValue) || maxCommonValue < 0) {
      setError("Max common must be a valid number");
      return;
    }

    if (clusterValue !== undefined && (clusterValue < 1 || clusterValue > 4)) {
      setError("Cluster target must be between 1 and 4");
      return;
    }

    setLoading(true);
    setError("");
    setBatch(null);

    try {
      const response = await generateTickets({
        count: ticketCount,
        maxCommon: maxCommonValue,
        seed: seed || undefined,
        clusterTarget: clusterValue,
      });

      const tickets = response.tickets || [];

      try {
        let targetDrawId: string | null = null;
        let targetPaisId: number | null = null;
        let targetDrawAt: string | null = null;
        let targetDrawSnapshotJson: string | null = null;

        try {
          const openDraw = await getOpenDraw();
          const drawData = openDraw.draw;
          
          if (drawData && drawData.LotteryNumber) {
            targetDrawId = null; // оставить пустым до подтверждения из Lotto Sheli
            targetPaisId = drawData.LotteryNumber ?? null;
            targetDrawAt = drawData.nextLottoryDate ?? null;
            targetDrawSnapshotJson = JSON.stringify(drawData);
          }
        } catch (drawErr) {
          console.warn("Could not fetch open draw, creating batch without draw info:", drawErr);
        }

        const batchResponse = await createBatch({
          targetDrawId,
          targetPaisId,
          targetDrawAt,
          targetDrawSnapshotJson,
          generatorVersion: "mobile-v1",
          tickets: tickets.map((t: Ticket) => ({
            ticketIndex: t.ticketIndex,
            numbers: t.numbers,
            strong: t.strong,
          })),
        });

        const newBatch: GeneratedBatch = {
          id: String(batchResponse.batch?.id || batchResponse.batch?.batch_key),
          tickets: tickets,
          createdAt: new Date().toISOString(),
          params: {
            count: ticketCount,
            maxCommon: maxCommonValue,
            seed: seed || undefined,
            clusterTarget: clusterValue,
          },
        };

        setBatch(newBatch);
        Alert.alert("Success", `Generated and saved ${response.count} tickets as batch #${newBatch.id}`);
      } catch (batchErr) {
        const message = batchErr instanceof Error ? batchErr.message : String(batchErr);
        console.error("Failed to save batch:", message);
        
        const newBatch: GeneratedBatch = {
          id: `local-${Date.now()}`,
          tickets: tickets,
          createdAt: new Date().toISOString(),
          params: {
            count: ticketCount,
            maxCommon: maxCommonValue,
            seed: seed || undefined,
            clusterTarget: clusterValue,
          },
        };

        setBatch(newBatch);
        Alert.alert("Partial Success", `Generated ${response.count} tickets (failed to save to database: ${message})`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Generate Tickets</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Number of Tickets</Text>
            <TextInput
              style={styles.input}
              value={count}
              onChangeText={setCount}
              placeholder="10"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Max Common Numbers</Text>
            <TextInput
              style={styles.input}
              value={maxCommon}
              onChangeText={setMaxCommon}
              placeholder="3"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Seed (Optional)</Text>
            <TextInput
              style={styles.input}
              value={seed}
              onChangeText={setSeed}
              placeholder="Optional random seed"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Cluster Target (1-4, Optional)</Text>
            <Pressable
              style={styles.dropdown}
              onPress={() => setShowClusterDropdown(true)}
            >
              <Text style={styles.dropdownText}>
                {clusterTarget || "Select cluster"}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </Pressable>
            {clusterTarget && (
              <Text style={styles.description}>{clusterDescriptions[clusterTarget]}</Text>
            )}
          </View>

          <Modal
            visible={showClusterDropdown}
            transparent
            animationType="fade"
            onRequestClose={() => setShowClusterDropdown(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowClusterDropdown(false)}
            >
              <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
                <Text style={styles.dropdownTitle}>Select Cluster</Text>
                {["-", "1", "2", "3", "4"].map((option) => (
                  <Pressable
                    key={option}
                    style={[
                      styles.dropdownOption,
                      clusterTarget === option && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      setClusterTarget(option);
                      setShowClusterDropdown(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        clusterTarget === option && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      Cluster {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Generate Tickets</Text>
            )}
          </Pressable>

          {batch && (
            <Pressable
              style={({ pressed }) => [
                styles.batchCard,
                pressed && styles.batchCardPressed,
              ]}
              onPress={() => setShowBatchModal(true)}
            >
              <Text style={styles.batchTitle}>Batch #{batch.id.slice(-8)}</Text>
              <Text style={styles.batchMeta}>
                {batch.tickets.length} tickets · {new Date(batch.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.batchParams}>
                Count: {batch.params.count} · Max Common: {batch.params.maxCommon}
                {batch.params.seed && ` · Seed: ${batch.params.seed}`}
                {batch.params.clusterTarget && ` · Cluster: ${batch.params.clusterTarget}`}
              </Text>
              <View style={styles.batchArrow}>
                <Text style={styles.batchArrowText}>→ View Tickets</Text>
              </View>
            </Pressable>
          )}

          <Modal
            visible={showBatchModal}
            animationType="slide"
            onRequestClose={() => setShowBatchModal(false)}
          >
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Batch #{batch?.id.slice(-8)}</Text>
                <Pressable onPress={() => setShowBatchModal(false)}>
                  <Text style={styles.modalClose}>Close</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                {batch?.tickets.map((ticket) => (
                  <View key={ticket.ticketIndex} style={styles.ticketCard}>
                    <Text style={styles.ticketIndex}>
                      Ticket #{ticket.ticketIndex}
                    </Text>
                    <Text style={styles.ticketNumbers}>
                      Numbers: {ticket.numbers.join(", ")}
                    </Text>
                    <Text style={styles.ticketStrong}>
                      Strong: {ticket.strong}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </SafeAreaView>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
  },
  dropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#f9f9f9",
  },
  dropdownText: {
    fontSize: 16,
    color: "#333",
  },
  dropdownArrow: {
    fontSize: 16,
    color: "#666",
  },
  description: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dropdownModal: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    maxWidth: 300,
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  dropdownOption: {
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#f9f9f9",
  },
  dropdownOptionSelected: {
    backgroundColor: "#007AFF",
  },
  dropdownOptionText: {
    fontSize: 16,
    color: "#333",
  },
  dropdownOptionTextSelected: {
    color: "#fff",
  },
  error: {
    color: "red",
    marginBottom: 16,
    textAlign: "center",
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#007AFF",
    marginBottom: 24,
    minHeight: 52,
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  batchCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  batchCardPressed: {
    opacity: 0.8,
  },
  batchTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  batchMeta: {
    fontSize: 14,
    marginBottom: 6,
    opacity: 0.8,
  },
  batchParams: {
    fontSize: 13,
    marginBottom: 8,
    opacity: 0.7,
  },
  batchArrow: {
    marginTop: 8,
  },
  batchArrowText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  modalClose: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  modalContent: {
    padding: 16,
  },
  ticketCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  ticketIndex: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  ticketNumbers: {
    fontSize: 14,
    marginBottom: 4,
  },
  ticketStrong: {
    fontSize: 14,
    fontWeight: "600",
  },
});
