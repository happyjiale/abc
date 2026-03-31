"""日志查看服务：读取项目 logs 目录下的模拟远程服务器日志，并通过 API 提供给前端。"""

import re
from pathlib import Path
from typing import Optional, Tuple

from flask import Flask, Response, abort, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent.parent
LOGS_DIR = ROOT / "logs"
FRONTEND_DIR = ROOT / "frontend"

# 列表接口扫描每个文件的前若干字节，匹配常见错误/告警关键字（UTF-8 兼容）
_LOG_ISSUE_SCAN_BYTES = 512 * 1024
_LOG_ISSUE_RE = re.compile(
    rb"(?:\[error\]|\[crit\]|\[alert\]|\[emerg\]|\[warn\]|\[warning\]|"
    rb"\bERROR\b|\bWARN\b|FATAL|CRITICAL|Traceback|Exception:|panic:)",
    re.IGNORECASE,
)

# 单日志接口按行分页，避免整文件 read_text 进内存
_LOG_DEFAULT_LINE_LIMIT = 50_000
_LOG_MAX_LINE_LIMIT = 200_000

# 前端静态资源通过 /assets/* 提供（与 index.html 中 link/script 一致）
app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="/assets")

# Swagger /docs 使用的 OpenAPI 描述，与下方路由行为对应
OPENAPI_SPEC = {
    "openapi": "3.0.3",
    "info": {
        "title": "日志查看 API",
        "description": "读取项目 logs 目录下的模拟远程服务器日志。",
        "version": "1.0.0",
    },
    "servers": [{"url": "/", "description": "本机"}],
    "paths": {
        "/api/logs": {
            "get": {
                "summary": "列出日志文件",
                "operationId": "listLogs",
                "responses": {
                    "200": {
                        "description": "日志项列表（name + has_issue，有问题优先排序）",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "files": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "name": {"type": "string"},
                                                    "has_issue": {
                                                        "type": "boolean",
                                                        "description": "扫描文件前部是否含错误/告警特征",
                                                    },
                                                },
                                                "required": ["name", "has_issue"],
                                            },
                                        }
                                    },
                                    "required": ["files"],
                                }
                            }
                        },
                    }
                },
            }
        },
        "/api/logs/{filename}": {
            "get": {
                "summary": "获取单个日志片段（按行分页）",
                "operationId": "getLog",
                "parameters": [
                    {
                        "name": "filename",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string", "example": "nginx.log"},
                        "description": "logs 目录下的文件名，须以 .log 结尾",
                    },
                    {
                        "name": "line_offset",
                        "in": "query",
                        "required": False,
                        "schema": {"type": "integer", "minimum": 0, "default": 0},
                        "description": "起始行号（从 0 计）",
                    },
                    {
                        "name": "line_limit",
                        "in": "query",
                        "required": False,
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 200000,
                            "default": 50000,
                        },
                        "description": "本段最多行数，上限 200000",
                    },
                ],
                "responses": {
                    "200": {
                        "description": "日志内容片段",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "content": {"type": "string"},
                                        "line_offset": {"type": "integer"},
                                        "line_limit": {"type": "integer"},
                                        "returned_lines": {"type": "integer"},
                                        "has_more": {
                                            "type": "boolean",
                                            "description": "是否还有后续行",
                                        },
                                    },
                                    "required": [
                                        "name",
                                        "content",
                                        "line_offset",
                                        "line_limit",
                                        "returned_lines",
                                        "has_more",
                                    ],
                                }
                            }
                        },
                    },
                    "400": {"description": "非法文件名或分页参数"},
                    "404": {"description": "文件不存在"},
                },
            }
        },
    },
}

_DOCS_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OpenAPI — 日志查看 API</title>
  <script>
    (function () {
      var k = "app-theme";
      var ok = { dark: 1, light: 1, blue: 1 };
      var t = null;
      try { t = localStorage.getItem(k); } catch (e) {}
      document.documentElement.dataset.theme = ok[t] ? t : "dark";
    })();
  </script>
  <link rel="stylesheet" href="/assets/theme.css" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" crossorigin="anonymous" />
  <style>
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); }
    .docs-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.75rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); background: var(--surface); }
    #swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
<div class="docs-bar">
  <div class="theme-switcher" role="group" aria-label="界面主题">
    <span class="theme-switcher__label">主题</span>
    <button type="button" class="theme-switcher__btn" data-theme-set="dark" aria-pressed="false">深色</button>
    <button type="button" class="theme-switcher__btn" data-theme-set="light" aria-pressed="false">浅色</button>
    <button type="button" class="theme-switcher__btn" data-theme-set="blue" aria-pressed="false">蓝色</button>
  </div>
</div>
<div id="swagger-ui"></div>
<script src="/assets/theme.js"></script>
<script>
  window.AppTheme.initThemeUI(document);
</script>
<script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin="anonymous"></script>
<script>
  window.onload = function () {
    window.ui = SwaggerUIBundle({
      url: "/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
    });
  };
</script>
</body>
</html>
"""


def _safe_log_name(name: str) -> Optional[str]:
    """仅允许单层文件名、且后缀为 .log，防止路径穿越与任意文件读取。"""
    if not name or name != Path(name).name:
        return None
    if not name.lower().endswith(".log"):
        return None
    return name


def _read_log_slice(path: Path, line_offset: int, line_limit: int) -> tuple[str, bool, int]:
    """从 line_offset（0 起）起最多读 line_limit 行；不整文件读入内存。返回 (正文, has_more, 本段行数)。"""
    lines: list[str] = []
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            if i < line_offset:
                continue
            if len(lines) == line_limit:
                return "".join(lines), True, line_limit
            lines.append(line)
    return "".join(lines), False, len(lines)


def _parse_line_range() -> Optional[Tuple[int, int]]:
    """解析 query：line_offset、line_limit；非法则返回 None（调用方应 400）。"""
    raw_off = request.args.get("line_offset", "0", type=str)
    raw_lim = request.args.get("line_limit", str(_LOG_DEFAULT_LINE_LIMIT), type=str)
    try:
        line_offset = int(raw_off)
        line_limit = int(raw_lim)
    except ValueError:
        return None
    if line_offset < 0 or line_limit < 1 or line_limit > _LOG_MAX_LINE_LIMIT:
        return None
    return line_offset, line_limit


def _log_file_has_issue(path: Path) -> bool:
    """读取日志文件头部字节，检测常见 error/warn 等模式（粗粒度，供列表高亮）。"""
    try:
        with path.open("rb") as f:
            chunk = f.read(_LOG_ISSUE_SCAN_BYTES)
    except OSError:
        return False
    return _LOG_ISSUE_RE.search(chunk) is not None


@app.route("/openapi.json")
def openapi_spec():
    return jsonify(OPENAPI_SPEC)


@app.route("/docs")
def openapi_docs():
    return Response(_DOCS_HTML, mimetype="text/html; charset=utf-8")


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/raw")
def raw_log_page():
    """单日志原文页：查询参数 file= 某 .log 文件名。"""
    return send_from_directory(FRONTEND_DIR, "raw.html")


@app.route("/api/logs")
def list_logs():
    """返回 .log 列表；每项含 name 与 has_issue（按扫描结果排序：有问题优先）。"""
    if not LOGS_DIR.is_dir():
        return jsonify({"files": []})
    names = sorted(
        f.name for f in LOGS_DIR.iterdir() if f.is_file() and f.suffix.lower() == ".log"
    )
    entries = [
        {"name": n, "has_issue": _log_file_has_issue(LOGS_DIR / n)} for n in names
    ]
    entries.sort(key=lambda x: (not x["has_issue"], x["name"]))
    return jsonify({"files": entries})


@app.route("/api/logs/<filename>")
def get_log(filename):
    """读取单个日志片段（按行分页）；非法名或分页参数 400，不存在 404。"""
    safe = _safe_log_name(filename)
    if not safe:
        abort(400)
    parsed = _parse_line_range()
    if parsed is None:
        abort(400)
    line_offset, line_limit = parsed
    path = LOGS_DIR / safe
    if not path.is_file():
        abort(404)
    content, has_more, returned_lines = _read_log_slice(path, line_offset, line_limit)
    return jsonify(
        {
            "name": safe,
            "content": content,
            "line_offset": line_offset,
            "line_limit": line_limit,
            "returned_lines": returned_lines,
            "has_more": has_more,
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
