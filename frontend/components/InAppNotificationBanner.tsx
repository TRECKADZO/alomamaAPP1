/**
 * Bannière de notification in-app — toast qui slide depuis le haut.
 * Rendu globalement par _layout.tsx, alimenté par useNotifications().
 *
 * - Auto-hide après 5 secondes
 * - Tap sur la bannière → navigation vers /notifications
 * - Swipe up pour fermer manuellement
 * - Animation Reanimated (smooth 60 FPS)
 */
import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications } from "../lib/notifications-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const AUTO_DISMISS_MS = 5000;

const ICON_FOR: Record<string, any> = {
  rdv: "calendar",
  message: "chatbox-ellipses",
  rappel: "alarm",
  test: "checkmark-circle",
  info: "information-circle",
  payment: "wallet",
  premium: "star",
  rdv_confirmation: "checkmark-done-circle",
  rdv_cancellation: "close-circle",
};

export default function InAppNotificationBanner() {
  const { toast, dismissToast } = useNotifications();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-200);
  const dismissTimer = useRef<any>(null);

  const hide = () => {
    translateY.value = withTiming(-200, { duration: 250 }, (finished) => {
      if (finished) runOnJS(dismissToast)();
    });
  };

  const handleTap = () => {
    hide();
    setTimeout(() => router.push("/notifications"), 280);
  };

  useEffect(() => {
    if (toast) {
      // Slide-in
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
      // Auto-hide
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(hide, AUTO_DISMISS_MS);
    } else {
      translateY.value = -200;
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  // Geste : swipe up pour fermer
  const swipeUp = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY < 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < -40 || e.velocityY < -300) {
        translateY.value = withTiming(-200, { duration: 200 }, (finished) => {
          if (finished) runOnJS(dismissToast)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast) return null;

  const iconName = ICON_FOR[toast.type] || "notifications";
  const isPositive = ["test", "rdv_confirmation", "payment"].includes(toast.type);
  const isNegative = ["rdv_cancellation"].includes(toast.type);
  const colors: [string, string] = isPositive
    ? ["#10B981", "#059669"]
    : isNegative
    ? ["#EF4444", "#DC2626"]
    : ["#F4A754", "#D97843"];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { paddingTop: insets.top + 6 },
        animatedStyle,
      ]}
    >
      <GestureDetector gesture={swipeUp}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleTap}
          style={styles.touchable}
          testID="in-app-banner"
        >
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <View style={styles.iconCircle}>
              <Ionicons name={iconName} size={22} color="#fff" />
            </View>
            <View style={styles.content}>
              <Text numberOfLines={1} style={styles.title}>{toast.title}</Text>
              <Text numberOfLines={2} style={styles.body}>{toast.body}</Text>
            </View>
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={hide}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </LinearGradient>
          {/* Petite poignée swipe-up */}
          <View style={styles.swipeHandle} />
        </TouchableOpacity>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 9999,
    elevation: 30,
  },
  touchable: {
    width: SCREEN_WIDTH - 24,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
      android: {
        elevation: 10,
      },
    }),
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1 },
  title: { color: "#fff", fontSize: 14, fontWeight: "800" },
  body: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 2, lineHeight: 16 },
  swipeHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
    marginTop: 4,
  },
});
