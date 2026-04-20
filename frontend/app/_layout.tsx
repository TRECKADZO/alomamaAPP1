import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../lib/auth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { COLORS } from "../constants/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
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
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
