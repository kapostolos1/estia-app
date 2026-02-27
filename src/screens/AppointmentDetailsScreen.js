// src/screens/AppointmentDetailsScreen.js
import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLanguage } from "../i18n/LanguageProvider";
import * as SMS from "expo-sms";
import { useAppointments } from "../store/appointmentsStore";
import { useSettings } from "../store/settingsStore";
import { t } from "../i18n";
import { weekdayFromDate } from "../utils/weekday";
function digitsOnly(s) {
  return (s || "").replace(/\D/g, "");
}

function formatDateDDMMYYYY(input) {
  const d = digitsOnly(input).slice(0, 8);
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  let out = dd;
  if (mm.length) out += "-" + mm;
  if (yyyy.length) out += "-" + yyyy;
  return out;
}

function formatTimeHHMM(input) {
  const t0 = digitsOnly(input).slice(0, 4);
  const hh = t0.slice(0, 2);
  const mm = t0.slice(2, 4);
  let out = hh;
  if (mm.length) out += ":" + mm;
  return out;
}

function parseDateTime(dateText, timeText) {
  const d = digitsOnly(dateText); // DDMMYYYY
  const t0 = digitsOnly(timeText); // HHMM
  if (d.length !== 8 || t0.length !== 4) return null;

  const dd = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const yyyy = Number(d.slice(4, 8));
  const hh = Number(t0.slice(0, 2));
  const min = Number(t0.slice(2, 4));

  if (dd < 1 || dd > 31) return null;
  if (mm < 1 || mm > 12) return null;
  if (yyyy < 2020 || yyyy > 2100) return null;
  if (hh < 0 || hh > 23) return null;
  if (min < 0 || min > 59) return null;

  const dt = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function formatDateTimeGR(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function dateToDDMMYYYY(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function timeToHHMM(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}


function isSameDayISO(iso, dateObj) {
  const d = new Date(iso);
  return (
    d.getFullYear() === dateObj.getFullYear() &&
    d.getMonth() === dateObj.getMonth() &&
    d.getDate() === dateObj.getDate()
  );
}

function parseDateOnly(dateText) {
  const d = digitsOnly(dateText);
  if (d.length !== 8) return null;
  const dd = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const yyyy = Number(d.slice(4, 8));
  if (dd < 1 || dd > 31) return null;
  if (mm < 1 || mm > 12) return null;
  if (yyyy < 2020 || yyyy > 2100) return null;
  const dt = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function formatTimeFromISO(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function renderSmsTemplate(tpl, item) {
  return (tpl || "")
    .replaceAll("{NAME}", item?.name || "")
    .replaceAll("{DATE}", dateToDDMMYYYY(item?.startsAt))
    .replaceAll("{TIME}", timeToHHMM(item?.startsAt));
}

export default function AppointmentDetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const { appointments, updateAppointment, deleteAppointment } = useAppointments();
  const { lang } = useLanguage();

  const {
    smsTemplateEl,
    smsTemplateEn,
    DEFAULT_TEMPLATE_EL,
    DEFAULT_TEMPLATE_EN,
  } = useSettings();

  const item = useMemo(() => appointments.find((a) => a.id === id), [appointments, id]);

  const [editing, setEditing] = useState(false);
  const [newDate, setNewDate] = useState(item ? dateToDDMMYYYY(item.startsAt) : "");
  const [newTime, setNewTime] = useState(item ? timeToHHMM(item.startsAt) : "");

  const weekdayCurrent = useMemo(() => (item ? weekdayFromDate(new Date(item.startsAt)) : ""), [item]);
  const selectedDateObj = useMemo(() => parseDateOnly(newDate), [newDate]);
  const weekdayNew = useMemo(() => weekdayFromDate(selectedDateObj), [selectedDateObj]);


  const bookedTimes = useMemo(() => {
    if (!selectedDateObj) return [];
    const list = appointments
      .filter((a) => a.id !== item?.id) // ✅ μην μετράει το ίδιο ραντεβού
      .filter((a) => a.status !== "cancelled")
      .filter((a) => isSameDayISO(a.startsAt, selectedDateObj))
      .map((a) => formatTimeFromISO(a.startsAt))
      .sort((a, b) => a.localeCompare(b));
    return Array.from(new Set(list));
  }, [appointments, selectedDateObj, item?.id]);

  if (!item) {
    return (
      <View style={styles.container}>
        <Text style={{ color: "#fff" }}>{t("details.notFound")}</Text>
      </View>
    );
  }

  async function sendSms() {
    const available = await SMS.isAvailableAsync();
    if (!available) {
      Alert.alert(t("details.smsTitle"), t("details.smsNotSupported"));
      return;
    }

    const tpl =
      lang === "en"
        ? (smsTemplateEn?.trim() ? smsTemplateEn : DEFAULT_TEMPLATE_EN)
        : (smsTemplateEl?.trim() ? smsTemplateEl : DEFAULT_TEMPLATE_EL);

    const message = renderSmsTemplate(tpl, item);

    await SMS.sendSMSAsync([item.phone], message);
  }


  async function applyNewDateTime() {
    if (digitsOnly(newDate).length !== 8) {
      Alert.alert(t("details.errTitle"), t("details.errDateFull"));
      return;
    }
    if (digitsOnly(newTime).length !== 4) {
      Alert.alert(t("details.errTitle"), t("details.errTimeFull"));
      return;
    }

    const updated = parseDateTime(newDate, newTime);
    if (!updated) {
      Alert.alert(t("details.errTitle"), t("details.errUnknownDT", { dt: `${newDate} ${newTime}` }));
      return;
    }

    if (updated.getTime() <= Date.now()) {
      Alert.alert(t("details.errPastTitle"), t("details.errPastText"));
      return;
    }

    const conflict = appointments.some(
      (a) => a.id !== item.id && new Date(a.startsAt).getTime() === updated.getTime() && a.status !== "cancelled"
    );
    if (conflict) {
      Alert.alert(t("details.conflictTitle"), t("details.conflictText"));
      return;
    }

    try {
      await updateAppointment(item.id, { startsAt: updated.toISOString() });
      setEditing(false);
      Alert.alert(t("common.ok"), t("details.updatedOk"));
    } catch (e) {
      Alert.alert(t("details.errTitle"), e?.message || t("details.errGeneric"));
    }
  }

  function cancelAppointment() {
    Alert.alert(t("details.cancelTitle"), t("details.cancelConfirm"), [
      { text: t("details.no"), style: "cancel" },
      {
        text: t("details.yes"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAppointment(item.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert(t("details.errTitle"), e?.message || t("details.errGeneric"));
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.line}>
          {t("details.phoneLabel")}: {item.phone}
        </Text>
        <Text style={styles.line}>
          {t("details.datetimeLabel")}: {formatDateTimeGR(item.startsAt)}
        </Text>
        {!!weekdayCurrent && <Text style={styles.subInfo}>📅 {weekdayCurrent}</Text>}

        <Pressable style={styles.smsBtn} onPress={sendSms}>
          <Text style={styles.smsText}>{t("details.sendSms")}</Text>
        </Pressable>

        {!editing ? (
          <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
            <Text style={styles.editText}>{t("details.changeDatetime")}</Text>
          </Pressable>
        ) : (
          <View style={styles.editBox}>
            <Text style={styles.editLabel}>{t("details.newDateLabel")}</Text>
            <TextInput
              value={newDate}
              onChangeText={(v) => setNewDate(formatDateDDMMYYYY(v))}
              keyboardType="number-pad"
              maxLength={10}
              style={styles.input}
            />

            {!!weekdayNew && <Text style={styles.subInfo}>📅 {weekdayNew}</Text>}

            {selectedDateObj && (
              <View style={styles.bookedBox}>
                <Text style={styles.bookedTitle}>
                  {t("details.bookedTitle", { count: bookedTimes.length })}
                </Text>
                {bookedTimes.length === 0 ? (
                  <Text style={styles.bookedEmpty}>{t("details.bookedEmpty")}</Text>
                ) : (
                  <Text style={styles.bookedTimes}>{bookedTimes.join(" • ")}</Text>
                )}
              </View>
            )}

            <Text style={[styles.editLabel, { marginTop: 10 }]}>{t("details.newTimeLabel")}</Text>
            <TextInput
              value={newTime}
              onChangeText={(v) => setNewTime(formatTimeHHMM(v))}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable style={[styles.smallBtn, { backgroundColor: "#22C55E" }]} onPress={applyNewDateTime}>
                <Text style={{ fontWeight: "900", color: "#052016" }}>{t("details.save")}</Text>
              </Pressable>
              <Pressable style={[styles.smallBtn, { backgroundColor: "#0F3A27" }]} onPress={() => setEditing(false)}>
                <Text style={{ fontWeight: "900", color: "#D1FAE5" }}>{t("details.cancel")}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Pressable style={styles.cancelBtn} onPress={cancelAppointment}>
          <Text style={styles.cancelText}>{t("details.cancelAppointment")}</Text>
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#0c3224" },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 10 },
  line: { color: "#D1FAE5", marginTop: 6, fontSize: 14 },
  subInfo: { color: "#9FE6C1", marginTop: 6, fontWeight: "800" },
  bookedBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    borderRadius: 12,
    padding: 12,
  },
  bookedTitle: { color: "#fff", fontWeight: "900", marginBottom: 6 },
  bookedEmpty: { color: "#9FE6C1" },
  bookedTimes: { color: "#D1FAE5", lineHeight: 20 },

  smsBtn: {
    marginTop: 18,
    backgroundColor: "#22C55E",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  smsText: { color: "#052016", fontWeight: "900", fontSize: 16 },

  editBtn: {
    marginTop: 12,
    backgroundColor: "#0F3A27",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  editText: { color: "#D1FAE5", fontWeight: "900" },

  editBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 12,
    padding: 12,
  },
  editLabel: { color: "#D1FAE5", marginBottom: 8, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    color: "#fff",
    borderRadius: 12,
    padding: 12,
  },
  smallBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center" },

  cancelBtn: {
    marginTop: 14,
    backgroundColor: "#7F1D1D",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelText: { color: "#fff", fontWeight: "900" },
});




