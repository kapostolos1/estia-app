import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { useAppointments } from "../store/appointmentsStore";
import { supabase } from "../lib/supabase";
import { t } from "../i18n";
import { weekdayFromDate } from "../utils/weekday";
import { PixelRatio } from "react-native";

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
  const t2 = digitsOnly(input).slice(0, 4);
  const hh = t2.slice(0, 2);
  const mm = t2.slice(2, 4);
  let out = hh;
  if (mm.length) out += ":" + mm;
  return out;
}

function parseDateTime(dateText, timeText) {
  const d = digitsOnly(dateText); // DDMMYYYY
  const t2 = digitsOnly(timeText); // HHMM
  if (d.length !== 8 || t2.length !== 4) return null;

  const dd = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const yyyy = Number(d.slice(4, 8));
  const hh = Number(t2.slice(0, 2));
  const min = Number(t2.slice(2, 4));

  if (dd < 1 || dd > 31) return null;
  if (mm < 1 || mm > 12) return null;
  if (yyyy < 2020 || yyyy > 2100) return null;
  if (hh < 0 || hh > 23) return null;
  if (min < 0 || min > 59) return null;

  const dt = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
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

function isSameDayISO(iso, dateObj) {
  if (!dateObj) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === dateObj.getFullYear() &&
    d.getMonth() === dateObj.getMonth() &&
    d.getDate() === dateObj.getDate()
  );
}

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
// Monday-first index (Δευ=0 ... Κυρ=6)
function mondayFirstIndex(jsDay) {
  return (jsDay + 6) % 7;
}

function monthLabel(date) {
  const months = t("calendar.months"); // array 12
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
    const offset = mondayFirstIndex(first.getDay()); // 0..6
    const totalCells = 42; // 6 weeks
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

  const weekdaysRaw = t("calendar.weekdays");
  const weekdays = Array.isArray(weekdaysRaw) ? weekdaysRaw : ["Δ", "Τ", "Τ", "Π", "Π", "Σ", "Κ"];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.calBackdrop}>
        <View style={styles.calCard}>
          {/* Header */}
          <View style={styles.calHeader}>
            <Pressable
              style={styles.calNavBtn}
              onPress={() => setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() - 1, 1)))}
            >
              <Text style={styles.calNavText}>‹</Text>
            </Pressable>

            <Text style={styles.calTitle}>{monthLabel(cursor)}</Text>

            <Pressable
              style={styles.calNavBtn}
              onPress={() => setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() + 1, 1)))}
            >
              <Text style={styles.calNavText}>›</Text>
            </Pressable>
          </View>

          {/* Weekdays */}
          <View style={styles.calWeekRow}>
            {weekdays.map((w, idx) => (
              <Text key={idx} style={styles.calWeekDay}>
                {w}
              </Text>
            ))}
          </View>

          {/* Grid */}
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
                    <Text style={[styles.calDayNum, isToday && styles.calDayTodayText]}>{cell.dayNum}</Text>
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
            <Text style={styles.calCloseText}>{t("common.close") || "Κλείσιμο"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------- screen ----------
export default function NewAppointmentScreen({ navigation, route }) {
  const { appointments, createAppointment, ready, businessId } = useAppointments();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const [dateText, setDateText] = useState(""); // DD-MM-YYYY
  const [timeText, setTimeText] = useState(""); // HH:MM

  const [saving, setSaving] = useState(false);

  // ✅ refs
  const nameInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const timeInputRef = useRef(null);

  // ✅ suggestions state
  const [nameSug, setNameSug] = useState([]);
  const [phoneSug, setPhoneSug] = useState([]);
  const [showNameSug, setShowNameSug] = useState(false);
  const [showPhoneSug, setShowPhoneSug] = useState(false);
  const [loadingNameSug, setLoadingNameSug] = useState(false);
  const [loadingPhoneSug, setLoadingPhoneSug] = useState(false);

  // calendar modal
  const [calOpen, setCalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const selectedDateObj = useMemo(() => parseDateOnly(dateText), [dateText]);
  const weekdayLabel = useMemo(() => weekdayFromDate(selectedDateObj), [selectedDateObj]);

  // ✅ Prefill date from HomeScreen (Quick Add / Calendar day)
  useEffect(() => {
    const iso = route?.params?.prefillDate;
    if (!iso) return;

    const d = new Date(iso);
    if (isNaN(d.getTime())) return;

    setDateText(ddmmyyyyFromDateObj(d));

    // ✅ move focus to time for premium flow
    setTimeout(() => {
      timeInputRef.current?.focus?.();
    }, 150);

    // avoid re-trigger
    navigation.setParams({ prefillDate: null });
  }, [route?.params?.prefillDate, navigation]);

  // ✅ fetch customers (name)
  const fetchCustomersByName = useCallback(
    async (term) => {
      const q = (term || "").trim();
      if (q.length < 3) {
        setNameSug([]);
        return;
      }
      if (!businessId) return;

      setLoadingNameSug(true);
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("business_id", businessId)
          .ilike("name", `%${q}%`)
          .order("last_seen_at", { ascending: false })
          .limit(8);

        if (error) throw error;
        setNameSug(data || []);
      } catch {
        setNameSug([]);
      } finally {
        setLoadingNameSug(false);
      }
    },
    [businessId]
  );

  // ✅ fetch customers (phone)
  const fetchCustomersByPhone = useCallback(
    async (phoneValue) => {
      const d = digitsOnly(phoneValue);
      if (d.length < 5) {
        setPhoneSug([]);
        return;
      }
      if (!businessId) return;

      setLoadingPhoneSug(true);
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("business_id", businessId)
          .ilike("phone", `${d}%`)
          .order("last_seen_at", { ascending: false })
          .limit(8);

        if (error) throw error;
        setPhoneSug(data || []);
      } catch {
        setPhoneSug([]);
      } finally {
        setLoadingPhoneSug(false);
      }
    },
    [businessId]
  );

  // ✅ debounce name suggestions
  useEffect(() => {
    const q = (name || "").trim();
    if (q.length < 3) {
      setShowNameSug(false);
      setNameSug([]);
      return;
    }

    setShowNameSug(true);
    const tmr = setTimeout(() => fetchCustomersByName(q), 250);
    return () => clearTimeout(tmr);
  }, [name, fetchCustomersByName]);

  // ✅ debounce phone suggestions
  useEffect(() => {
    const d = digitsOnly(phone);
    if (d.length < 5) {
      setShowPhoneSug(false);
      setPhoneSug([]);
      return;
    }

    setShowPhoneSug(true);
    const tmr = setTimeout(() => fetchCustomersByPhone(d), 250);
    return () => clearTimeout(tmr);
  }, [phone, fetchCustomersByPhone]);

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

  const bookedAppointments = useMemo(() => {
    if (!selectedDateObj) return [];

    const list = (appointments || [])
      .filter((a) => a.status !== "cancelled" && isSameDayISO(a.startsAt, selectedDateObj))
      .map((a) => ({
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
  }, [appointments, selectedDateObj]);

  async function onSave() {
    if (!ready || !businessId) {
      Alert.alert(t("newAppointment.waitTitle"), t("newAppointment.waitText"));
      return;
    }

    const n = name.trim();
    const p = phone.trim();

    if (!n) return Alert.alert(t("newAppointment.errTitle"), t("newAppointment.errName"));
    if (!p) return Alert.alert(t("newAppointment.errTitle"), t("newAppointment.errPhone"));

    if (digitsOnly(dateText).length !== 8) {
      return Alert.alert(t("newAppointment.errTitle"), t("newAppointment.errDateFull"));
    }
    if (digitsOnly(timeText).length !== 4) {
      return Alert.alert(t("newAppointment.errTitle"), t("newAppointment.errTimeFull"));
    }

    const dt = parseDateTime(dateText, timeText);
    if (!dt) {
      return Alert.alert(
        t("newAppointment.errTitle"),
        t("newAppointment.errUnknownDT", { dt: `${dateText} ${timeText}` })
      );
    }

    if (dt.getTime() <= Date.now()) {
      return Alert.alert(t("newAppointment.errPastTitle"), t("newAppointment.errPastText"));
    }

    const conflict = appointments.some(
      (a) => new Date(a.startsAt).getTime() === dt.getTime() && a.status !== "cancelled"
    );
    if (conflict) {
      return Alert.alert(t("newAppointment.conflictTitle"), t("newAppointment.conflictText"));
    }

    setSaving(true);
    try {
      await createAppointment({
        name: n,
        phone: p,
        note: note.trim() || null,
        startsAt: dt.toISOString(),
      });

      // ✅ auto-save customer (upsert)
      try {
        const n2 = n.trim();
        const p2 = digitsOnly(p);
        if (n2 && p2) {
          const nowIso = new Date().toISOString();
          await supabase.from("customers").upsert(
            {
              business_id: businessId,
              name: n2,
              phone: p2,
              last_seen_at: nowIso,
              updated_at: nowIso,
            },
            { onConflict: "business_id,phone" }
          );
        }
      } catch {}

      navigation.goBack();
    } catch (e) {
      Alert.alert(t("newAppointment.errTitle"), e?.message || t("newAppointment.errTitle"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t("newAppointment.title")}</Text>

        {/* ✅ NAME + suggestions */}
        <Text style={styles.label}>{t("newAppointment.nameLabel")}</Text>
        <TextInput
          ref={nameInputRef}
          value={name}
          onChangeText={(v) => setName(v)}
          placeholder={t("newAppointment.namePh")}
          placeholderTextColor="#9FE6C1"
          style={styles.input}
          onFocus={() => {
            const q = (name || "").trim();
            if (q.length >= 3) setShowNameSug(true);
          }}
          onBlur={() => {
            // μικρό delay για να προλάβει tap σε suggestion
            setTimeout(() => setShowNameSug(false), 120);
          }}
        />

        {showNameSug && (
          <View style={styles.sugBox}>
            {loadingNameSug ? (
              <Text style={styles.sugHint}>{t("newAppointment.sug.loading")}</Text>
            ) : nameSug.length === 0 ? (
              <Text style={styles.sugHint}>{t("newAppointment.sug.noMatches")}</Text>
            ) : (
              nameSug.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.sugRow}
                  onPress={() => {
                    setName(c.name || "");
                    setPhone(c.phone || "");
                    setShowNameSug(false);
                    setShowPhoneSug(false);
                    setTimeout(() => phoneInputRef.current?.focus?.(), 80);
                  }}
                >
                  <Text style={styles.sugTitle}>{c.name}</Text>
                  <Text style={styles.sugSub}>{c.phone}</Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* ✅ PHONE + suggestions */}
        <Text style={styles.label}>{t("newAppointment.phoneLabel")}</Text>
        <TextInput
          ref={phoneInputRef}
          value={phone}
          onChangeText={(v) => setPhone(digitsOnly(v))}
          placeholder={t("newAppointment.phonePh")}
          placeholderTextColor="#9FE6C1"
          keyboardType="phone-pad"
          style={styles.input}
          onFocus={() => {
            const d = digitsOnly(phone);
            if (d.length >= 5) setShowPhoneSug(true);
          }}
          onBlur={() => {
            setTimeout(() => setShowPhoneSug(false), 120);
          }}
        />

        {showPhoneSug && (
          <View style={styles.sugBox}>
            {loadingPhoneSug ? (
              <Text style={styles.sugHint}>{t("newAppointment.sug.loading")}</Text>
            ) : phoneSug.length === 0 ? (
              <Text style={styles.sugHint}>{t("newAppointment.sug.noMatches")}</Text>
            ) : (
              phoneSug.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.sugRow}
                  onPress={() => {
                    setName(c.name || "");
                    setPhone(c.phone || "");
                    setShowPhoneSug(false);
                    setShowNameSug(false);
                  }}
                >
                  <Text style={styles.sugTitle}>{c.phone}</Text>
                  <Text style={styles.sugSub}>{c.name}</Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        <Text style={styles.label}>{t("newAppointment.noteLabel")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("newAppointment.notePh")}
          placeholderTextColor="#9FE6C1"
          style={styles.input}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <View style={styles.dateLabelRow}>
              <Text style={styles.label}>{t("newAppointment.dateLabel")}</Text>

              <Pressable
                style={styles.calIconBtn}
                onPress={() => {
                  setCalOpen(true);
                }}
                hitSlop={10}
              >
                <Text style={styles.calIconText}>📅</Text>
              </Pressable>
            </View>

            <TextInput
              value={dateText}
              onChangeText={(v) => setDateText(formatDateDDMMYYYY(v))}
              placeholder="17012026"
              placeholderTextColor="#9FE6C1"
              keyboardType="number-pad"
              maxLength={10}
              style={styles.input}
            />
            {!!weekdayLabel && <Text style={styles.subInfo}>📅 {weekdayLabel}</Text>}
          </View>

          <View style={{ width: 130 }}>
            <Text style={styles.label}>{t("newAppointment.timeLabel")}</Text>
            <TextInput
              ref={timeInputRef}
              value={timeText}
              onChangeText={(v) => setTimeText(formatTimeHHMM(v))}
              placeholder="1030"
              placeholderTextColor="#9FE6C1"
              keyboardType="number-pad"
              maxLength={5}
              style={styles.input}
            />
          </View>
        </View>

        {/* ✅ Calendar Modal */}
        <CalendarModal
          visible={calOpen}
          onClose={() => setCalOpen(false)}
          initialDate={selectedDateObj || new Date()}
          countsByDay={countsByDay}
          onPick={(d) => {
            setDateText(ddmmyyyyFromDateObj(d));
            // ✅ όταν διαλέξει ημερομηνία, πάει κατευθείαν στην ώρα
            setTimeout(() => {
              timeInputRef.current?.focus?.();
            }, 80);
          }}
        />

        {/* ⬇️ Κλεισμένες ώρες */}
        {selectedDateObj && (
          <View style={styles.bookedBox}>
            <Text style={styles.bookedTitle}>
              {t("newAppointment.bookedTitle", { count: bookedAppointments.length })}
            </Text>

            {bookedAppointments.length === 0 ? (
              <Text style={styles.bookedEmpty}>{t("newAppointment.bookedEmpty")}</Text>
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

        {/* ✅ Modal λεπτομερειών ραντεβού */}
        <Modal
          visible={!!selectedAppointment}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedAppointment(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedAppointment(null)}>
            <Pressable style={styles.modalBox} onPress={() => {}}>
              <Text style={styles.modalTitle}>🕒 {selectedAppointment?.time}</Text>

              {!!selectedAppointment?.name && <Text style={styles.modalLine}>👤 {selectedAppointment.name}</Text>}
              {!!selectedAppointment?.phone && <Text style={styles.modalLine}>📞 {selectedAppointment.phone}</Text>}
              {!!selectedAppointment?.note && <Text style={styles.modalNote}>{selectedAppointment.note}</Text>}

              <Pressable style={styles.modalCloseBtn} onPress={() => setSelectedAppointment(null)}>
                <Text style={styles.modalCloseText}>{t("common.close") || "Κλείσιμο"}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Pressable
          style={[styles.saveBtn, (saving || !ready || !businessId) && { opacity: 0.7 }]}
          onPress={onSave}
          disabled={saving || !ready || !businessId}
        >
          <Text style={styles.saveText}>{saving ? t("newAppointment.saving") : t("newAppointment.save")}</Text>
        </Pressable>

        <Text style={styles.hint}>{t("newAppointment.tip")}</Text>
        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#0c3224" },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 12 },

  label: { color: "#D1FAE5", fontWeight: "900", marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    color: "#fff",
    borderRadius: 12,
    padding: 12,
  },

  // ✅ suggestions (white dropdown)
  sugBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 6,
    overflow: "hidden",
  },
  sugRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sugTitle: {
    color: "#052016",
    fontWeight: "900",
  },
  sugSub: {
    color: "#374151",
    marginTop: 2,
  },
  sugHint: {
    color: "#374151",
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontWeight: "800",
  },

  dateLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calIconBtn: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  calIconText: { fontSize: 16 },

  subInfo: { color: "#9FE6C1", marginTop: 6, fontWeight: "800" },

  bookedBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 12,
    padding: 12,
  },
  bookedTitle: { color: "#fff", fontWeight: "900", marginBottom: 6 },
  bookedEmpty: { color: "#9FE6C1" },

  bookedTimesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  bookedChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bookedChipText: {
    color: "#DFFFEF",
    fontWeight: "700",
  },

  saveBtn: {
    marginTop: 14,
    backgroundColor: "#22C55E",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveText: { color: "#052016", fontWeight: "900", fontSize: 16 },

  hint: { marginTop: 12, color: "#9FE6C1", fontSize: 12 },

  // Calendar modal styles
  calBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "center",
    padding: 18,
  },
  calCard: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 16,
    padding: 14,
  },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  calNavBtn: {
    width: 42,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    alignItems: "center",
    justifyContent: "center",
  },
  calNavText: { color: "#D1FAE5", fontSize: 22, fontWeight: "900" },

  calWeekRow: { flexDirection: "row", marginBottom: 6 },
  calWeekDay: { flex: 1, textAlign: "center", color: "#9FE6C1", fontWeight: "900" },

  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: {
    width: "14.2857%",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  calDayWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#062417",
    borderWidth: 1,
    borderColor: "#0F3A27",
  },
  calDayToday: {
    borderWidth: 2,
    borderColor: "#9FE6C1",
  },
  calDayNum: { color: "#fff", fontWeight: "900" },
  calDayTodayText: { fontWeight: "900" },

  calCountPill: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  calCountText: {
    color: "#052016",
    fontWeight: "900",
  },
  calCountEmpty: { marginTop: 6 },

  calCloseBtn: {
    marginTop: 10,
    backgroundColor: "#0F3A27",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  calCloseText: { color: "#D1FAE5", fontWeight: "900" },

  // details modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 18,
  },
  modalBox: {
    backgroundColor: "#0f2b22",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalTitle: {
    color: "#DFFFEF",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  modalLine: {
    color: "#DFFFEF",
    fontSize: 15,
    marginBottom: 6,
  },
  modalNote: {
    color: "#BFF5D8",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 20,
  },
  modalCloseBtn: {
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(111, 233, 170, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(111, 233, 170, 0.35)",
  },
  modalCloseText: {
    color: "#DFFFEF",
    fontWeight: "800",
  },
});




