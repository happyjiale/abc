const API_BASE = "";

const LOG_PAGE_LINE_LIMIT = 50_000;

const params = new URLSearchParams(window.location.search);
const fileParam = params.get("file") || "";

const viewEl = document.getElementById("log-view");
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("raw-title");

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

async function load() {
  if (!fileParam || !fileParam.toLowerCase().endsWith(".log")) {
    setStatus("缺少有效的 file 参数（须为 .log 文件名）。", true);
    viewEl.textContent = "";
    titleEl.textContent = "日志原文";
    return;
  }

  titleEl.textContent = `原文 · ${fileParam}`;
  document.title = `原文 · ${fileParam}`;
  setStatus(`正在加载 ${fileParam}…`);
  viewEl.textContent = "";
  try {
    const data = await fetchLogFullText(fileParam);
    viewEl.textContent = data.content ?? "";
    const lines = (data.content || "").split("\n").length;
    setStatus(`${data.name} · ${lines} 行`);
  } catch (e) {
    setStatus(e.message || "加载失败", true);
  }
}

load();
