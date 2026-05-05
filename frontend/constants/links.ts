/**
 * Liens publics de l'application À lo Maman
 * Centralisés ici pour faciliter les mises à jour (Play Store, App Store, site, support).
 */

// 📦 Package Android : com.alomaman
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.alomaman";

// 🍎 App Store iOS — TODO : mettre à jour quand publication iOS
export const APP_STORE_URL = ""; // non publié pour l'instant

// 🌐 Version web de l'application (surchargable via EXPO_PUBLIC_WEB_APP_URL)
export const WEB_APP_URL =
  process.env.EXPO_PUBLIC_WEB_APP_URL || "https://alomaman.com";

// 🌐 Site web institutionnel (identique à la web app par défaut)
export const WEBSITE_URL = WEB_APP_URL;

// 📧 Contact support
export const SUPPORT_EMAIL = "infos@e-medicare.co";

/**
 * Construit le texte de partage de l'app avec les bons liens selon la plateforme.
 * Inclut automatiquement Google Play + version web (et App Store si disponible).
 *
 * @param intro Message d'introduction personnalisé (ex: invitation parrainage, invitation pro).
 */
export function buildShareAppText(intro: string): string {
  const lines = [intro.trim()];
  if (PLAY_STORE_URL) {
    lines.push("");
    lines.push("📱 Téléchargez gratuitement sur Google Play :");
    lines.push(PLAY_STORE_URL);
  }
  if (APP_STORE_URL) {
    lines.push("");
    lines.push("🍎 Disponible aussi sur l'App Store :");
    lines.push(APP_STORE_URL);
  }
  if (WEB_APP_URL) {
    lines.push("");
    lines.push("🌐 Ou utilisez-la directement dans votre navigateur :");
    lines.push(WEB_APP_URL);
  }
  return lines.join("\n");
}
