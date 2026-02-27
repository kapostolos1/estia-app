// src/screens/AuthStartScreen.js

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabase";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { FontAwesome } from "@expo/vector-icons";
import { t } from "../i18n";

WebBrowser.maybeCompleteAuthSession();

const LOGO = require("../../assets/logo.png");

function parseParamsFromUrl(url) {
  if (!url) return {};

  const qIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");

  const queryPart =
    qIndex >= 0
      ? url.slice(qIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";

  const hashPart = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";

  const all = [queryPart, hashPart].filter(Boolean).join("&");
  const out = {};

  all.split("&").forEach((kv) => {
    const [k, v] = kv.split("=");
    if (!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  });

  return out;
}

export default function AuthStartScreen({ navigation }) {
  const [loading, setLoading] = useState(false);

  // ✅ Modal πριν το OAuth
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [pendingProvider, setPendingProvider] = useState(null); // "google" | "apple" | null

  // πρέπει να υπάρχει στο Supabase Redirect URLs:
  // estiaapp://auth/callback
  const redirectTo = Linking.createURL("auth/callback");

  async function completeOAuthFromReturnUrl(returnUrl) {
    const p = parseParamsFromUrl(returnUrl);

    // ✅ CASE A: PKCE flow => ?code=...
    if (p.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(returnUrl);
      if (error) throw error;
      return true;
    }

    // ✅ CASE B: Implicit flow => #access_token=...&refresh_token=...
    if (p.access_token && p.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token,
      });
      if (error) throw error;
      return true;
    }

    throw new Error("OAuth returned without code and without tokens. Please try again.");
  }

  // ✅ Προ-έλεγχος invite (πριν το OAuth): αν είναι λάθος, δεν ξεκινάμε καν
  async function precheckInviteOrThrow() {
    const code = (inviteCode || "").trim();
    if (!code) return;

    const { data: ok, error } = await supabase.rpc("check_staff_invite_code", {
      p_code: code,
    });

    if (error) throw error;

    if (!ok) {
      // δεν συνεχίζουμε σε OAuth
      throw new Error(t("invite.invalidOrUsed"));
    }
  }

  // ✅ Μετά το OAuth: αν υπάρχει invite, κάνε accept. Αν αποτύχει -> sign out local
  async function applyInviteAfterOAuthOrThrow() {
    const code = (inviteCode || "").trim();
    if (!code) {
      // owner default (προαιρετικό: γράψε signup_type=owner)
      try {
        const { data: u } = await supabase.auth.getUser();
        const userId = u?.user?.id;
        if (userId) {
          await supabase.from("profiles").update({ signup_type: "owner" }).eq("id", userId);
        }
      } catch (_) {}
      return;
    }

    const { error: eAcc } = await supabase.rpc("accept_staff_invite", {
      p_code: code,
    });
    if (eAcc) throw eAcc;

    // προαιρετικό: γράψε και στο profile
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (userId) {
        const { error: eUp } = await supabase
          .from("profiles")
          .update({ signup_type: "staff", invite_code: code })
          .eq("id", userId);
        if (eUp) throw eUp;
      }
    } catch (_) {}
  }

  async function startOAuth(provider) {
    if (loading) return;
    setLoading(true);

    try {
      // ✅ αν έβαλε invite code, το ελέγχουμε ΠΡΙΝ ανοίξει το Google/Apple
      await precheckInviteOrThrow();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,

          // ✅ Google: να σε ρωτάει ποιο account (select_account)
          queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      if (!data?.url) {
        Alert.alert("Error", "No OAuth URL returned.");
        return;
      }

      // ✅ Ανοίγει in-app browser και επιστρέφει με estiaapp://auth/callback...
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (res.type !== "success" || !res.url) {
        // user cancelled / dismissed
        return;
      }

      // ✅ Φτιάχνει session (exchange code ή setSession)
      await completeOAuthFromReturnUrl(res.url);

      // ✅ ΜΟΝΟ ΑΥΤΟ: αν υπάρχει invite -> accept staff
      const code = (inviteCode || "").trim();
      if (code) {
        const { error: eAcc } = await supabase.rpc("accept_staff_invite", {
          p_code: code,
        });

        if (eAcc) {
          // ❌ δεν θέλουμε να μείνει logged-in σαν owner κατά λάθος
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch (_) {}

          Alert.alert(t("common.errorTitle"), eAcc.message || t("invite.invalidOrUsed"));
          return;
        }
      }

    // ✅ καθάρισε input
    setInviteCode("");

    // εδώ δεν χρειάζεται navigation — το App.js guard με session θα σε πάει Home
  } catch (e) {
    Alert.alert(t("common.errorTitle"), e?.message || "OAuth failed");
  } finally {
    setLoading(false);
  }
}

  function openInviteModal(provider) {
    if (loading) return;
    setPendingProvider(provider);
    setRoleModalOpen(true);
  }

  async function continueFromModal() {
    const provider = pendingProvider;
    setRoleModalOpen(false);

    if (!provider) return;
    await startOAuth(provider);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Estia Appointments</Text>
        <Text style={styles.subtitle}>{t("login.tagline")}</Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [
            styles.googleBtn,
            (pressed || loading) && { opacity: 0.85 },
          ]}
          onPress={() => openInviteModal("google")}
          disabled={loading}
        >
          <FontAwesome name="google" size={20} color="#000" />
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.emailBtn, pressed && { opacity: 0.9 }]}
          onPress={() => navigation.navigate("Login")}
          disabled={loading}
        >
          <FontAwesome name="envelope" size={18} color="#D1FAE5" />
          <Text style={styles.emailText}>Continue with Email</Text>
        </Pressable>

        {Platform.OS === "ios" && (
          <Pressable
            style={({ pressed }) => [
              styles.appleBtn,
              (pressed || loading) && { opacity: 0.85 },
            ]}
            onPress={() => openInviteModal("apple")}
            disabled={loading}
          >
            <FontAwesome name="apple" size={20} color="#fff" />
            <Text style={styles.appleText}>Continue with Apple</Text>
          </Pressable>
        )}

        <Text style={styles.legal}>
          By continuing you agree to the Terms of Service and Privacy Policy.
        </Text>
      </View>

      {/* ✅ Modal: Invite πριν το OAuth */}
      <Modal
        visible={roleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("oauthInvite.title")}</Text>
            <Text style={styles.modalText}>{t("oauthInvite.text")}</Text>

            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder={t("oauthInvite.placeholder")}
              placeholderTextColor="#9FE6C1"
              autoCapitalize="none"
              style={styles.modalInput}
              editable={!loading}
            />

            <View style={styles.modalBtnsRow}>
              <Pressable
                style={[
                  styles.modalBtn,
                  { backgroundColor: "#22C55E" },
                  loading && { opacity: 0.75 },
                ]}
                onPress={continueFromModal}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ fontWeight: "900", color: "#052016" }}>
                    {t("common.continue")}
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={[
                  styles.modalBtn,
                  { backgroundColor: "#0F3A27" },
                  loading && { opacity: 0.75 },
                ]}
                onPress={() => setRoleModalOpen(false)}
                disabled={loading}
              >
                <Text style={{ fontWeight: "900", color: "#D1FAE5" }}>
                  {t("common.cancel")}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.modalHint}>
              {t("oauthInvite.hint")}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const BG = "#0c3224";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    padding: 20,
    justifyContent: "center",
  },
  header: { alignItems: "center", marginBottom: 22 },
  logo: { width: 170, height: 170, marginBottom: 10 },
  title: { fontSize: 28, fontWeight: "900", color: "#fff" },
  subtitle: {
    marginTop: 6,
    color: "#D1FAE5",
    opacity: 0.95,
    textAlign: "center",
  },

  buttons: { gap: 12 },

  googleBtn: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleText: { color: "#000", fontWeight: "900", fontSize: 16 },

  emailBtn: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emailText: { color: "#D1FAE5", fontWeight: "900", fontSize: 16 },

  appleBtn: {
    backgroundColor: "#000",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  appleText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  legal: {
    marginTop: 10,
    textAlign: "center",
    color: "#D1FAE5",
    opacity: 0.7,
    fontSize: 12,
  },

  // ✅ Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  modalText: { color: "#D1FAE5", marginTop: 6, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    borderRadius: 12,
    padding: 12,
    color: "#fff",
    backgroundColor: "#062417",
  },
  modalBtnsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  modalHint: {
    marginTop: 10,
    color: "#D1FAE5",
    opacity: 0.8,
    fontSize: 12,
    textAlign: "center",
  },
});