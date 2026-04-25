import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { api, formatError } from "../../lib/api";
import { pickImageBase64 } from "../../lib/imagePicker";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const ROLE_LABELS: any = {
  maman: "Maman",
  professionnel: "Professionnel de santé",
  admin: "Administrateur",
  centre_sante: "Centre de santé",
  famille: "Famille / Proche",
};
const ROLE_ICONS: any = {
  maman: "heart",
  professionnel: "medical",
  admin: "shield-checkmark",
  centre_sante: "business",
  famille: "people",
};
const ROLE_GRADIENTS: Record<string, [string, string]> = {
  maman: ["#F472B6", "#FB7185"],
  professionnel: ["#2DD4BF", "#06B6D4"],
  admin: ["#C85A40", "#A64A35"],
  centre_sante: ["#A855F7", "#6366F1"],
  famille: ["#F59E0B", "#EF4444"],
};

export default function Profil() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const uploadPhoto = async () => {
    const b64 = await pickImageBase64();
    if (!b64) return;
    try {
      await api.post("/profile/photo", { photo_base64: b64 });
      await refresh();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // Navigation immédiate AVANT clear pour éviter d'attendre AsyncStorage
      router.replace("/");
    } catch (e) {
      console.warn("router.replace error", e);
    }
    // Puis nettoyage du token/user en arrière-plan
    try {
      await logout();
    } catch (e) {
      console.warn("logout error", e);
    } finally {
      setShowLogoutModal(false);
      setLoggingOut(false);
    }
  };

  const role = (user?.role || "maman") as keyof typeof ROLE_GRADIENTS;
  const gradient = ROLE_GRADIENTS[role] || ROLE_GRADIENTS.maman;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Header gradient avec photo */}
        <LinearGradient colors={gradient} style={styles.header}>
          <Text style={styles.headerTitle}>Mon profil</Text>
          <View style={styles.avatarWrap}>
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
              <Ionicons name={ROLE_ICONS[role]} size={14} color="#fff" />
              <Text style={styles.roleText}>{ROLE_LABELS[role]}</Text>
              {user?.premium && (
                <View style={styles.premiumPill}>
                  <Ionicons name="diamond" size={10} color="#fff" />
                  <Text style={styles.premiumText}>PREMIUM</Text>
                </View>
              )}
            </View>
            {user?.specialite && <Text style={styles.spec}>{user.specialite}</Text>}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Informations personnelles */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informations personnelles</Text>
            <InfoRow icon="mail-outline" label="Email" value={user?.email || "-"} />
            {user?.phone && <InfoRow icon="call-outline" label="Téléphone" value={user.phone} />}
            <InfoRow
              icon="time-outline"
              label="Membre depuis"
              value={user?.created_at ? new Date(user.created_at).toLocaleDateString("fr-FR") : "-"}
            />
          </View>

          {/* Mon espace santé (seulement maman) */}
          {role === "maman" && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mon espace santé</Text>
              <MenuRow icon="grid" iconColor="#EC4899" label="Mon espace santé (hub)" onPress={() => router.push("/mon-espace-sante")} />
              <MenuRow icon="document-text" iconColor="#14B8A6" label="Mon dossier médical" onPress={() => router.push("/dossier-medical")} />
              <MenuRow icon="heart" iconColor="#EC4899" label="Suivi grossesse" onPress={() => router.push("/(tabs)/grossesse")} />
              <MenuRow icon="happy" iconColor="#3B82F6" label="Carnets de santé enfants" onPress={() => router.push("/(tabs)/enfants")} />
              <MenuRow icon="flower" iconColor="#E11D48" label="Cycle menstruel" onPress={() => router.push("/cycle")} />
              <MenuRow icon="document-text" iconColor="#14B8A6" label="Mes documents" onPress={() => router.push("/documents")} />
              <MenuRow icon="moon" iconColor="#6366F1" label="Suivi sommeil" onPress={() => router.push("/sommeil")} />
              <MenuRow icon="calendar" iconColor="#F59E0B" label="Mon agenda" onPress={() => router.push("/agenda")} />
              <MenuRow icon="people-circle" iconColor="#A855F7" label="Famille connectée" onPress={() => router.push("/famille")} />
              <MenuRow icon="diamond" iconColor="#F59E0B" label="Premium" onPress={() => router.push("/premium")} />
            </View>
          )}

          {/* Préférences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paramètres</Text>
            <MenuRow icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications")} />
            <MenuRow icon="lock-closed-outline" label="Sécurité & Mot de passe" />
            <MenuRow icon="language-outline" label="Langue" value="Français" />
            <MenuRow icon="help-circle-outline" label="Aide & Support" />
            <MenuRow icon="information-circle-outline" label="À propos" />
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
            <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </TouchableOpacity>

          <Text style={styles.appVersion}>À lo Maman · v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Modal de confirmation de déconnexion (remplace Alert.alert qui peut être capricieux sur Android edge-to-edge) */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => !loggingOut && setShowLogoutModal(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.modalBg} onPress={() => !loggingOut && setShowLogoutModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="log-out-outline" size={32} color={COLORS.error} />
            </View>
            <Text style={styles.modalTitle}>Se déconnecter ?</Text>
            <Text style={styles.modalSubtitle}>
              Vous devrez vous reconnecter pour accéder à votre compte.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setShowLogoutModal(false)}
                disabled={loggingOut}
                testID="cancel-logout-btn"
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirm]}
                onPress={confirmLogout}
                disabled={loggingOut}
                testID="confirm-logout-btn"
              >
                {loggingOut ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Déconnexion</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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

function MenuRow({ icon, iconColor = COLORS.textSecondary, label, value, onPress }: any) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <View style={[styles.menuIcon, { backgroundColor: iconColor + "1A" }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {value && <Text style={styles.menuValue}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: {
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: SPACING.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  avatarWrap: { alignItems: "center", marginTop: 16 },
  bigAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  bigAvatarImg: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: "rgba(255,255,255,0.5)" },
  bigAvatarText: { color: "#fff", fontSize: 38, fontWeight: "800" },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.05)",
  },
  name: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 12 },
  email: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    marginTop: 10,
  },
  roleText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    marginLeft: 6,
  },
  premiumText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  spec: { color: "rgba(255,255,255,0.85)", marginTop: 6, fontSize: 13 },

  body: { padding: SPACING.lg, marginTop: -20, gap: 12 },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW,
  },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, fontSize: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  infoLabel: { color: COLORS.textSecondary, fontSize: 11, textTransform: "uppercase", fontWeight: "700", letterSpacing: 0.5 },
  infoValue: { color: COLORS.textPrimary, fontSize: 14, marginTop: 2 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  menuIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  menuValue: { color: COLORS.textMuted, fontSize: 12 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: "#FEF2F2",
    marginTop: 4,
  },
  logoutText: { color: COLORS.error, fontWeight: "700" },
  appVersion: { textAlign: "center", color: COLORS.textMuted, marginTop: 14, fontSize: 12 },

  // Logout confirmation modal
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  modalCancel: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  modalConfirm: {
    backgroundColor: COLORS.error,
  },
  modalConfirmText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
