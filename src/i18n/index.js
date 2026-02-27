import { I18n } from "i18n-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

import el from "./el";
import en from "./en";

const STORAGE_KEY = "app_language";
const DEFAULT_LANG = "el";

const i18n = new I18n({
  el,
  en,
});

i18n.enableFallback = true;

export async function initLanguage() {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);

  const lang = saved === "el" || saved === "en" ? saved : DEFAULT_LANG;
  i18n.locale = lang;

  return lang;
}

export async function setLanguage(lang) {
  i18n.locale = lang;
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  return lang;
}

export function t(key, options) {
  return i18n.t(key, options);
}

export function getLanguage() {
  return i18n.locale === "en" ? "en" : "el";
}




