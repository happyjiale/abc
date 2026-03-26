"""日志查看服务：读取项目 logs 目录下的模拟远程服务器日志，并通过 API 提供给前端。"""

from pathlib import Path
from typing import Optional

from flask import Flask, Response, abort, jsonify, send_from_directory

ROOT = Path(__file__).resolve().parent.parent
LOGS_DIR = ROOT / "logs"
FRONTEND_DIR = ROOT / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="/assets")

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
                        "description": "文件名列表（仅 .log）",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "files": {
                                            "type": "array",
                                            "items": {"type": "string"},
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
                "summary": "获取单个日志全文",
                "operationId": "getLog",
                "parameters": [
                    {
                        "name": "filename",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string", "example": "nginx.log"},
                        "description": "logs 目录下的文件名，须以 .log 结尾",
                    }
                ],
                "responses": {
                    "200": {
                        "description": "日志内容",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "content": {"type": "string"},
                                    },
                                    "required": ["name", "content"],
                                }
                            }
                        },
                    },
                    "400": {"description": "非法文件名"},
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenAPI — 日志查看 API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" crossorigin="anonymous" />
  <style>body{margin:0} #swagger-ui .topbar{display:none}</style>
</head>
<body>
<div id="swagger-ui"></div>
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
    if not name or name != Path(name).name:
        return None
    if not name.lower().endswith(".log"):
        return None
    return name


@app.route("/openapi.json")
def openapi_spec():
    return jsonify(OPENAPI_SPEC)


@app.route("/docs")
def openapi_docs():
    return Response(_DOCS_HTML, mimetype="text/html; charset=utf-8")


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/api/logs")
def list_logs():
    if not LOGS_DIR.is_dir():
        return jsonify({"files": []})
    files = sorted(
        f.name for f in LOGS_DIR.iterdir() if f.is_file() and f.suffix.lower() == ".log"
    )
    return jsonify({"files": files})


@app.route("/api/logs/<filename>")
def get_log(filename):
    safe = _safe_log_name(filename)
    if not safe:
        abort(400)
    path = LOGS_DIR / safe
    if not path.is_file():
        abort(404)
    content = path.read_text(encoding="utf-8", errors="replace")
    return jsonify({"name": safe, "content": content})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
