/**
 * 日志查看页：列表点击后在右侧展示时间线；「原文」跳转 /raw?file=。
 */
const API_BASE = "";

/** 与后端默认 line_limit 对齐，分页拉取直至 has_more 为 false */
const LOG_PAGE_LINE_LIMIT = 50_000;

const listEl = document.getElementById("log-list");
const timelineRoot = document.getElementById("timeline-root");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("btn-refresh");

let selectedName = "";

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("status--error", isError);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchLogFullText(name) {
  const parts = [];
  let lineOffset = 0;
  let lastName = name;
  while (true) {
    const q = new URLSearchParams({
      line_offset: String(lineOffset),
      line_limit: String(LOG_PAGE_LINE_LIMIT),
    });
    const data = await fetchJson(
      `${API_BASE}/api/logs/${encodeURIComponent(name)}?${q}`
    );
    parts.push(data.content ?? "");
    lastName = data.name || name;
    if (!data.has_more) break;
    const n = data.returned_lines ?? 0;
    if (n <= 0) break;
    lineOffset += n;
  }
  return { name: lastName, content: parts.join("") };
}

function normalizeFileEntries(raw) {
  const files = raw || [];
  return files.map((item) => {
    if (typeof item === "string") {
      return { name: item, has_issue: false };
    }
    return {
      name: item.name ?? "",
      has_issue: Boolean(item.has_issue),
    };
  });
}

function setActiveButton(name) {
  selectedName = name;
  listEl.querySelectorAll(".log-list__btn").forEach((btn) => {
    const n = btn.dataset.logName;
    const on = n === name;
    btn.classList.toggle("log-list__btn--active", on);
    if (on) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  });
}

function renderTimeline(entries, fileName) {
  timelineRoot.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "timeline-empty";
    empty.textContent = "该日志没有可解析的行。";
    timelineRoot.appendChild(empty);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "timeline";
  wrap.setAttribute("role", "list");

  const cap = document.createElement("div");
  cap.className = "timeline__caption";
  cap.textContent = `${fileName} · 共 ${entries.length} 条（上为新）`;
  timelineRoot.appendChild(cap);
  timelineRoot.appendChild(wrap);

  for (const row of entries) {
    const item = document.createElement("div");
    let cls = `timeline__item timeline__item--${row.mod} timeline__item--band-${row.dateBand}`;
    if (row.isWeekend) cls += " timeline__item--weekend";
    if (!row.dateKey) cls += " timeline__item--nodate";
    item.className = cls;
    item.setAttribute("role", "listitem");

    const marker = document.createElement("div");
    marker.className = "timeline__marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = row.emoji;

    const body = document.createElement("div");
    body.className = "timeline__body";

    const meta = document.createElement("div");
    meta.className = "timeline__meta";

    const dateHead = document.createElement("span");
    dateHead.className = row.dateKey
      ? "timeline__date-head"
      : "timeline__date-head timeline__date-head--unknown";
    dateHead.textContent = row.dateKey ? row.dateHead : "未解析时间";

    const clock = document.createElement("time");
    clock.className = "timeline__clock";
    clock.dateTime = row.ms != null ? new Date(row.ms).toISOString() : "";
    clock.textContent = row.timeLabel;

    meta.appendChild(dateHead);
    meta.appendChild(clock);

    const textEl = document.createElement("p");
    textEl.className = "timeline__text";
    textEl.textContent = row.text;

    body.appendChild(meta);
    body.appendChild(textEl);
    item.appendChild(marker);
    item.appendChild(body);
    wrap.appendChild(item);
  }
}

async function loadFileList() {
  setStatus("正在加载文件列表…");
  const data = await fetchJson(`${API_BASE}/api/logs`);
  const entries = normalizeFileEntries(data.files);
  listEl.innerHTML = "";

  if (entries.length === 0 || !entries.some((e) => e.name)) {
    setStatus("logs 目录下没有 .log 文件。", true);
    timelineRoot.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "timeline-empty";
    empty.textContent = "暂无日志可选。";
    timelineRoot.appendChild(empty);
    selectedName = "";
    return;
  }

  const valid = entries.filter((e) => e.name);
  const fragment = document.createDocumentFragment();

  for (const { name, has_issue } of valid) {
    const li = document.createElement("li");
    li.className = "log-list__row";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "log-list__btn";
    btn.dataset.logName = name;
    if (has_issue) {
      btn.classList.add("log-list__btn--issue");
      const icon = document.createElement("span");
      icon.className = "log-list__emoji";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "⚠️";
      btn.appendChild(icon);
      btn.appendChild(document.createTextNode(" "));
      btn.setAttribute("aria-label", `${name}，含错误/告警特征`);
    }
    btn.appendChild(document.createTextNode(name));
    btn.addEventListener("click", () => {
      setActiveButton(name);
      loadSelectedTimeline();
    });

    const rawLink = document.createElement("a");
    rawLink.className = "log-list__raw-link";
    rawLink.href = `/raw?file=${encodeURIComponent(name)}`;
    rawLink.textContent = "原文";
    rawLink.setAttribute("aria-label", `查看 ${name} 原文`);
    rawLink.addEventListener("click", (e) => e.stopPropagation());

    li.appendChild(btn);
    li.appendChild(rawLink);
    fragment.appendChild(li);
  }

  listEl.appendChild(fragment);

  const stillThere = valid.some((e) => e.name === selectedName);
  const pick = stillThere ? selectedName : valid[0].name;
  setActiveButton(pick);
  setStatus("");
  await loadSelectedTimeline();
}

async function loadSelectedTimeline() {
  const name = selectedName;
  if (!name) return;
  setStatus(`正在加载 ${name}…`);
  timelineRoot.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "timeline-empty";
  loading.textContent = "加载中…";
  timelineRoot.appendChild(loading);

  try {
    const data = await fetchLogFullText(name);
    const content = data.content ?? "";
    const entries = window.LogTimeline.buildTimelineEntries(content);
    timelineRoot.innerHTML = "";
    renderTimeline(entries, data.name || name);
    setStatus(`${data.name || name} · 时间线 ${entries.length} 条`);
  } catch (e) {
    timelineRoot.innerHTML = "";
    const err = document.createElement("p");
    err.className = "timeline-empty timeline-empty--error";
    err.textContent = e.message || "加载失败";
    timelineRoot.appendChild(err);
    setStatus(e.message || "加载失败", true);
  }
}

refreshBtn.addEventListener("click", () => {
  loadFileList().catch((e) => setStatus(e.message || "刷新失败", true));
});

loadFileList().catch((e) => setStatus(e.message || "无法连接后端", true));
