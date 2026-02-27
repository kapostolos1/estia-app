// src/screens/UsersScreen.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Alert, Modal, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../lib/supabase";
import { useAppointments } from "../store/appointmentsStore";
import { t } from "../i18n";

// helper για κωδικό
function makeCode(len = 6) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // χωρίς I, O, 0, 1
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function UsersScreen() {
  const { businessId, myRole, ready, refresh } = useAppointments();
  const isOwner = myRole === "owner";

  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const canUse = ready && businessId && isOwner;

  const loadMembers = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, work_phone, role, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMembers(data || []);
    } catch (e) {
      Alert.alert(t("errors.errorTitle"), e?.message || t("users.errors.loadUsers"));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers])
  );

  useEffect(() => {
    if (typeof refresh === "function") refresh();
  }, [refresh]);

  const ownerRow = useMemo(() => members.find((m) => m.role === "owner"), [members]);

  async function createInvite() {
    if (!canUse) {
      Alert.alert(t("users.notAllowedTitle"), t("users.notAllowedText"));
      return;
    }

    const code = makeCode(6);
    setLoading(true);
    try {
      const { error } = await supabase.from("staff_invites").insert([
        {
          business_id: businessId,
          code,
          role: "staff",
        },
      ]);

      if (error) throw error;

      setInviteCode(code);
      setInviteModalOpen(true);
    } catch (e) {
      Alert.alert(t("errors.errorTitle"), e?.message || t("users.errors.createInvite"));
    } finally {
      setLoading(false);
    }
  }

  function confirmRemove(member) {
    Alert.alert(
      t("users.removeTitle"),
      t("users.removeText", {
        name: member.full_name || member.email || member.id,
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("users.removeBtn"), style: "destructive", onPress: () => removeMember(member) },
      ]
    );
  }

  async function removeMember(member) {
    if (!canUse) return;

    if (member.role === "owner") {
      Alert.alert(t("users.cantTitle"), t("users.cantRemoveOwner"));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc("owner_remove_staff", {
        p_staff_id: member.id,
      });
      if (error) throw error;

      await loadMembers();
    } catch (e) {
      Alert.alert(t("errors.errorTitle"), e?.message || t("users.errors.removeUser"));
    } finally {
      setLoading(false);
    }
  }

  // ---- Guards ----
  if (!ready) {
    return (
      <View style={styles.container}>
        <Text style={{ color: "#D1FAE5" }}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (!businessId) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 10 }}>
          {t("users.noBusinessTitle")}
        </Text>
        <Text style={{ color: "#D1FAE5" }}>{t("users.noBusinessText")}</Text>
      </View>
    );
  }

  if (!isOwner) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 10 }}>
          {t("users.title")}
        </Text>
        <Text style={{ color: "#D1FAE5" }}>{t("users.ownerOnlyText")}</Text>
      </View>
    );
  }

  // ---- Normal UI ----
  return (
    <View style={styles.container}>
      {/* Invite Modal */}
      <Modal visible={inviteModalOpen} transparent animationType="fade" onRequestClose={() => setInviteModalOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setInviteModalOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("users.inviteTitle")}</Text>
            <Text style={styles.modalText}>{t("users.inviteText")}</Text>

            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{inviteCode}</Text>
            </View>

            <Pressable style={styles.modalBtn} onPress={() => setInviteModalOpen(false)}>
              <Text style={{ color: "#052016", fontWeight: "900" }}>{t("common.ok")}</Text>
            </Pressable>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.topRow}>
        <Text style={styles.title}>{t("users.title")}</Text>

        <Pressable style={[styles.addBtn, loading && { opacity: 0.7 }]} onPress={createInvite} disabled={loading}>
          <Text style={styles.addText}>{t("users.addStaffCode")}</Text>
        </Pressable>
      </View>

      {ownerRow && (
        <View style={styles.ownerBox}>
          <Text style={styles.ownerTitle}>{t("users.ownerSection")}</Text>
          <Text style={styles.ownerLine}>{ownerRow.full_name || ownerRow.email || ownerRow.id}</Text>
          {!!ownerRow.work_phone && (
            <Text style={styles.ownerLine}>
              {t("users.phone")}: {ownerRow.work_phone}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>{t("users.teamSection")}</Text>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadMembers}
        ListEmptyComponent={<Text style={styles.empty}>{t("users.emptyUsers")}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.name}>{item.full_name || "—"}</Text>
              <Text style={styles.meta}>{item.email || ""}</Text>
              {!!item.work_phone && (
                <Text style={styles.meta}>
                  {t("users.phone")}: {item.work_phone}
                </Text>
              )}
              <Text style={styles.role}>{item.role}</Text>
            </View>

            {item.role !== "owner" && (
              <Pressable style={styles.removeBtn} onPress={() => confirmRemove(item)} disabled={loading}>
                <Text style={styles.removeText}>{t("users.removeBtn")}</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#0c3224" },

  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 22, fontWeight: "900", color: "#fff" },

  addBtn: { backgroundColor: "#22C55E", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  addText: { color: "#052016", fontWeight: "900" },

  ownerBox: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  ownerTitle: { color: "#fff", fontWeight: "900", marginBottom: 6 },
  ownerLine: { color: "#D1FAE5" },

  sectionTitle: { color: "#D1FAE5", fontWeight: "900", marginBottom: 8 },

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
  meta: { color: "#9FE6C1", fontSize: 12, marginTop: 3 },
  role: { color: "#D1FAE5", fontSize: 12, marginTop: 6, fontWeight: "900" },

  removeBtn: { backgroundColor: "#7F1D1D", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  removeText: { color: "#fff", fontWeight: "900" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  modalCard: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#072A1C",
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  modalText: { color: "#D1FAE5", marginTop: 6, marginBottom: 12 },

  codeBox: {
    borderWidth: 1,
    borderColor: "#0F3A27",
    backgroundColor: "#062417",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  codeText: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 2 },

  modalBtn: { backgroundColor: "#22C55E", padding: 12, borderRadius: 12, alignItems: "center" },
});

