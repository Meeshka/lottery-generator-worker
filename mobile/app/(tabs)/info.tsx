import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  healthCheck,
  getLatestDraw,
  updateDraws,
  validateToken,
} from "../../services/api";
import {
  getAccessToken,
  clearTokens,
} from "../../services/secureStorage";

export default function InfoScreen() {
  const [loginState, setLoginState] = useState<"checking" | "logged_in" | "not_logged_in" | "invalid">("checking");
  const [workerState, setWorkerState] = useState<"checking" | "healthy" | "unhealthy">("checking");
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [latestDrawDate, setLatestDrawDate] = useState<string | null>(null);
  const [updatingDraws, setUpdatingDraws] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  useEffect(() => {
    checkAllStates();
  }, []);

  async function checkAllStates() {
    await Promise.all([
      checkLoginState(),
      checkWorkerState(),
      checkLatestDraw(),
    ]);
  }

  async function checkLoginState() {
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoginState("not_logged_in");
        setTokenValid(false);
        return;
      }

      setLoginState("logged_in");
      
      // Validate token by checking JWT expiration
      const isValid = validateToken(token);
      setTokenValid(isValid);
      if (!isValid) {
        setLoginState("invalid");
      }
    } catch (err) {
      console.error("Error checking login state:", err);
      setLoginState("not_logged_in");
      setTokenValid(false);
    }
  }

  async function checkWorkerState() {
    try {
      await healthCheck();
      setWorkerState("healthy");
    } catch (err) {
      console.error("Worker health check failed:", err);
      setWorkerState("unhealthy");
    }
  }

  async function checkLatestDraw() {
    try {
      const latest = await getLatestDraw();
      if (latest && latest.draw_date) {
        setLatestDrawDate(latest.draw_date);
      }
    } catch (err) {
      console.error("Error fetching latest draw:", err);
    }
  }

  async function handleUpdateDraws() {
    const token = await getAccessToken();
    if (!token) {
      Alert.alert("Error", "No access token found. Please login first.");
      return;
    }

    if (!tokenValid) {
      Alert.alert("Error", "Token is invalid. Please login again.");
      return;
    }

    setUpdatingDraws(true);
    setUpdateResult(null);

    try {
      const result = await updateDraws(token);
      
      if (result.ok) {
        const message = `Updated ${result.importedCount} new draws out of ${result.totalDraws} total.`;
        setUpdateResult(message);
        Alert.alert("Success", message);
        
        // Refresh latest draw date
        await checkLatestDraw();
        
        // Note: Weight and cluster recalculation would need to be triggered
        // This would typically be done via a separate endpoint or scheduled job
        if (result.importedCount > 0) {
          Alert.alert(
            "Recalculation Needed",
            "New draws have been imported. Weight and cluster recalculation should be triggered."
          );
        }
      } else {
        setUpdateResult(`Error: ${result.error}`);
        Alert.alert("Error", result.error || "Failed to update draws");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUpdateResult(`Error: ${message}`);
      Alert.alert("Error", message);
    } finally {
      setUpdatingDraws(false);
    }
  }

  async function handleLogout() {
    try {
      await clearTokens();
      setLoginState("not_logged_in");
      setTokenValid(false);
      Alert.alert("Logged Out", "You have been logged out successfully");
      // Refresh all states after logout
      await checkAllStates();
    } catch (err) {
      console.error("Error logging out:", err);
      Alert.alert("Error", "Failed to log out");
    }
  }

  function getLoginStateText() {
    switch (loginState) {
      case "checking":
        return "Checking...";
      case "logged_in":
        return tokenValid ? "Logged in (valid)" : "Logged in (invalid token)";
      case "not_logged_in":
        return "Not logged in";
      case "invalid":
        return "Invalid token";
      default:
        return "Unknown";
    }
  }

  function getWorkerStateText() {
    switch (workerState) {
      case "checking":
        return "Checking...";
      case "healthy":
        return "Healthy";
      case "unhealthy":
        return "Unhealthy";
      default:
        return "Unknown";
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
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

        <View style={styles.infoCard}>
          <Text style={styles.label}>Login State</Text>
          <Text style={styles.value}>{getLoginStateText()}</Text>
          {tokenValid !== null && (
            <Text style={styles.subValue}>
              Token validation: {tokenValid ? "Valid" : "Invalid"}
            </Text>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.label}>Worker State</Text>
          <Text style={styles.value}>{getWorkerStateText()}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.label}>Latest Draw Date</Text>
          <Text style={styles.value}>
            {latestDrawDate ? latestDrawDate : "Not available"}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (!tokenValid || loginState !== "logged_in") && styles.buttonDisabled,
          ]}
          onPress={handleUpdateDraws}
          disabled={updatingDraws || !tokenValid || loginState !== "logged_in"}
        >
          {updatingDraws ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Update Draws</Text>
          )}
        </Pressable>

        {loginState === "logged_in" && (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.logoutButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.buttonText}>Logout</Text>
          </Pressable>
        )}

        {updateResult && (
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Update Result</Text>
            <Text style={styles.resultText}>{updateResult}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
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
  infoCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  value: {
    fontSize: 18,
    fontWeight: "500",
    color: "#007AFF",
  },
  subValue: {
    fontSize: 14,
    marginTop: 4,
    color: "#666",
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#007AFF",
    marginBottom: 16,
    minHeight: 52,
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
  },
  logoutButton: {
    backgroundColor: "#FF3B30",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  resultCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#e8f5e9",
    borderWidth: 1,
    borderColor: "#4caf50",
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  resultText: {
    fontSize: 14,
    color: "#333",
  },
});
