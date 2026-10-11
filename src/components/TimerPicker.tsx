import { TIMER_SECONDS, formatSeconds, parseTimerSetting, type TimerSetting } from "../engine/timerSetting";

interface TimerPickerProps {
  value: TimerSetting;
  onChange: (value: TimerSetting) => void;
}

const label = (v: TimerSetting) => (v === "off" ? "Off" : v === "pack" ? "Pack default" : formatSeconds(v));

/**
 * Topbar pill that opens the round-length menu. A native <select> sits invisibly
 * over the pill, so clicking anywhere on it opens the platform's own picker.
 */
export function TimerPicker({ value, onChange }: TimerPickerProps) {
  return (
    <span className="icon-btn select-pill">
      Timer: {label(value)}
      <span className="select-caret" aria-hidden>▾</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(parseTimerSetting(e.target.value))}
        aria-label="Round timer"
      >
        <option value="off">Off</option>
        <option value="pack">Pack default</option>
        {TIMER_SECONDS.map((s) => (
          <option key={s} value={s}>
            {formatSeconds(s)}
          </option>
        ))}
      </select>
    </span>
  );
}
