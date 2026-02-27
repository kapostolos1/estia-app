// src/screens/SmsTemplateScreen.js
import React, { useMemo, useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from "react-native";
import { useSettings } from "../store/settingsStore";
import { t } from "../i18n";
import { useLanguage } from "../i18n/LanguageProvider";

function formatDateGR(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function formatTimeGR(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}
function renderPreview(tpl) {
  const now = new Date();
  const sample = {
    NAME: "Γιώργος Παπαδόπουλος",
    DATE: formatDateGR(now),
    TIME: formatTimeGR(now),
  };

  return (tpl || "")
    .replaceAll("{NAME}", sample.NAME)
    .replaceAll("{DATE}", sample.DATE)
    .replaceAll("{TIME}", sample.TIME);
}

export default function SmsTemplateScreen({ navigation }) {
  const { lang } = useLanguage();

  const {
    ready,
    smsTemplateEl,
    smsTemplateEn,
    saveSmsTemplateForLang,
    DEFAULT_TEMPLATE_EL,
    DEFAULT_TEMPLATE_EN,
  } = useSettings();

  const defaultTpl = lang === "en" ? DEFAULT_TEMPLATE_EN : DEFAULT_TEMPLATE_EL;
  const currentTpl = lang === "en" ? smsTemplateEn : smsTemplateEl;

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setText(currentTpl && currentTpl.trim() ? currentTpl : defaultTpl);
  }, [ready, currentTpl, defaultTpl]);

  const preview = useMemo(() => renderPreview(text), [text]);

  async function onSave() {
    const next = (text || "").trim();
    if (!next) {
      Alert.alert(t("errors.errorTitle"), t("smsTemplate.errors.emptyTemplate"));
      return;
    }

    setSaving(true);
    try {
      await saveSmsTemplateForLang(lang, next);
      Alert.alert(t("common.ok"), t("smsTemplate.saved"));
      if (navigation?.canGoBack?.()) navigation.goBack();
    } catch (e) {
      Alert.alert(t("errors.errorTitle"), e?.message || t("smsTemplate.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function onReset() {
    Alert.alert(t("smsTemplate.resetTitle"), t("smsTemplate.resetText"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("smsTemplate.resetYes"),
        style: "destructive",
        onPress: () => setText(defaultTpl),
      },
    ]);
  }

  if (!ready) {
    return (
      <View style={styles.container}>
        <Text style={{ color: "#D1FAE5" }}>{t("common.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t("smsTemplate.title")}</Text>

      <View style={styles.box}>
        <Text style={styles.label}>{t("smsTemplate.tagsLabel")}</Text>
        <Text style={styles.tags}>{"{NAME}  {DATE}  {TIME}"}</Text>

        <Text style={[styles.label, { marginTop: 12 }]}>{t("smsTemplate.textLabel")}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.input}
          placeholder={t("smsTemplate.placeholder")}
          placeholderTextColor="#9FE6C1"
          multiline
          textAlignVertical="top"
        />

        <Text style={[styles.label, { marginTop: 12 }]}>{t("smsTemplate.previewLabel")}</Text>
        <View style={styles.previewBox}>
          <Text style={styles.previewText}>{preview || "—"}</Text>
        </View>

        <View style={styles.row}>
          <Pressable
            style={[styles.btn, { backgroundColor: "#0F3A27" }, saving && { opacity: 0.7 }]}
            onPress={onReset}
            disabled={saving}
          >
            <Text style={styles.btnTextLight}>{t("smsTemplate.resetBtn")}</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, { backgroundColor: "#22C55E" }, saving && { opacity: 0.7 }]}
            onPress={onSave}
            disabled={saving}
          >
            <Text style={styles.btnTextDark}>
              {saving ? t("smsTemplate.saving") : t("smsTemplate.saveBtn")}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>{t("smsTemplate.hint")}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#0c3224" },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 12 },

  box: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 14,
    padding: 14,
  },

  label: { color: "#D1FAE5", fontWeight: "900" },
  tags: { color: "#9FE6C1", marginTop: 6, fontWeight: "900" },

  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    color: "#fff",
    borderRadius: 12,
    padding: 12,
    minHeight: 160,
  },

  previewBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    borderRadius: 12,
    padding: 12,
  },
  previewText: { color: "#D1FAE5", lineHeight: 20 },

  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },

  btnTextLight: { color: "#D1FAE5", fontWeight: "900" },
  btnTextDark: { color: "#052016", fontWeight: "900" },

  hint: { marginTop: 12, color: "#9FE6C1", fontSize: 12 },
});




