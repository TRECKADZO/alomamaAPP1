import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../lib/auth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons, MaterialIcons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import * as Font from "expo-font";
import { COLORS } from "../constants/theme";
import OfflineBanner from "../components/OfflineBanner";
import { NotificationsProvider, useNotifications } from "../lib/notifications-context";
import InAppNotificationBanner from "../components/InAppNotificationBanner";
import { registerNotificationListeners } from "../lib/push";

/**
 * Pont entre les listeners push natifs et le contexte de notifications :
 *  - Reçoit une notif en foreground → affiche un toast in-app
 *  - User tape une notif système → ouvre la page /notifications
 */
function NotificationsBridge() {
  const { showToast, refresh } = useNotifications();
  const router = useRouter();

  useEffect(() => {
    const cleanup = registerNotificationListeners({
      onForegroundReceive: (notif) => {
        const title = notif.request.content.title || "À lo Maman";
        const body = notif.request.content.body || "";
        const data: any = notif.request.content.data || {};
        showToast(title, body, data.type || "info");
        // Re-sync le compteur
        refresh();
      },
      onNotificationTap: (response) => {
        const data: any = response.notification.request.content.data || {};
        // Routes ciblées selon le type
        if (data.type === "incoming_call" && data.rdv_id) {
          // 📞 Appel entrant → ouvrir directement l'écran téléconsultation
          router.push(`/video-call/${data.rdv_id}` as any);
        } else if (data.type === "rdv" || data.type === "rdv_confirmation" || data.type === "rdv_cancellation") {
          router.push("/(tabs)/rdv" as any);
        } else if (data.type === "message") {
          if (data.conversation_id) router.push(`/chat/${data.conversation_id}` as any);
          else router.push("/notifications");
        } else {
          router.push("/notifications");
        }
        refresh();
      },
    });
    return cleanup;
  }, [showToast, refresh, router]);

  return null;
}

export default function RootLayout() {
  // Précharge les polices d'icônes (silencieusement) pour éviter le warning
  // FontFaceObserver "6000ms timeout exceeded" sur le web preview lent.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        await Promise.race([
          Font.loadAsync({
            ...Ionicons.font,
            ...MaterialIcons.font,
            ...MaterialCommunityIcons.font,
            ...FontAwesome5.font,
          }),
          new Promise((resolve) => setTimeout(resolve, 5000)), // ne bloque jamais > 5s
        ]);
      } catch {
        // Échec silencieux : les icônes vont juste se charger plus tard
      } finally {
        setFontsReady(true);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationsProvider>
            <StatusBar style="dark" />
            <View style={{ flex: 1 }}>
              <OfflineBanner />
              <View style={{ flex: 1 }}>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bgPrimary } }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="chat/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="video-call/[rdvId]" options={{ presentation: "fullScreenModal", headerShown: false }} />
                  <Stack.Screen name="cycle" />
                  <Stack.Screen name="contraception" />
                  <Stack.Screen name="post-partum" />
                  <Stack.Screen name="search" />
                  <Stack.Screen name="notifications" />
                  <Stack.Screen name="fhir" />
                  <Stack.Screen name="tele-echo" />
                  <Stack.Screen name="naissance" />
                  <Stack.Screen name="premium" />
                  <Stack.Screen name="parrainage" options={{ headerShown: false }} />
                  <Stack.Screen name="portail-pro" options={{ title: "Portail Pro - À lo Maman" }} />
                  <Stack.Screen name="plans" options={{ title: "Nos offres - À lo Maman" }} />
                  <Stack.Screen name="cmu" options={{ title: "CMU - Ma couverture" }} />
                  <Stack.Screen name="cgu" options={{ title: "CGU - À lo Maman" }} />
                  <Stack.Screen name="privacy" options={{ title: "Politique de Confidentialité" }} />
                  <Stack.Screen name="ressources" options={{ title: "Ressources éducatives" }} />
                  <Stack.Screen name="croissance" options={{ title: "Courbes OMS" }} />
                  <Stack.Screen name="supprimer-compte" options={{ title: "Supprimer mon compte" }} />
                  <Stack.Screen name="changer-mot-de-passe" options={{ title: "Changer mot de passe" }} />
                  <Stack.Screen name="suppression-compte" options={{ headerShown: false }} />
                  <Stack.Screen name="aide-support" options={{ headerShown: false }} />
                  <Stack.Screen name="about" options={{ headerShown: false }} />
                  <Stack.Screen name="documents/[id]" options={{ headerShown: false, presentation: "card" }} />
                  <Stack.Screen name="admin/[section]" options={{ headerShown: false }} />
                  <Stack.Screen name="admin/annuaire" options={{ headerShown: false }} />
                  <Stack.Screen name="admin/user/[id]" options={{ headerShown: false }} />
                </Stack>
              </View>
              {/* Bannière in-app globale + pont natif vers le context */}
              <NotificationsBridge />
              <InAppNotificationBanner />
            </View>
          </NotificationsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
