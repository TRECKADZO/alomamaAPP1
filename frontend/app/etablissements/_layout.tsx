import { Stack } from "expo-router";

export default function EtablissementsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "🏥 Établissements agréés" }} />
      <Stack.Screen name="[id]" options={{ title: "Détail établissement" }} />
      <Stack.Screen name="carte" options={{ title: "🗺️ Carte interactive" }} />
    </Stack>
  );
}
