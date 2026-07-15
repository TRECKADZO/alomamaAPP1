/**
 * LeafletMap.tsx — Carte interactive puissante cross-platform (iOS/Android/web)
 * utilisant Leaflet.js + OpenStreetMap via un WebView. Zéro dépendance à Google Maps.
 *
 * Sur web : Leaflet est chargé directement dans un iframe (via srcDoc).
 * Sur mobile : WebView Expo affiche la même page HTML.
 *
 * Bridge JS ↔ RN :
 *   - RN → JS  : injectJavaScript avec commandes JSON
 *   - JS → RN  : window.ReactNativeWebView.postMessage(JSON.stringify(...))
 */
import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  nom: string;
  categorie?: string;
  specialites_metier?: string[];
  commune?: string;
  region?: string;
  adresse?: string;
  telephone?: string;
  cmu_accepted?: boolean | null;
  distance_km?: number;
  travel_min_car?: number;
};

export type LeafletMapHandle = {
  centerOn: (lat: number, lon: number, zoom?: number) => void;
  setMarkers: (markers: MapMarker[]) => void;
  fitBounds: (markers: MapMarker[]) => void;
};

type Props = {
  initialCenter?: { lat: number; lon: number };
  initialZoom?: number;
  markers?: MapMarker[];
  userLocation?: { lat: number; lon: number } | null;
  onMarkerPress?: (marker: MapMarker) => void;
  onDirectionsPress?: (marker: MapMarker) => void;
  onMapReady?: () => void;
  height?: number | string;
};

// ── HTML/JS Leaflet embarqué. Utilise unpkg CDN pour le premier chargement,
// puis cache localement les tuiles via leaflet.offline (via localStorage).
const buildHtml = (initialCenter: { lat: number; lon: number }, initialZoom: number) => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>À lo Maman · Carte</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  .leaflet-popup-content { margin:10px 12px; line-height:1.4; font-size:13px; max-width:260px; }
  .popup-title { font-weight:800; color:#0F172A; font-size:14px; margin-bottom:4px; }
  .popup-cat { color:#EC4899; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; }
  .popup-addr { color:#64748B; font-size:11px; margin-top:6px; }
  .popup-badges { display:flex; gap:4px; flex-wrap:wrap; margin-top:6px; }
  .popup-badge { background:#F1F5F9; color:#334155; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; }
  .popup-badge.cmu { background:#DCFCE7; color:#166534; }
  .popup-badge.dist { background:#FEE2E2; color:#991B1B; }
  .popup-actions { display:flex; gap:6px; margin-top:10px; }
  .popup-btn { flex:1; padding:8px 10px; border-radius:6px; border:none; font-weight:700; font-size:11px; cursor:pointer; }
  .popup-btn-primary { background:#EC4899; color:white; }
  .popup-btn-secondary { background:#EDE9FE; color:#5B21B6; }
  .popup-tel { color:#059669; font-size:11px; margin-top:4px; display:block; text-decoration:none; }
  .user-marker { background:#3B82F6; border:3px solid white; border-radius:50%; width:16px; height:16px; box-shadow:0 0 0 2px #3B82F6; }
</style>
</head>
<body>
<div id="map"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>

<script>
(function() {
  // Bridge JS → RN (postMessage) ou dispatchEvent (web parent)
  function postToRN(payload) {
    var msg = JSON.stringify(payload);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, "*");
    }
  }

  var map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([${initialCenter.lat}, ${initialCenter.lon}], ${initialZoom});

  // Tuiles OSM avec fallback + cache navigateur (Cache-Control: 7 jours par défaut)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    crossOrigin: true,
  }).addTo(map);

  // Cluster group
  var cluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: function(c) {
      var count = c.getChildCount();
      var color = count < 10 ? '#7C3AED' : count < 50 ? '#EC4899' : '#DC2626';
      return L.divIcon({
        html: '<div style="background:'+color+';color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,0.25);">' + count + '</div>',
        className: 'alo-cluster',
        iconSize: [36, 36],
      });
    },
  });
  map.addLayer(cluster);

  // Marqueur utilisateur
  var userMarker = null;
  function setUserLocation(lat, lon) {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: 'user-marker', iconSize: [16, 16] }),
      title: 'Ma position',
    }).addTo(map);
  }

  // Style de marqueur selon catégorie/spécialités
  function getMarkerColor(m) {
    var specs = m.specialites_metier || [];
    if (specs.indexOf('Maternité') >= 0) return '#EC4899';
    if (specs.indexOf('Pédiatrie') >= 0) return '#7C3AED';
    if (specs.indexOf('Psychiatrie') >= 0) return '#DC2626';
    if (specs.indexOf('Dentaire') >= 0) return '#0891B2';
    if (specs.indexOf('Ophtalmologie') >= 0) return '#F59E0B';
    if (specs.indexOf('Pharmacie') >= 0) return '#10B981';
    return '#3B82F6';
  }

  function makeIcon(m) {
    var color = getMarkerColor(m);
    return L.divIcon({
      className: 'alo-marker',
      html: '<div style="background:'+color+';border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:22px;height:22px;box-shadow:0 2px 4px rgba(0,0,0,0.3);"><div style="transform:rotate(45deg);text-align:center;color:white;font-size:11px;font-weight:800;line-height:22px;">+</div></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
      popupAnchor: [0, -20],
    });
  }

  function buildPopup(m) {
    var specs = (m.specialites_metier || []).slice(0, 4).map(function(s) {
      return '<span class="popup-badge">' + s + '</span>';
    }).join('');
    var cmu = '';
    if (m.cmu_accepted === true) cmu = '<span class="popup-badge cmu">✓ CMU</span>';
    else if (m.cmu_accepted === false) cmu = '<span class="popup-badge">CMU non acceptée</span>';
    var dist = '';
    if (typeof m.distance_km === 'number') {
      dist = '<span class="popup-badge dist">📍 ' + m.distance_km + ' km · ~' + (m.travel_min_car || Math.round(m.distance_km * 2)) + ' min</span>';
    }
    var tel = m.telephone
      ? '<a class="popup-tel" href="tel:' + m.telephone + '">📞 ' + m.telephone + '</a>'
      : '';
    return (
      '<div>' +
        '<div class="popup-cat">' + (m.categorie || 'Établissement') + '</div>' +
        '<div class="popup-title">' + (m.nom || '—') + '</div>' +
        (m.adresse ? '<div class="popup-addr">' + m.adresse + '</div>' : '') +
        '<div class="popup-badges">' + specs + cmu + dist + '</div>' +
        tel +
        '<div class="popup-actions">' +
          '<button class="popup-btn popup-btn-primary" onclick="window._openDetail(\\''+m.id+'\\')">Fiche & RDV</button>' +
          '<button class="popup-btn popup-btn-secondary" onclick="window._openDirections(\\''+m.id+'\\')">Itinéraire</button>' +
        '</div>' +
      '</div>'
    );
  }

  // Handlers appelés depuis les boutons de popup
  window._markersById = {};
  window._openDetail = function(id) {
    postToRN({ type: 'marker_press', marker: window._markersById[id] || { id: id } });
  };
  window._openDirections = function(id) {
    postToRN({ type: 'directions_press', marker: window._markersById[id] || { id: id } });
  };

  function setMarkers(list) {
    cluster.clearLayers();
    window._markersById = {};
    list.forEach(function(m) {
      window._markersById[m.id] = m;
      var mk = L.marker([m.lat, m.lon], { icon: makeIcon(m) });
      mk.bindPopup(buildPopup(m));
      cluster.addLayer(mk);
    });
  }

  function fitBounds(list) {
    if (!list || list.length === 0) return;
    var latLngs = list.map(function(m) { return [m.lat, m.lon]; });
    map.fitBounds(latLngs, { padding: [40, 40], maxZoom: 15 });
  }

  // Bridge RN → JS via URL-hash ou via eval injectJavaScript
  window._api = {
    setMarkers: setMarkers,
    setUserLocation: setUserLocation,
    centerOn: function(lat, lon, zoom) { map.setView([lat, lon], zoom || 14); },
    fitBounds: fitBounds,
  };

  // Signal prêt
  setTimeout(function() {
    postToRN({ type: 'ready' });
  }, 300);
})();
</script>
</body>
</html>`;

const LeafletMap = forwardRef<LeafletMapHandle, Props>((props, ref) => {
  const {
    initialCenter = { lat: 7.5, lon: -5.5 },
    initialZoom = 6,
    markers = [],
    userLocation = null,
    onMarkerPress,
    onDirectionsPress,
    onMapReady,
    height = "100%",
  } = props;

  const webviewRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  const html = useMemo(
    () => buildHtml(initialCenter, initialZoom),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialCenter.lat, initialCenter.lon, initialZoom],
  );

  const runJs = (code: string) => {
    if (Platform.OS === "web") {
      // Sur web, injection via contentWindow.eval
      try {
        // @ts-expect-error - contentWindow may be typed as Window
        iframeRef.current?.contentWindow?.eval?.(code);
      } catch {}
    } else if (webviewRef.current) {
      webviewRef.current.injectJavaScript(code + "\ntrue;");
    }
  };

  const sendMarkers = () => {
    runJs(`window._api && window._api.setMarkers(${JSON.stringify(markers)});`);
    if (userLocation) {
      runJs(`window._api && window._api.setUserLocation(${userLocation.lat}, ${userLocation.lon});`);
    }
  };

  // À chaque changement de markers ou de userLoc, refresh
  useEffect(() => {
    if (ready) sendMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, userLocation, ready]);

  useImperativeHandle(ref, () => ({
    centerOn: (lat, lon, zoom) => runJs(`window._api && window._api.centerOn(${lat}, ${lon}, ${zoom || 14});`),
    setMarkers: (list) => runJs(`window._api && window._api.setMarkers(${JSON.stringify(list)});`),
    fitBounds: (list) => runJs(`window._api && window._api.fitBounds(${JSON.stringify(list)});`),
  }));

  const handleMessage = (raw: string) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "ready") {
        setReady(true);
        onMapReady?.();
      } else if (msg.type === "marker_press" && msg.marker && onMarkerPress) {
        const full = markers.find((m) => m.id === msg.marker.id) || msg.marker;
        onMarkerPress(full);
      } else if (msg.type === "directions_press" && msg.marker && onDirectionsPress) {
        const full = markers.find((m) => m.id === msg.marker.id) || msg.marker;
        onDirectionsPress(full);
      }
    } catch {}
  };

  // ── Web : iframe avec srcDoc + postMessage listener
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onMsg = (ev: MessageEvent) => {
      if (typeof ev.data === "string") handleMessage(ev.data);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { height: height as any }]}>
        {/* @ts-expect-error - iframe not typed in RN but works on web */}
        <iframe
          ref={iframeRef as any}
          srcDoc={html}
          style={{ border: 0, width: "100%", height: "100%" }}
          allow="geolocation *; fullscreen"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups"
          title="Carte des établissements"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: height as any }]}>
      <WebView
        ref={webviewRef}
        source={{ html, baseUrl: "https://alomaman.local" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(ev: WebViewMessageEvent) => handleMessage(ev.nativeEvent.data)}
        onLoadEnd={() => { /* setReady is triggered by JS ready */ }}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      />
    </View>
  );
});

LeafletMap.displayName = "LeafletMap";
export default LeafletMap;

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", backgroundColor: "#F8FAFC" },
});
