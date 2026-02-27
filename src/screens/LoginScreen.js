import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Modal,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabase";
import * as Linking from "expo-linking";
import { t } from "../i18n";
import { useLanguage } from "../i18n/LanguageProvider";
import { useSettings } from "../store/settingsStore";
const LOGO = require("../../assets/logo.png");
const FLAG_EL = require("../../assets/flags/el.png");
const FLAG_EN = require("../../assets/flags/en-uk.png");

// ✅ timeout helper
function withTimeout(promise, ms, msg) { 
    

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export default function LoginScreen({ navigation, route }) {
  const { refreshSmsTemplate } = useSettings();

async function changeLangAndRefresh(nextLang) {
  try {
    // changeLang συνήθως είναι async (γράφει storage)
    await changeLang(nextLang);

    // φόρτωσε ΣΙΓΟΥΡΑ το template της γλώσσας που πάτησες
    await refreshSmsTemplate(nextLang);
  } catch (e) {
    // optional: console.log(e)
  }
}

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const isLogin = mode === "login";

  // fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { lang, changeLang } = useLanguage();

  // signup fields
  const [fullName, setFullName] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  // UI
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ NEW: μπλοκάρει login μέχρι να καθαρίσει τυχόν recovery session
  const [authReady, setAuthReady] = useState(true);

  // Forgot password modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // ✅ κόβει διπλό πάτημα / διπλό submit
  const loginLock = useRef(false);

  const buttonText = useMemo(() => {
    if (loading) return t("common.loading");
    return isLogin ? t("login.login") : t("login.signup");
  }, [loading, isLogin, lang]); // 👈 πρόσθεσε και lang για live αλλαγή


  function goMode(nextMode) {
    setMode(nextMode);
    setShowPass(false);
    setPassword("");
    if (nextMode === "login") {
      setFullName("");
      setWorkPhone("");
      setInviteCode("");
    }
  }

  // ✅ helper: καθάρισε recovery session και περίμενε να σταθεροποιηθεί SIGNED_OUT
  async function ensureSignedOutStable() {
    const { data } = await withTimeout(
      supabase.auth.getSession(),
      4000,
      "Timeout στο getSession"
    );

    if (!data?.session) return;

    try {
      // local scope = καθαρίζει σίγουρα το storage στο κινητό
      await withTimeout(
        supabase.auth.signOut({ scope: "local" }),
        6000,
        "Timeout στο signOut"
      );
    } catch (_) {}

    const start = Date.now();
    while (Date.now() - start < 6000) {
      const { data: d2 } = await supabase.auth.getSession();
      if (!d2?.session) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // ✅ ΤΡΕΧΕΙ ΑΥΤΟΜΑΤΑ όταν ανοίγει το LoginScreen
  React.useEffect(() => {
    let alive = true;

    const shouldCleanup = route?.params?.cleanupRecovery === true;
    if (!shouldCleanup) return;

    (async () => {
      setAuthReady(false);
      try {
        await ensureSignedOutStable();
      } catch (_) {
        // ignore
      } finally {
        if (alive) setAuthReady(true);
        // καθάρισε το flag για να μη ξανατρέξει
        navigation.setParams?.({ cleanupRecovery: false });
      }
    })();

    return () => {
      alive = false;
    };
  }, [route?.params?.cleanupRecovery]);


  // ✅ βοηθητική: περιμένει να “δέσει” το business_id στο profiles
  async function waitForBusinessLink(timeoutMs = 8000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data?.business_id) return true;

      await new Promise((r) => setTimeout(r, 350));
    }

    return false;
  }

 // ✅ ΈΝΑ submit για login & signup
async function handleSubmit() {
  if (loginLock.current) return;
  loginLock.current = true;

  const mail = (email || "").trim().toLowerCase();
  const pass = password || "";

  if (!mail || !pass) {
    Alert.alert(t("errors.errorTitle"), t("errors.fillEmailPass"));
    loginLock.current = false;
    return;
  }
  if (!mail.includes("@")) {
    Alert.alert(t("errors.errorTitle"), t("errors.validEmail"));
    loginLock.current = false;
    return;
  }
  if (pass.length < 6) {
    Alert.alert(t("errors.errorTitle"), t("errors.passLen"));
    loginLock.current = false;
    return;
  }

  if (!isLogin) {
    if (!fullName.trim()) {
      Alert.alert(t("errors.errorTitle"), t("errors.fillName"));
      loginLock.current = false;
      return;
    }
    if (!workPhone.trim()) {
      Alert.alert(t("errors.errorTitle"), t("errors.fillPhone"));
      loginLock.current = false;
      return;
    }
  }

  setLoading(true);
  try {
    // ✅ LOGIN
    if (isLogin) {
      if (!authReady) {
        Alert.alert(t("errors.waitTitle"), t("errors.waitText"));
        return;
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: mail,
          password: pass,
        }),
        25000,
        "Timeout στη σύνδεση"
      );

      if (error) {
        Alert.alert(t("errors.errorTitle"), error.message);
        return;
      }

      // App.js guard θα σε πάει Home
      return;
    }

    // ✅ SIGNUP
    const code = (inviteCode || "").trim();
    const isStaff = !!code;

    if (isStaff) {
      const { data: ok, error: eCheck } = await withTimeout(
        supabase.rpc("check_staff_invite_code", { p_code: code }),
        15000,
        "Timeout στον έλεγχο κωδικού"
      );

      if (eCheck) {
        Alert.alert(t("errors.errorTitle"), eCheck.message);
        return;
      }
      if (!ok) {
        Alert.alert(t("invite.title"), t("invite.invalidOrUsed"));
        return;
      }
    }

      const { error: signErr } = await withTimeout(
        supabase.auth.signUp({
          email: mail,
          password: pass,
          options: {
            data: {
              signup_type: isStaff ? "staff" : "owner",
              invite_code: isStaff ? code : null,
              full_name: fullName.trim(),
              work_phone: workPhone.trim(),
            },
          },
        }),
        20000,
        "Timeout στο signUp"
      );

      if (signErr) {
        Alert.alert("Σφάλμα", signErr.message);
        return;
      }

      const { data: sess } = await withTimeout(
        supabase.auth.getSession(),
        10000,
        "Timeout στο getSession"
      );

      if (!sess?.session) {
        const { error: eLogin } = await withTimeout(
          supabase.auth.signInWithPassword({ email: mail, password: pass }),
          20000,
          "Timeout στη σύνδεση μετά το signUp"
        );

        if (eLogin) {
          Alert.alert("Σφάλμα", eLogin.message);
          return;
        }
      }

      if (isStaff) {
        const { error: e2 } = await withTimeout(
          supabase.rpc("accept_staff_invite", { p_code: code }),
          15000,
          "Timeout στο accept invite"
        );

        if (e2) {
          await supabase.auth.signOut({ scope: "local" });
          Alert.alert(
            t("login.inviteTitle"),
            t("login.inviteActivateFail")
          );
          return;
        }

        const ok = await withTimeout(
          waitForBusinessLink(8000),
          10000,
          "Timeout στο business link"
        );

        if (!ok) {
          await supabase.auth.signOut({ scope: "local" });
          Alert.alert(
            t("login.tempProblemTitle"),
            t("login.tempProblemText")
          );
          return;
        }

        Alert.alert(
          t("login.readyTitle"),
          t("login.staffReadyText")
        );
        } else {
        Alert.alert(
          t("login.readyTitle"),
          t("login.ownerReadyText")
        );
        }

        setPassword("");
        setInviteCode("");
        return;
        } catch (e) {
        Alert.alert(
          t("common.errorTitle"),
          e?.message || t("common.genericError")
        );
        } finally {
        setLoading(false);
        loginLock.current = false;
        }
        }

  async function handleResetPassword() {
  const mail = (resetEmail || "").trim().toLowerCase();

  if (!mail || !mail.includes("@")) {
    Alert.alert(
      t("common.errorTitle"),
      t("login.invalidEmail")
    );
    return;
  }

  setLoading(true);
  try {
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: "estiaapp://reset-password",
      }),
      15000,
      "Timeout στην αποστολή email επαναφοράς"
    );

    if (error) {
      Alert.alert(
        t("common.errorTitle"),
        error.message
      );
      return;
    }

    Alert.alert(
      t("login.resetSentTitle"),
      t("login.resetSentText"),
      [{ text: t("common.ok") }]
    );

    setResetOpen(false);
    setResetEmail("");
  } catch (e) {
    Alert.alert(
      t("common.errorTitle"),
      e?.message || t("common.genericError")
    );
  } finally {
    setLoading(false);
  }
}


 

  return (
  <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === "ios" ? "padding" : "height"}
  >
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.langRow}>
          <Pressable
            onPress={() => changeLangAndRefresh("el")}
            style={[styles.langPill, lang === "el" && styles.langPillActive]}
          >
            <Image source={FLAG_EL} style={styles.flag} />
          </Pressable>

          <Pressable
            onPress={() => changeLangAndRefresh("en")}
            style={[styles.langPill, lang === "en" && styles.langPillActive]}
          >
            <Image source={FLAG_EN} style={styles.flag} />
          </Pressable>

        </View>

        <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
        <Text style={styles.appName}>Estia Appointments</Text>
        <Text style={styles.tagline}>{t("login.tagline")}</Text>
      </View>

      <View style={styles.switchRow}>
        <Pressable
          onPress={() => goMode("login")}
          style={[styles.switchBtn, isLogin && styles.switchBtnActive]}
        >
          <Text style={[styles.switchText, isLogin && styles.switchTextActive]}>
            {t("login.login")}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => goMode("signup")}
          style={[styles.switchBtn, !isLogin && styles.switchBtnActive]}
        >
          <Text style={[styles.switchText, !isLogin && styles.switchTextActive]}>
            {t("login.signup")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        {!isLogin && (
          <>
            <TextInput
              placeholder={t("login.fullName")}
              placeholderTextColor="#9FE6C1"
              value={fullName}
              onChangeText={setFullName}
              style={styles.input}
            />

            <TextInput
              placeholder={t("login.workPhone")}
              placeholderTextColor="#9FE6C1"
              value={workPhone}
              onChangeText={setWorkPhone}
              keyboardType="phone-pad"
              style={styles.input}
            />

            <TextInput
              placeholder={t("login.inviteCode")}
              placeholderTextColor="#9FE6C1"
              value={inviteCode}
              onChangeText={setInviteCode}
              style={styles.input}
            />
          </>
        )}

        <TextInput
          placeholder={t("login.email")}
          placeholderTextColor="#9FE6C1"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />

        <View style={styles.passRow}>
          <TextInput
            placeholder={t("login.password")}
            placeholderTextColor="#9FE6C1"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
          />

          <Pressable
            onPress={() => setShowPass((v) => !v)}
            style={styles.eyeBtn}
            hitSlop={10}
            disabled={loading}
          >
            <Text style={styles.eyeText}>{showPass ? "🙈" : "👁"}</Text>
          </Pressable>
        </View>

        {isLogin && (
          <Pressable
            onPress={() => {
              setResetEmail(email);
              setResetOpen(true);
            }}
            disabled={loading}
          >
            <Text style={styles.forgot}>{t("login.forgot")}</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.button, loading && { opacity: 0.75 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.buttonText}>{buttonText}</Text>
          )}
        </Pressable>

        <Text style={styles.note}>
          {isLogin ? t("login.noteLogin") : t("login.noteSignup")}
        </Text>
      </View>

      <Modal
        visible={resetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setResetOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("login.resetTitle")}</Text>
            <Text style={styles.modalText}>{t("login.resetText")}</Text>

            <TextInput
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder={t("login.email")}
              placeholderTextColor="#9FE6C1"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable
                style={[
                  styles.smallBtn,
                  { backgroundColor: "#22C55E" },
                  loading && { opacity: 0.75 },
                ]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                <Text style={{ fontWeight: "900", color: "#052016" }}>
                  {t("login.send")}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.smallBtn,
                  { backgroundColor: "#0F3A27" },
                  loading && { opacity: 0.75 },
                ]}
                onPress={() => setResetOpen(false)}
                disabled={loading}
              >
                <Text style={{ fontWeight: "900", color: "#D1FAE5" }}>
                  {t("common.cancel")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  </KeyboardAvoidingView>
);


}

const ACCENT = "#22C55E";
const BG = "#0c3224";
const CARD = "#072A1C";

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: BG,
  },
  header: { alignItems: "center", marginBottom: 18 },
  logoImage: { width: 192, height: 192, marginBottom: 10 },
  appName: { fontSize: 28, fontWeight: "900", marginBottom: 6, color: "#fff" },
  tagline: { fontSize: 13, opacity: 0.95, textAlign: "center", color: "#D1FAE5" },
  
  langRow: {
  position: "absolute",
  top: -18,
  left: -9,
  flexDirection: "row",
  gap: 10,
  zIndex: 10,
},

  langPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    alignItems: "center",
    justifyContent: "center",
  },

  langPillActive: {
    borderColor: "#22C55E",
  },

  flag: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },

  // (προαιρετικό) αν θέλεις να “τονίζει” το ενεργό flag λίγο περισσότερο
  flagActive: {
    opacity: 1,
  },

  switchRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#0F3A27",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#062417",
  },
  switchBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  switchBtnActive: { backgroundColor: ACCENT },
  switchText: { fontSize: 14, fontWeight: "800", color: "#D1FAE5" },
  switchTextActive: { color: "#052016" },


  card: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    borderRadius: 16,
    padding: 16,
    backgroundColor: CARD,
  },

  input: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    color: "#fff",
    backgroundColor: "#062417",
  },

  passRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  eyeBtn: {
    width: 52,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    alignItems: "center",
    justifyContent: "center",
  },
  eyeText: { fontSize: 18, color: "#D1FAE5" },

  forgot: {
    color: "#9FE6C1",
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 10,
  },

  button: {
    backgroundColor: ACCENT,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 2,
  },
  buttonText: { color: "#052016", fontSize: 16, fontWeight: "900" },

  note: {
    marginTop: 12,
    fontSize: 12,
    opacity: 0.95,
    textAlign: "center",
    color: "#D1FAE5",
  },

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

  smallBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
});














