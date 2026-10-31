#!/usr/bin/env python3
"""Read-only review of versioned Appsmith API actions and RootedOps routing manifest.

No credentials, outbound requests, API mutations or datasource edits.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="machine-readable redacted inventory")
    args = parser.parse_args()
    cfg = json.loads((ROOT / "config/internal_service_routing.json").read_text())
    services = cfg["internal_services"]
    for name, service in services.items():
        u = urlparse(service["base_url"])
        if u.scheme != "http" or not u.hostname or u.port != service["port"]:
            raise SystemExit(f"Invalid internal service: {name}")
        if u.hostname.endswith(".store") or u.hostname.endswith(".org"):
            raise SystemExit(f"Public hostname in internal destination: {name}")
    aliases = cfg["appsmith_datasources"]
    rows = []
    for f in sorted((ROOT / "pages").glob("*/queries/*/metadata.json")):
        try:
            action = json.loads(f.read_text()).get("unpublishedAction", {})
        except (ValueError, UnicodeError):
            continue
        if action.get("pluginType") != "API":
            continue
        ds = action.get("datasource") or {}
        name = ds.get("name", "")
        service = aliases.get(name, {}).get("service")
        route = (action.get("actionConfiguration") or {}).get("path", "")
        cls = "INTERNAL_API" if service else (
            "NEEDS_REVIEW" if name in cfg["not_internal_by_default"]
            else "EXTERNAL_OR_UNCLASSIFIED"
        )
        rows.append({"source": str(f.relative_to(ROOT)), "action": action.get("name"),
                     "datasource": name, "method": (action.get("actionConfiguration") or {}).get("httpMethod"),
                     "path": route, "classification": cls,
                     "expected_base_url": services[service]["base_url"] if service else None})
    if args.json:
        print(json.dumps({"services": services, "actions": rows}, indent=2))
    else:
        for name, service in services.items():
            print(f"SERVICE {name}: {service['base_url']}")
        for a in rows:
            print(f"{a['classification']}: {a['source']} [{a['datasource']}] {a['method']} {a['path']}")
        print(f"Reviewed {len(rows)} versioned API actions; no deployed datasource settings were inspected or changed.")


if __name__ == "__main__":
    main()
