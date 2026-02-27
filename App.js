// App.js
import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { supabase } from "./src/lib/supabase";
import { cleanupInvalidRefreshToken, isInvalidRefreshTokenError } from "./src/lib/authCleanup";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import NewAppointmentScreen from "./src/screens/NewAppointmentScreen";
import AppointmentDetailsScreen from "./src/screens/AppointmentDetailsScreen";
import SmsTemplateScreen from "./src/screens/SmsTemplateScreen";
import UsersScreen from "./src/screens/UsersScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import AuthStartScreen from "./src/screens/AuthStartScreen";
import { AppointmentsProvider, useAppointments } from "./src/store/appointmentsStore";
import { SettingsProvider } from "./src/store/settingsStore";
import { SubscriptionIAPProvider } from "./src/components/SubscriptionIAPManager";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { LanguageProvider } from "./src/i18n/LanguageProvider";
import { t } from "./src/i18n";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

// ✅ helper: παίρνει params από ? και από # (supabase tokens είναι στο hash)
function parseParamsFromUrl(url) {
  if (!url) return {};
  const out = {};

  const hashPart = url.includes("#") ? url.split("#")[1] : "";
  const queryPart = url.includes("?") ? url.split("?")[1].split("#")[0] : "";

  const all = [queryPart, hashPart].filter(Boolean).join("&");
  if (!all) return out;

  const sp = new URLSearchParams(all);
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}


function RootNavigator({ session, forceReset }) {
  return (
    <Stack.Navigator
      initialRouteName="AuthStart"
      screenOptions={{ headerBackTitleVisible: false }}
    >
      <Stack.Screen
        name="AuthStart"
        component={AuthStartScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={() => ({ title: t("nav.resetPassword") })}
      />

      {session && !forceReset ? (
        <>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={() => ({ title: t("nav.home") })}
          />

          <Stack.Screen
            name="NewAppointment"
            component={NewAppointmentScreen}
            options={() => ({ title: t("nav.newAppointment") })}
          />

          <Stack.Screen
            name="AppointmentDetails"
            component={AppointmentDetailsScreen}
            options={() => ({ title: t("nav.appointmentDetails") })}
          />

          <Stack.Screen
            name="SmsTemplate"
            component={SmsTemplateScreen}
            options={() => ({ title: t("nav.smsTemplate") })}
          />

          <Stack.Screen
            name="Users"
            component={UsersScreen}
            options={() => ({ title: t("nav.users") })}
          />
        </>
      ) : null}
    </Stack.Navigator>
  );
}


export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [navReadyTick, setNavReadyTick] = useState(0);

  // ✅ όταν έρθει recovery link, το κάνουμε true για να κόψουμε timing issues
  const [forceReset, setForceReset] = useState(false);
  const forceResetRef = useRef(false);
  useEffect(() => {
    forceResetRef.current = forceReset;
  }, [forceReset]);

  // pending navigation μέχρι να είναι έτοιμο το navigator
  const pendingNavRef = useRef(null);

  // ✅ Linking config (δεν πειράζουμε app.json)
  const linking = {
    prefixes: ["estiaapp://", "estiaapp:///"],
    config: {
      screens: {
        ResetPassword: "reset-password",
        Login: "login",
        Home: "home",
        
      },
    },
  };

 

// 1) Session bootstrap + auth events
useEffect(() => {
  let mounted = true;

  (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error && isInvalidRefreshTokenError(error)) {
        // ✅ καθάρισε local storage session ώστε να μην πετάει errors
        await cleanupInvalidRefreshToken();
        setSession(null);
      } else {
        if (error) console.log("getSession error:", error.message);
        setSession(data?.session ?? null);
      }
    } catch (e) {
      if (!mounted) return;

      if (isInvalidRefreshTokenError(e)) {
        await cleanupInvalidRefreshToken();
        setSession(null);
      } else {
        console.log("getSession exception:", String(e?.message || e));
        setSession(null);
      }
    } finally {
      if (mounted) setLoading(false);
    }
  })();

  const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
    console.log("AUTH EVENT:", event, "session?", !!newSession);

    // ✅ Αν για οποιοδήποτε λόγο έρθει session null / signed out -> καθάρισε forceReset
    if (event === "SIGNED_OUT" || !newSession) {
      setForceReset(false);
    }

    setSession(newSession ?? null);
  });

  return () => {
    mounted = false;
    sub?.subscription?.unsubscribe?.();
  };
}, []);


  // 2) Deep link handler (recovery)
  useEffect(() => {
    let alive = true;

    async function handleUrl(url) {
      try {
        if (!alive || !url) return;

        console.log("✅ DEEPLINK URL:", url);

        const params = parseParamsFromUrl(url);
        console.log("B) params.type =", params.type);

        if (params.type !== "recovery") return;

        const access_token = params.access_token;
        const refresh_token = params.refresh_token;

        // ✅ κλείδωσε reset flow
        setForceReset(true);

        // ✅ πήγαινε ΑΜΕΣΩΣ ResetPassword και πέρασε tokens στο route
        const navPayload = {
          name: "ResetPassword",
          hard: true,
          params: { access_token, refresh_token },
        };

        if (navigationRef.isReady()) {
          navigationRef.reset({
            index: 0,
            routes: [{ name: "ResetPassword", params: navPayload.params }],
          });
        } else {
          pendingNavRef.current = navPayload;
        }

        // ✅ setSession fire-and-forget (ΧΩΡΙΣ timeout/await)
        // (το reset password σου δουλεύει με REST, άρα αυτό είναι μόνο βοηθητικό)
        if (access_token && refresh_token) {
          supabase.auth
            .setSession({ access_token, refresh_token })
            .then(({ error }) => {
              if (error) console.log("setSession error:", error.message);
            })
            .catch(() => {});
        } else {
          console.log("❌ recovery link χωρίς tokens (λείπει access/refresh)");
        }
      } catch (e) {
        console.log("handleUrl error:", e?.message || e);
      }
    }

    Linking.getInitialURL().then((u) => handleUrl(u));
    const sub = Linking.addEventListener("url", (ev) => handleUrl(ev.url));

    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  // 3) ✅ GUARD navigation (χωρίς loop)
  useEffect(() => {
    if (!navigationRef.isReady()) return;
    if (forceReset) return;

    const current = navigationRef.getCurrentRoute()?.name;

    console.log("GUARD:", { hasSession: !!session, forceReset, current });

    if (session) {
      const inApp = ["Home", "NewAppointment", "AppointmentDetails", "SmsTemplate", "Users"].includes(current);
      if (inApp) return;

      navigationRef.reset({
        index: 0,
        routes: [{ name: "Home" }],
      });
    } else {
    if (current === "AuthStart" || current === "Login") return;

    navigationRef.reset({
      index: 0,
      routes: [{ name: "AuthStart" }],
    });
  }
  }, [session, forceReset, navReadyTick]);


  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
  <LanguageProvider>
    <AppointmentsProvider>
      <SettingsProvider>
        <SubscriptionIAPProvider>
          <NavigationContainer
            ref={navigationRef}
            linking={linking}
            onReady={() => {
              if (pendingNavRef.current?.name) {
                if (pendingNavRef.current.hard) {
                  navigationRef.reset({
                    index: 0,
                    routes: [
                      {
                        name: "ResetPassword",
                        params: pendingNavRef.current.params,
                      },
                    ],
                  });
                } else {
                  navigationRef.navigate(
                    pendingNavRef.current.name,
                    pendingNavRef.current.params
                  );
                }
                pendingNavRef.current = null;
              }

              setNavReadyTick((x) => x + 1);
            }}
          >
            <RootNavigator session={session} forceReset={forceReset} />
          </NavigationContainer>
        </SubscriptionIAPProvider>
      </SettingsProvider>
    </AppointmentsProvider>
  </LanguageProvider>
);

}





























