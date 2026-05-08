/**
 * PremiumGate — composant réutilisable pour afficher un état "Premium requis 💎"
 * inline dans une page lorsque l'utilisateur n'a pas l'abonnement.
 */
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADIUS } from "../constants/theme";

type Props = {
  message: string;
  /** Couleur d'accent (par défaut bleu Pro) */
  color?: string;
  /** Bénéfices affichés en bas de la carte */
  benefits?: string;
  /** Texte du bouton CTA */
  ctaLabel?: string;
};

export default function PremiumGate({
  message,
  color = "#0EA5E9",
  benefits,
  ctaLabel = "Devenir Premium",
}: Props) {
  const router = useRouter();
  return (
    <View style={[styles.block, { backgroundColor: color + "10", borderColor: color + "40" }]}>
      <Ionicons name="lock-closed" size={40} color={color} />
      <Text style={[styles.title, { color }]}>Premium requis 💎</Text>
      <Text style={styles.msg}>{message}</Text>
      <TouchableOpacity style={[styles.btn, { backgroundColor: color }]} onPress={() => router.push("/premium")}>
        <Ionicons name="star" size={16} color="#fff" />
        <Text style={styles.btnText}>{ctaLabel}</Text>
      </TouchableOpacity>
      {benefits ? <Text style={[styles.note, { color }]}>{benefits}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: "center", padding: 24, marginTop: 12, borderRadius: RADIUS.lg, borderWidth: 1 },
  title: { fontSize: 18, fontWeight: "800", marginTop: 12 },
  msg: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 19, paddingHorizontal: 8 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, marginTop: 16 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  note: { fontSize: 11, textAlign: "center", marginTop: 12, paddingHorizontal: 12, lineHeight: 16, opacity: 0.85 },
});
