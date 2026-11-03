"""Copy only Habit Tracker-owned integration/card files into an existing HA config."""
import argparse
from pathlib import Path
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config_dir", type=Path)
    args = parser.parse_args()
    target = args.config_dir.resolve()
    if not (target / "configuration.yaml").is_file():
        parser.error("config_dir must contain configuration.yaml")
    root = Path(__file__).resolve().parents[1]
    source = root / "integrations/home-assistant"
    destination = target / "custom_components/habit_tracker"
    shutil.copytree(root / "custom_components/habit_tracker", destination,
                    dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    cards = target / "www/habit-tracker"
    cards.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / "cards/habit-lab-visual-card.js", cards / "habit-lab-visual-card.js")
    print(f"Integration copied to {destination}")
    print("Restart Home Assistant, then add Habit Tracker. Its connected card loads automatically.")


if __name__ == "__main__":
    main()
