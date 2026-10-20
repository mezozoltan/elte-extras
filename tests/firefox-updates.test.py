import copy
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
update_feed = runpy.run_path(str(ROOT / "scripts/update-firefox-feed.py"))["update_feed"]
URL = "https://github.com/mezozoltan/elte-extras/releases/download/v1.10.4/elte-extras-1.10.4.xpi"


class UpdateFeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        self.addon_id = self.manifest["browser_specific_settings"]["gecko"]["id"]
        self.feed = self.folder / "updates.json"
        self.original = {"addons": {self.addon_id: {"updates": [{"version": "1.10.2"}]}}}
        self.feed.write_text(json.dumps(self.original), encoding="utf-8")

    def archive(self, manifest=None, signing_files=True):
        path = self.folder / "test.xpi"
        with ZipFile(path, "w") as archive:
            archive.writestr("manifest.json", json.dumps(manifest or self.manifest))
            # Fixture only; production signatures are verified by Firefox.
            if signing_files:
                archive.writestr("META-INF/mozilla.rsa", b"test fixture")
        return path

    def test_hash_version_compatibility_and_idempotence(self):
        archive = self.archive()
        entry = update_feed(archive, URL, self.feed)
        self.assertEqual(entry["version"], self.manifest["version"])
        self.assertEqual(entry["update_hash"], "sha256:" + hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(entry["applications"]["gecko"]["strict_min_version"], "128.0")
        first = self.feed.read_bytes()
        update_feed(archive, URL, self.feed)
        self.assertEqual(first, self.feed.read_bytes())
        self.assertEqual(len(json.loads(first)["addons"][self.addon_id]["updates"]), 2)

    def test_unsigned_rejected_without_modifying_feed(self):
        original = self.feed.read_bytes()
        with self.assertRaises(ValueError):
            update_feed(self.archive(signing_files=False), URL, self.feed)
        self.assertEqual(original, self.feed.read_bytes())

    def test_wrong_id_or_update_url_rejected(self):
        for key, value in [("id", "another@addon"), ("update_url", "https://example.com/updates.json")]:
            manifest = copy.deepcopy(self.manifest)
            manifest["browser_specific_settings"]["gecko"][key] = value
            with self.assertRaises(ValueError):
                update_feed(self.archive(manifest), URL, self.feed)

    def test_non_release_or_insecure_download_rejected(self):
        for url in [URL.replace("https:", "http:"), URL.replace("github.com", "example.com"), URL.replace(".xpi", ".zip")]:
            with self.assertRaises(ValueError):
                update_feed(self.archive(), url, self.feed)


if __name__ == "__main__":
    unittest.main()
