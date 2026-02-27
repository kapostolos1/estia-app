// src/store/appointmentsStore.js
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { t } from "../i18n";
const GRACE_MS = 8 * 60 * 60 * 1000;
const Ctx = createContext(null);

// ✅ timeout helper (όπως το έχεις)
function withTimeout(promise, ms, msg) {
  return new Promise((resolve, reject) => {
    const tt = setTimeout(() => reject(new Error(msg)), ms);
    promise.then(
      (v) => {
        clearTimeout(tt);
        resolve(v);
      },
      (e) => {
        clearTimeout(tt);
        reject(e);
      }
    );
  });
}

function computeAccessFromDb({ entitlementRow, subRow }) {
  const now = Date.now();

  // ✅ ΡΥΘΜΙΣΕΙΣ UX
  const WARN_WINDOW_MS = 0; // ❌ καμία προειδοποίηση πριν τη λήξη
  

  const mkWarn = (msLeft) => {
    const totalMins = Math.max(0, Math.floor(msLeft / (60 * 1000)));
    const hh = Math.floor(totalMins / 60);
    const mm = totalMins % 60;
    return {
      warnLevel: "warning",
      warnText: t("subscription.expiringIn", { hh, mm }),
    };
  };

  const mkExpired = () => ({
    warnLevel: "info",
    warnText: t("subscription.expiredInline"),
  });

  // -------------------------
  // 1) ENTITLEMENT OVERRIDE
  // -------------------------
  if (entitlementRow) {
    const kind = (entitlementRow.kind || "").toLowerCase();

    if (kind === "lifetime") {
      return {
        allowed: true,
        status: "lifetime",
        endsAt: null,
        canCreate: true,
        warnLevel: null,
        warnText: null,
        hoursLeft: null,
      };
    }
   
        // ✅ Subscription entitlement (sub / subscription)
    if (kind === "sub" || kind === "subscription") {
      const expMs = entitlementRow.expires_at
        ? new Date(entitlementRow.expires_at).getTime()
        : null;

      // αν λείπει expires_at, το θεωρούμε unknown (δεν μπορείς να κρίνεις)
      if (!expMs) {
        return {
          allowed: true,
          status: "unknown",
          endsAt: null,
          canCreate: true,
          warnLevel: null,
          warnText: null,
          hoursLeft: null,
        };
      }

      const msLeft = expMs - now;

      // ✅ ενεργή συνδρομή
      if (msLeft > 0) {
        const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
        return {
          allowed: true,
          status: "paid", // ή "sub" αν προτιμάς
          endsAt: new Date(expMs).toISOString(),
          canCreate: true,
          warnLevel: null,
          warnText: null,
          hoursLeft,
        };
      }

      // ✅ GRACE 8 ωρών: δείξε banner αλλά ΜΗΝ κλειδώνεις
      if (now < expMs + GRACE_MS) {
        return {
          allowed: true,
          status: "grace",
          endsAt: new Date(expMs).toISOString(),
          canCreate: true,
          warnLevel: "info",
          warnText:
            t("subscription.expiredBanner") ||
            "Η συνδρομή έληξε. Κάντε ανανέωση για να συνεχίσετε να προσθέτετε νέα ραντεβού.",
          hoursLeft: 0,
        };
      }

      // ✅ expired: κλείδωσε νέα ραντεβού
      return {
        allowed: false,
        status: "expired",
        endsAt: new Date(expMs).toISOString(),
        canCreate: false,
        warnLevel: "info",
        warnText:
          t("subscription.expiredBanner") ||
          "Η συνδρομή έληξε. Κάντε ανανέωση για να συνεχίσετε να προσθέτετε νέα ραντεβού.",
        hoursLeft: 0,
      };
    }

    if (kind === "gift_until") {
      const expMs = entitlementRow.expires_at
        ? new Date(entitlementRow.expires_at).getTime()
        : null;

      if (!expMs) {
        return {
          allowed: true,
          status: "gift",
          endsAt: null,
          canCreate: true,
          warnLevel: null,
          warnText: null,
          hoursLeft: null,
        };
      }

      const msLeft = expMs - now;

      if (msLeft > 0) {
        const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));

        return {
          allowed: true,
          status: "gift",
          endsAt: new Date(expMs).toISOString(),
          canCreate: true,
          warnLevel: null,
          warnText: null,
          hoursLeft,
        };
      }

      // ✅ 8 ώρες “δώρο” μετά τη λήξη (χωρίς να το γράφει πουθενά)
      if (now < expMs + GRACE_MS) {
        return {
          allowed: true,
          status: "grace",
          endsAt: new Date(expMs).toISOString(),
          canCreate: true,
          warnLevel: "info",
          warnText: t("subscription.expiredBanner") || "Η συνδρομή έληξε",
          hoursLeft: 0,
        };
      }

      const exp = mkExpired();
      return {
        allowed: false,
        status: "expired",
        endsAt: new Date(expMs).toISOString(),
        canCreate: false,
        hoursLeft: 0,
        ...exp,
      };
    }

    return {
      allowed: true,
      status: "unknown",
      endsAt: null,
      canCreate: true,
      warnLevel: null,
      warnText: null,
      hoursLeft: null,
    };
  }

  // -------------------------
  // 2) FALLBACK: SUBSCRIPTIONS
  // -------------------------
  if (!subRow) {
    return {
      allowed: true,
      status: "unknown",
      endsAt: null,
      canCreate: true,
      warnLevel: null,
      warnText: null,
      hoursLeft: null,
    };
  }

  const trialEnds = subRow.trial_ends_at ? new Date(subRow.trial_ends_at).getTime() : null;
  const paidUntil = subRow.paid_until ? new Date(subRow.paid_until).getTime() : null;

  const endsAtMs =
    (paidUntil && paidUntil > 0 ? paidUntil : null) ??
    (trialEnds && trialEnds > 0 ? trialEnds : null);

  if (!endsAtMs) {
    return {
      allowed: true,
      status: "unknown",
      endsAt: null,
      canCreate: true,
      warnLevel: null,
      warnText: null,
      hoursLeft: null,
    };
  }

  const msLeft = endsAtMs - now;

  if (msLeft > 0) {
    const status = paidUntil && paidUntil >= now ? "paid" : "trial";
    const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));

    return {
      allowed: true,
      status,
      endsAt: new Date(endsAtMs).toISOString(),
      canCreate: true,
      warnLevel: null,
      warnText: null,
      hoursLeft,
    };
  }

  if (now < endsAtMs + GRACE_MS) {
    return {
      allowed: true,
      status: "grace",
      endsAt: new Date(endsAtMs).toISOString(),
      canCreate: true,
      warnLevel: "info",
      warnText:
        t("subscription.expiredBanner") ||
        "Η συνδρομή έληξε. Κάντε ανανέωση για να συνεχίσετε να προσθέτετε νέα ραντεβού.",
      hoursLeft: 0,
    };
  }

  const exp = mkExpired();
  return {
    allowed: false,
    status: "expired",
    endsAt: new Date(endsAtMs).toISOString(),
    canCreate: false, // ✅ κλειδώνει μετά το 8ωρο
    warnLevel: "info",
    warnText:
      t("subscription.expiredBanner") ||
      "Η συνδρομή έληξε. Κάντε ανανέωση για να συνεχίσετε να προσθέτετε νέα ραντεβού.",
    hoursLeft: 0,
    ...exp,
  };
}

export function AppointmentsProvider({ children }) {
  const [ready, setReady] = useState(false);

  const [businessId, setBusinessId] = useState(null);
  useEffect(() => {
    console.log("BUSINESS_ID CHANGED ✅", businessId);
  }, [businessId]);

  const [myRole, setMyRole] = useState(null); // owner | staff | needs_invite | null
  const [showTrialIntro, setShowTrialIntro] = useState(false);

  const [appointments, setAppointments] = useState([]);

  const [access, setAccess] = useState({
    allowed: true,
    status: "unknown",
    endsAt: null,
    canCreate: true,
    warnLevel: null,
    warnText: null,
    hoursLeft: null,
  });

  const accessRef = useRef(access);
  useEffect(() => {
    accessRef.current = access;
  }, [access]);

  const refreshingRef = useRef(false);

  // realtime channels
  const apptChannelRef = useRef(null);
  const subsChannelRef = useRef(null);
  const entChannelRef = useRef(null); // ✅ NEW

  // ✅ 8 ώρες "σιωπηρό δώρο" μετά τη λήξη
  const graceTimeoutRef = useRef(null);

  const clearGraceTimer = useCallback(() => {
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
  }, []);

  const stopRealtime = useCallback(() => {
    // ✅ σταμάτα και το grace timer
    clearGraceTimer();

    if (apptChannelRef.current) {
      supabase.removeChannel(apptChannelRef.current);
      apptChannelRef.current = null;
    }
    if (subsChannelRef.current) {
      supabase.removeChannel(subsChannelRef.current);
      subsChannelRef.current = null;
    }
    if (entChannelRef.current) {
      supabase.removeChannel(entChannelRef.current);
      entChannelRef.current = null;
    }
  }, [clearGraceTimer]);

  function mapRow(r) {
    return {
      id: r.id,
      businessId: r.business_id,
      name: r.name,
      phone: r.phone,
      note: r.note ?? "",
      startsAt: r.starts_at,
      status: r.status ?? "active",
      sms24Sent: !!r.sms24_sent,
      sms2hSent: !!r.sms2h_sent,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
    };
  }

  const loadAppointments = useCallback(async (bId) => {
    if (!bId) {
      setAppointments([]);
      return;
    }

    const { data, error } = await withTimeout(
      supabase
        .from("appointments")
        .select(
          "id, business_id, name, phone, note, starts_at, status, sms24_sent, sms2h_sent, created_at, updated_at"
        )
        .eq("business_id", bId)
        .order("starts_at", { ascending: true }),
      12000,
      "Timeout στο loadAppointments"
    );

    if (error) throw error;
    setAppointments((data || []).map(mapRow));
  }, []);

  // ✅ για να καλούμε loadAccess μέσα σε timer χωρίς closure προβλήματα
  const loadAccessRef = useRef(null);

  const loadAccess = useCallback(
    async (bId) => {
      console.log("LOAD_ACCESS_FOR_BID ✅", bId, Date.now());

      // ✅ καθάρισε παλιό grace timer πριν υπολογίσεις νέο access
      clearGraceTimer();

      if (!bId) {
        setAccess((prev) => ({
          ...prev,
          status: "unknown",
          allowed: true,
          canCreate: true,
        }));
        return;
      }

      const { data: u } = await withTimeout(
        supabase.auth.getUser(),
        8000,
        "Timeout στο getUser (loadAccess)"
      );
      const userId = u?.user?.id;

      if (!userId) {
        setAccess((prev) => ({
          ...prev,
          status: "unknown",
          allowed: true,
          canCreate: true,
        }));
        return;
      }

      // ✅ Φέρνουμε ΚΑΙ entitlement ΚΑΙ subscription (bulletproof)
      const [entRes, subRes] = await withTimeout(
        Promise.all([
          supabase
            .from("business_entitlements")
            .select("business_id, kind, expires_at, note, revoked_at, created_at")
            .eq("business_id", bId)
            .is("revoked_at", null)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("subscriptions")
            .select("business_id, trial_ends_at, paid_until")
            .eq("business_id", bId)
            .maybeSingle(),
        ]),
        15000,
        "Timeout στο business_entitlements/subscriptions (loadAccess)"
      );

      if (entRes?.error) throw entRes.error;
      if (subRes?.error) throw subRes.error;

      const entitlementRow = entRes?.data?.[0] || null;
      const subRow = subRes?.data || null;

      const entAccess = entitlementRow
        ? computeAccessFromDb({ entitlementRow, subRow: null })
        : null;

      const subAccess = computeAccessFromDb({ entitlementRow: null, subRow });

      const entKind = String(entitlementRow?.kind || "").toLowerCase();
      const subStatus = String(subAccess?.status || "").toLowerCase();
      const subActive = subStatus === "paid" || subStatus === "trial";

      let res;

      // ✅ lifetime πάντα νικάει
      if (entKind === "lifetime") {
        res = entAccess;
      } else if (subActive) {
        // ✅ paid/trial υπερισχύει οποιουδήποτε gift/grace/expired entitlement
        res = subAccess;
      } else if (entAccess) {
        // ✅ αλλιώς άσε entitlement να οδηγήσει (gift/grace/expired)
        res = entAccess;
      } else {
        res = subAccess;
      }

      console.log("ACCESS_FROM_DB =>", {
        status: res?.status,
        canCreate: res?.canCreate,
        allowed: res?.allowed,
        endsAt: res?.endsAt,
      });

      setAccess(res);

      // ✅ Αν είμαστε σε grace, κάνε auto recheck όταν τελειώσει το 8ωρο
      if (res?.status === "grace" && res?.endsAt) {
        const endsMs = new Date(res.endsAt).getTime();
        const graceEndsMs = endsMs + GRACE_MS;
        const delay = graceEndsMs - Date.now() + 1500;

        if (delay <= 0) {
          loadAccessRef.current?.(bId)?.catch?.(() => {});
        } else {
          graceTimeoutRef.current = setTimeout(() => {
            loadAccessRef.current?.(bId)?.catch?.(() => {});
          }, delay);
        }
      }
    },
    [clearGraceTimer, GRACE_MS]
  );

  useEffect(() => {
    loadAccessRef.current = loadAccess;
  }, [loadAccess]);

  const markTrialIntroSeen = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) {
        setShowTrialIntro(false);
        return;
      }

      await supabase.from("profiles").update({ trial_info_seen: true }).eq("id", userId);
      setShowTrialIntro(false);
    } catch (e) {
      setShowTrialIntro(false);
    }
  }, []);

  const startRealtime = useCallback(
    (bId) => {
      stopRealtime();
      if (!bId) return;

      apptChannelRef.current = supabase
        .channel(`appointments:${bId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${bId}` },
          (payload) => {
            const evt = payload.eventType;

            if (evt === "INSERT") {
              const row = mapRow(payload.new);
              setAppointments((prev) => {
                const exists = prev.some((a) => a.id === row.id);
                const next = exists ? prev : [...prev, row];
                next.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
                return next;
              });
              return;
            }

            if (evt === "UPDATE") {
              const row = mapRow(payload.new);
              setAppointments((prev) => prev.map((a) => (a.id === row.id ? row : a)));
              return;
            }

            if (evt === "DELETE") {
              const id = payload.old?.id;
              if (!id) return;
              setAppointments((prev) => prev.filter((a) => a.id !== id));
            }
          }
        )
        .subscribe();

      subsChannelRef.current = supabase
        .channel(`subscriptions:${bId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "subscriptions", filter: `business_id=eq.${bId}` },
          () => {
            loadAccess(bId).catch(() => {});
          }
        )
        .subscribe();

      entChannelRef.current = supabase
        .channel(`business_entitlements:${bId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "business_entitlements", filter: `business_id=eq.${bId}` },
          () => {
            loadAccess(bId).catch(() => {});
          }
        )
        .subscribe();
    },
    [stopRealtime, loadAccess]
  );

  /**
   * ensureBusinessAndRole:
   * - staff χωρίς business_id => needs_invite
   * - owner χωρίς business_id => bootstrap business
   */
  const ensureBusinessAndRole = useCallback(async (user) => {
    const email = (user?.email || "").toLowerCase().trim();
    const fullName = (user?.user_metadata?.full_name || "").trim();
    const workPhone = (user?.user_metadata?.work_phone || "").trim();

    const metaSignupType = (user?.user_metadata?.signup_type || "").toLowerCase();
    const metaInviteCode = (user?.user_metadata?.invite_code || "").trim();
    const looksLikeStaff = metaSignupType === "staff" || !!metaInviteCode;

    let { data: prof, error: ep } = await withTimeout(
      supabase
        .from("profiles")
        .select("id, role, business_id, email, full_name, work_phone, trial_info_seen")
        .eq("id", user.id)
        .maybeSingle(),
      12000,
      "Timeout στο profiles (ensureBusinessAndRole)"
    );
    if (ep) throw ep;

    if (!prof) {
      const { data: created, error: ei } = await withTimeout(
        supabase
          .from("profiles")
          .upsert(
            [
              {
                id: user.id,
                email,
                full_name: fullName || null,
                work_phone: workPhone || null,
                role: null,
                business_id: null,
                trial_info_seen: false,
              },
            ],
            { onConflict: "id" }
          )
          .select("id, role, business_id, trial_info_seen")
          .single(),
        12000,
        "Timeout στο upsert profiles"
      );
      if (ei) throw ei;
      prof = created;
    }

    if (prof?.business_id) {
      let role = (prof.role || "").toLowerCase();

      if (!role) {
        const { data: biz, error: bizErr } = await withTimeout(
          supabase.from("businesses").select("owner_id").eq("id", prof.business_id).single(),
          12000,
          "Timeout στο businesses (resolve owner)"
        );

        if (!bizErr && biz?.owner_id) {
          role = biz.owner_id === user.id ? "owner" : "staff";
          await supabase.from("profiles").update({ role }).eq("id", user.id);
        } else {
          role = "staff";
        }
      }

      const looksLikeStaff2 =
        String(user?.user_metadata?.signup_type || "").toLowerCase() === "staff" ||
        !!String(user?.user_metadata?.invite_code || "").trim();

      const shouldShowTrialIntro =
        role === "owner" && !looksLikeStaff2 && prof.trial_info_seen !== true;

      setShowTrialIntro(shouldShowTrialIntro);

      return { businessId: prof.business_id, role };
    }

    const bName = fullName || (email ? `Επιχείρηση ${email}` : "Νέα Επιχείρηση");

    const { data: b, error: eb } = await withTimeout(
      supabase.from("businesses").insert([{ name: bName, owner_id: user.id }]).select("id").single(),
      12000,
      "Timeout στο insert businesses"
    );
    if (eb) throw eb;

    const { error: eu } = await withTimeout(
      supabase.from("profiles").update({ business_id: b.id, role: "owner" }).eq("id", user.id),
      12000,
      "Timeout στο update profiles (set business_id)"
    );
    if (eu) throw eu;

    setShowTrialIntro(true);
    return { businessId: b.id, role: "owner" };
  }, []);

  // ✅ lock για να μην τρέχει applyUserState 2 φορές παράλληλα
  const applyLockRef = useRef(false);
  const pendingApplyRef = useRef(null);

  const applyUserState = useCallback(
    async (user) => {
      if (applyLockRef.current) {
        pendingApplyRef.current = user;
        return;
      }
      applyLockRef.current = true;

      try {
        if (!user) {
          stopRealtime();
          setBusinessId(null);
          setMyRole(null);
          setAppointments([]);
          setAccess({
            allowed: true,
            status: "unknown",
            endsAt: null,
            canCreate: true,
            warnLevel: null,
            warnText: null,
            hoursLeft: null,
          });
          return;
        }

        const res = await withTimeout(
          ensureBusinessAndRole(user),
          12000,
          "Timeout στο ensureBusinessAndRole"
        );

        setBusinessId(res.businessId);
        setMyRole(res.role);

        if (res.businessId) {
          startRealtime(res.businessId);

          await withTimeout(
            Promise.all([loadAppointments(res.businessId), loadAccess(res.businessId)]),
            15000,
            "Timeout στο loadAppointments/loadAccess"
          );
        } else {
          stopRealtime();
          setAppointments([]);
          setAccess((prev) => ({
            ...prev,
            status: "unknown",
            allowed: true,
            canCreate: true,
            warnLevel: null,
            warnText: null,
            hoursLeft: null,
            endsAt: null,
          }));
        }
      } catch (e) {
        stopRealtime();
        setAppointments([]);
        setAccess((prev) => ({
          ...prev,
          status: "unknown",
          allowed: true,
          canCreate: true,
          warnLevel: null,
          warnText: null,
          hoursLeft: null,
          endsAt: null,
        }));
      } finally {
        applyLockRef.current = false;

        const pending = pendingApplyRef.current;
        pendingApplyRef.current = null;
        if (pending) {
          setTimeout(() => applyUserState(pending), 0);
        }
      }
    },
    [ensureBusinessAndRole, startRealtime, loadAppointments, loadAccess, stopRealtime]
  );

  // ✅ Refresh από DB κάθε 2 ώρες
  useEffect(() => {
    if (!businessId) return;
    console.log("CALLING loadAccess ✅", businessId);
    loadAccess(businessId).catch(() => {});

    const id = setInterval(() => {
      loadAccess(businessId).catch(() => {});
    }, 2 * 60 * 60 * 1000);

    return () => clearInterval(id);
  }, [businessId, loadAccess]);

  // ✅ UI-only ticker: ΜΟΝΟ hoursLeft/warn. Δεν πειράζει status/allowed/canCreate.
  useEffect(() => {
    const id = setInterval(() => {
      setAccess((prev) => {
        if (!prev?.endsAt) return prev;

        const nowTs = Date.now();
        const endsTs = new Date(prev.endsAt).getTime();
        const diffMs = endsTs - nowTs;

        const hoursLeft = diffMs > 0 ? Math.ceil(diffMs / 3600000) : 0;

        const WARN_WINDOW_MS = 24 * 60 * 60 * 1000;
        const st = String(prev.status || "").toLowerCase();
        const isActive = st === "paid" || st === "trial" || st === "gift" || st === "lifetime";

        let warnLevel = prev.warnLevel;
        let warnText = prev.warnText;

        if (isActive && diffMs > 0 && diffMs <= WARN_WINDOW_MS) {
          const totalMins = Math.max(0, Math.floor(diffMs / 60000));
          const hh = Math.floor(totalMins / 60);
          const mm = totalMins % 60;
          warnLevel = "warning";
          warnText = t("subscription.expiringIn", { hh, mm });
        }

        if (hoursLeft === prev.hoursLeft && warnLevel === prev.warnLevel && warnText === prev.warnText) {
          return prev;
        }

        return { ...prev, hoursLeft, warnLevel, warnText };
      });
    }, 60 * 1000);

    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(
    async (_opts = {}) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const { data } = await withTimeout(
          supabase.auth.getUser(),
          8000,
          "Timeout στο getUser (refresh)"
        );
        await applyUserState(data?.user || null);
      } finally {
        refreshingRef.current = false;
      }
    },
    [applyUserState]
  );

  // ✅ init: session + listener
  useEffect(() => {
    let alive = true;
    let unsub = null;

    (async () => {
      try {
        const { data } = await withTimeout(
          supabase.auth.getUser(),
          8000,
          "Timeout στο getUser (init)"
        );

        try {
          await withTimeout(
            applyUserState(data?.user || null),
            12000,
            "Timeout στο applyUserState (init)"
          );
        } catch (_) {}
      } finally {
        if (alive) setReady(true);
      }

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        applyUserState(session?.user || null).catch(() => {});
      });

      unsub = sub?.subscription;
    })();

    return () => {
      alive = false;
      try {
        unsub?.unsubscribe?.();
      } catch (_) {}
      stopRealtime();
    };
  }, [applyUserState, stopRealtime]);

  // -------------------------
  // ✅ CRUD
  // -------------------------
  const createAppointment = useCallback(
    async ({ name, phone, startsAt, note }) => {
      if (!businessId) throw new Error("Δεν υπάρχει επιχείρηση ακόμα.");

      // ✅ Soft-block πριν φας RLS error
      if (!accessRef.current?.canCreate) {
        throw new Error(t("subscription.expiredDialogText"));
      }

      const { error } = await supabase.from("appointments").insert([
        {
          business_id: businessId,
          name,
          phone,
          note: note ?? null,
          starts_at: startsAt,
          status: "active",
          sms24_sent: false,
          sms2h_sent: false,
        },
      ]);

      if (error) throw error;
    },
    [businessId]
  );

  const updateAppointment = useCallback(async (id, patch) => {
    const dbPatch = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    if (patch.note !== undefined) dbPatch.note = patch.note;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt;
    if (patch.sms24Sent !== undefined) dbPatch.sms24_sent = patch.sms24Sent;
    if (patch.sms2hSent !== undefined) dbPatch.sms2h_sent = patch.sms2hSent;

    const { data, error } = await supabase
      .from("appointments")
      .update(dbPatch)
      .eq("id", id)
      .select(
        "id, business_id, name, phone, note, starts_at, status, sms24_sent, sms2h_sent, created_at, updated_at"
      )
      .single();

    if (error) throw error;

    setAppointments((prev) => prev.map((a) => (a.id === id ? mapRow(data) : a)));
  }, []);

  const deleteAppointment = useCallback(async (id) => {
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) throw error;

    setAppointments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const needsInvite = myRole === "needs_invite";

  const value = useMemo(
    () => ({
      ready,
      businessId,
      myRole,
      needsInvite,

      appointments,
      loadAppointments,
      showTrialIntro,
      markTrialIntroSeen,

      access,

      refresh,

      createAppointment,
      updateAppointment,
      deleteAppointment,
    }),
    [
      ready,
      businessId,
      myRole,
      needsInvite,
      appointments,
      loadAppointments,
      showTrialIntro,
      markTrialIntroSeen,
      access,
      refresh,
      createAppointment,
      updateAppointment,
      deleteAppointment,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppointments() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppointments must be used within AppointmentsProvider");
  return ctx;
}



















