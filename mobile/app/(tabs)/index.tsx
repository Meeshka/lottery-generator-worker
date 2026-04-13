import { useState } from "react";
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { healthCheck } from "../../services/api";

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("Нажми кнопку для проверки API");
  const [error, setError] = useState<string>("");

  console.log("API:", process.env.EXPO_PUBLIC_API_BASE);

  async function onHealthCheck() {
    setLoading(true);
    setError("");
    setResult("");

    try {
      const data = await healthCheck();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Lottery Mobile</Text>
        <Text style={styles.subtitle}>Проверка связи с Worker API</Text>

        <View style={styles.buttonWrap}>
          <Button
            title="Check /health"
            onPress={onHealthCheck}
            disabled={loading}
          />
        </View>

        {loading && <ActivityIndicator size="large" />}

        {error ? (
          <View style={styles.card}>
            <Text style={styles.errorTitle}>Ошибка</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {result ? (
          <View style={styles.card}>
            <Text style={styles.resultTitle}>Ответ</Text>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
    color: "#555",
  },
  buttonWrap: {
    marginVertical: 10,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f3f3f3",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    color: "#b00020",
  },
  errorText: {
    fontSize: 14,
    color: "#b00020",
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    fontFamily: "monospace",
  },
});