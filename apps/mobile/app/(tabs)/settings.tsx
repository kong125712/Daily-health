import { FontAwesome6 } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ThemeMode } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";
import { numeric } from "../../src/utils/date";

export default function SettingsScreen() {
  const { adapter, defaultWaterTargetMl, locale, setLocale, setTheme, t, theme } = useApp();
  const [waterTarget, setWaterTarget] = useState(String(defaultWaterTargetMl));
  const [message, setMessage] = useState<string | null>(null);

  async function saveWaterTarget() {
    try {
      const next = await adapter.saveSettings({ defaultWaterTargetMl: numeric(waterTarget) ?? 0 });
      setWaterTarget(String(next.defaultWaterTargetMl));
      setMessage(t("common.success"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error"));
    }
  }

  return (
    <SafeAreaView style={shared.page} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={shared.header}>
          <Text style={shared.title}>{t("settings.title")}</Text>
          <Text style={shared.subtitle}>{t("settings.privacy")}</Text>
        </View>

        {message ? <Text style={message === t("common.success") ? { color: colors.leaf } : shared.error}>{message}</Text> : null}

        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("settings.language")}</Text>
          <Pressable
            accessibilityLabel={t("settings.language")}
            accessibilityRole="button"
            onPress={() => void setLocale(locale === "en" ? "zh-CN" : "en")}
            style={[shared.secondaryButton, { alignSelf: "stretch", alignItems: "center", flexDirection: "row", justifyContent: "space-between" }]}
          >
            <Text style={shared.secondaryButtonText}>{locale === "en" ? "English" : "简体中文"}</Text>
            <FontAwesome6 name="caret-right" size={14} color={colors.leaf} />
          </Pressable>
        </View>

        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("settings.theme")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["light", "dark", "system"] as ThemeMode[]).map((item) => (
              <Pressable key={item} style={[shared.secondaryButton, theme === item && { backgroundColor: colors.mint }]} onPress={() => void setTheme(item)}>
                <Text style={shared.secondaryButtonText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("settings.waterTarget")}</Text>
          <TextInput value={waterTarget} onChangeText={setWaterTarget} keyboardType="numeric" style={shared.input} />
          <Pressable style={shared.primaryButton} onPress={() => void saveWaterTarget()}>
            <Text style={shared.primaryButtonText}>{t("common.save")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
