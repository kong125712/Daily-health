import { StyleSheet } from "react-native";

export const colors = {
  leaf: "#177245",
  leafDark: "#0B3B25",
  mint: "#E9F8EF",
  page: "#F5F8F6",
  panel: "#FFFFFF",
  text: "#10231A",
  muted: "#64748B",
  line: "#DCE7DF",
  danger: "#B42318"
} as const;

export const shared = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { padding: 20, gap: 16, paddingBottom: 36 },
  header: { gap: 6, marginBottom: 4 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  panel: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 14 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  label: { color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, color: colors.text, backgroundColor: "#FFFFFF" },
  primaryButton: { minHeight: 46, backgroundColor: colors.leaf, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: colors.leaf, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  secondaryButtonText: { color: colors.leaf, fontWeight: "700", fontSize: 15 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 }
});
