import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../../src/state/AppProvider";
import { shared } from "../../src/ui/styles";

export default function StatusScreen() {
  const { adapter, authStatus } = useApp();
  return <SafeAreaView style={shared.page} edges={["left", "right"]}><ScrollView contentContainerStyle={shared.content}><View style={shared.header}><Text style={shared.title}>Status</Text><Text style={shared.subtitle}>Current app data path.</Text></View><View style={shared.panel}><Text style={shared.sectionTitle}>{adapter.mode}</Text><Text style={shared.helper}>The mobile bundle uses direct data adapters with no embedded service or WebView proxy.</Text><Text style={shared.helper}>Subscribed: {String(authStatus.subscribed)} · local mirror: {String(authStatus.localMirror)}</Text></View></ScrollView></SafeAreaView>;
}
