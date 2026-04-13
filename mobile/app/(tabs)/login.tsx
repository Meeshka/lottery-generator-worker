import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { generateOtp, validateOtp, healthCheck } from "../../services/api";
import {
  saveTokens,
  saveUserCredentials,
  getUserCredentials,
  getAccessToken,
} from "../../services/secureStorage";

export default function LoginScreen() {
  const [idNumber, setIdNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [workerHealthy, setWorkerHealthy] = useState(false);

  useEffect(() => {
    loadSavedCredentials();
    checkLoginStatus();
    checkWorkerHealth();
  }, []);

  async function loadSavedCredentials() {
    try {
      const credentials = await getUserCredentials();
      if (credentials.idNumber) setIdNumber(credentials.idNumber);
      if (credentials.phoneNumber) setPhoneNumber(credentials.phoneNumber);
    } catch (err) {
      console.error("Error loading credentials:", err);
    }
  }

  async function checkLoginStatus() {
    try {
      const token = await getAccessToken();
      setIsLoggedIn(!!token);
    } catch (err) {
      console.error("Error checking login status:", err);
      setIsLoggedIn(false);
    }
  }

  async function checkWorkerHealth() {
    try {
      await healthCheck();
      setWorkerHealthy(true);
    } catch (err) {
      console.error("Worker health check failed:", err);
      setWorkerHealthy(false);
    }
  }

  async function handleSendOtp() {
    if (!idNumber.trim() || !phoneNumber.trim()) {
      setError("Please fill in ID number and phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await generateOtp(idNumber.trim(), phoneNumber.trim());
      Alert.alert("Success", "OTP code has been sent to your phone");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!idNumber.trim() || !phoneNumber.trim() || !otpCode.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await validateOtp(
        idNumber.trim(),
        phoneNumber.trim(),
        otpCode.trim()
      );

      // Save tokens securely
      if (response.accessToken && response.refreshToken) {
        await saveTokens(response.accessToken, response.refreshToken);
      }

      // Save credentials for convenience
      await saveUserCredentials(idNumber.trim(), phoneNumber.trim());

      Alert.alert("Success", "Login successful!");
      setOtpCode("");
      setIsLoggedIn(true);
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
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>LottoSheli Login</Text>
            {isLoggedIn && <View style={styles.statusDot} />}
            {workerHealthy && <View style={[styles.statusDot, styles.workerStatusDot]} />}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>ID Number</Text>
            <TextInput
              style={styles.input}
              value={idNumber}
              onChangeText={setIdNumber}
              placeholder="Enter ID number"
              autoCapitalize="none"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Enter phone number"
              autoCapitalize="none"
              keyboardType="phone-pad"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.loginButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleSendOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Get OTP</Text>
            )}
          </Pressable>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>OTP Code</Text>
            <TextInput
              style={styles.input}
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="Enter OTP code"
              autoCapitalize="none"
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.sendButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </Pressable>
        </View>
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
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#34C759",
    marginLeft: 8,
  },
  workerStatusDot: {
    backgroundColor: "#007AFF",
    marginLeft: 8,
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
    marginBottom: 12,
    minHeight: 52,
    justifyContent: "center",
  },
  sendButton: {
    backgroundColor: "#007AFF",
  },
  loginButton: {
    backgroundColor: "#34C759",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
