import { Stack } from "expo-router";
import { COLORS } from "../../constants/theme";

export default function PostpartumLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.bgPrimary },
        headerTintColor: COLORS.textPrimary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Moi Aussi 🌸" }} />
      <Stack.Screen name="setup" options={{ title: "Configurer" }} />
      <Stack.Screen name="checkin" options={{ title: "Et toi, comment tu vas ?" }} />
      <Stack.Screen name="historique" options={{ title: "Mon historique" }} />
      <Stack.Screen name="testimonials" options={{ title: "Elles en parlent" }} />
      <Stack.Screen name="conjoint" options={{ title: "Pour mon conjoint" }} />
    </Stack>
  );
}
