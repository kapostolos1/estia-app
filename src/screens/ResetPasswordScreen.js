import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { CommonActions } from "@react-navigation/native";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase";
import { t } from "../i18n";

function withTimeout(promise, ms, msg) {
  return new Promise((resolve, reject) => {
    const tmr = setTimeout(() => reject(new Error(msg)), ms);
    promise.then(
      (v) => {
        clearTimeout(tmr);
        resolve(v);
      },
      (e) => {
        clearTimeout(tmr);
        reject(e);
      }
    );
  });
}

export default function ResetPasswordScreen({ navigation, route }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [saving, setSaving] = useState(false);

  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const accessToken = route?.params?.access_token || null;
  const hasToken = useMemo(() => !!accessToken, [accessToken]);

  async function save() {
    if (saving) return;

    const a = (p1 || "").trim();
    const b = (p2 || "").trim();

    if (!hasToken) {
      Alert.alert(t("errors.errorTitle"), t("resetPass.missingLink"));
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Login", params: { cleanupRecovery: true } }],
        })
      );
      return;
    }

    if (a.length < 6) {
      Alert.alert(t("errors.errorTitle"), t("resetPass.passLen"));
      return;
    }

    if (a !== b) {
      Alert.alert(t("errors.errorTitle"), t("resetPass.noMatch"));
      return;
    }

    setSaving(true);
    try {

      const res = await withTimeout(
        fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ password: a }),
        }),
        20000,
        t("resetPass.timeoutRest")
      );

      const text = await res.text();
      

      if (!res.ok) {
        let msg = t("resetPass.failGeneric");
        try {
          const j = JSON.parse(text);
          msg = j?.msg || j?.message || msg;
        } catch (_) {}

        if (res.status === 401 || res.status === 403) {
          msg = t("resetPass.linkExpired");
        }
        throw new Error(msg);
      }

      // ✅ SUCCESS
      try {
        await withTimeout(supabase.auth.signOut(), 6000, t("resetPass.timeoutSignOut"));
      } catch (_) {}


      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Login" }],
        })
      );

      setTimeout(() => {
        Alert.alert(t("resetPass.readyTitle"), t("resetPass.readyText"));
      }, 300);
    } catch (e) {
      
      Alert.alert(t("errors.errorTitle"), e?.message || t("resetPass.failUnknown"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0c3224" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("resetPass.title")}</Text>

        <Text style={styles.label}>{t("resetPass.newPassLabel")}</Text>
        <View style={styles.inputRow}>
          <TextInput value={p1} onChangeText={setP1} secureTextEntry={!show1} style={styles.input} />
          <Pressable onPress={() => setShow1((s) => !s)} disabled={saving}>
            <Text style={styles.eye}>{show1 ? "🙈" : "👁️"}</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { marginTop: 12 }]}>{t("resetPass.confirmLabel")}</Text>
        <View style={styles.inputRow}>
          <TextInput value={p2} onChangeText={setP2} secureTextEntry={!show2} style={styles.input} />
          <Pressable onPress={() => setShow2((s) => !s)} disabled={saving}>
            <Text style={styles.eye}>{show2 ? "🙈" : "👁️"}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.btn} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.btnText}>{t("resetPass.save")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, justifyContent: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 18 },
  label: { color: "#D1FAE5", fontWeight: "800", marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: "#fff", paddingVertical: 12 },
  eye: { fontSize: 18, color: "#D1FAE5", paddingLeft: 8 },
  btn: {
    marginTop: 18,
    backgroundColor: "#22C55E",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#052016", fontWeight: "900", fontSize: 16 },
});





























