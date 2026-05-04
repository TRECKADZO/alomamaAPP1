import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { COLORS } from "../../constants/theme";
import { View, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/" />;

  const isMaman = user.role === "maman";
  const isPro = user.role === "professionnel";
  const isAdmin = user.role === "admin";
  const isCentre = user.role === "centre_sante";
  const isFamille = user.role === "famille";

  // Android edge-to-edge : ajouter le padding bottom = inset safe area
  const bottomPad = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPad;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginBottom: 2 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      {/* --------- Accueil (tous rôles) --------- */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />

      {/* --------- Maman : Grossesse --------- */}
      <Tabs.Screen
        name="grossesse"
        options={{
          title: "Grossesse",
          href: isMaman ? "/(tabs)/grossesse" : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />

      {/* --------- Maman : Enfants --------- */}
      <Tabs.Screen
        name="enfants"
        options={{
          title: "Enfants",
          href: isMaman ? "/(tabs)/enfants" : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />

      {/* --------- Pro/Centre : Patientes ou Pros --------- */}
      {/* Pour le PRO → ses patientes ; pour le CENTRE → ses pros membres */}
      <Tabs.Screen
        name="patients"
        options={{
          title: isCentre ? "Pros" : "Patientes",
          href: isPro || isCentre ? "/(tabs)/patients" : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={isCentre ? "medkit" : "people"} size={size} color={color} />
          ),
        }}
      />

      {/* --------- Centre uniquement : Patientes du centre --------- */}
      <Tabs.Screen
        name="patientes"
        options={{
          title: "Patientes",
          href: isCentre ? "/(tabs)/patientes" : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />

      {/* --------- Maman/Pro/Centre : RDV --------- */}
      <Tabs.Screen
        name="rdv"
        options={{
          title: "RDV",
          href: isAdmin || isFamille ? null : "/(tabs)/rdv",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />

      {/* --------- Admin : Admin --------- */}
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: isAdmin ? "/(tabs)/admin" : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="analytics" size={size} color={color} />,
        }}
      />

      {/* --------- Messages : Pro uniquement dans la tab bar (Maman via dashboard) --------- */}
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          href: isPro ? "/(tabs)/messages" : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="mail" size={size} color={color} />,
        }}
      />

      {/* --------- Onglets cachés mais routes conservées (accessibles depuis dashboard / profil) --------- */}
      <Tabs.Screen
        name="communaute"
        options={{ title: "Communauté", href: null }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: "IA", href: null }}
      />

      {/* --------- Profil (tous rôles) --------- */}
      <Tabs.Screen
        name="profil"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
