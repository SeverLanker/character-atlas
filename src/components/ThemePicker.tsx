import { APP_THEMES, type ThemePref } from "../theme";

/** 设置里的外观主题选择：仅本机 UI 偏好，不写入资料库或备份。 */
export function ThemePicker({ value, onChange }: { value: ThemePref; onChange: (next: ThemePref) => void }) {
  return (
    <section className="app-theme-picker" aria-labelledby="app-theme-title">
      <h3 id="app-theme-title">外观主题</h3>
      <div className="app-theme-options" role="radiogroup" aria-label="外观主题">
        {APP_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value.theme === t.id}
            className={"app-theme-option" + (value.theme === t.id ? " active" : "")}
            onClick={() => onChange({ ...value, theme: t.id })}
          >
            <span className="app-theme-swatch" aria-hidden="true">
              {t.swatches.map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            <span>
              <strong>{t.name}</strong>
              <small>{t.description}</small>
            </span>
          </button>
        ))}
      </div>
      <label className="app-theme-follow">
        <input
          type="checkbox"
          checked={value.followSystem}
          onChange={(e) => onChange({ ...value, followSystem: e.target.checked })}
        />
        跟随系统深浅色（系统为深色时使用「夜读」）
      </label>
      <p className="app-theme-note">主题只保存在这台设备上，不进入角色资料和备份；角色的秘密身份主题不受影响。</p>
    </section>
  );
}
