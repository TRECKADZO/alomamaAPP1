/**
 * ErrorBoundary React pour attraper les crashs de render (sinon l'app crashe entière).
 * Utile en particulier pour envelopper la carte native.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error) => void;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Caught:", error, info);
    if (this.props.onError) this.props.onError(error);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ScrollView contentContainerStyle={s.container}>
          <Ionicons name="warning" size={40} color="#DC2626" />
          <Text style={s.title}>Oups, un problème est survenu</Text>
          <Text style={s.msg}>
            Nous n&apos;avons pas pu afficher cette section. L&apos;équipe a été alertée.
          </Text>
          <Text style={s.err} numberOfLines={4}>{this.state.error?.message}</Text>
          <TouchableOpacity style={s.btn} onPress={this.reset}>
            <Text style={s.btnTxt}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={() => Linking.openURL("mailto:support@alomaman.dev")}>
            <Text style={[s.btnTxt, { color: "#7C3AED" }]}>Contacter le support</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FEF2F2", gap: 12 },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  msg: { color: "#64748B", fontSize: 13, textAlign: "center", lineHeight: 18 },
  err: { color: "#DC2626", fontSize: 10, fontFamily: "monospace", padding: 8, backgroundColor: "#FEE2E2", borderRadius: 8, marginTop: 4, textAlign: "center" },
  btn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: "#7C3AED", borderRadius: 8, marginTop: 8 },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#7C3AED" },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
