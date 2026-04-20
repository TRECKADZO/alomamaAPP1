import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { api, formatError } from "../../lib/api";
import { pickImageBase64 } from "../../lib/imagePicker";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Profil() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();

  const uploadPhoto = async () => {
    const b64 = await pickImageBase64();
    if (!b64) return;
    try {
      await api.post("/profile/photo", { photo_base64: b64 });
      await refresh();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const handleLogout = () => {
    Alert.alert("Se déconnecter", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/");
        },
      },
    ]);
  };

  const roleLabels: any = { maman: "Maman", professionnel: "Professionnel de santé", admin: "Administrateur" };
  const roleIcons: any = { maman: "heart", professionnel: "medical", admin: "shield-checkmark" };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <Text style={styles.title}>Mon profil</Text>

        <View style={styles.profileCard}>
          <TouchableOpacity onPress={uploadPhoto} testID="profile-photo-btn">
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.bigAvatarImg} />
            ) : (
              <View style={styles.bigAvatar}>
                <Text style={styles.bigAvatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.roleChip}>
            <Ionicons name={roleIcons[user?.role || "maman"]} size={14} color={COLORS.primary} />
            <Text style={styles.roleText}>{roleLabels[user?.role || "maman"]}</Text>
          </View>
          {user?.specialite && (
            <Text style={styles.spec}>{user.specialite}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          <InfoRow icon="mail-outline" label="Email" value={user?.email || ""} />
          {user?.phone && <InfoRow icon="call-outline" label="Téléphone" value={user.phone} />}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paramètres</Text>
          <MenuRow icon="notifications-outline" label="Notifications" />
          <MenuRow icon="lock-closed-outline" label="Sécurité & Mot de passe" />
          <MenuRow icon="language-outline" label="Langue" value="Français" />
          <MenuRow icon="help-circle-outline" label="Aide & Support" />
          <MenuRow icon="information-circle-outline" label="À propos" />
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <Text style={styles.appVersion}>À lo Maman · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: any) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={COLORS.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function MenuRow({ icon, label, value }: any) {
  return (
    <TouchableOpacity style={styles.menuRow}>
      <Ionicons name={icon} size={20} color={COLORS.textSecondary} />
      <Text style={styles.menuLabel}>{label}</Text>
      {value && <Text style={styles.menuValue}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary, marginBottom: SPACING.lg },
  profileCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  bigAvatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  bigAvatarImg: { width: 90, height: 90, borderRadius: 45, marginBottom: 14 },
  cameraBadge: { position: "absolute", bottom: 14, right: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  bigAvatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  email: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  roleChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill },
  roleText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  spec: { color: COLORS.textSecondary, marginTop: 8, fontSize: 13 },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontWeight: "700", color: COLORS.textPrimary, marginBottom: 10, fontSize: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  infoLabel: { color: COLORS.textSecondary, fontSize: 11, textTransform: "uppercase", fontWeight: "600" },
  infoValue: { color: COLORS.textPrimary, fontSize: 14, marginTop: 2 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  menuLabel: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  menuValue: { color: COLORS.textMuted, fontSize: 12 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.error, marginTop: 10 },
  logoutText: { color: COLORS.error, fontWeight: "700" },
  appVersion: { textAlign: "center", color: COLORS.textMuted, marginTop: 20, fontSize: 12 },
});
