// src/screens/HomeScreen.js
// ✅ Τελικό HomeScreen + Menu modal + SMS panel + Tabs + Language flags + Calendar day list
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
  PixelRatio,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { useAppointments } from "../store/appointmentsStore";
import { useSettings } from "../store/settingsStore";
import * as SMS from "expo-sms";
import SubscriptionBanner from "../components/SubscriptionBanner";
import { t } from "../i18n";
import { useLanguage } from "../i18n/LanguageProvider";

// -------------------- helpers --------------------
function pad2(n) {
  return String(n).padStart(2, "0");
}
function keyFromDateObj(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}
function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
// Monday-first index (Mon=0..Sun=6)
function mondayFirstIndex(jsDay) {
  return (jsDay + 6) % 7;
}
function monthLabel(date) {
  const months = t("calendar.months"); // array 12
  const m = months?.[date.getMonth()] || "";
  return `${m} ${date.getFullYear()}`;
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
function formatDateTimeGR(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}
function formatDateGR(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function formatTimeGR(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}
function formatTimeFromISO(iso) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function isSameDay(aIso, bDate) {
  const a = new Date(aIso);
  return (
    a.getFullYear() === bDate.getFullYear() &&
    a.getMonth() === bDate.getMonth() &&
    a.getDate() === bDate.getDate()
  );
}
function renderTemplate(tpl, item) {
  return (tpl || "")
    .replaceAll("{NAME}", item.name || "")
    .replaceAll("{DATE}", formatDateGR(item.startsAt))
    .replaceAll("{TIME}", formatTimeGR(item.startsAt));
}
function formatDateLabel(dateObj) {
  if (!dateObj) return "";
  return `${pad2(dateObj.getDate())}-${pad2(dateObj.getMonth() + 1)}-${dateObj.getFullYear()}`;
}

// -------------------- Calendar Modal (same logic as NewAppointment) --------------------
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
            {(Array.isArray(weekdays) ? weekdays : ["M", "T", "W", "T", "F", "S", "S"]).map((w, idx) => (
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

// -------------------- screen --------------------
export default function HomeScreen({ navigation }) {
  const {
    appointments,
    updateAppointment,
    myRole,
    refresh,
    ready,
    businessId,
    access,
    showTrialIntro,
    markTrialIntroSeen,
  } = useAppointments();

  const { lang, changeLang } = useLanguage();

  const { smsTemplateEl, smsTemplateEn, DEFAULT_TEMPLATE_EL, DEFAULT_TEMPLATE_EN } = useSettings();

  const [forcedLogout, setForcedLogout] = useState(false);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const isOwner = myRole === "owner";

  const canCreate = !!access?.canCreate;
  const st = String(access?.status || "").trim().toLowerCase();
  const showBanner = st === "grace" || st === "expired";

  // tabs
  const [tab, setTab] = useState("today");
  const [q, setQ] = useState("");
  const [now, setNow] = useState(() => new Date());

  // menu modal
  const [menuOpen, setMenuOpen] = useState(false);

  // business resolving
  const [resolvingBiz, setResolvingBiz] = useState(false);
  const [bizTries, setBizTries] = useState(0);

  // ✅ Calendar states
  const [calOpen, setCalOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(null);

  // refresh time to show SMS panel automatically
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // staff no biz => show invite modal
  useEffect(() => {
    if (!ready) return;

    const staffNoBiz = myRole === "needs_invite" || (myRole === "staff" && !businessId);

    if (staffNoBiz) {
      setInviteOpen(true);
      setForcedLogout(true);
    } else {
      setInviteOpen(false);
      setForcedLogout(false);
    }
  }, [ready, myRole, businessId]);

  // retries when needs_invite
  useEffect(() => {
    if (!ready) return;

    if (myRole !== "needs_invite") {
      setResolvingBiz(false);
      setBizTries(0);
      return;
    }

    if (businessId) {
      setResolvingBiz(false);
      setBizTries(0);
      return;
    }

    setResolvingBiz(true);

    let cancelled = false;
    let tries = 0;

    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      setBizTries(tries);

      try {
        if (typeof refresh === "function") await refresh();
      } catch {}

      if (tries >= 8) {
        if (!cancelled) setResolvingBiz(false);
        return;
      }

      setTimeout(tick, 1200);
    };

    tick();

    return () => {
      cancelled = true;
    };
  }, [ready, businessId, myRole, refresh]);

  // refresh on focus
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      if (!businessId) return;
      refresh?.({ reason: "homeFocus" });
    }, [businessId, refresh])
  );

  async function doLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (e) {
      Alert.alert(t("errors.errorTitle"), e?.message || t("home.logoutFail"));
    }
  }

  function handleLogout() {
    Alert.alert(t("home.logoutTitle"), t("home.logoutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.yes"), style: "destructive", onPress: doLogout },
    ]);
  }

  async function attachWithInvite(code) {
    const c = (code || "").trim();
    if (!c) {
      Alert.alert(t("invite.title"), t("invite.enter"));
      return false;
    }

    const { data: ok, error: eCheck } = await supabase.rpc("check_staff_invite_code", { p_code: c });
    if (eCheck) {
      Alert.alert(t("errors.errorTitle"), eCheck.message);
      return false;
    }
    if (!ok) {
      Alert.alert(t("invite.title"), t("invite.invalidOrUsedShort"));
      return false;
    }

    const { error: e2 } = await supabase.rpc("accept_staff_invite", { p_code: c });
    if (e2) {
      Alert.alert(t("invite.title"), e2.message || t("invite.activateFail"));
      return false;
    }

    try {
      if (typeof refresh === "function") await refresh();
    } catch {}

    return true;
  }

  async function sendSms(item, kind) {
    const available = await SMS.isAvailableAsync();
    if (!available) {
      Alert.alert(t("sms.alertTitle"), t("sms.notSupported"));
      return;
    }

    if (!item.phone) {
      Alert.alert(t("sms.alertTitle"), t("sms.missingPhone"));
      return;
    }

    const tpl =
      lang === "en"
        ? smsTemplateEn?.trim()
          ? smsTemplateEn
          : DEFAULT_TEMPLATE_EN
        : smsTemplateEl?.trim()
        ? smsTemplateEl
        : DEFAULT_TEMPLATE_EL;

    const message = renderTemplate(tpl, item);
    await SMS.sendSMSAsync([item.phone], message);

    try {
      if (kind === "24h") await updateAppointment(item.id, { sms24Sent: true });
      if (kind === "2h") await updateAppointment(item.id, { sms2hSent: true });
    } catch (e) {
      Alert.alert(t("errors.errorTitle"), e?.message || t("sms.updateFail"));
    }

    setNow(new Date());
  }

  // menu actions
  function goSmsTemplate() {
    setMenuOpen(false);
    navigation.navigate("SmsTemplate");
  }
  function goUsers() {
    setMenuOpen(false);
    navigation.navigate("Users");
  }
  function goSupport() {
    setMenuOpen(false);
    Alert.alert(t("menu.support"), t("support.contactText"));
  }
  function goBack() {
    setMenuOpen(false);
    if (navigation.canGoBack()) navigation.goBack();
  }

  // sorted
  const sortedAll = useMemo(() => {
    return [...appointments].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [appointments]);

  const todayList = useMemo(() => {
    const nowTs = now.getTime();
    return sortedAll.filter((a) => {
      if (!isSameDay(a.startsAt, now)) return false;
      const t0 = new Date(a.startsAt).getTime();
      return t0 >= nowTs - 60 * 1000;
    });
  }, [sortedAll, now]);

  const upcomingList = useMemo(() => sortedAll.filter((a) => new Date(a.startsAt) > now), [sortedAll, now]);

  const historyList = useMemo(() => {
    return sortedAll
      .filter((a) => new Date(a.startsAt) < now)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }, [sortedAll, now]);

  const searchList = useMemo(() => {
    const term = (q || "").trim().toLowerCase();
    if (!term) return [];
    return sortedAll.filter((a) => {
      const name = (a.name || "").toLowerCase();
      const phone = (a.phone || "").toLowerCase();
      const note = (a.note || "").toLowerCase();
      return name.includes(term) || phone.includes(term) || note.includes(term);
    });
  }, [sortedAll, q]);

  const data =
    tab === "today" ? todayList : tab === "upcoming" ? upcomingList : tab === "history" ? historyList : searchList;

  const todayTotalCount = useMemo(() => {
    return sortedAll.filter((a) => isSameDay(a.startsAt, now)).length;
  }, [sortedAll, now]);

  const todayRemainingCount = useMemo(() => {
    const nowTs = now.getTime();
    return sortedAll.filter((a) => {
      if (!isSameDay(a.startsAt, now)) return false;
      const t0 = new Date(a.startsAt).getTime();
      return t0 >= nowTs - 60 * 1000;
    }).length;
  }, [sortedAll, now]);

  const sms2h = useMemo(() => {
    const from = now.getTime() + 2 * 60 * 60 * 1000;
    const to = now.getTime() + (2 * 60 + 30) * 60 * 1000;
    return upcomingList.filter((a) => {
      if (a.sms2hSent) return false;
      const t0 = new Date(a.startsAt).getTime();
      return t0 >= from && t0 <= to;
    });
  }, [upcomingList, now]);

  const sms24h = useMemo(() => {
    const from = now.getTime() + 24 * 60 * 60 * 1000;
    const to = now.getTime() + (24 * 60 + 120) * 60 * 1000;
    return upcomingList.filter((a) => {
      if (a.sms24Sent) return false;
      const t0 = new Date(a.startsAt).getTime();
      return t0 >= from && t0 <= to;
    });
  }, [upcomingList, now]);

  // ✅ counts for calendar pills
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

  // ✅ list of appointments for picked day
  const dayAppointments = useMemo(() => {
    if (!pickedDate) return [];
    return (appointments || [])
      .filter((a) => a.status !== "cancelled")
      .filter((a) => isSameDayISO(a.startsAt, pickedDate))
      .map((a) => ({
        id: a.id,
        time: formatTimeFromISO(a.startsAt),
        name: a.name || "",
        phone: a.phone || "",
        note: a.note || "",
      }))
      .sort((x, y) => x.time.localeCompare(y.time));
  }, [appointments, pickedDate]);

  // -------------------- guards --------------------
  if (!ready || myRole === null) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#D1FAE5", fontSize: 16 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (!businessId) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 10 }}>
          {t("home.connectBusiness")}
        </Text>

        <Text style={{ color: "#D1FAE5", marginBottom: 14 }}>
          {resolvingBiz ? `${t("home.checkingConnection")} (${bizTries}/8)` : t("home.enterInvite")}
        </Text>

        <Pressable style={styles.logoutBtnWide} onPress={doLogout}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>{t("home.logout")}</Text>
        </Pressable>

        <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => {}}>
          <View style={styles.modalBackdropCenter}>
            <View style={styles.inviteCard}>
              <Text style={styles.inviteTitle}>{t("home.inviteTitle")}</Text>
              <Text style={styles.inviteText}>{t("home.inviteText")}</Text>

              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder={t("home.invitePlaceholder")}
                placeholderTextColor="#9FE6C1"
                autoCapitalize="none"
                style={styles.search}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  style={[styles.inviteBtnOk, inviteLoading && { opacity: 0.7 }]}
                  disabled={inviteLoading}
                  onPress={async () => {
                    setInviteLoading(true);
                    try {
                      const ok = await attachWithInvite(inviteCode);
                      if (ok) {
                        setInviteOpen(false);
                        setInviteCode("");
                      }
                    } finally {
                      setInviteLoading(false);
                    }
                  }}
                >
                  <Text style={styles.inviteBtnOkText}>{inviteLoading ? "..." : t("common.ok")}</Text>
                </Pressable>

                <Pressable
                  style={styles.inviteBtnCancel}
                  onPress={async () => {
                    await doLogout();
                  }}
                >
                  <Text style={{ color: "#D1FAE5", fontWeight: "900" }}>{t("common.cancel")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // -------------------- UI --------------------
  return (
    <View style={styles.container}>
      {/* ✅ Menu Modal */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t("home.menu.title")}</Text>

            <Pressable style={styles.sheetItem} onPress={goSmsTemplate}>
              <Text style={styles.sheetItemText}>{t("home.menu.smsTemplate")}</Text>
            </Pressable>

            {isOwner && (
              <Pressable style={styles.sheetItem} onPress={goUsers}>
                <Text style={styles.sheetItemText}>{t("home.menu.users")}</Text>
              </Pressable>
            )}

            <Pressable style={styles.sheetItem} onPress={goSupport}>
              <Text style={styles.sheetItemText}>{t("home.menu.support")}</Text>
            </Pressable>

            <Pressable style={styles.sheetItem} onPress={goBack}>
              <Text style={styles.sheetItemText}>{t("home.menu.back")}</Text>
            </Pressable>

            <Pressable style={styles.sheetItem} onPress={handleLogout}>
              <Text style={[styles.sheetItemText, { color: "#F87171" }]}>{t("common.logout") || "Αποσύνδεση"}</Text>
            </Pressable>

            <Pressable style={[styles.sheetItem, styles.sheetCancel]} onPress={() => setMenuOpen(false)}>
              <Text style={[styles.sheetItemText, { textAlign: "center" }]}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ✅ Trial Intro Modal */}
      <Modal visible={!!showTrialIntro} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>{t("trialIntro.title")}</Text>
            <Text style={styles.inviteText}>{t("trialIntro.body")}</Text>

            <Pressable
              style={styles.inviteBtnOk}
              onPress={async () => {
                await markTrialIntroSeen();
              }}
            >
              <Text style={styles.inviteBtnOkText}>
                {t("trialIntro.continue") || t("common.continue") || "Συνέχεια"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ✅ Calendar Modal */}
      <CalendarModal
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        initialDate={pickedDate || new Date()}
        countsByDay={countsByDay}
        onPick={(d) => {
          setPickedDate(d);
          setDayOpen(true);
        }}
      />

      {/* ✅ Day appointments list modal (scrollable) */}
      <Modal visible={dayOpen} transparent animationType="fade" onRequestClose={() => setDayOpen(false)}>
        <Pressable style={styles.modalBackdropCenter} onPress={() => setDayOpen(false)}>
          <Pressable style={styles.dayCard} onPress={() => {}}>
            <Text style={styles.dayTitle}>📅 {formatDateLabel(pickedDate)}</Text>

            <Text style={styles.dayCount}>
              {(t("home.dayCount") && t("home.dayCount", { count: dayAppointments.length })) ||
                `${dayAppointments.length} ραντεβού`}
            </Text>

            {dayAppointments.length === 0 ? (
              <Text style={styles.dayEmpty}>
                {t("home.noAppointmentsDay") || "Δεν υπάρχουν ραντεβού για αυτή την ημέρα."}
              </Text>
            ) : (
              <FlatList
                data={dayAppointments}
                keyExtractor={(x) => x.id}
                style={{ marginTop: 10, maxHeight: 420 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.dayItem}
                    onPress={() => {
                      setDayOpen(false);
                      navigation.navigate("AppointmentDetails", { id: item.id });
                    }}
                  >
                    <Text style={styles.dayItemTime}>{item.time}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayItemName}>{item.name}</Text>
                      {!!item.phone && <Text style={styles.dayItemSub}>{item.phone}</Text>}
                      {!!item.note && <Text style={styles.dayItemSub}>{item.note}</Text>}
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                )}
              />
            )}

            <Pressable style={[styles.inviteBtnCancel, { marginTop: 12 }]} onPress={() => setDayOpen(false)}>
              <Text style={{ color: "#D1FAE5", fontWeight: "900" }}>{t("common.close") || "Κλείσιμο"}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header */}
      <View style={styles.topRow}>
        {/* LEFT: Flags πάνω από Title + badges */}
        <View style={styles.leftHeaderCol}>
          {/* ✅ Flags + Calendar button */}
          <View style={styles.langRowTop}>
            <Pressable
              onPress={() => changeLang("el")}
              style={[styles.langBtnRound, lang === "el" && styles.langBtnActive]}
              hitSlop={10}
            >
              <Text style={styles.langEmoji}>🇬🇷</Text>
            </Pressable>

            <Pressable
              onPress={() => changeLang("en")}
              style={[styles.langBtnRound, lang === "en" && styles.langBtnActive]}
              hitSlop={10}
            >
              <Text style={styles.langEmoji}>🇬🇧</Text>
            </Pressable>

            <Pressable onPress={() => setCalOpen(true)} style={styles.calBtnRound} hitSlop={10}>
              <Text style={styles.calEmoji}>📅</Text>
            </Pressable>
          </View>

          {/* Title + badges */}
          <View style={styles.leftHeaderRow}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {tab === "today"
                ? t("home.tabs.today")
                : tab === "upcoming"
                ? t("home.tabs.upcoming")
                : tab === "history"
                ? t("home.tabs.history")
                : t("home.tabs.search")}
            </Text>

            {tab === "today" && (
              <View style={styles.badgesRow}>
                <View style={styles.badgeDark}>
                  <Text style={styles.badgeDarkText}>{todayTotalCount}</Text>
                </View>
                <View style={styles.badgeGreen}>
                  <Text style={styles.badgeGreenText}>{todayRemainingCount}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* RIGHT: + New then Menu */}
        <View style={styles.rightHeader}>
          <Pressable
            style={[styles.addBtn, (!ready || !businessId || !canCreate) && { opacity: 0.45 }]}
            onPress={() => {
              if (!canCreate) {
                Alert.alert(t("subscription.expiredTitle"), t("subscription.expiredDialogText"));
                return;
              }
              navigation.navigate("NewAppointment");
            }}
            disabled={!ready || !businessId || !canCreate}
          >
            <Text style={styles.addText} numberOfLines={1} ellipsizeMode="tail">
              {t("home.addNew")}
            </Text>
          </Pressable>

          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)}>
            <Text style={styles.menuText}>≡</Text>
          </Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.switchRow}>
        <Pressable onPress={() => setTab("today")} style={[styles.switchBtn, tab === "today" && styles.switchBtnActive]}>
          <Text style={[styles.switchText, tab === "today" && styles.switchTextActive]}>{t("home.tabs.today")}</Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("upcoming")}
          style={[styles.switchBtn, tab === "upcoming" && styles.switchBtnActive]}
        >
          <Text style={[styles.switchText, tab === "upcoming" && styles.switchTextActive]}>{t("home.tabs.upcoming")}</Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("history")}
          style={[styles.switchBtn, tab === "history" && styles.switchBtnActive]}
        >
          <Text style={[styles.switchText, tab === "history" && styles.switchTextActive]}>{t("home.tabs.history")}</Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("search")}
          style={[styles.switchBtn, tab === "search" && styles.switchBtnActive]}
          accessibilityRole="button"
          accessibilityLabel={t("home.tabs.search")}
        >
          <Text style={[styles.switchText, tab === "search" && styles.switchTextActive]}>🔍</Text>
        </Pressable>
      </View>

      {showBanner && <SubscriptionBanner access={access} />}

      {/* SMS panel only on Today */}
      {tab === "today" && (sms2h.length > 0 || sms24h.length > 0) && (
        <View style={styles.smsPanel}>
          <Text style={styles.smsTitle}>{t("home.sms.title")}</Text>

          {sms2h.length > 0 && (
            <>
              {sms2h.slice(0, 3).map((a) => (
                <View key={a.id} style={styles.smsRow}>
                  <Text style={styles.smsRowText}>
                    {a.name} • {formatTimeGR(a.startsAt)}
                  </Text>
                  <Pressable style={styles.smsBtnSmall} onPress={() => sendSms(a, "2h")}>
                    <Text style={styles.smsBtnSmallText}>{t("home.sms.send")}</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}

          {sms24h.length > 0 && (
            <>
              <Text style={[styles.smsSub, { marginTop: 10 }]}>{t("home.sms.in24h")}</Text>
              {sms24h.slice(0, 3).map((a) => (
                <View key={a.id} style={styles.smsRow}>
                  <Text style={styles.smsRowText}>
                    {a.name} • {formatDateGR(a.startsAt)} {formatTimeGR(a.startsAt)}
                  </Text>
                  <Pressable style={styles.smsBtnSmall} onPress={() => sendSms(a, "24h")}>
                    <Text style={styles.smsBtnSmallText}>{t("home.sms.send")}</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}

          <Text style={styles.smsHint}>{t("home.sms.hint")}</Text>
        </View>
      )}

      {/* Search input only on Search tab */}
      {tab === "search" && (
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("home.search.placeholder")}
          placeholderTextColor="#9FE6C1"
          style={styles.search}
        />
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === "search"
              ? q.trim()
                ? t("home.empty.searchNoResult")
                : t("home.empty.searchTypeSomething")
              : tab === "history"
              ? t("home.empty.noPast")
              : t("home.empty.noAppointments")}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate("AppointmentDetails", { id: item.id })}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.name}>{item.name}</Text>
              {!!item.note && <Text style={styles.note}>{item.note}</Text>}
              <Text style={styles.time}>{formatDateTimeGR(item.startsAt)}</Text>
              <Text style={styles.phone}>{item.phone}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

// -------------------- styles --------------------
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#0c3224" },

  // Header
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { fontSize: 26, fontWeight: "900", color: "#fff", flexShrink: 1 },

  badgesRow: { flexDirection: "row", gap: 8, flexShrink: 0 },
  rightHeader: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },

  menuBtn: {
    backgroundColor: "#0F3A27",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: { color: "#D1FAE5", fontSize: 27, fontWeight: "900" },

  addBtn: {
    backgroundColor: "#22C55E",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { color: "#052016", fontWeight: "900" },

  leftHeaderCol: { flex: 1, minWidth: 0, flexDirection: "column" },
  leftHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },

  langRowTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6, alignSelf: "flex-start" },

  langBtnRound: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#062417",
    borderWidth: 1,
    borderColor: "#0F3A27",
    alignItems: "center",
    justifyContent: "center",
  },
  langBtnActive: { borderColor: "#22C55E", borderWidth: 2 },
  langEmoji: { fontSize: 18 },

  calBtnRound: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#062417",
    borderWidth: 1,
    borderColor: "#0F3A27",
    alignItems: "center",
    justifyContent: "center",
  },
  calEmoji: { fontSize: 18 },

  // Tabs
  switchRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#0F3A27",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: "#062417",
  },
  switchBtn: { flex: 1, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  switchBtnActive: { backgroundColor: "#22C55E" },
  switchText: { fontSize: 13, fontWeight: "800", color: "#D1FAE5" },
  switchTextActive: { color: "#052016" },

  // Badges
  badgeDark: {
    backgroundColor: "#0F3A27",
    borderWidth: 1,
    borderColor: "#0F3A27",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDarkText: { color: "#D1FAE5", fontWeight: "900" },

  badgeGreen: {
    backgroundColor: "#22C55E",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeGreenText: { color: "#052016", fontWeight: "900" },

  smsPanel: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  smsTitle: { color: "#fff", fontWeight: "900", marginBottom: 8, fontSize: 16 },
  smsSub: { color: "#D1FAE5", fontWeight: "800", marginBottom: 6 },
  smsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  smsRowText: { color: "#D1FAE5", flex: 1, marginRight: 10 },
  smsBtnSmall: { backgroundColor: "#22C55E", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  smsBtnSmallText: { color: "#052016", fontWeight: "900" },
  smsHint: { color: "#9FE6C1", marginTop: 6, fontSize: 12 },

  search: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    color: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  empty: { marginTop: 20, color: "#D1FAE5" },

  card: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#0F3A27",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#072A1C",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { color: "#fff", fontSize: 16, fontWeight: "900" },
  note: { color: "#9FE6C1", fontSize: 14, marginTop: 4 },
  time: { color: "#f5f9f7", fontSize: 16, marginTop: 4 },
  phone: { color: "#9FE6C1", fontSize: 14, marginTop: 2 },
  chev: { color: "#D1FAE5", fontSize: 28 },

  // Modal menu
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#072A1C",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#0F3A27",
  },
  sheetTitle: { color: "#fff", fontWeight: "900", fontSize: 16, marginBottom: 10 },
  sheetItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    marginBottom: 10,
  },
  sheetItemText: { color: "#D1FAE5", fontWeight: "900" },
  sheetCancel: { backgroundColor: "#0F3A27" },

  // ✅ Center backdrop
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  // Invite
  logoutBtnWide: {
    backgroundColor: "#7F1D1D",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  inviteCard: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 16,
    padding: 16,
  },
  inviteTitle: { color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 6 },
  inviteText: { color: "#D1FAE5", marginBottom: 12 },
  inviteBtnOk: {
    width: "100%",
    backgroundColor: "#22C55E",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  inviteBtnOkText: { color: "#052016", fontWeight: "900", fontSize: 16 },
  inviteBtnCancel: {
    flex: 1,
    backgroundColor: "#0F3A27",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  // ✅ Day list modal
  dayCard: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 16,
    padding: 16,
  },
  dayTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  dayCount: { color: "#9FE6C1", marginTop: 6, fontWeight: "800" },
  dayEmpty: { color: "#D1FAE5", marginTop: 10 },

  dayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    marginBottom: 10,
  },
  dayItemTime: { color: "#22C55E", fontWeight: "900", width: 54 },
  dayItemName: { color: "#fff", fontWeight: "900" },
  dayItemSub: { color: "#9FE6C1", marginTop: 2, fontSize: 13 },

  // ✅ Calendar modal styles
  calBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 18 },
  calCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#072A1C",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#0F3A27",
  },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  calNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#062417",
    borderWidth: 1,
    borderColor: "#0F3A27",
    alignItems: "center",
    justifyContent: "center",
  },
  calNavText: { color: "#D1FAE5", fontSize: 22, fontWeight: "900" },

  calWeekRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  calWeekDay: { width: "14.28%", textAlign: "center", color: "#9FE6C1", fontWeight: "900" },

  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", paddingVertical: 8, alignItems: "center", justifyContent: "center" },

  calDayWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#062417",
    borderWidth: 1,
    borderColor: "#0F3A27",
    alignItems: "center",
    justifyContent: "center",
  },
  calDayNum: { color: "#D1FAE5", fontWeight: "900" },

  calDayToday: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  calDayTodayText: { color: "#052016" },

  calCountPill: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  calCountText: { color: "#052016", fontWeight: "900" },
  calCountEmpty: { marginTop: 6 },

  calCloseBtn: {
    marginTop: 12,
    backgroundColor: "#0F3A27",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  calCloseText: { color: "#D1FAE5", fontWeight: "900" },
});






