// src/screens/AppointmentDetailsScreen.js
import { useMemo, useState, useEffect } from "react";
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
  Modal,
  PixelRatio,
} from "react-native";
import { useLanguage } from "../i18n/LanguageProvider";
import * as SMS from "expo-sms";
import { useAppointments } from "../store/appointmentsStore";
import { useSettings } from "../store/settingsStore";
import { t } from "../i18n";
import { weekdayFromDate } from "../utils/weekday";

// ---------- helpers ----------
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
  if (!dateObj) return false;
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

// ---- calendar helpers (ίδιο με NewAppointment) ----
function pad2(n) {
  return String(n).padStart(2, "0");
}
function keyFromDateObj(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function ddmmyyyyFromDateObj(d) {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}
function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
function mondayFirstIndex(jsDay) {
  return (jsDay + 6) % 7;
}
function monthLabel(date) {
  const months = t("calendar.months");
  const m = months?.[date.getMonth()] || "";
  return `${m} ${date.getFullYear()}`;
}

// ---------- Calendar Modal ----------
function CalendarModal({ visible, onClose, onPick, countsByDay, initialDate }) {
  const [cursor, setCursor] = useState(() => startOfMonth(initialDate || new Date()));

  useEffect(() => {
    if (!visible) return;
    setCursor(startOfMonth(initialDate || new Date()));
  }, [visible, initialDate]);

  const fontScale = PixelRatio.getFontScale();
  const pillH = Math.max(18, Math.min(26, Math.round(18 * fontScale)));
  const pillFont = Math.max(12, Math.min(16, Math.round(12 * fontScale)));

  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const dim = daysInMonth(cursor);
    const offset = mondayFirstIndex(first.getDay());
    const totalCells = 42;
    const cells = [];

    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - offset + 1;
      if (dayNum < 1 || dayNum > dim) {
        cells.push(null);
      } else {
        const d = new Date(cursor.getFullYear(), cursor.getMonth(), dayNum, 0, 0, 0, 0);
        const k = keyFromDateObj(d);
        const count = (countsByDay && countsByDay[k]) || 0;
        cells.push({ dayNum, date: d, key: k, count });
      }
    }
    return cells;
  }, [cursor, countsByDay]);

  const weekdays = t("calendar.weekdays"); // array 7

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.calBackdrop}>
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <Pressable
              style={styles.calNavBtn}
              onPress={() =>
                setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() - 1, 1)))
              }
            >
              <Text style={styles.calNavText}>‹</Text>
            </Pressable>

            <Text style={styles.calTitle}>{monthLabel(cursor)}</Text>

            <Pressable
              style={styles.calNavBtn}
              onPress={() =>
                setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() + 1, 1)))
              }
            >
              <Text style={styles.calNavText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.calWeekRow}>
            {weekdays.map((w, idx) => (
              <Text key={idx} style={styles.calWeekDay}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {grid.map((cell, idx) => {
              if (!cell) return <View key={idx} style={styles.calCell} />;

              const now = new Date();
              const isToday =
                cell.date.getFullYear() === now.getFullYear() &&
                cell.date.getMonth() === now.getMonth() &&
                cell.date.getDate() === now.getDate();

              return (
                <Pressable
                  key={cell.key}
                  style={styles.calCell}
                  onPress={() => {
                    onPick(cell.date);
                    onClose();
                  }}
                >
                  <View style={[styles.calDayWrap, isToday && styles.calDayToday]}>
                    <Text style={[styles.calDayNum, isToday && styles.calDayTodayText]}>
                      {cell.dayNum}
                    </Text>
                  </View>

                  {cell.count > 0 ? (
                    <View
                      style={[
                        styles.calCountPill,
                        {
                          height: pillH,
                          minWidth: pillH,
                          paddingHorizontal: 8,
                          justifyContent: "center",
                          alignItems: "center",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.calCountText,
                          {
                            fontSize: pillFont,
                            includeFontPadding: false,
                            textAlignVertical: "center",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {String(cell.count)}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.calCountEmpty, { height: pillH }]} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.calCloseBtn} onPress={onClose}>
            <Text style={styles.calCloseText}>{t("common.close")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------- screen ----------
export default function AppointmentDetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const { appointments, updateAppointment, deleteAppointment } = useAppointments();
  const { lang } = useLanguage();

  const { smsTemplateEl, smsTemplateEn, DEFAULT_TEMPLATE_EL, DEFAULT_TEMPLATE_EN } = useSettings();

  const item = useMemo(() => appointments.find((a) => a.id === id), [appointments, id]);

  const [editing, setEditing] = useState(false);
  const [newDate, setNewDate] = useState(item ? dateToDDMMYYYY(item.startsAt) : "");
  const [newTime, setNewTime] = useState(item ? timeToHHMM(item.startsAt) : "");

  // ✅ calendar + preview modal
  const [calOpen, setCalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const weekdayCurrent = useMemo(
    () => (item ? weekdayFromDate(new Date(item.startsAt)) : ""),
    [item]
  );

  const selectedDateObj = useMemo(() => parseDateOnly(newDate), [newDate]);
  const weekdayNew = useMemo(() => weekdayFromDate(selectedDateObj), [selectedDateObj]);

  // ✅ counts για πράσινα "μπιλάκια" στο calendar
  const countsByDay = useMemo(() => {
    const out = {};
    for (const a of appointments || []) {
      if (!a?.startsAt) continue;
      if (a.status === "cancelled") continue;
      const d = new Date(a.startsAt);
      if (isNaN(d.getTime())) continue;
      const k = keyFromDateObj(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }, [appointments]);

  // ✅ booked appointments της επιλεγμένης μέρας (για chips + modal)
  const bookedAppointments = useMemo(() => {
    if (!selectedDateObj) return [];

    const list = (appointments || [])
      .filter((a) => a.id !== item?.id) // ✅ μην δείχνει το ίδιο που κάνεις edit
      .filter((a) => a.status !== "cancelled")
      .filter((a) => isSameDayISO(a.startsAt, selectedDateObj))
      .map((a) => ({
        id: a.id,
        time: formatTimeFromISO(a.startsAt),
        name: a.name || "",
        phone: a.phone || "",
        note: a.note || "",
        startsAt: a.startsAt,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    const seen = new Set();
    return list.filter((x) => {
      if (seen.has(x.time)) return false;
      seen.add(x.time);
      return true;
    });
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
      (a) =>
        a.id !== item.id &&
        new Date(a.startsAt).getTime() === updated.getTime() &&
        a.status !== "cancelled"
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
            {/* ✅ Label row + calendar icon */}
            <View style={styles.dateLabelRow}>
              <Text style={styles.editLabel}>{t("details.newDateLabel")}</Text>
              <Pressable style={styles.calIconBtn} onPress={() => setCalOpen(true)} hitSlop={10}>
                <Text style={styles.calIconText}>📅</Text>
              </Pressable>
            </View>

            <TextInput
              value={newDate}
              onChangeText={(v) => setNewDate(formatDateDDMMYYYY(v))}
              keyboardType="number-pad"
              maxLength={10}
              style={styles.input}
            />

            {/* ✅ Calendar Modal */}
            <CalendarModal
              visible={calOpen}
              onClose={() => setCalOpen(false)}
              initialDate={selectedDateObj || new Date()}
              countsByDay={countsByDay}
              onPick={(d) => setNewDate(ddmmyyyyFromDateObj(d))}
            />

            {!!weekdayNew && <Text style={styles.subInfo}>📅 {weekdayNew}</Text>}

            {selectedDateObj && (
              <View style={styles.bookedBox}>
                <Text style={styles.bookedTitle}>
                  {t("details.bookedTitle", { count: bookedAppointments.length })}
                </Text>

                {bookedAppointments.length === 0 ? (
                  <Text style={styles.bookedEmpty}>{t("details.bookedEmpty")}</Text>
                ) : (
                  <View style={styles.bookedTimesWrap}>
                    {bookedAppointments.map((a, idx) => (
                      <Pressable
                        key={`${a.time}-${idx}`}
                        onPress={() => setSelectedAppointment(a)}
                        style={({ pressed }) => [styles.bookedChip, pressed && { opacity: 0.85 }]}
                        hitSlop={8}
                      >
                        <Text style={styles.bookedChipText}>{a.time}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ✅ Modal λεπτομερειών κλεισμένου ραντεβού */}
            <Modal
              visible={!!selectedAppointment}
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedAppointment(null)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setSelectedAppointment(null)}>
                <Pressable style={styles.modalBox} onPress={() => {}}>
                  <Text style={styles.modalTitle}>🕒 {selectedAppointment?.time}</Text>

                  {!!selectedAppointment?.name && (
                    <Text style={styles.modalLine}>👤 {selectedAppointment.name}</Text>
                  )}

                  {!!selectedAppointment?.phone && (
                    <Text style={styles.modalLine}>📞 {selectedAppointment.phone}</Text>
                  )}

                  {!!selectedAppointment?.note && (
                    <Text style={styles.modalNote}>{selectedAppointment.note}</Text>
                  )}

                  <Pressable style={styles.modalCloseBtn} onPress={() => setSelectedAppointment(null)}>
                    <Text style={styles.modalCloseText}>Κλείσιμο</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>

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
  editLabel: { color: "#D1FAE5", fontWeight: "800" },

  input: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    color: "#fff",
    borderRadius: 12,
    padding: 12,
  },

  dateLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calIconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#062417",
    borderWidth: 1,
    borderColor: "#0F3A27",
  },
  calIconText: { fontSize: 16 },

  bookedTimesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  bookedChip: {
    backgroundColor: "#062417",
    borderWidth: 1,
    borderColor: "#0F3A27",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  bookedChipText: { color: "#D1FAE5", fontWeight: "900" },

  smallBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center" },

  cancelBtn: {
    marginTop: 14,
    backgroundColor: "#7F1D1D",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelText: { color: "#fff", fontWeight: "900" },

  // modal preview
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#062417",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#0F3A27",
    padding: 16,
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 18, marginBottom: 10 },
  modalLine: { color: "#D1FAE5", fontSize: 14, marginTop: 6 },
  modalNote: { color: "#9FE6C1", marginTop: 10, lineHeight: 20 },
  modalCloseBtn: {
    marginTop: 14,
    backgroundColor: "#0F3A27",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCloseText: { color: "#D1FAE5", fontWeight: "900" },

  // calendar
  calBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 18 },
  calCard: { backgroundColor: "#062417", borderRadius: 16, borderWidth: 1, borderColor: "#0F3A27", padding: 14 },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calNavBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: "#072A1C" },
  calNavText: { color: "#D1FAE5", fontWeight: "900", fontSize: 20 },
  calTitle: { color: "#fff", fontWeight: "900", fontSize: 18 },
  calWeekRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 6 },
  calWeekDay: { width: "14.285%", textAlign: "center", color: "#9FE6C1", fontWeight: "900" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.285%", paddingVertical: 8, alignItems: "center" },
  calDayWrap: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  calDayNum: { color: "#D1FAE5", fontWeight: "900" },
  calDayToday: { borderWidth: 2, borderColor: "#9FE6C1" },
  calDayTodayText: { color: "#fff" },
  calCountPill: { backgroundColor: "#22C55E", borderRadius: 999, marginTop: 6 },
  calCountText: { color: "#052016", fontWeight: "900" },
  calCountEmpty: { marginTop: 6 },
  calCloseBtn: { marginTop: 10, backgroundColor: "#0F3A27", padding: 12, borderRadius: 12, alignItems: "center" },
  calCloseText: { color: "#D1FAE5", fontWeight: "900" },
});




