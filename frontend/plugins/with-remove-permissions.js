/**
 * Plugin Expo : retire les permissions Android automatiques ajoutées par les SDK natifs
 * (notamment Agora) que nous n'utilisons PAS dans À lo Maman.
 *
 * Cela évite de devoir les justifier auprès de Google Play Console.
 *
 * Permissions retirées :
 *  - FOREGROUND_SERVICE_MEDIA_PROJECTION : Pas de partage d'écran
 *  - READ_PHONE_STATE                    : Pas besoin de l'IMEI/numéro
 *  - BLUETOOTH                           : Pas d'accessoires Bluetooth (deprecated < 31)
 *  - BLUETOOTH_ADMIN                     : Pas de gestion BT (deprecated < 31)
 *  - BLUETOOTH_CONNECT                   : Pas de connexion BT >= 31
 *  - SYSTEM_ALERT_WINDOW                 : Pas d'overlay système
 *  - WRITE_SETTINGS                      : Pas de modif paramètres système
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSIONS_TO_REMOVE = [
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "android.permission.READ_PHONE_STATE",
  "android.permission.BLUETOOTH",
  "android.permission.BLUETOOTH_ADMIN",
  "android.permission.BLUETOOTH_CONNECT",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.WRITE_SETTINGS",
];

function withRemovePermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    // S'assurer que xmlns:tools est déclaré au niveau <manifest>
    manifest.manifest.$ = manifest.manifest.$ || {};
    if (!manifest.manifest.$["xmlns:tools"]) {
      manifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    // Supprimer les permissions existantes ET ajouter une directive tools:node="remove"
    const existing = manifest.manifest["uses-permission"] || [];
    const filtered = existing.filter(
      (p) => !PERMISSIONS_TO_REMOVE.includes(p.$["android:name"])
    );

    // Ajouter explicitement les directives "remove" pour neutraliser les fusions
    // depuis les manifests des SDK (Agora, etc.)
    const removeEntries = PERMISSIONS_TO_REMOVE.map((perm) => ({
      $: {
        "android:name": perm,
        "tools:node": "remove",
      },
    }));

    manifest.manifest["uses-permission"] = [...filtered, ...removeEntries];

    return cfg;
  });
}

module.exports = withRemovePermissions;
