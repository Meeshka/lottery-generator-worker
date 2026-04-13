import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { generateTickets } from "../../services/api";

type Ticket = {
  ticketIndex: number;
  numbers: number[];
  strong: number;
};

export default function GenerateTicketsScreen() {
  const [count, setCount] = useState("10");
  const [maxCommon, setMaxCommon] = useState("3");
  const [seed, setSeed] = useState("");
  const [clusterTarget, setClusterTarget] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);

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
    setTickets([]);

    try {
      const response = await generateTickets({
        count: ticketCount,
        maxCommon: maxCommonValue,
        seed: seed || undefined,
        clusterTarget: clusterValue,
      });

      setTickets(response.tickets || []);
      Alert.alert("Success", `Generated ${response.count} tickets`);
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
            <TextInput
              style={styles.input}
              value={clusterTarget}
              onChangeText={setClusterTarget}
              placeholder="1, 2, 3, or 4"
              keyboardType="number-pad"
              maxLength={1}
            />
          </View>

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

          {tickets.length > 0 && (
            <View style={styles.ticketsContainer}>
              <Text style={styles.ticketsTitle}>
                Generated {tickets.length} Tickets
              </Text>
              {tickets.map((ticket) => (
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
            </View>
          )}
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
  ticketsContainer: {
    marginTop: 16,
  },
  ticketsTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
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
