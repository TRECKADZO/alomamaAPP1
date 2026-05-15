import { Stack } from "expo-router";
import { COLORS } from "../../constants/theme";

export default function GrossessePlusLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.bgPrimary },
        headerTintColor: COLORS.textPrimary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Grossesse +" }} />
      <Stack.Screen name="setup" options={{ title: "Configurer" }} />
      <Stack.Screen name="semaines" options={{ title: "Semaine par semaine" }} />
      <Stack.Screen name="semaine/[w]" options={{ title: "Semaine" }} />
      <Stack.Screen name="suivi" options={{ title: "Suivi médical" }} />
      <Stack.Screen name="journal" options={{ title: "Mon journal" }} />
      <Stack.Screen name="contractions" options={{ title: "Contractions" }} />
      <Stack.Screen name="trousseau" options={{ title: "Trousseau" }} />
      <Stack.Screen name="respiration" options={{ title: "Respiration" }} />
      <Stack.Screen name="cpn" options={{ title: "Consultations" }} />
      <Stack.Screen name="naissance" options={{ title: "Déclarer la naissance" }} />
    </Stack>
  );
}
