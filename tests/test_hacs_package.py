"""Distribution contract: exact HACS layout, bundled assets, no server or secrets."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from package_home_assistant import package
import package_home_assistant


class HacsPackageTest(unittest.TestCase):
    def test_curated_repository_and_installable_component_are_complete(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            package(output, "fixture/habit-tracker-ha")
            with ZipFile(output / "hacs-repository.zip") as archive:
                names = archive.namelist()
                prefix = "custom_components/habit_tracker/"
                self.assertTrue(all(name in ("README.md", "README.fr.md", "LICENSE", "hacs.json") or
                                    name.startswith(prefix) for name in names))
                self.assertFalse(any("__pycache__" in name or name.endswith(".pyc") for name in names))
                self.assertIn(prefix + "www/habit-tracker-card.js", names)
                self.assertIn(prefix + "www/dashboard.yaml", names)
                self.assertIn(prefix + "translations/fr.json", names)
                self.assertIn(prefix + "brand/icon.png", names)
                self.assertIn(prefix + "brand/icon@2x.png", names)
                self.assertIn("README.fr.md", names)
                self.assertIn(b"README.fr.md", archive.read("README.md"))
                self.assertIn(b"README.md", archive.read("README.fr.md"))
                hacs = json.loads(archive.read("hacs.json"))
                self.assertEqual(hacs["homeassistant"], "2026.10.2")
                manifest = json.loads(archive.read(prefix + "manifest.json"))
                self.assertEqual(manifest["domain"], "habit_tracker")
                self.assertEqual(manifest["documentation"], "https://github.com/fixture/habit-tracker-ha")
                self.assertEqual(manifest["dependencies"], ["frontend", "http", "lovelace"])
                with ZipFile(output / "habit_tracker.zip") as component:
                    self.assertEqual(set(component.namelist()), {n.removeprefix(prefix) for n in names if n.startswith(prefix)})
                    for name in component.namelist():
                        self.assertEqual(component.read(name), archive.read(prefix + name))
            # A second build does not collect unrelated files in the output directory.
            (output / ".env").write_text("fixture, never package this")
            package(output, "fixture/habit-tracker-ha")
            with ZipFile(output / "hacs-repository.zip") as archive:
                self.assertNotIn(".env", archive.namelist())

    def test_repository_rejects_urls_and_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            for repository in ("https://github.com/fixture/repo", "../..", "fixture/repo/path", "fixture/repo\n", "fixture/repo;echo"):
                with self.subTest(repository=repository), self.assertRaises(ValueError):
                    package(Path(temporary), repository)

    def test_missing_submodule_fails_with_initialization_command(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with patch.object(package_home_assistant, "CLIENT_ROOT", directory / "missing"):
                with self.assertRaisesRegex(ValueError, "git submodule update --init --recursive"):
                    package(directory / "output", "floriaaan/habit-tracker-ha")
            self.assertFalse((directory / "output").exists())


if __name__ == "__main__":
    unittest.main()
