import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { IngredientScanView, RecognizedIngredientInput } from "../../src/domain";
import type { ImageInput } from "../../src/data/DataAdapter";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";

function useImageDraft() {
  const [image, setImage] = useState<ImageInput | null>(null);

  async function choose(source: "library" | "camera") {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error("Camera permission is needed to scan ingredients.");
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("Photo library permission is needed to scan ingredients.");
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) throw new Error("The selected photo could not be read.");
    const mimeType = asset.mimeType === "image/png" || asset.mimeType === "image/webp" ? asset.mimeType : "image/jpeg";
    setImage({
      fileName: asset.fileName ?? `meal-${Date.now()}.${mimeType === "image/png" ? "png" : "jpg"}`,
      mimeType,
      dataUrl: `data:${mimeType};base64,${asset.base64}`
    });
  }

  return { image, setImage, choose };
}

export default function SmartScanScreen() {
  const { adapter, locale, t } = useApp();
  const { image, setImage, choose } = useImageDraft();
  const [scan, setScan] = useState<IngredientScanView | null>(null);
  const [ingredients, setIngredients] = useState<RecognizedIngredientInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function chooseImage(source: "library" | "camera") {
    try {
      await choose(source);
      setScan(null);
      setIngredients([]);
      setEditing(false);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("common.error") });
    }
  }

  async function analyze() {
    if (!image) return;
    setLoading(true);
    try {
      const next = await adapter.analyzeIngredients({ image, locale });
      setScan(next);
      setIngredients(next.ingredients);
      setEditing(false);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("common.error") });
    } finally {
      setLoading(false);
    }
  }

  function patchIngredient(index: number, patch: Partial<RecognizedIngredientInput>) {
    setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function confirm() {
    if (!scan || ingredients.some((item) => !item.normalizedName || !item.displayNameEn || !item.displayNameZh || !item.estimatedAmount)) {
      setMessage({ type: "error", text: t("smart.needIngredients") });
      return;
    }
    setLoading(true);
    try {
      const next = await adapter.saveIngredientScan(scan.id, { ingredients, confirmed: true });
      setScan(next);
      setIngredients(next.ingredients);
      setEditing(false);
      setMessage({ type: "success", text: t("smart.confirmedToast") });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("common.error") });
    } finally {
      setLoading(false);
    }
  }

  const step = scan?.confirmedAt ? 3 : scan ? 2 : 1;
  return (
    <SafeAreaView style={shared.page} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={shared.header}>
          <Text style={shared.title}>{t("smart.title")}</Text>
          <Text style={shared.subtitle}>{t("smart.subtitle")}</Text>
        </View>
        {message ? <Text style={message.type === "error" ? shared.error : { color: colors.leaf, fontSize: 13 }}>{message.text}</Text> : null}
        <View style={[shared.panel, { flexDirection: "row", padding: 10, gap: 6 }]}>
          {[t("smart.stepUpload"), t("smart.stepReview"), t("smart.stepConfirmed")].map((label, index) => (
            <View key={label} style={{ flex: 1, alignItems: "center", gap: 4, opacity: step >= index + 1 ? 1 : 0.45 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: step >= index + 1 ? colors.leaf : "#CBD5E1", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "white", fontWeight: "700" }}>{index + 1}</Text></View>
              <Text style={{ color: colors.text, fontSize: 11, textAlign: "center" }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("smart.stepUpload")}</Text>
          {image ? <Image source={{ uri: image.dataUrl }} style={{ height: 220, width: "100%", borderRadius: 12, backgroundColor: colors.mint }} resizeMode="cover" /> : <View style={{ height: 160, borderRadius: 12, backgroundColor: colors.mint, justifyContent: "center", alignItems: "center", padding: 24 }}><Text style={[shared.helper, { textAlign: "center" }]}>{t("smart.notice")}</Text></View>}
          <View style={shared.row}>
            <Pressable style={[shared.secondaryButton, shared.flex]} onPress={() => void chooseImage("library")}><Text style={shared.secondaryButtonText}>Choose photo</Text></Pressable>
            <Pressable style={[shared.secondaryButton, shared.flex]} onPress={() => void chooseImage("camera")}><Text style={shared.secondaryButtonText}>Take photo</Text></Pressable>
          </View>
          <Pressable style={[shared.primaryButton, (!image || loading) && { opacity: 0.55 }]} disabled={!image || loading} onPress={() => void analyze()}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={shared.primaryButtonText}>{scan ? t("smart.again") : t("smart.start")}</Text>}
          </Pressable>
        </View>

        {scan ? <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("smart.stepReview")}</Text>
          <Text style={shared.helper}>{locale === "zh-CN" ? scan.uncertaintyNoteZh : scan.uncertaintyNoteEn}</Text>
          {ingredients.map((ingredient, index) => (
            <View key={`${ingredient.normalizedName}-${index}`} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, paddingTop: index ? 12 : 0, gap: 5 }}>
              {editing ? <>
                <TextInput value={ingredient.displayNameEn} onChangeText={(displayNameEn) => patchIngredient(index, { displayNameEn })} style={shared.input} placeholder="English ingredient" />
                <TextInput value={ingredient.displayNameZh} onChangeText={(displayNameZh) => patchIngredient(index, { displayNameZh })} style={shared.input} placeholder="中文食材" />
                <TextInput value={ingredient.estimatedAmount} onChangeText={(estimatedAmount) => patchIngredient(index, { estimatedAmount })} style={shared.input} placeholder="Amount" />
              </> : <>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{locale === "zh-CN" ? ingredient.displayNameZh : ingredient.displayNameEn}</Text>
                <Text style={shared.helper}>{ingredient.estimatedAmount}{ingredient.estimatedCalories ? ` · ${ingredient.estimatedCalories} kcal` : ""}</Text>
                {ingredient.notes ? <Text style={shared.helper}>{ingredient.notes}</Text> : null}
              </>}
            </View>
          ))}
          <View style={shared.row}>
            <Pressable style={[shared.secondaryButton, shared.flex]} onPress={() => setEditing((value) => !value)}><Text style={shared.secondaryButtonText}>{editing ? t("smart.doneEditing") : t("smart.edit")}</Text></Pressable>
            <Pressable style={[shared.primaryButton, shared.flex, loading && { opacity: 0.55 }]} disabled={loading} onPress={() => void confirm()}><Text style={shared.primaryButtonText}>{scan.confirmedAt ? t("smart.confirmAgain") : t("smart.confirmIngredients")}</Text></Pressable>
          </View>
          {scan.confirmedAt ? <Pressable style={shared.primaryButton} onPress={() => router.push("/(tabs)/recipes")}><Text style={shared.primaryButtonText}>{t("smart.generate")}</Text></Pressable> : null}
        </View> : null}
        {image ? <Pressable style={shared.secondaryButton} onPress={() => { setImage(null); setScan(null); setIngredients([]); setEditing(false); }}><Text style={shared.secondaryButtonText}>{t("common.reset")}</Text></Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
