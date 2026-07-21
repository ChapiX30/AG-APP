#!/usr/bin/env python3
"""Concrete evidence for 2026-07-13 GCP cost drivers (no guesses)."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from google.auth import default
from google.auth.transport.requests import AuthorizedSession

PROJECT = "agg1-b7f40"
START = "2026-07-13T00:00:00Z"
END = "2026-07-14T00:00:00Z"


def session():
    creds, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return AuthorizedSession(creds)


def logging_counts(sess: AuthorizedSession) -> Counter:
    url = f"https://logging.googleapis.com/v2/entries:list"
    # Count "Function execution started" per function name.
    body = {
        "resourceNames": [f"projects/{PROJECT}"],
        "filter": (
            f'resource.type="cloud_function" '
            f'AND timestamp>="{START}" AND timestamp<"{END}" '
            f'AND textPayload:"Function execution started"'
        ),
        "orderBy": "timestamp desc",
        "pageSize": 1000,
    }
    counts: Counter = Counter()
    page_token = None
    pages = 0
    while pages < 20:
        payload = dict(body)
        if page_token:
            payload["pageToken"] = page_token
        r = sess.post(url, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        for entry in data.get("entries", []):
            name = (
                entry.get("resource", {})
                .get("labels", {})
                .get("function_name", "unknown")
            )
            counts[name] += 1
        page_token = data.get("nextPageToken")
        pages += 1
        if not page_token:
            break
    return counts


def cloud_builds(sess: AuthorizedSession):
    url = (
        f"https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/builds"
        f"?pageSize=25"
    )
    r = sess.get(url, timeout=60)
    if r.status_code == 403:
        return {"error": "permission_denied", "detail": r.text[:300]}
    r.raise_for_status()
    builds = []
    for b in r.json().get("builds", []):
        create = b.get("createTime", "")
        if not (START <= create < END):
            # also keep nearby for context
            if not create.startswith("2026-07-1"):
                continue
        builds.append(
            {
                "id": b.get("id", "")[:12],
                "status": b.get("status"),
                "createTime": create,
                "finishTime": b.get("finishTime"),
                "duration": _duration(b.get("createTime"), b.get("finishTime")),
            }
        )
    return builds


def _duration(start: str | None, end: str | None) -> str:
    if not start or not end:
        return "?"
    try:
        a = datetime.fromisoformat(start.replace("Z", "+00:00"))
        b = datetime.fromisoformat(end.replace("Z", "+00:00"))
        return f"{(b - a).total_seconds():.0f}s"
    except Exception:
        return "?"


def monitoring_invocations(sess: AuthorizedSession):
    # Align to UTC day window
    url = (
        f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries"
        f"?filter={_q('metric.type=\"cloudfunctions.googleapis.com/function/execution_count\"')}"
        f"&interval.startTime={START}"
        f"&interval.endTime={END}"
        f"&aggregation.alignmentPeriod=86400s"
        f"&aggregation.perSeriesAligner=ALIGN_SUM"
        f"&aggregation.crossSeriesReducer=REDUCE_SUM"
        f"&aggregation.groupByFields=resource.labels.function_name"
    )
    r = sess.get(url, timeout=60)
    if r.status_code >= 400:
        return {"error": r.status_code, "detail": r.text[:400]}
    out = []
    for ts in r.json().get("timeSeries", []):
        name = ts.get("resource", {}).get("labels", {}).get("function_name", "?")
        points = ts.get("points", [])
        val = 0
        for p in points:
            v = p.get("value", {})
            val += int(v.get("int64Value") or v.get("doubleValue") or 0)
        out.append((val, name))
    out.sort(reverse=True)
    return out


def _q(s: str) -> str:
    from urllib.parse import quote

    return quote(s, safe="")


def firestore_ops(sess: AuthorizedSession):
    url = (
        f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries"
        f"?filter={_q('metric.type=\"firestore.googleapis.com/document/read_count\"')}"
        f"&interval.startTime={START}"
        f"&interval.endTime={END}"
        f"&aggregation.alignmentPeriod=86400s"
        f"&aggregation.perSeriesAligner=ALIGN_SUM"
        f"&aggregation.crossSeriesReducer=REDUCE_SUM"
    )
    r = sess.get(url, timeout=60)
    if r.status_code >= 400:
        return {"error": r.status_code, "detail": r.text[:400]}
    total = 0
    for ts in r.json().get("timeSeries", []):
        for p in ts.get("points", []):
            v = p.get("value", {})
            total += int(v.get("int64Value") or v.get("doubleValue") or 0)
    return total


def main():
    sess = session()
    print(f"=== Evidence window {START} .. {END} project={PROJECT} ===")
    print()

    print("--- Cloud Builds (July 13-ish) ---")
    builds = cloud_builds(sess)
    if isinstance(builds, dict):
        print(builds)
    elif not builds:
        print("(none returned)")
    else:
        for b in builds:
            print(
                f"{b['createTime']}  status={b['status']}  dur={b['duration']}  id={b['id']}"
            )
    print()

    print("--- Function executions from logs (started) ---")
    try:
        counts = logging_counts(sess)
        if not counts:
            print("(no matching log entries / retention)")
        else:
            for name, n in counts.most_common(20):
                print(f"{n:6d}  {name}")
            print(f"TOTAL_STARTED={sum(counts.values())}")
    except Exception as e:
        print(f"log query failed: {e}")
    print()

    print("--- Monitoring: function execution_count (sum day) ---")
    inv = monitoring_invocations(sess)
    if isinstance(inv, dict):
        print(inv)
    else:
        for n, name in inv[:20]:
            print(f"{n:6d}  {name}")
        print(f"TOTAL_INVOCATIONS={sum(n for n, _ in inv)}")
    print()

    print("--- Monitoring: Firestore document read_count (sum day) ---")
    reads = firestore_ops(sess)
    print(reads)


if __name__ == "__main__":
    main()
