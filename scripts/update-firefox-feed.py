"""Advertise a signed release XPI in Firefox's public update feed.

Checks signing-file presence; Firefox performs cryptographic signature validation.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
FEED_URL = "https://raw.githubusercontent.com/mezozoltan/elte-extras/main/updates.json"
RELEASE_PREFIX = "/mezozoltan/elte-extras/releases/download/"


def update_feed(xpi_path, download_url, feed_path=ROOT / "updates.json"):
    url = urlparse(download_url)
    if (url.scheme != "https" or url.netloc != "github.com"
            or not url.path.startswith(RELEASE_PREFIX)
            or not url.path.endswith(".xpi") or url.query or url.fragment):
        raise ValueError("Use a direct HTTPS XPI download URL from this repository's releases.")
    local_manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    addon_id = local_manifest["browser_specific_settings"]["gecko"]["id"]
    with ZipFile(xpi_path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        gecko = manifest["browser_specific_settings"]["gecko"]
        if gecko.get("id") != addon_id or gecko.get("update_url") != FEED_URL:
            raise ValueError("XPI must contain the current add-on ID and GitHub update_url.")
        names = {name.lower() for name in archive.namelist()}
        if not ("meta-inf/mozilla.rsa" in names or "meta-inf/cose.sig" in names):
            raise ValueError("XPI has no Mozilla signing files. Submit it to AMO for signing first.")
    entry = {
        "version": manifest["version"],
        "update_link": download_url,
        "update_hash": "sha256:" + hashlib.sha256(Path(xpi_path).read_bytes()).hexdigest(),
    }
    compatibility = {key: gecko[key] for key in ("strict_min_version", "strict_max_version") if key in gecko}
    if compatibility:
        entry["applications"] = {"gecko": compatibility}
    feed_path = Path(feed_path)
    feed = json.loads(feed_path.read_text(encoding="utf-8"))
    updates = feed.setdefault("addons", {}).setdefault(addon_id, {}).setdefault("updates", [])
    updates[:] = [item for item in updates if item.get("version") != entry["version"]]
    updates.append(entry)
    feed_path.write_text(json.dumps(feed, indent=2) + "\n", encoding="utf-8")
    return entry


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xpi", required=True, type=Path)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    print(json.dumps(update_feed(args.xpi, args.url), indent=2))
