/**
 * 日志查看页：通过同域 API 拉取 logs 目录下的 .log 列表与内容。
 * 后端需与页面同源（API_BASE 为空）或在此填写完整 API 根地址。
 */
const API_BASE = "";

const listEl = document.getElementById("log-list");
const viewEl = document.getElementById("log-view");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("btn-refresh");

/** 当前选中的日志文件名 */
let selectedName = "";

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

/** 将 API 返回的 files 项规范为 { name, has_issue } */
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

/** 请求 /api/logs，渲染左侧列表；有文件时自动加载第一项（或保持选中若仍存在） */
async function loadFileList() {
  setStatus("正在加载文件列表…");
  const data = await fetchJson(`${API_BASE}/api/logs`);
  const entries = normalizeFileEntries(data.files);
  listEl.innerHTML = "";

  if (entries.length === 0 || !entries.some((e) => e.name)) {
    setStatus("logs 目录下没有 .log 文件。", true);
    viewEl.textContent = "";
    selectedName = "";
    return;
  }

  const valid = entries.filter((e) => e.name);
  const fragment = document.createDocumentFragment();

  for (const { name, has_issue } of valid) {
    const li = document.createElement("li");
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
      loadSelectedLog();
    });
    li.appendChild(btn);
    fragment.appendChild(li);
  }

  listEl.appendChild(fragment);

  const stillThere = valid.some((e) => e.name === selectedName);
  const pick = stillThere ? selectedName : valid[0].name;
  setActiveButton(pick);
  setStatus("");
  await loadSelectedLog();
}

/** 根据当前选中项请求 /api/logs/<name>，将全文写入预览区 */
async function loadSelectedLog() {
  const name = selectedName;
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

refreshBtn.addEventListener("click", () => {
  loadFileList().catch((e) => setStatus(e.message || "刷新失败", true));
});

loadFileList().catch((e) => setStatus(e.message || "无法连接后端", true));
