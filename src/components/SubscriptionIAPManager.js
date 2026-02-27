// src/components/SubscriptionIAPManager.js
import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Linking from "expo-linking";
import { useIAP } from "react-native-iap";
import { supabase } from "../lib/supabase";
import { t } from "../i18n";
import { useAppointments } from "../store/appointmentsStore";
import { useEffect } from "react";
import { AppState } from "react-native";
const SUB_SKU = "estia_monthly";

const Ctx = createContext(null);

function tt(key, fallback) {
  try {
    const v = t(key);
    if (typeof v === "string" && v.startsWith("[missing")) return fallback;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

async function openSubscriptions() {
  const urlWeb = "https://play.google.com/store/account/subscriptions";
  try {
    const can = await Linking.canOpenURL(urlWeb);
    if (can) return Linking.openURL(urlWeb);
  } catch {}
  Alert.alert(
    tt("common.errorTitle", "Σφάλμα"),
    tt("paywall.errCannotOpenSubscriptions", "Δεν μπορώ να ανοίξω τις συνδρομές.")
  );
}

/** ✅ 3A helper: wait λίγο για να ενημερωθεί το subscriptions state */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForSubItem(getter, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const item = getter();
    if (item) return item;
    await wait(250);
  }
  return null;
}

function extractToken(purchase) {
  return (
    purchase?.purchaseToken ||
    purchase?.androidPurchaseToken ||
    purchase?.purchaseTokenAndroid ||
    null
  );
}

export function SubscriptionIAPProvider({ children }) {
  const { myRole, refresh } = useAppointments();
  const [busy, setBusy] = useState(false);
  const lastStartRef = useRef(0);

  const roleReady = !!myRole;
  const isOwner = (myRole || "").toLowerCase() === "owner";

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getAvailablePurchases, // ✅ RESTORE support

  } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      setBusy(true);
      try {
        const purchaseToken = extractToken(purchase);

        if (!purchaseToken) {
          console.log("PURCHASE OBJECT:", JSON.stringify(purchase, null, 2));
          throw new Error("Missing purchaseToken from purchase");
        }

        // ✅ 1) ACK πρώτα για να μη γίνεται auto-cancel στο test
        await finishTransaction({ purchase, isConsumable: false });
        const { data: sess } = await supabase.auth.getSession();
        console.log("SESSION??", !!sess?.session);
        console.log("CALLING PLAY VERIFY...");
        // ✅ 2) Μετά verify στο backend
        const { data, error } = await supabase.functions.invoke("play-verify", {
          body: { kind: "subscription", productId: SUB_SKU, purchaseToken },
        });

        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Verify failed");

        // ✅ 3) refresh για να φύγει banner/ξεκλείδωμα
        await refresh?.({ reason: "purchaseSuccess" });

        // ✅ 3B) bulletproof refresh (σε περίπτωση που DB write “αργήσει” 1-2s)
        setTimeout(() => refresh?.({ reason: "purchaseSuccess:retry" }), 1200);
      } catch (e) {
        console.log("IAP ERROR:", e?.message || e);
        Alert.alert("Σφάλμα", e?.message || "Κάτι πήγε στραβά στην αγορά.");
      } finally {
        setBusy(false);
      }
    },

    onPurchaseError: async (e) => {  
  
  useEffect(() => {
    if (!roleReady) return;

    const tick = () => refresh?.({ reason: "iap:poll" });

    // κάθε 60s ένα refresh
    const id = setInterval(tick, 60 * 1000);

    // όταν η εφαρμογή ξαναγίνει active
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") tick();
    });

    return () => {
      clearInterval(id);
      sub?.remove?.();
    };
  }, [roleReady, refresh]); 

  
      const msg = String(e?.message || e);

      // Αν λέει already owned / already subscribed -> κάνε RESTORE+VERIFY
      const alreadyOwned =
        /already.*owned|already.*subscribed|ITEM_ALREADY_OWNED|E_ALREADY_OWNED/i.test(msg);

      if (alreadyOwned) {
        try {
          setBusy(true);

          const purchases = await getAvailablePurchases?.();
          const list = Array.isArray(purchases) ? purchases : [];

          // Βρες subscription purchase για το SKU
          const match =
            list.find((p) => (p.productId || p.id) === SUB_SKU) ||
            list.find((p) => Array.isArray(p.productIds) && p.productIds.includes(SUB_SKU)) ||
            null;

          const purchaseToken = extractToken(match);

          if (purchaseToken) {
            const { data, error } = await supabase.functions.invoke("play-verify", {
              body: { kind: "subscription", productId: SUB_SKU, purchaseToken },
            });

            if (!error && data?.ok) {
              await refresh?.({ reason: "restoreSuccess" });
              setTimeout(() => refresh?.({ reason: "restoreSuccess:retry" }), 1200);
              return;
            }
          }

          // Αν δεν βρήκαμε token ή verify απέτυχε, πάμε manage subscriptions
          await openSubscriptions();
        } catch (err) {
          await openSubscriptions();
        } finally {
          setBusy(false);
        }
        return;
      }

      Alert.alert(tt("common.errorTitle", "Σφάλμα"), msg);
      setBusy(false);
    },
  });

  const subItem = useMemo(() => {
    return (subscriptions || []).find((s) => (s.productId || s.id) === SUB_SKU) || null;
  }, [subscriptions]);

  const ensureProduct = async () => {
    if (Platform.OS !== "android") return;
    if (!connected) return;
    if (subItem) return;

    try {
      await fetchProducts({ skus: [SUB_SKU], type: "subs" });
    } catch {
      // ok
    }
  };

  // ✅ RESTORE button-like behavior: πριν αγοράσει, προσπάθησε πρώτα sync
  const restoreAndVerifyIfPossible = async () => {
    try {
      const purchases = await getAvailablePurchases?.();
      const list = Array.isArray(purchases) ? purchases : [];

      const match =
        list.find((p) => (p.productId || p.id) === SUB_SKU) ||
        list.find((p) => Array.isArray(p.productIds) && p.productIds.includes(SUB_SKU)) ||
        null;

      const purchaseToken = extractToken(match);
      if (!purchaseToken) return false;

      const { data, error } = await supabase.functions.invoke("play-verify", {
        body: { kind: "subscription", productId: SUB_SKU, purchaseToken },
      });

      if (error) return false;
      if (!data?.ok) return false;

      await refresh?.({ reason: "restoreAttempt" });
      setTimeout(() => refresh?.({ reason: "restoreAttempt:retry" }), 1200);
      return true;
    } catch {
      return false;
    }
  };

  // Αυτό είναι που θα καλεί η Home/Banner
  const startFlow = async () => {
    // throttle
    const now = Date.now();
    if (now - lastStartRef.current < 1200) return;
    lastStartRef.current = now;

    if (busy) return; // extra guard
    if (!roleReady) return;

    if (!roleReady) return;
    if (!isOwner) {
      Alert.alert(
        tt("common.errorTitle", "Σφάλμα"),
        tt("paywall.onlyOwnerCanPay", "Μόνο ο ιδιοκτήτης μπορεί να ενεργοποιήσει συνδρομή.")
      );
      return;
    }

    if (Platform.OS !== "android") {
      Alert.alert(
        tt("common.errorTitle", "Σφάλμα"),
        "Η συνδρομή είναι διαθέσιμη μόνο μέσω Google Play (Android)."
      );
      return;
    }

    if (!connected) {
      Alert.alert(
        tt("common.errorTitle", "Σφάλμα"),
        tt("paywall.iapNotReady", "Το Play Billing δεν είναι έτοιμο. Δοκίμασε ξανά σε λίγα δευτερόλεπτα.")
      );
      return;
    }

    setBusy(true);
    try {
      // ✅ Πρώτα try restore/sync (αν είναι ήδη subscribed)
      const restored = await restoreAndVerifyIfPossible();
      if (restored) {
        await openSubscriptions();
        return;
      }

      await ensureProduct();

      // περίμενε λίγο να ενημερωθεί το subscriptions state
      const item = await waitForSubItem(
        () => (subscriptions || []).find((s) => (s.productId || s.id) === SUB_SKU),
        4
      );

      if (!item) {
        Alert.alert(
          tt("common.errorTitle", "Σφάλμα"),
          tt("paywall.productNotReady",
            "Το προϊόν συνδρομής δεν βρέθηκε ακόμα. Δοκίμασε ξανά σε λίγα δευτερόλεπτα."
          )
        );
        return;
      }

      const offerDetails = item?.subscriptionOfferDetailsAndroid || [];
      const offers = offerDetails
        .map((od) => od?.offerToken)
        .filter(Boolean)
        .map((offerToken) => ({
          sku: SUB_SKU,
          offerToken,
        }));

      await requestPurchase({
        type: "subs",
        request: {
          google: {
            skus: [SUB_SKU],
            ...(offers.length > 0 ? { subscriptionOffers: offers } : {}),
          },
        },
      });
    } catch (e) {
      

      const msg = String(e?.message || e);
      const alreadyOwned =
        /already.*owned|already.*subscribed|ITEM_ALREADY_OWNED|E_ALREADY_OWNED/i.test(msg);

      if (alreadyOwned) {
        // αν είναι ήδη subscribed, ο “σωστός” δρόμος είναι restore/manage
        const ok = await restoreAndVerifyIfPossible();
        if (!ok) await openSubscriptions();
        return;
      }

      Alert.alert(tt("common.errorTitle", "Σφάλμα"), msg);
    } finally {
      setBusy(false)
    }
  };

  const value = useMemo(
    () => ({
      startFlow,
      busy,
      roleReady,
      connected,
    }),
    [busy, roleReady, connected]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSubscriptionIAP() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSubscriptionIAP must be used within SubscriptionIAPProvider");
  return v;
}