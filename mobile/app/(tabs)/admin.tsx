import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  updateDraws,
  validateToken,
  recalculateWeightsWithWindows,
  checkMissingBatchResults,
  getDailyBatchQuota,
  setDailyBatchQuota,
  getGenerationWindows,
  setGenerationWindows,
} from "../../services/api";
import {
  getAccessToken,
  getAuthProfile,
} from "../../services/secureStorage";

export default function AdminActionsScreen() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [updatingDraws, setUpdatingDraws] = useState(false);
  const [recalculatingWeights, setRecalculatingWeights] = useState(false);
  const [checkingMissingResults, setCheckingMissingResults] = useState(false);
  const [dailyQuota, setDailyQuota] = useState<number | null>(null);
  const [editingQuota, setEditingQuota] = useState(false);
  const [newQuota, setNewQuota] = useState("");
  const [savingQuota, setSavingQuota] = useState(false);
  const [weightsWindow, setWeightsWindow] = useState<number | null>(null);
  const [clusterWindow, setClusterWindow] = useState<number | null>(null);
  const [editingWindows, setEditingWindows] = useState(false);
  const [newWeightsWindow, setNewWeightsWindow] = useState("");
  const [newClusterWindow, setNewClusterWindow] = useState("");
  const [savingWindows, setSavingWindows] = useState(false);

  useEffect(() => {
    checkAuthAndRedirect();
  }, []);

  useEffect(() => {
    if (isAdmin && tokenValid) {
      loadDailyQuota();
      loadGenerationWindows();
    }
  }, [isAdmin, tokenValid]);

  async function checkAuthAndRedirect() {
    try {
      const token = await getAccessToken();
      if (!token || !validateToken(token)) {
        setIsAuthenticated(false);
        return;
      }
      setIsAuthenticated(true);
      await checkAuth();
    } catch (err) {
      console.error('Auth check failed:', err);
      setIsAuthenticated(false);
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

  async function loadDailyQuota() {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const result = await getDailyBatchQuota(token);
      if (result.ok) {
        setDailyQuota(result.quota);
        setNewQuota(String(result.quota));
      }
    } catch (err) {
      console.error("Error loading daily quota:", err);
    }
  }

  async function handleSaveQuota() {
    const token = await getAccessToken();
    if (!token) {
      Alert.alert("Error", "No access token found. Please login first.");
      return;
    }

    const quotaValue = parseInt(newQuota, 10);
    if (isNaN(quotaValue) || quotaValue < 0) {
      Alert.alert("Error", "Please enter a valid quota value (0 or greater).");
      return;
    }

    setSavingQuota(true);
    try {
      const result = await setDailyBatchQuota(token, quotaValue);
      if (result.ok) {
        setDailyQuota(result.quota);
        setEditingQuota(false);
        Alert.alert("Success", `Daily quota updated to ${result.quota} batches per day.`);
      } else {
        Alert.alert("Error", "Failed to update daily quota.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert("Error", message);
    } finally {
      setSavingQuota(false);
    }
  }

  async function loadGenerationWindows() {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const result = await getGenerationWindows(token);
      if (result.ok) {
        setWeightsWindow(result.weightsWindow);
        setClusterWindow(result.clusterWindow);
        setNewWeightsWindow(String(result.weightsWindow));
        setNewClusterWindow(String(result.clusterWindow));
      }
    } catch (err) {
      console.error("Error loading generation windows:", err);
    }
  }

  async function handleSaveWindows() {
    const token = await getAccessToken();
    if (!token) {
      Alert.alert("Error", "No access token found. Please login first.");
      return;
    }

    const weightsValue = parseInt(newWeightsWindow, 10);
    const clusterValue = parseInt(newClusterWindow, 10);

    if (isNaN(weightsValue) || weightsValue <= 0) {
      Alert.alert("Error", "Please enter a valid weights window.");
      return;
    }

    if (isNaN(clusterValue) || clusterValue <= 0) {
      Alert.alert("Error", "Please enter a valid cluster window.");
      return;
    }

    setSavingWindows(true);
    try {
      const result = await setGenerationWindows(token, {
        weightsWindow: weightsValue,
        clusterWindow: clusterValue,
      });

      if (result.ok) {
        setWeightsWindow(result.weightsWindow);
        setClusterWindow(result.clusterWindow);
        setEditingWindows(false);
        Alert.alert(
          "Success",
          `Generation windows updated.\nWeights: ${result.weightsWindow}\nClusters: ${result.clusterWindow}` 
        );
      } else {
        Alert.alert("Error", "Failed to update generation windows.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert("Error", message);
    } finally {
      setSavingWindows(false);
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
              const result = await recalculateWeightsWithWindows(token, {
                weightsWindow: weightsWindow ?? 300,
                clusterWindow: clusterWindow ?? 150,
              });

              if (result.ok) {
                const message =
                  `${result.message || "Weights recalculated successfully"}\n` +
                  `Weights window: ${result.weightsWindow ?? (weightsWindow ?? 300)}\n` +
                  `Cluster window: ${result.clusterWindow ?? (clusterWindow ?? 150)}`;
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

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Please login</Text>
        <Text style={styles.subText}>Authentication required</Text>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Access denied</Text>
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
            Recalculates weights/priorities for generation using the configured windows.
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

        {/* Daily Batch Quota Card */}
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Daily Batch Quota</Text>
          <Text style={styles.actionDescription}>
            Maximum number of batches a user can create per day. (Hourly limit: 5 batches/hour)
          </Text>
          <View style={styles.quotaContainer}>
            {editingQuota ? (
              <View style={styles.quotaEditContainer}>
                <TextInput
                  style={styles.quotaInput}
                  value={newQuota}
                  onChangeText={setNewQuota}
                  keyboardType="number-pad"
                  placeholder="Enter quota"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.quotaButton,
                    styles.saveButton,
                    pressed && styles.buttonPressed,
                    savingQuota && styles.buttonDisabled,
                  ]}
                  onPress={handleSaveQuota}
                  disabled={savingQuota}
                >
                  {savingQuota ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.buttonText}>Save</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.quotaButton,
                    styles.cancelButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => {
                    setEditingQuota(false);
                    setNewQuota(String(dailyQuota ?? 50));
                  }}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.quotaDisplayContainer}>
                <Text style={styles.quotaValue}>{dailyQuota ?? 50}</Text>
                <Text style={styles.quotaLabel}>batches/day</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.quotaButton,
                    styles.editButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => setEditingQuota(true)}
                >
                  <Text style={styles.buttonText}>Edit</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Generation Windows</Text>
          <Text style={styles.actionDescription}>
            Recommended defaults: weights = 300, clusters = 150.
          </Text>
          {editingWindows ? (
            <View style={styles.settingsColumn}>
              <Text style={styles.fieldLabel}>Weights window</Text>
              <TextInput
                style={styles.quotaInput}
                value={newWeightsWindow}
                onChangeText={setNewWeightsWindow}
                keyboardType="number-pad"
                placeholder="Enter weights window"
              />

              <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Cluster window</Text>
              <TextInput
                style={styles.quotaInput}
                value={newClusterWindow}
                onChangeText={setNewClusterWindow}
                keyboardType="number-pad"
                placeholder="Enter cluster window"
              />

              <View style={[styles.quotaEditContainer, styles.settingsButtons]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.quotaButton,
                    styles.saveButton,
                    pressed && styles.buttonPressed,
                    savingWindows && styles.buttonDisabled,
                  ]}
                  onPress={handleSaveWindows}
                  disabled={savingWindows}
                >
                  {savingWindows ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.buttonText}>Save</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.quotaButton,
                    styles.cancelButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => {
                    setEditingWindows(false);
                    setNewWeightsWindow(String(weightsWindow ?? 300));
                    setNewClusterWindow(String(clusterWindow ?? 150));
                  }}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.settingsColumn}>
              <Text style={styles.settingValue}>
                Weights window: <Text style={styles.settingValueStrong}>{weightsWindow ?? 300}</Text>
              </Text>
              <Text style={styles.settingValue}>
                Cluster window: <Text style={styles.settingValueStrong}>{clusterWindow ?? 150}</Text>
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.quotaButton,
                  styles.editButton,
                  pressed && styles.buttonPressed,
                  styles.settingsEditButton,
                ]}
                onPress={() => setEditingWindows(true)}
              >
                <Text style={styles.buttonText}>Edit</Text>
              </Pressable>
            </View>
          )}
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
  quotaContainer: {
    marginTop: 8,
  },
  quotaEditContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quotaDisplayContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quotaInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  quotaButton: {
    padding: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  editButton: {
    backgroundColor: "#007AFF",
  },
  saveButton: {
    backgroundColor: "#34C759",
  },
  cancelButton: {
    backgroundColor: "#FF3B30",
  },
  quotaValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#333",
  },
  quotaLabel: {
    fontSize: 14,
    color: "#666",
  },
  settingsColumn: {
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  fieldSpacing: {
    marginTop: 12,
  },
  settingsButtons: {
    marginTop: 12,
  },
  settingValue: {
    fontSize: 16,
    color: "#333",
    marginBottom: 8,
  },
  settingValueStrong: {
    fontWeight: "700",
  },
  settingsEditButton: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
});
