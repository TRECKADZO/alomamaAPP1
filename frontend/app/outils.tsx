import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

type Tool = "dpa" | "poids" | "temp" | "imc";

export default function OutilsScreen() {
  const router = useRouter();
  const [active, setActive] = useState<Tool>("dpa");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#6366F1", "#3B82F6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🧮 Boîte à outils</Text>
          <Text style={styles.sub}>Calculateurs et convertisseurs</Text>
        </View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {([
          { key: "dpa", label: "📅 DPA", color: "#EC4899" },
          { key: "poids", label: "⚖️ Poids", color: "#10B981" },
          { key: "temp", label: "🌡️ Temp.", color: "#F59E0B" },
          { key: "imc", label: "📊 IMC", color: "#A855F7" },
        ] as Array<{key: Tool; label: string; color: string}>).map((t) => (
          <TouchableOpacity key={t.key} onPress={() => setActive(t.key)} style={[styles.tab, active === t.key && { backgroundColor: t.color, borderColor: t.color }]} testID={`tool-${t.key}`}>
            <Text style={[styles.tabText, active === t.key && { color: "#fff" }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {active === "dpa" && <CalculDPA />}
          {active === "poids" && <ConvPoids />}
          {active === "temp" && <ConvTemp />}
          {active === "imc" && <CalculIMC />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CalculDPA() {
  const [ddr, setDdr] = useState("");
  let result: any = null;
  try {
    if (ddr) {
      const d = new Date(ddr);
      if (!isNaN(d.getTime())) {
        const dpa = new Date(d.getTime() + 280 * 86400000);
        const today = new Date();
        const daysSince = Math.floor((today.getTime() - d.getTime()) / 86400000);
        const sa = Math.floor(daysSince / 7);
        const trim = sa < 14 ? 1 : sa < 28 ? 2 : 3;
        result = { dpa, sa: Math.max(0, sa), trim };
      }
    }
  } catch { /* */ }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📅 Date Présumée d'Accouchement (DPA)</Text>
      <Text style={styles.cardIntro}>Entrez le 1er jour de vos dernières règles (DDR) :</Text>
      <TextInput
        style={styles.input}
        value={ddr}
        onChangeText={setDdr}
        placeholder="AAAA-MM-JJ (ex: 2026-01-15)"
        placeholderTextColor={COLORS.textMuted}
        testID="dpa-ddr-input"
      />
      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultLine}>🤰 SA actuelle : <Text style={styles.resultBold}>{result.sa} SA</Text></Text>
          <Text style={styles.resultLine}>📊 Trimestre : <Text style={styles.resultBold}>T{result.trim}</Text></Text>
          <Text style={styles.resultLine}>👶 DPA : <Text style={styles.resultBold}>{result.dpa.toLocaleDateString("fr-FR")}</Text></Text>
        </View>
      )}
      <Text style={styles.help}>La DPA est calculée à 40 SA (280 jours) après le 1er jour de vos dernières règles.</Text>
    </View>
  );
}

function ConvPoids() {
  const [grams, setGrams] = useState("");
  const [pounds, setPounds] = useState("");
  const setG = (g: string) => {
    setGrams(g);
    const n = parseFloat(g.replace(",", "."));
    setPounds(isNaN(n) ? "" : (n / 453.592).toFixed(2));
  };
  const setP = (p: string) => {
    setPounds(p);
    const n = parseFloat(p.replace(",", "."));
    setGrams(isNaN(n) ? "" : (n * 453.592).toFixed(0));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>⚖️ Convertisseur de poids</Text>
      <Text style={styles.cardIntro}>Convertir entre grammes/kg et livres :</Text>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Grammes</Text>
          <TextInput style={styles.input} value={grams} onChangeText={setG} placeholder="3500" keyboardType="number-pad" placeholderTextColor={COLORS.textMuted} />
        </View>
        <Ionicons name="swap-horizontal" size={20} color={COLORS.primary} style={{ marginTop: 26 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Livres</Text>
          <TextInput style={styles.input} value={pounds} onChangeText={setP} placeholder="7.72" keyboardType="decimal-pad" placeholderTextColor={COLORS.textMuted} />
        </View>
      </View>
      {grams && (
        <Text style={styles.resultLine}>= <Text style={styles.resultBold}>{(parseFloat(grams) / 1000).toFixed(2)} kg</Text></Text>
      )}
    </View>
  );
}

function ConvTemp() {
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const setCelsius = (v: string) => { setC(v); const n = parseFloat(v.replace(",", ".")); setF(isNaN(n) ? "" : (n * 9 / 5 + 32).toFixed(1)); };
  const setFar = (v: string) => { setF(v); const n = parseFloat(v.replace(",", ".")); setC(isNaN(n) ? "" : ((n - 32) * 5 / 9).toFixed(1)); };

  let warning = "";
  const cn = parseFloat(c);
  if (!isNaN(cn)) {
    if (cn >= 38) warning = "🔴 Fièvre — consultez si elle persiste >24h ou pour bébé <3 mois.";
    else if (cn >= 37.5) warning = "🟡 Légère fièvre — surveillez.";
    else if (cn < 36) warning = "🔵 Hypothermie — couvrez l'enfant.";
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🌡️ Convertisseur de température</Text>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Celsius (°C)</Text>
          <TextInput style={styles.input} value={c} onChangeText={setCelsius} placeholder="37.5" keyboardType="decimal-pad" placeholderTextColor={COLORS.textMuted} />
        </View>
        <Ionicons name="swap-horizontal" size={20} color={COLORS.primary} style={{ marginTop: 26 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Fahrenheit (°F)</Text>
          <TextInput style={styles.input} value={f} onChangeText={setFar} placeholder="99.5" keyboardType="decimal-pad" placeholderTextColor={COLORS.textMuted} />
        </View>
      </View>
      {warning ? <View style={styles.warnBox}><Text style={styles.warnText}>{warning}</Text></View> : null}
    </View>
  );
}

function CalculIMC() {
  const [poids, setPoids] = useState("");
  const [taille, setTaille] = useState("");
  let result: any = null;
  const p = parseFloat(poids.replace(",", "."));
  const t = parseFloat(taille.replace(",", "."));
  if (!isNaN(p) && !isNaN(t) && t > 0) {
    const tm = t > 3 ? t / 100 : t; // accepte cm ou m
    const imc = p / (tm * tm);
    let cat = "";
    if (imc < 18.5) cat = "Maigreur";
    else if (imc < 25) cat = "Normal";
    else if (imc < 30) cat = "Surpoids";
    else cat = "Obésité";
    result = { imc: imc.toFixed(1), cat };
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📊 Calcul IMC</Text>
      <Text style={styles.cardIntro}>Indice de Masse Corporelle. Utile pour le suivi pré-grossesse.</Text>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Poids (kg)</Text>
          <TextInput style={styles.input} value={poids} onChangeText={setPoids} placeholder="65" keyboardType="decimal-pad" placeholderTextColor={COLORS.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Taille (cm)</Text>
          <TextInput style={styles.input} value={taille} onChangeText={setTaille} placeholder="165" keyboardType="decimal-pad" placeholderTextColor={COLORS.textMuted} />
        </View>
      </View>
      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultLine}>IMC : <Text style={styles.resultBold}>{result.imc}</Text></Text>
          <Text style={styles.resultLine}>Catégorie : <Text style={styles.resultBold}>{result.cat}</Text></Text>
        </View>
      )}
      <Text style={styles.help}>L'IMC pendant la grossesse n'est pas pertinent (le ventre s'agrandit). Calculez-le avant grossesse.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  tabs: { padding: SPACING.xl, gap: 6, paddingBottom: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabText: { fontWeight: "700", fontSize: 12, color: COLORS.textPrimary },
  card: { backgroundColor: COLORS.surface, padding: 16, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  cardIntro: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, marginBottom: 14 },
  label: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.textPrimary, marginBottom: 8 },
  row2: { flexDirection: "row", gap: 10, alignItems: "center" },
  resultBox: { backgroundColor: "#ECFDF5", borderRadius: RADIUS.md, padding: 12, marginTop: 8, borderWidth: 1, borderColor: "#A7F3D0" },
  resultLine: { color: "#065F46", fontSize: 14, marginVertical: 3 },
  resultBold: { fontWeight: "800", fontSize: 16 },
  warnBox: { backgroundColor: "#FEF3C7", padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: "#FCD34D" },
  warnText: { color: "#78350F", fontSize: 12, fontWeight: "700" },
  help: { color: COLORS.textMuted, fontSize: 11, marginTop: 12, fontStyle: "italic" },
});
