/**
 * SnomedPicker — Sélecteur de concepts SNOMED CT (codification clinique)
 *
 * Usage :
 *   <SnomedPicker
 *     value={codes}
 *     onChange={setCodes}
 *     domain="obstetric"          // optionnel : filtre par domaine
 *     entityType="dmp_consultation" // optionnel : sauvegarde auto via /snomed/attach
 *     entityId={consultationId}     // requis si entityType fourni
 *   />
 *
 *   codes : Array<{ system, code, display, domain }>
 */
import { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Modal, Pressable, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";

export type SnomedCode = {
  system: string;   // ex. "http://snomed.info/sct"
  code: string;     // ex. "386661006"
  display: string;  // ex. "Fièvre"
  display_en?: string;
  domain?: string;
};

type Domain = { id: string; label: string };

type Props = {
  value: SnomedCode[];
  onChange: (codes: SnomedCode[]) => void;
  domain?: string;                    // filtre initial
  entityType?: string;
  entityId?: string;
  label?: string;
  disabled?: boolean;
};

export default function SnomedPicker({
  value = [],
  onChange,
  domain: initialDomain,
  entityType,
  entityId,
  label = "🧬 Codification SNOMED CT",
  disabled = false,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [q, setQ] = useState("");
  const [dom, setDom] = useState<string | undefined>(initialDomain);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [results, setResults] = useState<SnomedCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Charge la liste des domaines une fois (public)
  useEffect(() => {
    api.get("/snomed/meta").then((r: any) => {
      setDomains(r.data?.domains || []);
    }).catch(() => {});
  }, []);

  // Recherche debouncée
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params: any = { q, limit: 30 };
        if (dom) params.domain = dom;
        const r = await api.get("/snomed/search", { params });
        setResults(r.data?.results || []);
      } catch (e: any) {
        console.log("SNOMED search error", e?.message);
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, dom, visible]);

  const alreadyPicked = useMemo(() => new Set(value.map((v) => v.code)), [value]);

  const toggle = (c: SnomedCode) => {
    let next: SnomedCode[];
    if (alreadyPicked.has(c.code)) {
      next = value.filter((v) => v.code !== c.code);
    } else {
      next = [...value, c];
    }
    onChange(next);
  };

  const removeOne = (code: string) => {
    onChange(value.filter((v) => v.code !== code));
  };

  const attachToEntity = async () => {
    if (!entityType || !entityId) { setVisible(false); return; }
    setSaving(true);
    try {
      await api.post("/snomed/attach", {
        entity_type: entityType,
        entity_id: entityId,
        codes: value,
      });
      setVisible(false);
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Impossible d'enregistrer les codes.");
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          style={[styles.addBtn, disabled && styles.addBtnDisabled]}
          onPress={() => setVisible(true)}
          disabled={disabled}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.addBtnTxt}>Ajouter un code</Text>
        </TouchableOpacity>
      </View>

      {/* Chips des codes sélectionnés */}
      {value.length === 0 ? (
        <Text style={styles.empty}>Aucun code clinique attaché.</Text>
      ) : (
        <View style={styles.chips}>
          {value.map((c) => (
            <View key={c.code} style={styles.chip}>
              <Text style={styles.chipCode}>{c.code}</Text>
              <Text style={styles.chipTxt}>{c.display}</Text>
              {!disabled && (
                <TouchableOpacity onPress={() => removeOne(c.code)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Modal picker */}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>🧬 SNOMED CT — Recherche</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={26} color="#111" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Ex. fièvre, éclampsie, BCG, 72892002…"
              placeholderTextColor="#94A3B8"
              style={styles.search}
              autoFocus
            />

            {/* Filtres domaine */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.domainRow}>
              <TouchableOpacity onPress={() => setDom(undefined)} style={[styles.domainChip, !dom && styles.domainChipActive]}>
                <Text style={[styles.domainChipTxt, !dom && styles.domainChipTxtActive]}>Tous</Text>
              </TouchableOpacity>
              {domains.map((d) => (
                <TouchableOpacity key={d.id} onPress={() => setDom(d.id)} style={[styles.domainChip, dom === d.id && styles.domainChipActive]}>
                  <Text style={[styles.domainChipTxt, dom === d.id && styles.domainChipTxtActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Résultats */}
            {loading ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color="#EC4899" />
            ) : (
              <ScrollView style={styles.results}>
                {results.length === 0 ? (
                  <Text style={styles.noRes}>Aucun résultat. Essayez un autre mot-clé.</Text>
                ) : (
                  results.map((c) => {
                    const picked = alreadyPicked.has(c.code);
                    return (
                      <TouchableOpacity key={c.code} onPress={() => toggle(c)} style={[styles.resRow, picked && styles.resRowPicked]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resDisplay}>{c.display}</Text>
                          <Text style={styles.resMeta}>
                            {c.code} · {c.domain || "—"}{c.display_en && c.display_en !== c.display ? ` · ${c.display_en}` : ""}
                          </Text>
                        </View>
                        <Ionicons
                          name={picked ? "checkmark-circle" : "add-circle-outline"}
                          size={26}
                          color={picked ? "#059669" : "#EC4899"}
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerCount}>{value.length} code{value.length > 1 ? "s" : ""} sélectionné{value.length > 1 ? "s" : ""}</Text>
              <TouchableOpacity
                style={[styles.doneBtn, saving && { opacity: 0.6 }]}
                onPress={attachToEntity}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.doneTxt}>Valider</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  label: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EC4899", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  addBtnDisabled: { opacity: 0.5 },
  addBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },
  empty: { color: "#64748B", fontSize: 12, fontStyle: "italic" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FCE7F3", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  chipCode: { fontFamily: "monospace", fontSize: 10, color: "#831843", fontWeight: "700" },
  chipTxt: { color: "#831843", fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%", padding: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sheetTitle: { fontWeight: "800", fontSize: 17, color: "#111" },
  search: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#111", marginBottom: 8 },
  domainRow: { gap: 6, paddingVertical: 6 },
  domainChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F1F5F9" },
  domainChipActive: { backgroundColor: "#EC4899" },
  domainChipTxt: { fontSize: 12, color: "#334155", fontWeight: "600" },
  domainChipTxtActive: { color: "#fff" },
  results: { marginTop: 8, minHeight: 240, maxHeight: 400 },
  noRes: { textAlign: "center", color: "#64748B", padding: 20, fontStyle: "italic" },
  resRow: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 8 },
  resRowPicked: { backgroundColor: "#F0FDF4" },
  resDisplay: { color: "#0F172A", fontWeight: "600", fontSize: 14 },
  resMeta: { color: "#64748B", fontSize: 11, marginTop: 2, fontFamily: "monospace" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  footerCount: { color: "#64748B", fontSize: 12 },
  doneBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EC4899", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  doneTxt: { color: "#fff", fontWeight: "800" },
});
