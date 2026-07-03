import { Stack } from "expo-router";

export default function DHIS2Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "📊 Export DHIS2" }} />
      <Stack.Screen name="config" options={{ title: "Configuration DHIS2" }} />
      <Stack.Screen name="history" options={{ title: "Historique exports" }} />
    </Stack>
  );
}
