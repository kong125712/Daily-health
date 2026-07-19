import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { authenticateWithEmail } from "../../src/auth/cloud";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";

export default function LoginScreen() {
  const { activateCloudSession, activateLocalMode } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [action, setAction] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function continueLocally() {
    await activateLocalMode();
    router.replace("/(tabs)");
  }

  async function continueInCloud() {
    setBusy(true);
    setMessage(null);
    try {
      const status = await authenticateWithEmail({ email, password, action });
      await activateCloudSession(status);
      if (!status.subscribed) {
        setMessage("This account is ready, but an active subscription is required for cloud access.");
        return;
      }
      router.replace("/(tabs)");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={shared.page}>
      <View style={[shared.content, { flex: 1, justifyContent: "center", gap: 24 }]}>
        <View style={{ gap: 10 }}>
          <Text style={[shared.title, { color: colors.leafDark }]}>Daily Health</Text>
          <Text style={shared.subtitle}>AI ingredient recognition, recipe ideas, and everyday health records.</Text>
        </View>
        <View style={[shared.panel, { gap: 12 }]}>
          <Text style={shared.sectionTitle}>Use Daily Health your way</Text>
          <Text style={shared.helper}>Cloud access unlocks web and sync. Health records stay on the cloud service only after an active subscription is confirmed.</Text>
          {message ? <Text style={shared.error}>{message}</Text> : null}
          <View style={shared.row}>
            {(["login", "register"] as const).map((item) => <Pressable key={item} style={[shared.secondaryButton, shared.flex, action === item && { backgroundColor: colors.mint }]} onPress={() => setAction(item)}><Text style={shared.secondaryButtonText}>{item === "login" ? "Sign in" : "Create account"}</Text></Pressable>)}
          </View>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" style={shared.input} />
          <TextInput value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Password (8+ characters)" style={shared.input} />
          <Pressable accessibilityRole="button" disabled={busy} style={[shared.primaryButton, busy && { opacity: 0.55 }]} onPress={() => void continueInCloud()}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={shared.primaryButtonText}>{action === "login" ? "Sign in to cloud" : "Create cloud account"}</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" style={shared.secondaryButton} onPress={() => void continueLocally()}>
            <Text style={shared.secondaryButtonText}>Continue without an account</Text>
          </Pressable>
          <Text style={shared.helper}>Local mode keeps health records in this device’s SQLite database. You can add your own AI key in Profile.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
