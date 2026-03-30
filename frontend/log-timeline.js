/**
 * 将日志正文解析为时间线条目（越靠前越新）。
 * 支持：ISO 时间行、nginx 组合日志、Docker JSON 行、含 ERROR/WARN 等关键词的通用行。
 */

const NGINX_TIME_RE =
  /\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s/;

const MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** @returns {number|null} UTC 毫秒时间戳 */
function parseLineTime(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let obj = null;
  if (trimmed.startsWith("{")) {
    try {
      obj = JSON.parse(trimmed);
    } catch {
      obj = null;
    }
  }
  if (obj && typeof obj.time === "string") {
    const t = Date.parse(obj.time);
    if (!Number.isNaN(t)) return t;
  }

  const isoStart = trimmed.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/
  );
  if (isoStart) {
    const t = Date.parse(isoStart[1].endsWith("Z") ? isoStart[1] : `${isoStart[1]}Z`);
    if (!Number.isNaN(t)) return t;
  }

  const nm = trimmed.match(NGINX_TIME_RE);
  if (nm) {
    const d = +nm[1];
    const mon = MONTHS[nm[2]];
    const y = +nm[3];
    const hh = +nm[4];
    const mm = +nm[5];
    const ss = +nm[6];
    if (mon !== undefined && !Number.isNaN(y)) {
      return Date.UTC(y, mon, d, hh, mm, ss);
    }
  }

  return null;
}

/** 用于展示的短文本（单行） */
function displayLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed);
      if (o && typeof o.log === "string") return o.log.replace(/\n/g, " ").trim();
      if (o && typeof o.time === "string") return trimmed;
    } catch {
      /* fallthrough */
    }
  }
  return trimmed;
}

/**
 * @param {string} text
 * @returns {{ emoji: string, mod: string }}
 */
function classifyEvent(text) {
  const s = text.toLowerCase();

  if (
    /\b(error|fatal|crit|critical|emerg|panic|exception|traceback)\b/.test(s) ||
    /\[error\]|\[crit\]|\[alert\]|\[emerg\]/.test(s)
  ) {
    return { emoji: "💥", mod: "error" };
  }
  if (/\b(warn|warning)\b/.test(s) || /\[warn\]|\[warning\]/.test(s)) {
    return { emoji: "⚠️", mod: "warn" };
  }
  if (/\b(info|note)\b/.test(s) && /\[server\]|\[system\]|ready|started|starting/.test(s)) {
    return { emoji: "ℹ️", mod: "info" };
  }

  if (/"(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s/i.test(s)) {
    const ngx = s.match(/\s(\d{3})\s+\d+\s+"/);
    if (ngx) {
      const code = +ngx[1];
      if (code >= 500) return { emoji: "🔴", mod: "error" };
      if (code >= 400) return { emoji: "🚧", mod: "warn" };
      if (code >= 200 && code < 300) return { emoji: "✅", mod: "ok" };
    }
  }
  const mini = s.match(/^(?:get|post|head|put|patch|delete)\s+\S+\s+(\d{3})\b/i);
  if (mini) {
    const code = +mini[1];
    if (code >= 500) return { emoji: "🔴", mod: "error" };
    if (code >= 400) return { emoji: "🚧", mod: "warn" };
    if (code >= 200 && code < 300) return { emoji: "✅", mod: "ok" };
  }
  if (/\b(post|put|patch)\b/.test(s) && /\b(http|api|\/)\b/.test(s)) {
    return { emoji: "📮", mod: "neutral" };
  }
  if (/\bget\b/.test(s) && (s.includes("http") || s.includes("/"))) {
    return { emoji: "🌐", mod: "neutral" };
  }
  if (/\bhead\b/.test(s)) {
    return { emoji: "🔎", mod: "neutral" };
  }
  if (/\b(delete|removed)\b/.test(s)) {
    return { emoji: "🗑️", mod: "neutral" };
  }
  if (/\b(shutdown|shutting|abort|aborted)\b/.test(s)) {
    return { emoji: "🔻", mod: "warn" };
  }
  if (/\b(starting|started|ready|listening)\b/.test(s)) {
    return { emoji: "🚀", mod: "ok" };
  }
  if (/\bhealth|probe|metric\b/.test(s)) {
    return { emoji: "🩺", mod: "neutral" };
  }

  return { emoji: "📋", mod: "neutral" };
}

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * @param {number|null} ms
 * @param {number} lineIndex
 */
function enrichDateFields(ms, lineIndex) {
  if (ms == null || Number.isNaN(ms)) {
    return {
      dateKey: null,
      dateHead: "",
      timeLabel: `行 ${lineIndex + 1}`,
      isWeekend: false,
    };
  }
  try {
    const d = new Date(ms);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const dateKey = `${y}-${mo}-${da}`;
    const dow = d.getDay();
    const wk = WEEKDAYS_ZH[dow];
    const dateHead = `${y}年${mo}月${da}日 ${wk}`;
    const timeLabel = d.toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return {
      dateKey,
      dateHead,
      timeLabel,
      isWeekend: dow === 0 || dow === 6,
    };
  } catch {
    return {
      dateKey: null,
      dateHead: "",
      timeLabel: `行 ${lineIndex + 1}`,
      isWeekend: false,
    };
  }
}

/**
 * @param {string} content
 * @returns {Array<{ ms: number|null, lineIndex: number, dateKey: string|null, dateHead: string, timeLabel: string, isWeekend: boolean, dateBand: number, text: string, emoji: string, mod: string }>}
 */
function buildTimelineEntries(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ms = parseLineTime(line);
    const text = displayLine(line);
    const { emoji, mod } = classifyEvent(text);
    const df = enrichDateFields(ms, i);
    rows.push({
      ms,
      lineIndex: i,
      dateKey: df.dateKey,
      dateHead: df.dateHead,
      timeLabel: df.timeLabel,
      isWeekend: df.isWeekend,
      dateBand: 0,
      text,
      emoji,
      mod,
    });
  }

  const parsed = rows.filter((r) => r.ms != null).length;
  const useTime = parsed > 0 && parsed >= Math.max(1, Math.floor(rows.length * 0.2));

  rows.sort((a, b) => {
    if (useTime) {
      const ma = a.ms != null ? a.ms : -Infinity;
      const mb = b.ms != null ? b.ms : -Infinity;
      if (mb !== ma) return mb - ma;
      return b.lineIndex - a.lineIndex;
    }
    return b.lineIndex - a.lineIndex;
  });

  const distinctDates = [];
  for (const r of rows) {
    if (r.dateKey && !distinctDates.includes(r.dateKey)) {
      distinctDates.push(r.dateKey);
    }
  }
  const bandByKey = new Map();
  distinctDates.forEach((k, idx) => bandByKey.set(k, idx % 2));
  for (const r of rows) {
    r.dateBand = r.dateKey != null ? bandByKey.get(r.dateKey) : 0;
  }

  return rows;
}

if (typeof window !== "undefined") {
  window.LogTimeline = { buildTimelineEntries, parseLineTime, displayLine, classifyEvent };
}
