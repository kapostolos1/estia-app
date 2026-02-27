import React, { createContext, useContext, useEffect, useState } from "react";
import { initLanguage, setLanguage } from "./index";

const LangCtx = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState("en");
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const l = await initLanguage();
      if (!alive) return;
      setLang(l);
      setLangReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const changeLang = async (l) => {
    const res = await setLanguage(l);
    setLang(res); // rerender everywhere
  };

  return <LangCtx.Provider value={{ lang, langReady, changeLang }}>{children}</LangCtx.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
