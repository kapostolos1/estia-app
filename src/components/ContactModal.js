// src/components/ContactModal.js
import React, { useMemo } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Linking, Alert } from "react-native";

/**
 * Professional contact modal (bilingual-ready) — NO Clipboard (no native modules needed)
 *
 * Usage:
 * <ContactModal
 *   visible={contactOpen}
 *   onClose={() => setContactOpen(false)}
 *   email="estiaappointments@gmail.com"
 *   phone="+306946690119"
 *   appName="Estia Appointments"
 *   labels={{
 *     title: t("contact.title"),
 *     subtitle: t("contact.subtitle"),
 *     emailLabel: t("contact.emailLabel"),
 *     phoneLabel: t("contact.phoneLabel"),
 *     sendEmail: t("contact.sendEmail"),
 *     call: t("contact.call"),
 *     close: t("common.close"),
 *     noEmailAppTitle: t("contact.noEmailAppTitle"),
 *     noEmailAppMsg: t("contact.noEmailAppMsg"),
 *     noCallTitle: t("contact.noCallTitle"),
 *     noCallMsg: t("contact.noCallMsg"),
 *     emailHint: t("contact.emailHint"),
 *     phoneHint: t("contact.phoneHint"),
 *     subject: t("contact.subject"), // optional
 *     body: t("contact.body"),       // optional
 *   }}
 * />
 */

export default function ContactModal({
  visible,
  onClose,
  email,
  phone,
  appName = "Estia Appointments",
  labels,
}) {
  const L = labels || {};

  const subject = useMemo(() => {
    const text = L.subject ?? `[${appName}] Support`;
    return encodeURIComponent(text);
  }, [L.subject, appName]);

  const body = useMemo(() => {
    const text =
      L.body ??
      `Hello,\n\nI need help with:\n\n(write here)\n\n---\nInfo:\nUser email:\nDevice:\nApp version:\n`;
    return encodeURIComponent(text);
  }, [L.body]);

  async function openEmail() {
    if (!email) {
      Alert.alert(L.missingEmailTitle ?? "Missing email", L.missingEmailMsg ?? "No support email set.");
      return;
    }
    const url = `mailto:${email}?subject=${subject}&body=${body}`;
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert(
        L.noEmailAppTitle ?? "No email app found",
        L.noEmailAppMsg ?? "Please set up an email account on your device."
      );
      return;
    }
    Linking.openURL(url);
  }

  async function openPhone() {
    if (!phone) {
      Alert.alert(L.missingPhoneTitle ?? "Missing phone", L.missingPhoneMsg ?? "No phone number set.");
      return;
    }
    const url = `tel:${phone}`;
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert(L.noCallTitle ?? "Calling not supported", L.noCallMsg ?? "This device cannot place calls.");
      return;
    }
    Linking.openURL(url);
  }

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tap outside to close */}
      <Pressable style={s.backdrop} onPress={onClose} />

      <View style={s.sheet}>
        <Text style={s.title}>{L.title ?? "Επικοινωνία"}</Text>
        <Text style={s.sub}>{L.subtitle ?? "Διάλεξε τρόπο επικοινωνίας με την υποστήριξη."}</Text>

        {/* EMAIL */}
        <View style={s.card}>
          <Text style={s.label}>{L.emailLabel ?? "Email"}</Text>

          {/* Tap on email => opens email app */}
          <Pressable onPress={openEmail} hitSlop={10}>
            <Text style={[s.value, s.valueLink]} numberOfLines={1}>
              {email || "-"}
            </Text>
          </Pressable>

          {!!L.emailHint && <Text style={s.hint}>{L.emailHint}</Text>}

          <View style={s.row}>
            <Pressable style={s.btn} onPress={openEmail}>
              <Text style={s.btnText}>{L.sendEmail ?? "Στείλε email"}</Text>
            </Pressable>
          </View>
        </View>

        {/* PHONE */}
        <View style={s.card}>
          <Text style={s.label}>{L.phoneLabel ?? "Τηλέφωνο"}</Text>

          {/* Tap on phone number => opens dialer */}
          <Pressable onPress={openPhone} hitSlop={10}>
            <Text style={[s.value, s.valueLink]}>{phone || "-"}</Text>
          </Pressable>

          {!!L.phoneHint && <Text style={s.hint}>{L.phoneHint}</Text>}

          <View style={s.row}>
            <Pressable style={s.btn} onPress={openPhone}>
              <Text style={s.btnText}>{L.call ?? "Κλήση"}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={s.close} onPress={onClose}>
          <Text style={s.closeText}>{L.close ?? "Κλείσιμο"}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },

  sheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: "#0c1f17",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  title: { color: "white", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.75)", marginTop: 6, marginBottom: 12 },

  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  label: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  value: { color: "white", fontSize: 16, fontWeight: "700", marginTop: 4 },
  valueLink: { textDecorationLine: "underline" },

  hint: { color: "rgba(255,255,255,0.6)", marginTop: 6, fontSize: 12 },

  row: { flexDirection: "row", gap: 10, marginTop: 10 },

  btn: {
    flex: 1,
    backgroundColor: "#1f8a5b",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "800" },

  close: { marginTop: 14, paddingVertical: 12, alignItems: "center" },
  closeText: { color: "rgba(255,255,255,0.8)", fontWeight: "700" },
});