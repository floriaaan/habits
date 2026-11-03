"""Export only the HA client as a HACS repository and integration ZIP, never publish it."""
import argparse
import json
from pathlib import Path
import re
import shutil
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def package(destination: Path, repository: str):
    """Build a curated public-distribution candidate; exclude backend and git history."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*", repository):
        raise ValueError("repository must be a GitHub owner/name, not a URL or path")
    destination.mkdir(parents=True, exist_ok=True)
    # A temporary tree prevents stale files from previous exports entering the archive.
    with tempfile.TemporaryDirectory(prefix="habit-tracker-hacs-") as temporary:
        export = Path(temporary)
        component = export / "custom_components/habit_tracker"
        shutil.copytree(ROOT / "custom_components/habit_tracker", component,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
        manifest_path = component / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["documentation"] = f"https://github.com/{repository}"
        manifest["issue_tracker"] = f"https://github.com/{repository}/issues"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        shutil.copyfile(ROOT / "hacs.json", export / "hacs.json")
        shutil.copyfile(ROOT / "LICENSE", export / "LICENSE")
        shutil.copyfile(ROOT / "integrations/home-assistant/README-HACS.md", export / "README.md")
        with ZipFile(destination / "habit_tracker.zip", "w", ZIP_DEFLATED) as archive:
            for source in sorted(component.rglob("*")):
                if source.is_file():
                    archive.write(source, source.relative_to(component))
        with ZipFile(destination / "hacs-repository.zip", "w", ZIP_DEFLATED) as archive:
            for source in sorted(export.rglob("*")):
                if source.is_file():
                    archive.write(source, source.relative_to(export))
    return destination / "hacs-repository.zip"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, help="GitHub owner/name for documentation links")
    args = parser.parse_args()
    try:
        archive = package(ROOT / "target/hacs", args.repository)
    except ValueError as error:
        parser.error(str(error))
    print(f"HACS repository candidate: {archive}")
    print(f"Integration-only archive: {archive.parent / 'habit_tracker.zip'}")
    print("Nothing published. HACS requires a public GitHub repository.")


if __name__ == "__main__":
    main()
