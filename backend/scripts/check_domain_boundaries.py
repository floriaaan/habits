"""Fail if domain source imports transport, persistence or external client SDKs."""
import re
from pathlib import Path

violations = []
for source in (Path(__file__).resolve().parents[1] / "src/modules").rglob("*.rs"):
    if "integrations" in source.parts:
        continue  # Integration adapters may use external SDKs, per ADR-001.
    code = "\n".join(line for line in source.read_text().splitlines() if not line.lstrip().startswith("//"))
    if re.search(r"\b(?:axum|sqlx|reqwest|tower)::", code):
        violations.append(str(source))
assert not violations, f"Domain boundary violations: {violations}"
print("Domain boundaries: OK")
