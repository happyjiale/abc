/**
 * 全局主题：写入 html[data-theme]，与 localStorage 同步。
 * 任意页面在 <head> 最前加入内联脚本避免闪烁后，再引入本文件并调用 initThemeUI（可选）。
 */
const THEME_STORAGE_KEY = "app-theme";
const THEMES = ["dark", "light", "blue"];

function getTheme() {
  const t = document.documentElement.dataset.theme;
  return THEMES.includes(t) ? t : "dark";
}

function setTheme(name) {
  if (!THEMES.includes(name)) return;
  document.documentElement.dataset.theme = name;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch (_) {
    /* ignore */
  }
}

/**
 * 绑定头部主题按钮：容器内需有 [data-theme-set="dark|light|blue"]
 */
function initThemeUI(root) {
  const el = root || document;
  const buttons = el.querySelectorAll("[data-theme-set]");
  function syncActive() {
    const current = getTheme();
    buttons.forEach((btn) => {
      const v = btn.getAttribute("data-theme-set");
      const on = v === current;
      btn.classList.toggle("theme-switcher__btn--active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-theme-set");
      if (THEMES.includes(v)) setTheme(v);
      syncActive();
    });
  });
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_STORAGE_KEY && THEMES.includes(e.newValue)) {
      document.documentElement.dataset.theme = e.newValue;
      syncActive();
    }
  });
  syncActive();
}

if (typeof window !== "undefined") {
  window.AppTheme = { THEMES, THEME_STORAGE_KEY, getTheme, setTheme, initThemeUI };
}
