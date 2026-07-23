import { FontAwesome6 } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useState } from "react";
import { Image, Pressable, Text, View, type ColorValue } from "react-native";
import type { AppLocale } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors } from "../../src/ui/styles";

function TabLabel({ children, color }: { children: string; color: ColorValue }) {
  return <Text numberOfLines={2} style={{ color, fontSize: 10, fontWeight: "600", lineHeight: 12, textAlign: "center" }}>{children}</Text>;
}

function AppHeaderBrand() {
  return <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
    <Image accessibilityLabel="Daily Health" source={require("../../assets/logo.png")} style={{ borderRadius: 10, height: 48, width: 48 }} />
    <Text numberOfLines={1} style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Daily Health</Text>
  </View>;
}

function AppHeaderLanguageSwitch() {
  const { locale, setLocale } = useApp();
  const [saving, setSaving] = useState(false);

  async function chooseLocale(nextLocale: AppLocale) {
    if (saving || locale === nextLocale) return;
    setSaving(true);
    try {
      await setLocale(nextLocale);
    } finally {
      setSaving(false);
    }
  }

  return <View style={{ alignItems: "center", flexDirection: "row", gap: 9 }}>
    <FontAwesome6 name="language" size={18} color={colors.muted} />
    <View style={{ borderColor: colors.line, borderRadius: 8, borderWidth: 1, flexDirection: "row", overflow: "hidden" }}>
      <Pressable accessibilityLabel="Switch language to English" accessibilityRole="button" disabled={saving} onPress={() => void chooseLocale("en")} style={{ alignItems: "center", backgroundColor: locale === "en" ? colors.leaf : "#FFFFFF", justifyContent: "center", minHeight: 42, minWidth: 42, paddingHorizontal: 8 }}>
        <Text style={{ color: locale === "en" ? "#FFFFFF" : colors.text, fontSize: 14, fontWeight: "700" }}>EN</Text>
      </Pressable>
      <Pressable accessibilityLabel="Switch language to Chinese" accessibilityRole="button" disabled={saving} onPress={() => void chooseLocale("zh-CN")} style={{ alignItems: "center", backgroundColor: locale === "zh-CN" ? colors.leaf : "#FFFFFF", justifyContent: "center", minHeight: 42, minWidth: 48, paddingHorizontal: 8 }}>
        <Text style={{ color: locale === "zh-CN" ? "#FFFFFF" : colors.text, fontSize: 14, fontWeight: "700" }}>中文</Text>
      </Pressable>
    </View>
  </View>;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerLeft: () => <AppHeaderBrand />,
      headerLeftContainerStyle: { marginLeft: 16 },
      headerRight: () => <AppHeaderLanguageSwitch />,
      headerRightContainerStyle: { marginRight: 16 },
      headerStyle: { backgroundColor: "#FFFFFF", height: 82 },
      headerTitle: () => null,
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
