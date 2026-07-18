import { createContext, useContext, type ReactNode } from "react";
import { usePortal, type Lang } from "../context/PortalContext";

export type Language = Lang;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { lang, setLang } = usePortal();

  return (
    <LanguageContext.Provider value={{ language: lang, setLanguage: setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}


