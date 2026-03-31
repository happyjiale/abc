"""后端全部 HTTP 接口的自动化测试；每个接口多个用例，并通过 @api_route 参与覆盖统计。"""

from __future__ import annotations

import pytest


# --- GET /openapi.json ---


@pytest.mark.api_route("GET", "/openapi.json")
def test_openapi_returns_200_and_json(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert data.get("openapi") == "3.0.3"


@pytest.mark.api_route("GET", "/openapi.json")
def test_openapi_contains_documented_paths(client):
    r = client.get("/openapi.json")
    paths = r.get_json()["paths"]
    assert "/api/logs" in paths
    assert "/api/logs/{filename}" in paths


@pytest.mark.api_route("GET", "/openapi.json")
def test_openapi_info_title(client):
    r = client.get("/openapi.json")
    assert r.get_json()["info"]["title"] == "日志查看 API"


# --- GET /docs ---


@pytest.mark.api_route("GET", "/docs")
def test_docs_returns_html(client):
    r = client.get("/docs")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("Content-Type", "")


@pytest.mark.api_route("GET", "/docs")
def test_docs_contains_swagger_ui(client):
    r = client.get("/docs")
    body = r.get_data(as_text=True)
    assert "swagger" in body.lower()


@pytest.mark.api_route("GET", "/docs")
def test_docs_references_openapi_url(client):
    r = client.get("/docs")
    assert "/openapi.json" in r.get_data(as_text=True)


# --- GET / ---


@pytest.mark.api_route("GET", "/")
def test_index_returns_200(client):
    r = client.get("/")
    assert r.status_code == 200


@pytest.mark.api_route("GET", "/")
def test_index_serves_html(client):
    r = client.get("/")
    assert "text/html" in r.headers.get("Content-Type", "")


@pytest.mark.api_route("GET", "/")
def test_index_contains_doctype_or_html_tag(client):
    r = client.get("/")
    text = r.get_data(as_text=True).lower()
    assert "<html" in text or "html" in text


# --- GET /raw ---


@pytest.mark.api_route("GET", "/raw")
def test_raw_page_returns_200(client):
    r = client.get("/raw")
    assert r.status_code == 200


@pytest.mark.api_route("GET", "/raw")
def test_raw_page_is_html(client):
    r = client.get("/raw")
    assert "text/html" in r.headers.get("Content-Type", "")


@pytest.mark.api_route("GET", "/raw")
def test_raw_page_includes_script_or_body(client):
    r = client.get("/raw")
    body = r.get_data(as_text=True).lower()
    assert "script" in body or "<body" in body or "body" in body


# --- GET /api/logs ---


@pytest.mark.api_route("GET", "/api/logs")
def test_list_logs_json_shape(client, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.app.LOGS_DIR", tmp_path)
    (tmp_path / "a.log").write_text("ok\n", encoding="utf-8")
    r = client.get("/api/logs")
    assert r.status_code == 200
    data = r.get_json()
    assert "files" in data
    assert isinstance(data["files"], list)
    assert len(data["files"]) >= 1
    item = data["files"][0]
    assert "name" in item and "has_issue" in item
    assert isinstance(item["has_issue"], bool)


@pytest.mark.api_route("GET", "/api/logs")
def test_list_logs_empty_when_no_log_dir_files(monkeypatch, tmp_path, client):
    empty = tmp_path / "empty_logs"
    empty.mkdir()
    monkeypatch.setattr("backend.app.LOGS_DIR", empty)
    r = client.get("/api/logs")
    assert r.status_code == 200
    assert r.get_json() == {"files": []}


@pytest.mark.api_route("GET", "/api/logs")
def test_list_logs_issue_priority_sort(monkeypatch, tmp_path, client):
    monkeypatch.setattr("backend.app.LOGS_DIR", tmp_path)
    (tmp_path / "clean.log").write_text("info line\n", encoding="utf-8")
    (tmp_path / "bad.log").write_text("[error] something\n", encoding="utf-8")
    r = client.get("/api/logs")
    names = [x["name"] for x in r.get_json()["files"]]
    assert names[0] == "bad.log"
    assert "clean.log" in names


@pytest.mark.api_route("GET", "/api/logs")
def test_list_logs_when_logs_dir_missing_returns_empty(monkeypatch, tmp_path, client):
    missing = tmp_path / "nope"
    monkeypatch.setattr("backend.app.LOGS_DIR", missing)
    r = client.get("/api/logs")
    assert r.status_code == 200
    assert r.get_json() == {"files": []}


# --- GET /api/logs/{filename} ---


@pytest.mark.api_route("GET", "/api/logs/{filename}")
def test_get_log_success(monkeypatch, tmp_path, client):
    monkeypatch.setattr("backend.app.LOGS_DIR", tmp_path)
    (tmp_path / "t.log").write_text("line1\n", encoding="utf-8")
    r = client.get("/api/logs/t.log")
    assert r.status_code == 200
    data = r.get_json()
    assert data["name"] == "t.log"
    assert "line1" in data["content"]
    assert data["has_more"] is False
    assert data["returned_lines"] == 1
    assert data["line_offset"] == 0
    assert data["line_limit"] == 50_000


@pytest.mark.api_route("GET", "/api/logs/{filename}")
def test_get_log_pagination(monkeypatch, tmp_path, client):
    monkeypatch.setattr("backend.app.LOGS_DIR", tmp_path)
    (tmp_path / "p.log").write_text("a\nb\nc\n", encoding="utf-8")
    r = client.get("/api/logs/p.log?line_offset=0&line_limit=2")
    assert r.status_code == 200
    d = r.get_json()
    assert d["content"] == "a\nb\n"
    assert d["has_more"] is True
    assert d["returned_lines"] == 2
    r2 = client.get("/api/logs/p.log?line_offset=2&line_limit=2")
    assert r2.status_code == 200
    d2 = r2.get_json()
    assert d2["content"] == "c\n"
    assert d2["has_more"] is False


@pytest.mark.api_route("GET", "/api/logs/{filename}")
def test_get_log_400_bad_line_params(client):
    r = client.get("/api/logs/x.log?line_offset=-1&line_limit=10")
    assert r.status_code == 400
    r2 = client.get("/api/logs/x.log?line_offset=0&line_limit=0")
    assert r2.status_code == 400


@pytest.mark.api_route("GET", "/api/logs/{filename}")
def test_get_log_400_dot_dot_not_log_suffix(client):
    # 非法/非 .log 文件名（如路径占位 `..`）须返回 400
    r = client.get("/api/logs/..")
    assert r.status_code == 400


@pytest.mark.api_route("GET", "/api/logs/{filename}")
def test_get_log_400_not_dot_log(client):
    r = client.get("/api/logs/readme.txt")
    assert r.status_code == 400


@pytest.mark.api_route("GET", "/api/logs/{filename}")
def test_get_log_404_missing_file(monkeypatch, tmp_path, client):
    monkeypatch.setattr("backend.app.LOGS_DIR", tmp_path)
    r = client.get("/api/logs/missing.log")
    assert r.status_code == 404


@pytest.mark.api_route("GET", "/api/logs/{filename}")
def test_get_log_utf8_with_replacement(monkeypatch, tmp_path, client):
    monkeypatch.setattr("backend.app.LOGS_DIR", tmp_path)
    (tmp_path / "u.log").write_bytes(b"ok\xff\xfe\n")
    r = client.get("/api/logs/u.log")
    assert r.status_code == 200
    assert "ok" in r.get_json()["content"]
