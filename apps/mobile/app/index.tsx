import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useApp } from "../src/state/AppProvider";

export default function Index() {
  const { authReady, authStatus } = useApp();
  if (!authReady) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  }
  return <Redirect href={authStatus.subscribed || authStatus.testMode ? "/(tabs)" : "/(auth)/login"} />;
}
