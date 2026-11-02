"""Isolated Docker smoke: non-root/read-only, health, closed auth, logs, backup/restore.

Uses an ephemeral project/port/volume; never removes the normal deployment volume.
Run from repository root: python3 scripts/docker_smoke.py
"""
import json
import os
import subprocess
import urllib.error
import urllib.request
import uuid

project = "habits-smoke-" + uuid.uuid4().hex[:12]
environment = dict(os.environ, COMPOSE_PROJECT_NAME=project, HOST_PORT="0")


def compose(*arguments):
    return subprocess.check_output(["docker", "compose", *arguments], env=environment, text=True)


try:
    print(compose("up", "--build", "--detach", "--wait", "--wait-timeout", "90"), flush=True)
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
    # Real snapshot, then restore while the application is stopped. No user fixture
    # enters the runtime image; user/entry data restoration is covered by Rust tests.
    compose("exec", "-T", "api", "/usr/local/bin/habit-tracker", "backup", "/data/smoke-backup.sqlite")
    assert "ok" in compose("exec", "-T", "api", "sqlite3", "/data/smoke-backup.sqlite", "PRAGMA quick_check;")
    compose("stop", "api")
    # Remove WAL sidecars only after graceful shutdown; restore a verified snapshot.
    compose("run", "--rm", "--no-deps", "--entrypoint", "/bin/sh", "api", "-ec", "test -s /data/smoke-backup.sqlite; rm -f /data/habits.sqlite-wal /data/habits.sqlite-shm; cp /data/smoke-backup.sqlite /data/habits.sqlite")
    compose("up", "--detach", "--wait", "--wait-timeout", "90")
    address = compose("port", "api", "8080").strip()
    with urllib.request.urlopen("http://" + address + "/health/ready", timeout=5) as response:
        assert response.status == 200
    logs = compose("logs", "--no-color", "api")
    assert "API listening" in logs and "request completed" in logs
    assert "smoke-test" not in logs  # Token must not appear in tracing output.
    print("Docker smoke: OK (health/auth/non-root/read-only/logs/backup/restore)")
finally:
    compose("down", "--volumes", "--remove-orphans")
