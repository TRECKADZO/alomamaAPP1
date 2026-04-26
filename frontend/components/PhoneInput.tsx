/**
 * PhoneInput — Champ téléphone avec indicatif +225 fixé
 * 
 * - Affiche +225 en préfixe figé (non éditable, non supprimable)
 * - L'utilisateur saisit uniquement les 10 chiffres locaux
 * - Renvoie via onChangeText la valeur canonique : "+225XXXXXXXXXX"
 *   (compatible avec _normalize_phone du backend et avec la version web)
 *   Quand l'utilisateur n'a pas encore saisi 10 chiffres, onChangeText reçoit
 *   les chiffres bruts (ex: "070900530"). À la soumission, le parent doit valider via
 *   extractLocalDigits().length === 10
 * - Affiche les 10 chiffres groupés (XX XX XX XX XX) pour la lisibilité
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS } from "../constants/theme";

export const CI_DIAL_CODE = "+225";

/** Extrait les 10 chiffres locaux à partir de n'importe quelle saisie/valeur stockée */
export function extractLocalDigits(value: string | undefined | null): string {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("225")) digits = digits.slice(3);
  // Retirer un éventuel 0 initial supplémentaire si on dépasse 10 chiffres
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
  /**
   * Reçoit à chaque frappe :
   * - La valeur canonique "+225XXXXXXXXXX" si 10 chiffres saisis
   * - Sinon les chiffres bruts saisis (ex: "070900") pour permettre au parent de stocker l'état partiel
   * Le parent doit valider la complétude via extractLocalDigits(value).length === 10
   */
  onChangeText: (value: string) => void;
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
  placeholder = "07 09 00 53 00",
  testID,
  bordered = true,
  style,
  editable = true,
  showIcon = true,
}: Props) {
  // État interne des 10 chiffres locaux (source de vérité de l'affichage)
  const [localDigits, setLocalDigits] = useState<string>(() => extractLocalDigits(value));

  // Synchronisation si le parent change la valeur de manière externe (reset, prefill...)
  useEffect(() => {
    const next = extractLocalDigits(value);
    if (next !== localDigits) {
      // Évite la boucle de re-render inutile : on ne re-set que si différent
      setLocalDigits(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const display = useMemo(() => formatForDisplay(localDigits), [localDigits]);

  const handleChange = (txt: string) => {
    const next = extractLocalDigits(txt);
    setLocalDigits(next);
    // On remonte au parent : valeur canonique si 10 chiffres, sinon les chiffres bruts
    // (le parent peut ainsi stocker l'état partiel et valider à la soumission via extractLocalDigits)
    const out = next.length === 10 ? buildCanonicalPhone(next) : next;
    onChangeText(out);
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
