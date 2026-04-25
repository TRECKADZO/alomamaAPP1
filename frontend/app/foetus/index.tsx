import { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { COLORS } from "../../constants/theme";

/**
 * /foetus index — redirige vers la SA actuelle de la maman.
 */
export default function FoetusIndex() {
  const router = useRouter();
  useEffect(() => {
    api.get("/foetus")
      .then((r) => {
        const sa = r.data.current_sa || 12;
        router.replace(`/foetus/${sa}`);
      })
      .catch(() => {
        router.replace("/foetus/12");
      });
  }, [router]);
  return (
    <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary }}>
      <ActivityIndicator color={COLORS.primary} />
    </SafeAreaView>
  );
}
