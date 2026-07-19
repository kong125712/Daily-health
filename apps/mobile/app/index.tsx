import { Redirect } from "expo-router";
import { useApp } from "../src/state/AppProvider";

export default function Index() {
  const { authStatus } = useApp();
  return <Redirect href={authStatus.subscribed || authStatus.testMode ? "/(tabs)" : "/(auth)/login"} />;
}
