/* 启动前设置应用主题，避免闪烁。规则与 src/theme.ts 保持一致。CSP 只允许同源脚本，所以放在独立文件。 */
(function () {
  try {
    const ids = { night: "#181c1b", xuan: "#f3ede0", bureau: "#cdb98f" };
    const pref = JSON.parse(localStorage.getItem("atlas-app-theme") || "null") || {};
    let theme = pref.theme;
    if (pref.followSystem === true) {
      const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      theme = dark ? "night" : theme === "night" ? "default" : theme;
    }
    if (!Object.prototype.hasOwnProperty.call(ids, theme)) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (theme === "night") root.style.colorScheme = "dark";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", ids[theme]);
  } catch (e) {
    /* 偏好损坏时保持默认主题 */
  }
})();
