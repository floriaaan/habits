"""Isolated Docker smoke: non-root/read-only, health, closed auth, logs, backup/restore.

Uses an ephemeral project/port/volume; never removes the normal deployment volume.
Run from repository root: python3 scripts/docker_smoke.py
With an already built local image: python3 scripts/docker_smoke.py --no-build
"""
import argparse
import json
import os
import subprocess
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--no-build", action="store_true", help="Test the existing local image without rebuilding or pulling")
args = parser.parse_args()
build_arguments = ("--no-build", "--pull", "never") if args.no_build else ("--build",)

project = "habits-smoke-" + uuid.uuid4().hex[:12]
environment = dict(os.environ, COMPOSE_PROJECT_NAME=project, HOST_PORT="0")
# Never inherit real provider settings or credentials into a smoke deployment.
for variable in [
    "OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL", "OIDC_ALLOWED_ALGORITHMS",
    "OIDC_ACCESS_TOKEN_TYP", "ENCRYPTION_KEY", "ENCRYPTION_KEY_ID",
    "STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REDIRECT_URI",
    "STRAVA_WEBHOOK_VERIFY_TOKEN", "STRAVA_WEBHOOK_PATH_TOKEN", "STRAVA_SUBSCRIPTION_ID",
    "STRAVA_ATHLETE_CAPACITY", "STRAVA_MULTI_ATHLETE_APPROVED",
    "HOME_ASSISTANT_URL", "HOME_ASSISTANT_ALLOW_HTTP",
]:
    environment[variable] = ""
environment["AUTH_MODE"] = "disabled"


def compose(*arguments):
    return subprocess.check_output(["docker", "compose", *arguments], env=environment, text=True)


try:
    print(compose("up", *build_arguments, "--detach", "--wait", "--wait-timeout", "90"), flush=True)
    container = compose("ps", "--quiet", "api").strip()
    inspection = json.loads(subprocess.check_output(["docker", "inspect", container], text=True))[0]
    assert inspection["Config"]["User"] == "10001:10001"
    assert inspection["HostConfig"]["ReadonlyRootfs"] is True
    assert "ALL" in inspection["HostConfig"]["CapDrop"]
    assert not inspection["HostConfig"]["Privileged"]
    assert all("docker.sock" not in mount["Destination"] for mount in inspection["Mounts"])
    assert inspection["State"]["Health"]["Status"] == "healthy"
    address = compose("port", "api", "8080").strip()
    url = "http://" + address
    for path in ["/health/live", "/health/ready"]:
        with urllib.request.urlopen(url + path, timeout=5) as response:
            assert response.status == 200
            assert response.headers["x-request-id"]
    try:
        urllib.request.urlopen(urllib.request.Request(url + "/api/v1/habits", headers={"Authorization": "Bearer smoke-test", "X-Test-User": "alice"}), timeout=5)
        raise AssertionError("Private endpoint accepted an invalid token")
    except urllib.error.HTTPError as response:
        assert response.code == 401
        assert json.load(response)["error"]["code"] == "unauthorized"
    assert compose("exec", "-T", "api", "id", "-u").strip() == "10001"
    # Bootstrap via the real CLI, then activate token-protected local mode.
    issued = json.loads(compose("exec", "-T", "api", "/usr/local/bin/habit-tracker", "bootstrap-local", "UTC"))
    token = issued["token"]
    environment["AUTH_MODE"] = "local"
    compose("up", *build_arguments, "--detach", "--wait", "--wait-timeout", "90")
    url = "http://" + compose("port", "api", "8080").strip()

    def api(path, method="GET", payload=None, key=None):
        headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
        if key:
            headers["Idempotency-Key"] = key
        request = urllib.request.Request(url + path, method=method, headers=headers,
                                         data=None if payload is None else json.dumps(payload).encode())
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)

    habit = api("/api/v1/habits", "POST", {
        "name": "Docker smoke", "kind": "boolean", "unit": "count", "target": 1, "timezone": "UTC",
    })
    entry_path = "/api/v1/habits/" + habit["id"] + "/entries"
    payload = {"occurred_at": datetime.now(timezone.utc).isoformat(), "value": 1}
    entry = api(entry_path, "POST", payload, "docker-smoke-entry")
    assert api(entry_path, "POST", payload, "docker-smoke-entry")["id"] == entry["id"]
    assert api("/api/v1/gamification")["xp"] == 10
    # Snapshot and restore a real authenticated entry and its XP ledger.
    compose("exec", "-T", "api", "/usr/local/bin/habit-tracker", "backup", "/data/smoke-backup.sqlite")
    assert "ok" in compose("exec", "-T", "api", "sqlite3", "/data/smoke-backup.sqlite", "PRAGMA quick_check;")
    compose("stop", "api")
    # Remove WAL sidecars only after graceful shutdown; restore a verified snapshot.
    compose("run", "--rm", "--no-deps", "--pull", "never", "--entrypoint", "/bin/sh", "api", "-ec", "test -s /data/smoke-backup.sqlite; rm -f /data/habits.sqlite-wal /data/habits.sqlite-shm; cp /data/smoke-backup.sqlite /data/habits.sqlite")
    compose("up", *build_arguments, "--detach", "--wait", "--wait-timeout", "90")
    address = compose("port", "api", "8080").strip()
    with urllib.request.urlopen("http://" + address + "/health/ready", timeout=5) as response:
        assert response.status == 200
    url = "http://" + address
    assert api("/api/v1/entries/" + entry["id"])["id"] == entry["id"]
    assert api("/api/v1/gamification")["xp"] == 10
    logs = compose("logs", "--no-color", "api")
    assert "API listening" in logs and "request completed" in logs
    assert "smoke-test" not in logs  # Token must not appear in tracing output.
    assert token not in logs
    print("Docker smoke: OK (health/closed-auth/local-PAT/check-in/idempotence/XP/non-root/read-only/logs/backup/restore)")
finally:
    compose("down", "--volumes", "--remove-orphans")
