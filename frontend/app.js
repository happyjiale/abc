const API_BASE = "";

const selectEl = document.getElementById("log-select");
const viewEl = document.getElementById("log-view");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("btn-refresh");

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

async function loadFileList() {
  setStatus("正在加载文件列表…");
  const data = await fetchJson(`${API_BASE}/api/logs`);
  const files = data.files || [];
  selectEl.innerHTML = "";
  if (files.length === 0) {
    setStatus("logs 目录下没有 .log 文件。", true);
    viewEl.textContent = "";
    return;
  }
  for (const name of files) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  }
  setStatus("");
  await loadSelectedLog();
}

async function loadSelectedLog() {
  const name = selectEl.value;
  if (!name) return;
  setStatus(`正在加载 ${name}…`);
  viewEl.textContent = "";
  try {
    const data = await fetchJson(
      `${API_BASE}/api/logs/${encodeURIComponent(name)}`
    );
    viewEl.textContent = data.content ?? "";
    setStatus(`${data.name} · ${(data.content || "").split("\n").length} 行`);
  } catch (e) {
    setStatus(e.message || "加载失败", true);
  }
}

selectEl.addEventListener("change", () => loadSelectedLog());
refreshBtn.addEventListener("click", () => {
  loadFileList().catch((e) => setStatus(e.message || "刷新失败", true));
});

loadFileList().catch((e) => setStatus(e.message || "无法连接后端", true));
