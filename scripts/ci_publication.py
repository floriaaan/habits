"""Fail-closed GHCR publication policy shared by push, PR, manual and scheduled CI."""
import json
import os
from pathlib import Path
import re


def policy(event_name, ref, repository, default_branch, fork):
    number = r"(?:0|[1-9][0-9]*)"
    prerelease = r"(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
    semver = rf"v{number}\.{number}\.{number}(?:-{prerelease}(?:\.{prerelease})*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    release = ref.startswith("refs/tags/") and re.fullmatch(semver, ref.removeprefix("refs/tags/")) is not None
    eligible = event_name == "workflow_dispatch" or (
        event_name == "push" and (ref == f"refs/heads/{default_branch}" or release))
    # A manually selected invalid tag is also refused, before GHCR login.
    publish = not fork and eligible and (not ref.startswith("refs/tags/") or release)
    return {"image": f"ghcr.io/{repository.lower()}", "release": str(release).lower(),
            "publish": str(publish).lower()}


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    repository = event["repository"]
    result = policy(os.environ["GITHUB_EVENT_NAME"], os.environ["GITHUB_REF"],
                    os.environ["GITHUB_REPOSITORY"], repository["default_branch"], repository["fork"])
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
        for key, value in result.items():
            output.write(f"{key}={value}\n")


if __name__ == "__main__":
    main()
