import { FontAwesome6 } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { type ColorValue, Text } from "react-native";
import { colors } from "../../src/ui/styles";

function TabLabel({ children, color }: { children: string; color: ColorValue }) {
  return <Text numberOfLines={2} style={{ color, fontSize: 10, fontWeight: "600", lineHeight: 12, textAlign: "center" }}>{children}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: "#FFFFFF" },
      headerTitleStyle: { color: colors.text, fontWeight: "700" },
      tabBarActiveTintColor: colors.leaf,
      tabBarInactiveTintColor: "#75807A",
      tabBarItemStyle: { minWidth: 0 },
      tabBarStyle: { borderTopColor: colors.line, backgroundColor: "#FFFFFF", height: 68, paddingTop: 6 }
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <FontAwesome6 name="house" size={18} color={color} />, tabBarLabel: ({ color }) => <TabLabel color={color}>Home</TabLabel> }} />
      <Tabs.Screen name="smart-scan" options={{ title: "Smart Scan", tabBarIcon: ({ color }) => <FontAwesome6 name="camera" size={18} color={color} />, tabBarLabel: ({ color }) => <TabLabel color={color}>Smart Scan</TabLabel> }} />
      <Tabs.Screen name="recipes" options={{ title: "Recipe Ideas", tabBarIcon: ({ color }) => <FontAwesome6 name="utensils" size={18} color={color} />, tabBarLabel: ({ color }) => <TabLabel color={color}>Recipe Ideas</TabLabel> }} />
      <Tabs.Screen name="food-log" options={{ title: "Food Log", tabBarIcon: ({ color }) => <FontAwesome6 name="bowl-food" size={18} color={color} />, tabBarLabel: ({ color }) => <TabLabel color={color}>Food Log</TabLabel> }} />
      <Tabs.Screen name="water" options={{ title: "Water", tabBarIcon: ({ color }) => <FontAwesome6 name="droplet" size={18} color={color} />, tabBarLabel: ({ color }) => <TabLabel color={color}>Water</TabLabel> }} />
      <Tabs.Screen name="me" options={{ title: "Me", tabBarIcon: ({ color }) => <FontAwesome6 name="user" size={18} color={color} />, tabBarLabel: ({ color }) => <TabLabel color={color}>Me</TabLabel> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", href: null }} />
      <Tabs.Screen name="exercise" options={{ title: "Exercise", href: null }} />
      <Tabs.Screen name="wellness" options={{ title: "Sleep & Weight", href: null }} />
      <Tabs.Screen name="history" options={{ title: "Daily History", href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", href: null }} />
      <Tabs.Screen name="my-recipes" options={{ title: "My Recipes", href: null }} />
      <Tabs.Screen name="status" options={{ title: "Status", href: null }} />
    </Tabs>
  );
}
