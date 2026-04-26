/**
 * PhoneInput — Champ téléphone avec indicatif +225 fixé
 * 
 * - Affiche +225 en préfixe figé (non éditable, non supprimable)
 * - L'utilisateur saisit uniquement les 10 chiffres locaux
 * - Renvoie via onChangeText la valeur canonique : "+225XXXXXXXXXX"
 *   (compatible avec _normalize_phone du backend et avec la version web)
 * - Affiche les 10 chiffres groupés (XX XX XX XX XX) pour la lisibilité
 * - Valide : exactement 10 chiffres requis
 */
import React, { useMemo } from "react";
import { View, Text, TextInput, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS } from "../constants/theme";

export const CI_DIAL_CODE = "+225";

/** Extrait les 10 chiffres locaux à partir de n'importe quelle saisie/valeur stockée */
export function extractLocalDigits(value: string | undefined | null): string {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  // Retirer un éventuel 0 initial (anciens formats), on conserve 10 chiffres
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Construit la valeur canonique +225XXXXXXXXXX si 10 chiffres saisis, sinon "" */
export function buildCanonicalPhone(localDigits: string): string {
  const d = (localDigits || "").replace(/\D/g, "").slice(0, 10);
  return d.length === 10 ? `${CI_DIAL_CODE}${d}` : "";
}

/** Formate "0709005300" → "07 09 00 53 00" pour l'affichage */
function formatForDisplay(d: string): string {
  return (d.match(/.{1,2}/g) || []).join(" ");
}

interface Props {
  /** Valeur du parent (peut être canonique "+22507...", brute "07..." ou vide) */
  value: string;
  /** Reçoit la valeur canonique "+225XXXXXXXXXX" si 10 chiffres, sinon "" */
  onChangeText: (canonical: string) => void;
  /** Reçoit aussi les 10 chiffres bruts si le parent en a besoin */
  onChangeLocal?: (localDigits: string) => void;
  placeholder?: string;
  testID?: string;
  /** Affiche le wrapper complet avec bordure (true) ou non (false → embed). Par défaut true */
  bordered?: boolean;
  style?: ViewStyle;
  editable?: boolean;
  showIcon?: boolean;
}

export default function PhoneInput({
  value,
  onChangeText,
  onChangeLocal,
  placeholder = "07 09 00 53 00",
  testID,
  bordered = true,
  style,
  editable = true,
  showIcon = true,
}: Props) {
  const localDigits = useMemo(() => extractLocalDigits(value), [value]);
  const display = formatForDisplay(localDigits);

  const handleChange = (txt: string) => {
    const next = extractLocalDigits(txt);
    onChangeLocal?.(next);
    onChangeText(buildCanonicalPhone(next));
  };

  return (
    <View style={[bordered ? styles.wrap : styles.wrapPlain, style]}>
      {showIcon && (
        <Ionicons name="call-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 6 }} />
      )}
      <View style={styles.prefixBadge}>
        <Text style={styles.prefixFlag}>🇨🇮</Text>
        <Text style={styles.prefixText}>{CI_DIAL_CODE}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={display}
        onChangeText={handleChange}
        keyboardType="phone-pad"
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        maxLength={14} // 10 chiffres + 4 espaces
        editable={editable}
        testID={testID}
        autoComplete="tel-national"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  wrapPlain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  prefixBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  prefixFlag: { fontSize: 14 },
  prefixText: { fontSize: 14, fontWeight: "700", color: COLORS.primary, letterSpacing: 0.3 },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
    paddingVertical: 10,
    letterSpacing: 1,
  },
});
