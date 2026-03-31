"""Pytest 配置：Flask 测试客户端、路由清单与 Markdown 报告钩子。"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

# 与 backend/app.py 中对外 HTTP 行为一一对应（自动化测试覆盖清单）
BACKEND_ROUTES: list[tuple[str, str]] = [
    ("GET", "/openapi.json"),
    ("GET", "/docs"),
    ("GET", "/"),
    ("GET", "/raw"),
    ("GET", "/api/logs"),
    ("GET", "/api/logs/{filename}"),
]


def route_key(method: str, path: str) -> str:
    return f"{method.upper()} {path}"


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers", "api_route(method, path): 声明本用例覆盖的后端接口（用于覆盖率统计）"
    )


@pytest.fixture
def client():
    """Flask 测试客户端（不启动真实端口）。"""
    from backend.app import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.hookimpl(tryfirst=True)
def pytest_sessionstart(session: pytest.Session) -> None:
    session._start_time = datetime.now(timezone.utc).timestamp()


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    start = getattr(session, "_start_time", None)
    if start is not None:
        session.config._duration = datetime.now(timezone.utc).timestamp() - start
    else:
        session.config._duration = 0.0

    if session.config.getoption("--collect-only", default=False):
        return

    root = Path(__file__).resolve().parent.parent
    out_dir = root / "test_reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"backend_test_report_{ts}.md"

    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    passed = len(reporter.stats.get("passed", [])) if reporter else 0
    failed = len(reporter.stats.get("failed", [])) if reporter else 0
    skipped = len(reporter.stats.get("skipped", [])) if reporter else 0
    errors = len(reporter.stats.get("error", [])) if reporter else 0
    total_run = passed + failed + skipped + errors
    duration = float(getattr(session.config, "_duration", 0.0))

    route_counts: dict[str, int] = {}
    for item in session.items:
        mark = item.get_closest_marker("api_route")
        if not mark:
            continue
        args = mark.args
        if len(args) >= 2:
            m, p = str(args[0]), str(args[1])
        else:
            continue
        key = route_key(m, p)
        route_counts[key] = route_counts.get(key, 0) + 1

    lines: list[str] = [
        "# 后端自动化测试报告",
        "",
        f"- **生成时间（UTC）**: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}Z",
        f"- **工作目录**: `{root}`",
        "",
        "## 1. 测试执行摘要",
        "",
        "| 项目 | 数量 |",
        "| --- | ---: |",
        f"| 已执行用例 | {total_run} |",
        f"| 通过 | {passed} |",
        f"| 失败 | {failed} |",
        f"| 跳过 | {skipped} |",
        f"| 错误 | {errors} |",
        f"| Pytest 退出码 | {exitstatus} |",
        f"| 耗时（秒） | {duration:.3f} |",
        "",
        "## 2. 接口测试用例覆盖",
        "",
        "说明：每个「接口」为 `METHOD path`；`{filename}` 表示路径参数。",
        "",
        "| 方法 | 路径 | 用例数 | 状态 |",
        "| --- | --- | ---: | --- |",
    ]

    covered_keys = set()
    for method, path in BACKEND_ROUTES:
        key = route_key(method, path)
        n = route_counts.get(key, 0)
        covered_keys.add(key)
        if n == 0:
            status = "未覆盖"
        elif n == 1:
            status = "已覆盖（仅 1 个用例，建议增加）"
        else:
            status = "已覆盖"
        lines.append(f"| {method} | `{path}` | {n} | {status} |")

    extra = sorted(set(route_counts) - covered_keys)
    if extra:
        lines.extend(["", "### 额外标记的路由（未列入 BACKEND_ROUTES）", ""])
        for k in extra:
            lines.append(f"- `{k}`: {route_counts[k]} 个用例")

    lines.extend(
        [
            "",
            "## 3. 未覆盖接口说明",
            "",
        ]
    )
    missing = [
        route_key(m, p)
        for m, p in BACKEND_ROUTES
        if route_counts.get(route_key(m, p), 0) == 0
    ]
    if not missing:
        lines.append("清单内接口均已至少有一个带 `@pytest.mark.api_route` 的用例。")
    else:
        for k in missing:
            lines.append(f"- `{k}`")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n[backend tests] Markdown 报告已写入: {out_path}")
