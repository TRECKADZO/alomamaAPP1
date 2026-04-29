import { Stack } from "expo-router";
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
          <StatusBar style="dark" />
          <View style={{ flex: 1 }}>
            <OfflineBanner />
            <View style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bgPrimary } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="chat/[id]" options={{ presentation: "card" }} />
                <Stack.Screen name="video-call/[rid]" options={{ presentation: "fullScreenModal", headerShown: false }} />
                <Stack.Screen name="cycle" />
                <Stack.Screen name="contraception" />
                <Stack.Screen name="post-partum" />
                <Stack.Screen name="search" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="fhir" />
                <Stack.Screen name="tele-echo" />
                <Stack.Screen name="naissance" />
                <Stack.Screen name="premium" />
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
                <Stack.Screen name="admin/[section]" options={{ headerShown: false }} />
                <Stack.Screen name="admin/annuaire" options={{ headerShown: false }} />
                <Stack.Screen name="admin/user/[id]" options={{ headerShown: false }} />
              </Stack>
            </View>
          </View>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
