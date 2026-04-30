import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v");
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
  } catch { return null; }
}

export default function RessourceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Quiz state
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { (async () => {
    try {
      const { data } = await api.get(`/resources/${id}`);
      setR(data);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  })(); }, [id]);

  const toggleLike = async () => {
    try { await api.post(`/resources/${id}/like`); } catch {}
  };

  const submitQuiz = async () => {
    if (!r?.questions) return;
    if (Object.keys(answers).length !== r.questions.length) {
      return Alert.alert("Répondez à toutes les questions", `Il vous reste ${r.questions.length - Object.keys(answers).length} question(s)`);
    }
    setSubmitting(true);
    try {
      const ordered = r.questions.map((_: any, i: number) => answers[i]);
      const { data } = await api.post(`/resources/${id}/quiz-submit`, { answers: ordered });
      setResult(data);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setSubmitting(false); }
  };

  const resetQuiz = () => { setAnswers({}); setResult(null); };

  const openExternal = (url: string) => {
    if (Platform.OS === "web") (window as any).open(url, "_blank");
    else Linking.openURL(url);
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  if (!r) return <SafeAreaView style={styles.loading}><Text style={{ color: COLORS.textMuted }}>Introuvable</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {r.type === "video" ? "Vidéo" : r.type === "quiz" ? "Quiz" : "Fiche"}
        </Text>
        <TouchableOpacity style={styles.likeBtn} onPress={toggleLike}>
          <Ionicons name="heart-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <LinearGradient colors={r.type === "video" ? ["#DC2626", "#991B1B"] : r.type === "quiz" ? ["#7C3AED", "#5B21B6"] : ["#059669", "#047857"]} style={styles.hero}>
          <Ionicons name={r.type === "video" ? "play-circle" : r.type === "quiz" ? "help-circle" : "document-text"} size={32} color="#fff" />
          <Text style={styles.heroTitle}>{r.title}</Text>
          {r.description ? <Text style={styles.heroDesc}>{r.description}</Text> : null}
          <View style={styles.metaRow}>
            {r.source ? <View style={styles.metaBadge}><Text style={styles.metaText}>{r.source}</Text></View> : null}
            {r.author_name ? <Text style={styles.authorText}>Par {r.author_name}</Text> : null}
          </View>
        </LinearGradient>

        {/* VIDEO — preview card avec ouverture externe (évite erreurs 153 d'embedding YouTube) */}
        {r.type === "video" && r.video_url && (
          <View style={styles.videoWrap}>
            {(() => {
              // Extract YouTube ID for thumbnail
              let ytId: string | null = null;
              try {
                const u = new URL(r.video_url);
                if (u.hostname.includes("youtu.be")) ytId = u.pathname.slice(1);
                else if (u.hostname.includes("youtube.com")) ytId = u.searchParams.get("v");
              } catch {}
              const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
              return (
                <TouchableOpacity style={styles.videoPreview} onPress={() => openExternal(r.video_url)} testID="open-video-btn" activeOpacity={0.85}>
                  {thumbUrl ? (
                    // @ts-ignore — Image import in scope via react-native default
                    <Image source={{ uri: thumbUrl }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="videocam" size={44} color="#fff" />
                    </View>
                  )}
                  <View style={styles.playOverlay}>
                    <View style={styles.playCircle}>
                      <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
                    </View>
                  </View>
                  <View style={styles.videoFooter}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.videoFooterTitle}>▶ Regarder la vidéo</Text>
                      <Text style={styles.videoFooterSub}>S'ouvre dans YouTube</Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color="#fff" />
                  </View>
                </TouchableOpacity>
              );
            })()}
            {r.duration_sec ? <Text style={styles.duration}>Durée : {Math.floor(r.duration_sec / 60)} min</Text> : null}
          </View>
        )}

        {/* FICHE */}
        {r.type === "fiche" && r.content_md && (
          <View style={styles.fiche}>
            <Markdown content={r.content_md} />
          </View>
        )}

        {/* QUIZ */}
        {r.type === "quiz" && r.questions && (
          <View style={styles.quiz}>
            {!result ? (
              <>
                {r.questions.map((q: any, qi: number) => (
                  <View key={qi} style={styles.qCard}>
                    <Text style={styles.qText}>{qi + 1}. {q.question}</Text>
                    {q.options.map((opt: string, oi: number) => {
                      const selected = answers[qi] === oi;
                      return (
                        <TouchableOpacity
                          key={oi}
                          style={[styles.opt, selected && styles.optSelected]}
                          onPress={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                          testID={`quiz-q${qi}-opt${oi}`}
                        >
                          <View style={[styles.optDot, selected && { backgroundColor: "#7C3AED", borderColor: "#7C3AED" }]}>
                            {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                          </View>
                          <Text style={[styles.optText, selected && { fontWeight: "800", color: "#5B21B6" }]}>{opt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
                <TouchableOpacity style={styles.submit} onPress={submitQuiz} disabled={submitting} testID="quiz-submit">
                  {submitting ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color="#fff" />
                      <Text style={styles.submitText}>Valider mes réponses</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.resultWrap}>
                <View style={[styles.scoreBadge, { backgroundColor: result.score_pct >= 70 ? "#10B981" : result.score_pct >= 40 ? "#F59E0B" : "#DC2626" }]}>
                  <Text style={styles.scoreValue}>{result.score_pct}%</Text>
                  <Text style={styles.scoreLabel}>{result.correct_count} / {result.total} bonnes réponses</Text>
                </View>
                {result.results.map((rr: any, i: number) => (
                  <View key={i} style={[styles.reviewCard, { borderLeftColor: rr.correct ? "#10B981" : "#DC2626" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name={rr.correct ? "checkmark-circle" : "close-circle"} size={18} color={rr.correct ? "#10B981" : "#DC2626"} />
                      <Text style={styles.reviewQ} numberOfLines={3}>{i + 1}. {rr.question}</Text>
                    </View>
                    {!rr.correct && (
                      <Text style={styles.reviewCorrect}>Réponse attendue : option {rr.correct_index + 1}</Text>
                    )}
                    {rr.explication ? <Text style={styles.reviewExpl}>💡 {rr.explication}</Text> : null}
                  </View>
                ))}
                <TouchableOpacity style={styles.retryBtn} onPress={resetQuiz}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.submitText}>Refaire le quiz</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Mini renderer markdown sans dépendance
function Markdown({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/);
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.startsWith("# ")) return <Text key={i} style={mdStyles.h1}>{b.substring(2)}</Text>;
        if (b.startsWith("## ")) return <Text key={i} style={mdStyles.h2}>{b.substring(3)}</Text>;
        if (b.startsWith("### ")) return <Text key={i} style={mdStyles.h3}>{b.substring(4)}</Text>;
        if (b.startsWith("> ")) return (
          <View key={i} style={mdStyles.quote}>
            <Text style={mdStyles.quoteText}>{renderInline(b.substring(2))}</Text>
          </View>
        );
        if (/^(\s*[-*]\s)/.test(b) || /^(\s*\d+\.\s)/.test(b)) {
          const lines = b.split("\n").filter(Boolean);
          return (
            <View key={i} style={{ marginVertical: 6 }}>
              {lines.map((ln, j) => {
                const ordered = /^\s*\d+\.\s/.test(ln);
                const bullet = ordered ? `${j + 1}.` : "•";
                const text = ln.replace(/^(\s*[-*]\s|\s*\d+\.\s)/, "");
                return (
                  <View key={j} style={mdStyles.liRow}>
                    <Text style={mdStyles.liBullet}>{bullet}</Text>
                    <Text style={mdStyles.liText}>{renderInline(text)}</Text>
                  </View>
                );
              })}
            </View>
          );
        }
        return <Text key={i} style={mdStyles.p}>{renderInline(b)}</Text>;
      })}
    </View>
  );
}

// Inline bold **text** rendering — returns string if no bold, array otherwise
function renderInline(text: string): any {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) => i % 2 === 1 ? <Text key={i} style={{ fontWeight: "800" }}>{p}</Text> : <Text key={i}>{p}</Text>);
}

const mdStyles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, marginTop: 8 },
  h2: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8, marginTop: 14 },
  h3: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6, marginTop: 10 },
  p: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22, marginBottom: 8 },
  liRow: { flexDirection: "row", gap: 8, marginBottom: 4, paddingLeft: 4 },
  liBullet: { fontSize: 14, color: COLORS.primary, fontWeight: "800", minWidth: 18 },
  liText: { flex: 1, fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  quote: { borderLeftWidth: 3, borderLeftColor: COLORS.primary, paddingLeft: 12, paddingVertical: 8, backgroundColor: "#F9FAFB", borderRadius: 4, marginVertical: 8 },
  quoteText: { fontSize: 14, color: COLORS.textSecondary, fontStyle: "italic", lineHeight: 21 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, flex: 1, textAlign: "center" },
  likeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  hero: { margin: SPACING.lg, padding: 18, borderRadius: RADIUS.lg, alignItems: "center", gap: 6 },
  heroTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 8, textAlign: "center" },
  heroDesc: { color: "rgba(255,255,255,0.92)", fontSize: 13, textAlign: "center", lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  metaBadge: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  metaText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  authorText: { color: "rgba(255,255,255,0.85)", fontSize: 11 },

  videoWrap: { paddingHorizontal: SPACING.lg },
  videoPreview: { borderRadius: 14, overflow: "hidden", backgroundColor: "#000" },
  thumb: { width: "100%", height: 200, backgroundColor: "#222" },
  playOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: 200, alignItems: "center", justifyContent: "center" },
  playCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(220,38,38,0.92)", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  videoFooter: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: COLORS.primary },
  videoFooterTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  videoFooterSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  videoFallback: { height: 180, borderRadius: 12, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", gap: 10 },
  extBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  extBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  duration: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, textAlign: "center" },

  fiche: { padding: SPACING.lg },

  quiz: { padding: SPACING.lg, gap: 14 },
  qCard: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  qText: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, lineHeight: 20 },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: RADIUS.sm, marginBottom: 6, borderWidth: 1.5, borderColor: COLORS.border },
  optSelected: { backgroundColor: "#F3E8FF", borderColor: "#7C3AED" },
  optDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  optText: { flex: 1, fontSize: 13, color: COLORS.textPrimary, lineHeight: 18 },
  submit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#7C3AED", paddingVertical: 14, borderRadius: 999 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  resultWrap: { gap: 12 },
  scoreBadge: { alignItems: "center", padding: 20, borderRadius: RADIUS.lg, gap: 6 },
  scoreValue: { fontSize: 42, fontWeight: "800", color: "#fff" },
  scoreLabel: { fontSize: 13, color: "#fff", opacity: 0.92 },
  reviewCard: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4, gap: 6 },
  reviewQ: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },
  reviewCorrect: { fontSize: 12, color: "#DC2626", fontWeight: "700", marginLeft: 24 },
  reviewExpl: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 24, fontStyle: "italic", lineHeight: 18 },
  retryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 999, marginTop: 8 },
});
