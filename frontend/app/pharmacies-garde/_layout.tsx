import { Stack } from "expo-router";

export default function PharmaciesGardeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="carte" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
