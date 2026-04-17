import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  updateDraws,
  validateToken,
  recalculateWeights,
  checkMissingBatchResults,
} from "../../services/api";
import {
  getAccessToken,
  getAuthProfile,
} from "../../services/secureStorage";

export default function AdminActionsScreen() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [updatingDraws, setUpdatingDraws] = useState(false);
  const [recalculatingWeights, setRecalculatingWeights] = useState(false);
  const [checkingMissingResults, setCheckingMissingResults] = useState(false);

  useEffect(() => {
    checkAuthAndRedirect();
  }, []);

  async function checkAuthAndRedirect() {
    try {
      const token = await getAccessToken();
      if (!token || !validateToken(token)) {
        router.replace('/login');
        return;
      }
      await checkAuth();
    } catch (err) {
      console.error('Auth check failed:', err);
      router.replace('/login');
    }
  }

  async function checkAuth() {
    try {
      const profile = await getAuthProfile();
      setIsAdmin(!!profile?.isAdmin);

      const token = await getAccessToken();
      if (token) {
        setTokenValid(validateToken(token));
      }
    } catch (err) {
      console.error("Error checking auth:", err);
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

    Alert.alert(
      "Update Draws",
      "This will update information about draws and the current draw. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Run",
          onPress: async () => {
            setUpdatingDraws(true);
            try {
              const result = await updateDraws(token);
              
              if (result.ok) {
                const message = `Updated ${result.importedCount} new draws out of ${result.totalDraws} total.`;
                Alert.alert("Success", message);
                
                if (result.importedCount > 0) {
                  Alert.alert(
                    "Recalculation Needed",
                    "New draws have been imported. Weight and cluster recalculation should be triggered."
                  );
                }
              } else {
                Alert.alert("Error", result.error || "Failed to update draws");
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              Alert.alert("Error", message);
            } finally {
              setUpdatingDraws(false);
            }
          },
        },
      ]
    );
  }

  async function handleRecalculateWeights() {
    const token = await getAccessToken();
    if (!token) {
      Alert.alert("Error", "No access token found. Please login first.");
      return;
    }

    if (!tokenValid) {
      Alert.alert("Error", "Token is invalid. Please login again.");
      return;
    }

    Alert.alert(
      "Recalculate Weights",
      "This will recalculate weights/priorities for generation. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Run",
          onPress: async () => {
            setRecalculatingWeights(true);
            try {
              const result = await recalculateWeights(token);

              if (result.ok) {
                const message = result.message || "Weights recalculated successfully";
                Alert.alert("Success", message);
              } else {
                Alert.alert("Error", result.error || "Failed to recalculate weights");
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              Alert.alert("Error", message);
            } finally {
              setRecalculatingWeights(false);
            }
          },
        },
      ]
    );
  }

  async function handleCheckMissingResults() {
    const token = await getAccessToken();
    if (!token) {
      Alert.alert("Error", "No access token found. Please login first.");
      return;
    }

    if (!tokenValid) {
      Alert.alert("Error", "Token is invalid. Please login again.");
      return;
    }

    Alert.alert(
      "Check Missing Results",
      "This will check for missing results and fill in gaps. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Run",
          onPress: async () => {
            setCheckingMissingResults(true);
            try {
              const result = await checkMissingBatchResults(token);
              const summary = result.summary || {};

              const message =
                `Scanned: ${summary.scanned ?? 0}\n` +
                `Eligible: ${summary.eligible ?? 0}\n` +
                `Checked now: ${summary.checkedNow ?? 0}\n` +
                `Skipped (already has results): ${summary.skippedWithResults ?? 0}\n` +
                `Skipped (draw not available): ${summary.skippedNoDraw ?? 0}\n` +
                `Failed: ${summary.failed ?? 0}`;

              Alert.alert("Check Complete", message);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              Alert.alert("Error", message);
            } finally {
              setCheckingMissingResults(false);
            }
          },
        },
      ]
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Access Denied</Text>
        <Text style={styles.subText}>Admin access required</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Admin Actions</Text>

        {/* Update Draws Card */}
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Update Draws</Text>
          <Text style={styles.actionDescription}>
            Updates information about draws and current draw.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.buttonPressed,
              updatingDraws && styles.buttonDisabled,
            ]}
            onPress={handleUpdateDraws}
            disabled={updatingDraws}
          >
            {updatingDraws ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Run</Text>
            )}
          </Pressable>
        </View>

        {/* Recalculate Weights Card */}
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Recalculate Weights</Text>
          <Text style={styles.actionDescription}>
            Recalculates weights/priorities for generation.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.buttonPressed,
              recalculatingWeights && styles.buttonDisabled,
            ]}
            onPress={handleRecalculateWeights}
            disabled={recalculatingWeights}
          >
            {recalculatingWeights ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Run</Text>
            )}
          </Pressable>
        </View>

        {/* Check Missing Results Card */}
        <View style={[styles.actionCard, styles.warningCard]}>
          <Text style={styles.actionTitle}>Check Missing Results</Text>
          <Text style={styles.actionDescription}>
            Checks for missing results and fills in gaps.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.warningButton,
              pressed && styles.buttonPressed,
              checkingMissingResults && styles.buttonDisabled,
            ]}
            onPress={handleCheckMissingResults}
            disabled={checkingMissingResults}
          >
            {checkingMissingResults ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Run</Text>
            )}
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
  errorText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FF5252",
    marginBottom: 8,
  },
  subText: {
    fontSize: 16,
    color: "#666",
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
  },
  actionCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  warningCard: {
    borderColor: "#FF9500",
    borderWidth: 2,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    color: "#333",
  },
  actionDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: "#007AFF",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  warningButton: {
    backgroundColor: "#FF9500",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    backgroundColor: "#999",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
