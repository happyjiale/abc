/**
 * 日志查看页：通过同域 API 拉取 logs 目录下的 .log 列表与内容。
 * 后端需与页面同源（API_BASE 为空）或在此填写完整 API 根地址。
 */
const API_BASE = "";

const selectEl = document.getElementById("log-select");
const viewEl = document.getElementById("log-view");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("btn-refresh");

/** 更新底部状态文案；isError 为 true 时使用错误样式 */
function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("status--error", isError);
}

/** GET JSON；非 2xx 时抛出带 status 的 Error */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** 请求 /api/logs，填充下拉框；有文件时自动加载当前选中项内容 */
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

/** 根据下拉框当前值请求 /api/logs/<name>，将全文写入预览区 */
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

// 首屏：拉列表并展示默认选中文件
loadFileList().catch((e) => setStatus(e.message || "无法连接后端", true));
