import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLanguage } from "../i18n";

const SettingsContext = createContext(null);

const KEY_SMS_TEMPLATE_EL = "sms_template_el_v1";
const KEY_SMS_TEMPLATE_EN = "sms_template_en_v1";

export const DEFAULT_TEMPLATE_EL =
  "Υπενθύμιση ραντεβού:\n{NAME}\n{DATE} {TIME}\n\nΑν δεν μπορείτε να έρθετε, ενημερώστε μας.";

export const DEFAULT_TEMPLATE_EN =
  "Appointment reminder:\n{NAME}\n{DATE} {TIME}\n\nIf you can’t make it, please let us know.";

// (κρατάω το παλιό export για συμβατότητα)
export const DEFAULT_TEMPLATE = DEFAULT_TEMPLATE_EL;

export function SettingsProvider({ children }) {
  const [ready, setReady] = useState(false);

  // ✅ Κρατάμε ΚΑΙ τα 2 templates στη μνήμη
  const [smsTemplateEl, setSmsTemplateEl] = useState(DEFAULT_TEMPLATE_EL);
  const [smsTemplateEn, setSmsTemplateEn] = useState(DEFAULT_TEMPLATE_EN);

  const loadTemplateForLang = useCallback(async (lang) => {
    const key = lang === "en" ? KEY_SMS_TEMPLATE_EN : KEY_SMS_TEMPLATE_EL;
    const fallback = lang === "en" ? DEFAULT_TEMPLATE_EN : DEFAULT_TEMPLATE_EL;

    const saved = await AsyncStorage.getItem(key);
    if (saved && saved.trim()) return saved;

    // ✅ Αν δεν υπάρχει, γράφουμε μία φορά το fallback για να υπάρχει πάντα
    await AsyncStorage.setItem(key, fallback);
    return fallback;
  }, []);

  // ✅ Φόρτωσε ΚΑΙ τα 2 από storage στο init
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [tplEl, tplEn] = await Promise.all([
          loadTemplateForLang("el"),
          loadTemplateForLang("en"),
        ]);

        if (!alive) return;

        setSmsTemplateEl(tplEl);
        setSmsTemplateEn(tplEn);
      } finally {
        if (alive) setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [loadTemplateForLang]);

  /**
   * ✅ Save για συγκεκριμένη γλώσσα (προτεινόμενο να το χρησιμοποιείς από το Screen)
   */
  const saveSmsTemplateForLang = useCallback(async (lang, next) => {
    const value = (next || "").trim();
    if (!value) return;

    if (lang === "en") {
      setSmsTemplateEn(value);
      await AsyncStorage.setItem(KEY_SMS_TEMPLATE_EN, value);
    } else {
      setSmsTemplateEl(value);
      await AsyncStorage.setItem(KEY_SMS_TEMPLATE_EL, value);
    }
  }, []);

  /**
   * ✅ Backwards-compatible: σώζει στη “τρέχουσα” γλώσσα (όπως είχες πριν)
   */
  const saveSmsTemplate = useCallback(async (next) => {
    const lang = getLanguage();
    await saveSmsTemplateForLang(lang, next);
  }, [saveSmsTemplateForLang]);

  /**
   * ✅ Refresh από storage (π.χ. όταν αλλάξει γλώσσα)
   */
  const refreshSmsTemplate = useCallback(
    async (forcedLang) => {
      const lang = forcedLang || getLanguage();
      const tpl = await loadTemplateForLang(lang);

      if (lang === "en") setSmsTemplateEn(tpl);
      else setSmsTemplateEl(tpl);

      return tpl;
    },
    [loadTemplateForLang]
  );

  // ✅ Το “τρέχον” template (computed) με βάση την τρέχουσα γλώσσα
  const smsTemplate = useMemo(() => {
    const lang = getLanguage(); // OK για computed display
    return lang === "en" ? smsTemplateEn : smsTemplateEl;
  }, [smsTemplateEl, smsTemplateEn]);

  const value = useMemo(
    () => ({
      ready,

      // ✅ expose και τα δύο (για οθόνες που θέλουν σωστά switch)
      smsTemplateEl,
      smsTemplateEn,

      // ✅ παλιό πεδίο για συμβατότητα
      smsTemplate,

      saveSmsTemplate,
      saveSmsTemplateForLang,

      DEFAULT_TEMPLATE,
      DEFAULT_TEMPLATE_EL,
      DEFAULT_TEMPLATE_EN,

      refreshSmsTemplate,
    }),
    [
      ready,
      smsTemplateEl,
      smsTemplateEn,
      smsTemplate,
      saveSmsTemplate,
      saveSmsTemplateForLang,
      refreshSmsTemplate,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}




