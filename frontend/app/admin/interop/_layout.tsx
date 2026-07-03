import { Stack } from "expo-router";

export default function InteropLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "🔌 Interopérabilité" }} />
      <Stack.Screen name="[id]" options={{ title: "Configuration système" }} />
      <Stack.Screen name="history" options={{ title: "Historique sync" }} />
    </Stack>
  );
}
