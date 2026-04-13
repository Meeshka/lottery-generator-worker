import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getBatches } from "../../services/api";

export default function BatchesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadBatches() {
    try {
      setError("");
      const data = await getBatches(20);
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
      <FlatList
        data={batches}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
                router.push({
                    pathname: "/batch/[id]",
                    params: { id: String(item.id) },
                })
            }
            style={styles.card}
          >
            <Text style={styles.title}>Batch #{item.id}</Text>
            <Text>Status: {item.status ?? "—"}</Text>
            <Text>Created: {item.createdAt || item.created_at || "—"}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.centerBlock}>
            <Text>Нет batch-ов</Text>
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
  card: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: "#f3f3f3",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  error: {
    color: "red",
  },
});