// src/components/SubscriptionBanner.js

import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { t } from "../i18n";
import { useSubscriptionIAP } from "./SubscriptionIAPManager";

export default function SubscriptionBanner({ access }) {
  const { startFlow, busy, roleReady } = useSubscriptionIAP();

  const isGrace = String(access?.status || "").toLowerCase() === "grace";
  const isExpired = String(access?.status || "").toLowerCase() === "expired";

  // 👉 εμφανίζεται ΜΟΝΟ όταν έχει λήξει (grace ή expired)
  if (!isGrace && !isExpired) return null;

  const title = isGrace
    ? (t("subscription.expiredTitleGrace") || t("sub.expiredTitle") || "Η συνδρομή έληξε")
    : (t("subscription.expiredTitleLocked") || t("sub.expiredTitle") || "Η συνδρομή έληξε");

  const text = isGrace
    ? (t("subscription.expiredBannerGrace") ||
        "Η συνδρομή έληξε. Για λίγες ώρες μπορείτε ακόμη να προσθέτετε νέα ραντεβού, αλλά χρειάζεται ανανέωση.")
    : (t("subscription.expiredBannerLocked") ||
        "Η συνδρομή έληξε. Κάντε ανανέωση για να ξεκλειδώσει η προσθήκη νέων ραντεβού.");

  const btnLabel = t("sub.renew") || "Ανανέωση";

  const disabled = busy || !roleReady;

  return (
    <View style={[styles.wrap, isGrace ? styles.wrapGrace : styles.wrapExpired]}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={[styles.title, isGrace && styles.titleGrace]}>{title}</Text>
        <Text style={[styles.text, styles.textExpired]}>{text}</Text>
      </View>

      <Pressable
        style={[styles.btn, disabled && styles.btnDisabled]}
        onPress={startFlow}
        disabled={disabled}
      >
        {busy ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text style={styles.btnText}>{t("common.loading") || "Φόρτωση..."}</Text>
          </View>
        ) : (
          <Text style={styles.btnText}>{btnLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  // 🟠 GRACE (ήπιο)
  wrapGrace: {
    backgroundColor: "#2A1C0E",
    borderColor: "#F59E0B",
  },

  // 🔴 EXPIRED (κόκκινο)
  wrapExpired: {
    backgroundColor: "#2A0E0E",
    borderColor: "#F04438",
  },

  title: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 2,
    color: "#F04438",
  },

  titleGrace: {
    color: "#F59E0B",
  },

  text: {
    fontSize: 13,
  },

  textExpired: {
    color: "#FECACA",
  },

  btn: {
    backgroundColor: "#F04438",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },

  btnDisabled: {
    opacity: 0.5,
  },

  btnText: {
    color: "white",
    fontWeight: "600",
  },
});


