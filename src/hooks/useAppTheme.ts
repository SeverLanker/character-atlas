import { useCallback, useEffect, useState } from "react";
import { applyTheme, readThemePref, resolveTheme, systemPrefersDark, writeThemePref, type ThemePref } from "../theme";

/** 读取并应用应用主题；「跟随系统」时监听系统深浅色变化。 */
export function useAppTheme() {
  const [pref, setPrefState] = useState<ThemePref>(() => readThemePref());
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (!pref.followSystem) return;
    const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, [pref.followSystem]);

  useEffect(() => {
    applyTheme(resolveTheme(pref, systemDark));
  }, [pref, systemDark]);

  const setPref = useCallback((next: ThemePref) => {
    writeThemePref(next);
    setPrefState(next);
  }, []);

  return [pref, setPref] as const;
}
