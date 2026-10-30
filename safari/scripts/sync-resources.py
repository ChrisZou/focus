#!/usr/bin/env python3
"""Copy Focus's Chrome sources and apply the Safari background/permissions manifest."""

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DESTINATION = ROOT / "safari/Focus/Focus Extension/Resources"
FILES = (
    "background.js", "popup.html", "popup.js", "settings.html", "settings.js",
    "confirm.html", "confirm.js", "redirect.html", "redirect.js", "styles.css",
)


def sync(destination):
    destination.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copy2(ROOT / name, destination / name)
    shutil.copytree(ROOT / "icons", destination / "icons", dirs_exist_ok=True)

    manifest = json.loads((ROOT / "manifest.json").read_text())
    # Safari supports MV3 event pages. Keep the same background logic while
    # avoiding service-worker startup differences in Safari/WebKit hosts.
    manifest["background"] = {"scripts": ["background.js"], "persistent": False}
    # Safari gates webNavigation events and tabs.update behind website access.
    # Access to unblocked sites is also needed to clear a tab's visit on exit.
    manifest["host_permissions"] = ["http://*/*", "https://*/*"]
    (destination / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"Synced Focus {manifest['version']} to {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    sync(parser.parse_args().destination.resolve())
