import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  healthCheck,
  getLatestDraw,
  validateToken,
} from "../../services/api";
import {
  getAccessToken,
  getAuthProfile,
} from "../../services/secureStorage";

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [lottoAccountStatus, setLottoAccountStatus] = useState<"checking" | "connected" | "not_connected">("checking");
  const [workerState, setWorkerState] = useState<"checking" | "healthy" | "unhealthy">("checking");
  const [loginState, setLoginState] = useState<"checking" | "valid" | "invalid">("checking");
  const [latestDrawDate, setLatestDrawDate] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    await Promise.all([
      checkUserProfile(),
      checkWorkerState(),
      checkLoginState(),
      checkLatestDraw(),
    ]);
    setLoading(false);
  }

  async function checkUserProfile() {
    try {
      const profile = await getAuthProfile();
      setIsAdmin(!!profile?.isAdmin);
      setUsername(profile?.firstName || profile?.email || "Guest");
      setEmail(profile?.email || "");
      setLottoAccountStatus(profile?.lottoUserId ? "connected" : "not_connected");
    } catch (err) {
      console.error("Error loading user profile:", err);
      setUsername("Guest");
    }
  }

  async function checkWorkerState() {
    try {
      await healthCheck();
      setWorkerState("healthy");
    } catch (err) {
      setWorkerState("unhealthy");
    }
  }

  async function checkLoginState() {
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoginState("invalid");
        return;
      }
      const isValid = validateToken(token);
      setLoginState(isValid ? "valid" : "invalid");
    } catch (err) {
      setLoginState("invalid");
    }
  }

  async function checkLatestDraw() {
    try {
      const latest = await getLatestDraw();
      if (latest && latest.draw_date) {
        const date = new Date(latest.draw_date);
        const formatted = date.toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        setLatestDrawDate(formatted);
      }
    } catch (err) {
      console.error("Error fetching latest draw:", err);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "healthy":
      case "valid":
      case "connected":
        return "#4CAF50";
      case "unhealthy":
      case "invalid":
      case "not_connected":
        return "#FF5252";
      default:
        return "#FF9500";
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Welcome back, {username}!</Text>

        {/* User Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>User Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Username:</Text>
            <Text style={[styles.value, { writingDirection: 'auto' }]}>{username}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Email:</Text>
            <Text style={[styles.value, { writingDirection: 'auto' }]}>{email || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Role:</Text>
            <View style={[
              styles.badge,
              { backgroundColor: isAdmin ? "#9C27B0" : "#4CAF50" }
            ]}>
              <Text style={styles.badgeText}>{isAdmin ? "Admin" : "User"}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Lotto Account:</Text>
            <View style={[
              styles.badge,
              { backgroundColor: getStatusColor(lottoAccountStatus) }
            ]}>
              <Text style={styles.badgeText}>
                {lottoAccountStatus === "connected" ? "Connected" : "Not Connected"}
              </Text>
            </View>
          </View>
        </View>

        {/* System Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>System Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Worker State:</Text>
            <View style={[
              styles.badge,
              { backgroundColor: getStatusColor(workerState) }
            ]}>
              <Text style={styles.badgeText}>
                {workerState === "healthy" ? "Healthy" : "Unhealthy"}
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Latest Draw:</Text>
            <Text style={styles.value}>{latestDrawDate || "Not available"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Login State:</Text>
            <View style={[
              styles.badge,
              { backgroundColor: getStatusColor(loginState) }
            ]}>
              <Text style={styles.badgeText}>
                {loginState === "valid" ? "Valid" : "Invalid"}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <Pressable
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/generate")}
          >
            <Text style={styles.actionIcon}>🎟️</Text>
            <Text style={styles.actionTitle}>Generate Ticket</Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/batches")}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionTitle}>My Batches</Text>
          </Pressable>

          {isAdmin && (
            <Pressable
              style={styles.actionCard}
              onPress={() => router.push("/(tabs)/admin")}
            >
              <Text style={styles.actionIcon}>⚙️</Text>
              <Text style={styles.actionTitle}>Admin Actions</Text>
            </Pressable>
          )}

          <Pressable
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/info")}
          >
            <Text style={styles.actionIcon}>ℹ️</Text>
            <Text style={styles.actionTitle}>System Info</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
    color: "#333",
  },
  card: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#333",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: "#666",
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    color: "#333",
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
  },
  actionCard: {
    width: "48%",
    marginHorizontal: "1%",
    backgroundColor: "#007AFF",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
});
