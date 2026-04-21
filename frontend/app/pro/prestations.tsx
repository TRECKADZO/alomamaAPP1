import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Switch, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function Prestations() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nom: "", prix_fcfa: "10000", duree_min: "30", description: "", active: true });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/pro/prestations");
      setList(data || []);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openAdd = () => {
    setEditing(null);
    setForm({ nom: "", prix_fcfa: "10000", duree_min: "30", description: "", active: true });
    setModal(true);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      nom: p.nom || "",
      prix_fcfa: String(p.prix_fcfa || 0),
      duree_min: String(p.duree_min || 30),
      description: p.description || "",
      active: p.active !== false,
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.nom.trim()) return Alert.alert("Champ requis", "Le nom est obligatoire.");
    const prix = parseInt(form.prix_fcfa || "0");
    if (isNaN(prix) || prix < 0) return Alert.alert("Prix invalide");
    const body = {
      nom: form.nom.trim(),
      prix_fcfa: prix,
      duree_min: parseInt(form.duree_min || "30"),
      description: form.description.trim() || undefined,
      active: form.active,
    };
    try {
      if (editing) await api.patch(`/pro/prestations/${editing.id}`, body);
      else await api.post("/pro/prestations", body);
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const remove = (id: string, nom: string) => {
    Alert.alert("Supprimer ?", `Voulez-vous supprimer « ${nom} » ?`, [
      { text: "Annuler" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        try { await api.delete(`/pro/prestations/${id}`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); }
      }},
    ]);
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Mes prestations</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl }}>
        <View style={styles.info}>
          <Ionicons name="information-circle" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Créez vos prestations et leurs tarifs. Les mamans les verront lors de la prise de rendez-vous et pourront choisir directement celle qui leur convient.
          </Text>
        </View>

        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="pricetags-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune prestation</Text>
            <Text style={styles.emptySub}>Ajoutez votre première prestation (ex: Consultation prénatale, Échographie, Suivi post-partum…)</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
              <Text style={styles.emptyBtnText}>+ Créer ma première prestation</Text>
            </TouchableOpacity>
          </View>
        ) : list.map((p) => (
          <TouchableOpacity key={p.id} style={[styles.card, !p.active && { opacity: 0.55 }]} onPress={() => openEdit(p)}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.name}>{p.nom}</Text>
                {!p.active && <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>désactivée</Text></View>}
              </View>
              <Text style={styles.price}>{p.prix_fcfa.toLocaleString()} FCFA</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Text style={styles.meta}>⏱ {p.duree_min} min</Text>
              </View>
              {p.description ? <Text style={styles.desc}>{p.description}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => remove(p.id, p.nom)} style={styles.delBtn}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editing ? "Modifier" : "Nouvelle prestation"}</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Nom de la prestation *</Text>
              <TextInput style={styles.input} value={form.nom} onChangeText={(v) => setForm({ ...form, nom: v })} placeholder="Ex: Consultation prénatale" placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.label}>Prix (FCFA) *</Text>
              <TextInput style={styles.input} value={form.prix_fcfa} onChangeText={(v) => setForm({ ...form, prix_fcfa: v.replace(/[^0-9]/g, "") })} keyboardType="numeric" placeholder="10000" placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.label}>Durée (minutes)</Text>
              <TextInput style={styles.input} value={form.duree_min} onChangeText={(v) => setForm({ ...form, duree_min: v.replace(/[^0-9]/g, "") })} keyboardType="numeric" placeholder="30" placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.label}>Description (optionnelle)</Text>
              <TextInput style={[styles.input, { height: 80 }]} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline placeholder="Décrivez la prestation…" placeholderTextColor={COLORS.textMuted} />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Active</Text>
                  <Text style={styles.switchHelp}>Visible pour les mamans lors de la prise de RDV</Text>
                </View>
                <Switch value={form.active} onValueChange={(v) => setForm({ ...form, active: v })} />
              </View>

              <TouchableOpacity style={styles.save} onPress={save}>
                <Text style={styles.saveText}>{editing ? "Enregistrer" : "Créer"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl, paddingBottom: 0 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },

  info: { flexDirection: "row", gap: 10, padding: 14, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, marginBottom: 16 },
  infoText: { flex: 1, color: COLORS.textPrimary, fontSize: 12, lineHeight: 17 },

  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14 },
  emptySub: { textAlign: "center", color: COLORS.textSecondary, marginTop: 6, lineHeight: 19 },
  emptyBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, marginTop: 18 },
  emptyBtnText: { color: "#fff", fontWeight: "800" },

  card: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, ...SHADOW.sm },
  name: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  price: { fontSize: 18, fontWeight: "800", color: COLORS.primary, marginTop: 4 },
  meta: { fontSize: 12, color: COLORS.textSecondary },
  desc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 6, lineHeight: 17 },
  inactiveBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  inactiveText: { color: "#B91C1C", fontSize: 10, fontWeight: "800" },
  delBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, maxHeight: "90%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLORS.textPrimary, backgroundColor: COLORS.surface },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  switchHelp: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  save: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 999, alignItems: "center", marginTop: 20 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
