import { FontAwesome6 } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "../../src/ui/styles";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: "#FFFFFF" },
      headerTitleStyle: { color: colors.text, fontWeight: "700" },
      tabBarActiveTintColor: colors.leaf,
      tabBarInactiveTintColor: "#75807A",
      tabBarStyle: { borderTopColor: "#DCE7DF", backgroundColor: "#FFFFFF" }
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <FontAwesome6 name="house" size={18} color={color} /> }} />
      <Tabs.Screen name="smart-scan" options={{ title: "Smart Scan", tabBarIcon: ({ color }) => <FontAwesome6 name="camera" size={18} color={color} /> }} />
      <Tabs.Screen name="recipes" options={{ title: "Recipes", tabBarIcon: ({ color }) => <FontAwesome6 name="utensils" size={18} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <FontAwesome6 name="user" size={18} color={color} /> }} />
      <Tabs.Screen name="food-log" options={{ title: "Food Log", href: null }} />
      <Tabs.Screen name="water" options={{ title: "Water", href: null }} />
      <Tabs.Screen name="exercise" options={{ title: "Exercise", href: null }} />
      <Tabs.Screen name="wellness" options={{ title: "Sleep & Weight", href: null }} />
      <Tabs.Screen name="history" options={{ title: "Daily History", href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", href: null }} />
      <Tabs.Screen name="my-recipes" options={{ title: "My Recipes", href: null }} />
      <Tabs.Screen name="me" options={{ title: "Me", href: null }} />
      <Tabs.Screen name="status" options={{ title: "Status", href: null }} />
    </Tabs>
  );
}
