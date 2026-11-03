"""Regressions for the publication gate, especially PRs, forks and invalid tags."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ci_publication import policy


class PublicationPolicyTest(unittest.TestCase):
    def test_event_and_fork_boundaries(self):
        cases = [
            ("push", "refs/heads/main", False, True),
            ("push", "refs/heads/feature", False, False),
            ("pull_request", "refs/pull/1/merge", False, False),
            ("pull_request_target", "refs/heads/main", False, False),
            ("schedule", "refs/heads/main", False, False),
            ("workflow_dispatch", "refs/heads/feature", False, True),
            ("push", "refs/heads/main", True, False),
            ("workflow_dispatch", "refs/heads/main", True, False),
        ]
        for event, ref, fork, expected in cases:
            with self.subTest(event=event, ref=ref, fork=fork):
                result = policy(event, ref, "Owner/Repo", "main", fork)
                self.assertEqual(result["publish"], str(expected).lower())
                self.assertEqual(result["image"], "ghcr.io/owner/repo")
        self.assertEqual(policy("push", "refs/heads/trunk", "owner/repo", "trunk", False)["publish"], "true")

    def test_semver_tags_are_checked_before_any_publication(self):
        for tag in ("v0.1.0", "v1.2.3-rc.1", "v1.2.3+build.5", "v1.2.3-0.alpha+build"):
            with self.subTest(tag=tag):
                self.assertEqual(policy("push", f"refs/tags/{tag}", "owner/repo", "main", False)["publish"], "true")
        for tag in ("v01.2.3", "v1.2", "v1.2.3-01", "v1.2.3-", "v1.2.3+", "latest", "v1.2.3\n"):
            for event in ("push", "workflow_dispatch"):
                with self.subTest(tag=tag, event=event):
                    self.assertEqual(policy(event, f"refs/tags/{tag}", "owner/repo", "main", False)["publish"], "false")


if __name__ == "__main__":
    unittest.main()
