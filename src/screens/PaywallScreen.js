// src/screens/PaywallScreen.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAppointments } from "../store/appointmentsStore";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";
import { t } from "../i18n";

// ✅ IAP (v14) — ΜΟΝΟ το hook
import { useIAP } from "react-native-iap";

const SUB_SKU = "estia_monthly";

function formatEnds(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

// ✅ Safe translate helper (για να μη βλέπεις [missing "..."] σε alerts)
function tt(key, fallback) {
  try {
    const v = t(key);
    if (typeof v === "string" && v.startsWith("[missing")) return fallback;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export default function PaywallScreen({ navigation }) {
  const { access, myRole, refresh } = useAppointments();

  const [buying, setBuying] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // throttle refreshAll
  const lastRefreshAtRef = useRef(0);

  // ✅ roleReady: κλειδώνει actions μέχρι να φορτώσει ρόλος
  const roleReady = !!myRole;

  // ✅ IAP Hook
  const { connected, subscriptions, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      try {
        setBuying(true);

        // ✅ Android purchaseToken
        const purchaseToken = purchase?.purchaseToken || purchase?.androidPurchaseToken || null;
        if (!purchaseToken) throw new Error("Missing purchaseToken from purchase object.");

        // ✅ Verify στο backend
        const { data, error } = await supabase.functions.invoke("play-verify", {
          body: {
            kind: "subscription",
            productId: SUB_SKU,
            purchaseToken,
          },
        });

        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Verify failed.");

        // ✅ Finish/Acknowledge (πολύ σημαντικό)
        await finishTransaction({ purchase, isConsumable: false });

        // ✅ refresh store (να εξαφανιστεί υπενθύμιση / να ξεκλειδώσει)
        await refreshAll("purchaseSuccess");

        // ✅ γύρνα Home γρήγορα & καθαρά
        goHomeFast();

        // (προαιρετικό) μπορείς να το αφήσεις ή να το βγάλεις για ακόμη πιο “στεγνό” UX
        Alert.alert(tt("common.successTitle", "Επιτυχία"), tt("paywall.purchaseOk", "Η συνδρομή ενεργοποιήθηκε."));
      } catch (e) {
        Alert.alert(tt("common.errorTitle", "Σφάλμα"), String(e?.message || e));
      } finally {
        setBuying(false);
      }
    },

    onPurchaseError: (e) => {
      Alert.alert(tt("common.errorTitle", "Σφάλμα"), String(e?.message || e));
      setBuying(false);
    },
  });

  const subItem = useMemo(() => {
    return (subscriptions || []).find((s) => (s.productId || s.id) === SUB_SKU) || null;
  }, [subscriptions]);

  const refreshAll = async (reason = "manual") => {
    try {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 1200) return;
      lastRefreshAtRef.current = now;

      if (Platform.OS === "android" && connected) {
        if (!subItem) {
          try {
            setLoadingProducts(true);
            await fetchProducts({ skus: [SUB_SKU], type: "subs" });
          } catch {
            // ok
          } finally {
            setLoadingProducts(false);
          }
        }
      }

      if (typeof refresh === "function") {
        await refresh({ reason });
      }
    } catch {
      // silent
    }
  };

  const goHomeFast = useCallback(() => {
    try {
      if (navigation?.reset) {
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
        return;
      }
      navigation?.navigate?.("Home");
    } catch {
      // ignore
    }
  }, [navigation]);

  // ✅ Auto refresh όταν ανοίγει το Paywall
  useFocusEffect(
    React.useCallback(() => {
      refreshAll("focus");
    }, [connected, subItem, roleReady]) // roleReady για να ξανατρέξει όταν έρθει ο ρόλος
  );

  // ✅ Auto refresh όταν επιστρέφει app από background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAll("appActive");
    });
    return () => sub.remove();
  }, [connected, subItem, roleReady]);

  // ✅ Φόρτωση προϊόντος όταν connected
  useEffect(() => {
    let alive = true;

    (async () => {
      if (Platform.OS !== "android") return;
      if (!connected) return;

      try {
        setLoadingProducts(true);
        await fetchProducts({ skus: [SUB_SKU], type: "subs" });
      } catch {
        // ok
      } finally {
        if (alive) setLoadingProducts(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [connected, fetchProducts]);

  const isActive = !!(access?.allowed && access?.status !== "expired");

  const title = useMemo(() => {
    if (access?.status === "grace") return tt("paywall.titleGrace", "Απαιτείται συνδρομή");
    if (access?.status === "expired") return tt("paywall.titleExpired", "Απαιτείται συνδρομή");
    return tt("paywall.titleDefault", "Συνδρομή");
  }, [access?.status]);

  const subtitle = useMemo(() => {
    if (isActive) return tt("paywall.subtitleAllowed", "Η συνδρομή σου είναι ενεργή.");

    if (access?.status === "grace") {
      return tt("paywall.subtitleGrace", `Η πρόσβαση θα κλειδώσει στις ${formatEnds(access.endsAt)}.`);
    }
    if (access?.status === "expired") {
      return tt(
        "paywall.subtitleExpired",
        "Η πρόσβαση έχει κλειδώσει. Πάτα «Ενεργοποίηση συνδρομής» για να ενεργοποιηθεί ξανά. Τα δεδομένα σου δεν χάνονται."
      );
    }
    return tt("paywall.subtitleDefault", "Ενεργοποίησε συνδρομή για να συνεχίσεις.");
  }, [isActive, access?.status, access?.endsAt]);

  async function openSubscriptions() {
    try {
      const urlWeb = "https://play.google.com/store/account/subscriptions";
      const can = await Linking.canOpenURL(urlWeb);
      if (!can) {
        Alert.alert(
          tt("common.errorTitle", "Σφάλμα"),
          tt("paywall.errCannotOpenSubscriptions", "Δεν μπορώ να ανοίξω τις συνδρομές.")
        );
        return;
      }
      await Linking.openURL(urlWeb);
    } catch {
      Alert.alert(tt("common.errorTitle", "Σφάλμα"), tt("paywall.errCannotOpenStore", "Δεν μπορώ να ανοίξω το Play Store."));
    }
  }

  async function buySubscription() {
    // ✅ ΜΗΝ αφήνεις action πριν έρθει ο ρόλος (fix για false “only owner”)
    if (!roleReady) return;

    // ✅ ΜΟΝΟ owner πληρώνει
    if ((myRole || "").toLowerCase() !== "owner") {
      Alert.alert(tt("common.errorTitle", "Σφάλμα"), tt("paywall.onlyOwnerCanPay", "Μόνο ο ιδιοκτήτης μπορεί να ενεργοποιήσει συνδρομή."));
      return;
    }

    if (Platform.OS !== "android") {
      Alert.alert(tt("common.errorTitle", "Σφάλμα"), "Η συνδρομή είναι διαθέσιμη μόνο μέσω Google Play (Android).");
      return;
    }

    if (!connected) {
      Alert.alert(
        tt("common.errorTitle", "Σφάλμα"),
        tt("paywall.iapNotReady", "Το Play Billing δεν είναι έτοιμο. Δοκίμασε ξανά σε λίγα δευτερόλεπτα.")
      );
      return;
    }

    if (!subItem) {
      Alert.alert(
        tt("common.errorTitle", "Σφάλμα"),
        tt("paywall.productNotReady", "Το προϊόν συνδρομής δεν βρέθηκε ακόμα. Περίμενε λίγα δευτερόλεπτα και ξαναδοκίμασε.")
      );
      refreshAll("productMissingBeforeBuy");
      return;
    }

    try {
      setBuying(true);

      const offerDetails = subItem?.subscriptionOfferDetailsAndroid || [];
      const offers = offerDetails
        .map((od) => od?.offerToken)
        .filter(Boolean)
        .map((offerToken) => ({ sku: SUB_SKU, offerToken }));

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
      Alert.alert(tt("common.errorTitle", "Σφάλμα"), String(e?.message || e));
      setBuying(false);
    }
  }

  async function doLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      if (typeof refresh === "function") await refresh({ reason: "logout" });

      if (navigation?.reset) {
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    } catch {
      Alert.alert(tt("common.errorTitle", "Σφάλμα"), tt("paywall.errLogout", "Αποτυχία αποσύνδεσης."));
    }
  }

  // ✅ disable μέχρι να φορτώσει role
  const mainBtnDisabled = buying || loadingProducts || !roleReady;

  // ✅ καλύτερο label όταν φορτώνει role
  const mainBtnLabel = !roleReady
    ? tt("common.loading", "Φόρτωση...")
    : isActive
    ? tt("paywall.continueBtn", "Συνέχεια")
    : tt("paywall.subscribeBtn", "Ενεργοποίηση συνδρομής");

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.h1}>{title}</Text>
        <Text style={styles.p}>{subtitle}</Text>

        {/* ✅ MAIN BUTTON: αν active -> Συνέχεια (Home), αλλιώς αγορά */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.buy, mainBtnDisabled && styles.btnDisabled]}
          onPress={isActive ? goHomeFast : buySubscription}
          disabled={mainBtnDisabled}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.buyText}>{mainBtnLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.primary}
          onPress={openSubscriptions}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.primaryText}>{tt("paywall.renewBtn", "Διαχείριση συνδρομής")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.logout}
          onPress={doLogout}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.logoutText}>{tt("paywall.logoutBtn", "Αποσύνδεση")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c3224", padding: 20, justifyContent: "center" },
  card: { borderWidth: 1, borderColor: "#0F3A27", backgroundColor: "#072A1C", borderRadius: 16, padding: 16 },
  h1: { color: "#fff", fontSize: 20, fontWeight: "900" },
  p: { color: "#D1FAE5", marginTop: 10, marginBottom: 14, lineHeight: 20 },

  buy: { backgroundColor: "#60A5FA", padding: 14, borderRadius: 12, alignItems: "center", marginBottom: 10 },
  buyText: { color: "#052016", fontWeight: "900" },
  btnDisabled: { opacity: 0.6 },

  primary: { backgroundColor: "#22C55E", padding: 14, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#052016", fontWeight: "900" },

  logout: { marginTop: 12, backgroundColor: "#7F1D1D", padding: 12, borderRadius: 12, alignItems: "center" },
  logoutText: { color: "#fff", fontWeight: "900" },
});





