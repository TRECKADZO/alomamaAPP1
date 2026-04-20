import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";

/**
 * Pick an image from gallery and return base64 string (without data prefix).
 */
export async function pickImageBase64(): Promise<string | null> {
  try {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission refusée", "Nous avons besoin d'accéder à votre galerie.");
        return null;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]?.base64) return null;
    return `data:image/jpeg;base64,${res.assets[0].base64}`;
  } catch (e: any) {
    Alert.alert("Erreur", e?.message || "Impossible d'accéder aux images");
    return null;
  }
}

export async function takePhotoBase64(): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission refusée", "Caméra nécessaire");
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]?.base64) return null;
    return `data:image/jpeg;base64,${res.assets[0].base64}`;
  } catch (e: any) {
    Alert.alert("Erreur", e?.message || "Impossible d'accéder à la caméra");
    return null;
  }
}
