#!/usr/bin/env python3
"""
keepalive_fleet.py — Despertador de proyectos Supabase de clientes Pro.

Cada 2 días (vía cron) recorre el directorio `customer_projects` de la
Estación e invoca la función `keepalive()` de cada proyecto activo con su
anon key. Eso reinicia el contador de inactividad del tier gratis y evita
que los proyectos se duerman.

- Éxito → actualiza `last_keepalive` y resetea el contador local de fallos.
- Fallo → incrementa fallos consecutivos (estado local en .keepalive_state.json).
  Con 2 fallos seguidos marca el proyecto como `status='error'` en el
  directorio para que el asistente avise a luigi.

Salida: JSON por stdout. Exit code 0 si todo ok, 1 si hubo fallos
(el cron avisa a luigi solo en ese caso; en silencio si no hay proyectos).

Uso manual:  python3 keepalive_fleet.py [--dry-run]
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request  # noqa: E402

ESTACION_HOST = "https://sodgzkablshladvbtnes.supabase.co"
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".keepalive_state.json")
TIMEOUT = 30


def estacion_request(method, path, body=None):
    url = ESTACION_HOST + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=representation")
    add_surrogate_to_request(req, "custom.supabase-estacion",
                               allowed_hosts=["sodgzkablshladvbtnes.supabase.co"])
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Estación {method} {path} → {e.code}: {e.read().decode()[:200]}")


def ping_project(url, anon_key):
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/rpc/keepalive",
        data=b"{}",
        method="POST",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return True, f"HTTP {resp.status}"
    except Exception as e:
        return False, str(e)[:160]


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def main():
    dry_run = "--dry-run" in sys.argv
    now = datetime.now(timezone.utc).isoformat()

    rows = estacion_request(
        "GET",
        "/rest/v1/customer_projects?select=license_code,supabase_url,supabase_anon_key,status&status=eq.active",
    ) or []

    state = load_state()
    ok, failed = [], []

    for r in rows:
        code = r["license_code"]
        good, detail = ping_project(r["supabase_url"], r["supabase_anon_key"])
        fails = state.get(code, {}).get("fails", 0)
        if good:
            ok.append(code)
            state[code] = {"fails": 0, "last_ok": now}
            if not dry_run:
                estacion_request("PATCH", f"/rest/v1/customer_projects?license_code=eq.{code}",
                                 {"last_keepalive": now, "status": "active"})
        else:
            fails += 1
            state[code] = {"fails": fails, "last_error": detail, "last_try": now}
            failed.append({"code": code, "error": detail, "consecutive_fails": fails})
            if fails >= 2 and not dry_run:
                estacion_request("PATCH", f"/rest/v1/customer_projects?license_code=eq.{code}",
                                 {"status": "error"})

    if not dry_run and rows:
        save_state(state)

    summary = {
        "checked": len(rows),
        "ok": ok,
        "failed": failed,
        "alert": len(failed) > 0,
        "dry_run": dry_run,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
