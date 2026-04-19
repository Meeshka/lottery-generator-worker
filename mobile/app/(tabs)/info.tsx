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
  pythonHealthCheck,
  getLatestDraw,
  validateToken,
} from "../../services/api";
import {
  getAccessToken,
  getAuthProfile,
} from "../../services/secureStorage";

export default function InfoScreen() {
  const router = useRouter();
  const [loginState, setLoginState] = useState<"checking" | "logged_in" | "not_logged_in" | "invalid">("checking");
  const [workerState, setWorkerState] = useState<"checking" | "healthy" | "unhealthy">("checking");
  const [pythonWorkerState, setPythonWorkerState] = useState<"checking" | "healthy" | "unhealthy">("checking");
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState("");
  const [lottoAccountStatus, setLottoAccountStatus] = useState<"checking" | "connected" | "not_connected">("checking");
  const [latestDrawDate, setLatestDrawDate] = useState<string | null>(null);

  useEffect(() => {
    checkAllStates();
  }, []);

  async function checkAllStates() {
    await Promise.all([
      checkLoginState(),
      checkWorkerState(),
      checkPythonWorkerState(),
      checkLatestDraw(),
    ]);
  }

  async function checkLoginState() {
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoginState("not_logged_in");
        setTokenValid(false);
        setIsAdmin(false);
        return;
      }

      setLoginState("logged_in");

      const isValid = validateToken(token);
      setTokenValid(isValid);

      if (!isValid) {
        setLoginState("invalid");
        setIsAdmin(false);
        return;
      }

      const profile = await getAuthProfile();
      setIsAdmin(!!profile?.isAdmin);
      setUsername(profile?.firstName || profile?.email || "User");
      setLottoAccountStatus(profile?.lottoUserId ? "connected" : "not_connected");
    } catch {
      setLoginState("not_logged_in");
      setTokenValid(false);
      setIsAdmin(false);
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

  async function checkPythonWorkerState() {
    try {
      await pythonHealthCheck();
      setPythonWorkerState("healthy");
    } catch (err) {
      setPythonWorkerState("unhealthy");
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
      case "logged_in":
        return "#4CAF50";
      case "unhealthy":
      case "invalid":
      case "not_connected":
      case "not_logged_in":
        return "#FF5252";
      default:
        return "#FF9500";
    }
  }

  function getStatusText(state: string) {
    switch (state) {
      case "checking":
        return "Checking...";
      case "healthy":
        return "Healthy";
      case "unhealthy":
        return "Unhealthy";
      case "logged_in":
        return "Logged in";
      case "not_logged_in":
        return "Not logged in";
      case "invalid":
        return "Invalid token";
      case "connected":
        return "Connected";
      case "not_connected":
        return "Not connected";
      default:
        return "Unknown";
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>System Info</Text>
          <Pressable
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={checkAllStates}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>

        {/* Session Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Login State:</Text>
            <View style={[
              styles.badge,
              { backgroundColor: getStatusColor(loginState) }
            ]}>
              <Text style={styles.badgeText}>{getStatusText(loginState)}</Text>
            </View>
          </View>
          {tokenValid !== null && (
            <View style={styles.row}>
              <Text style={styles.label}>Token Validation:</Text>
              <View style={[
                styles.badge,
                { backgroundColor: tokenValid ? "#4CAF50" : "#FF5252" }
              ]}>
                <Text style={styles.badgeText}>{tokenValid ? "Valid" : "Invalid"}</Text>
              </View>
            </View>
          )}
        </View>

        {/* User Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>User</Text>
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
            <Text style={styles.label}>Username:</Text>
            <Text style={[styles.value, { writingDirection: 'auto' }]}>{username}</Text>
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

        {/* System Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>System</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Worker State:</Text>
            <View style={[
              styles.badge,
              { backgroundColor: getStatusColor(workerState) }
            ]}>
              <Text style={styles.badgeText}>{getStatusText(workerState)}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Python Engine:</Text>
            <View style={[
              styles.badge,
              { backgroundColor: getStatusColor(pythonWorkerState) }
            ]}>
              <Text style={styles.badgeText}>{getStatusText(pythonWorkerState)}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Latest Draw Date:</Text>
            <Text style={styles.value}>{latestDrawDate || "Not available"}</Text>
          </View>
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
  content: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  refreshButton: {
    padding: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  refreshButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
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
});
