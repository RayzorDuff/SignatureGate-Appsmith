#!/usr/bin/env python3
"""Read-only review of versioned Appsmith API actions and RootedOps routing manifest.

No credentials, outbound requests, API mutations or datasource edits.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def inventory(root, cfg):
    """Inspect source metadata only; saved datasource bindings are unavailable."""
    services = cfg["internal_services"]
    for name, service in services.items():
        u = urlparse(service["base_url"])
        if u.scheme != "http" or not u.hostname or u.port != service["port"]:
            raise SystemExit(f"Invalid internal service: {name}")
        if u.hostname.endswith(".store") or u.hostname.endswith(".org"):
            raise SystemExit(f"Public hostname in internal destination: {name}")
    aliases = cfg["appsmith_datasources"]
    rows = []
    database_counts = {}
    for f in sorted((root / "pages").glob("*/queries/*/metadata.json")):
        try:
            metadata = json.loads(f.read_text())
        except (ValueError, UnicodeError):
            raise ValueError(f"Unreadable action metadata: {f.relative_to(root)}") from None
        action = metadata.get("unpublishedAction", {})
        # Git Sync stores pluginType on the root metadata, outside the action.
        plugin_type = metadata.get("pluginType") or action.get("pluginType")
        if metadata.get("pluginType") and action.get("pluginType") and metadata["pluginType"] != action["pluginType"]:
            raise ValueError(f"Conflicting plugin types: {f.relative_to(root)}")
        ds = action.get("datasource") or {}
        name = ds.get("name", "")
        if plugin_type == "DB":
            database_counts[name] = database_counts.get(name, 0) + 1
            if name not in cfg.get("test_database_contracts", {}):
                raise ValueError(f"Database datasource needs a reviewed test contract: {name}")
        if plugin_type != "API":
            continue
        service = aliases.get(name, {}).get("service")
        route = (action.get("actionConfiguration") or {}).get("path", "")
        cls = "INTERNAL_API" if service else (
            "NEEDS_REVIEW" if name in cfg["not_internal_by_default"]
            else "EXTERNAL_OR_UNCLASSIFIED"
        )
        rows.append({"source": str(f.relative_to(root)), "action": action.get("name"),
                     "datasource": name, "method": (action.get("actionConfiguration") or {}).get("httpMethod"),
                     "path": route, "classification": cls,
                     "expected_base_url": services[service]["base_url"] if service else None,
                     "live_binding_verified": False})
    if not rows:
        raise ValueError("No API actions found; an empty inventory is not a routing validation")
    contracts = cfg.get("test_database_contracts", {})
    for name, contract in contracts.items():
        if contract.get("database") != "signaturegate_test" or contract.get("username") != "signaturegate_test_app":
            raise ValueError(f"Unexpected test database or principal in contract: {name}")
        if contract.get("live_binding_verified") is not False:
            raise ValueError("A source-only contract cannot assert live verification")
    return {"scope": "source_metadata_and_desired_configuration_only",
            "live_binding_verified": False, "services": services, "actions": rows,
            "database_actions_by_datasource": database_counts,
            "test_database_contracts": contracts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="machine-readable redacted inventory")
    args = parser.parse_args()
    cfg = json.loads((ROOT / "config/internal_service_routing.json").read_text())
    report = inventory(ROOT, cfg)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for name, service in report["services"].items():
            print(f"SERVICE {name}: {service['base_url']}")
        for a in report["actions"]:
            print(f"{a['classification']}: {a['source']} [{a['datasource']}] {a['method']} {a['path']}")
        print(f"Reviewed {len(report['actions'])} versioned API actions and "
              f"{sum(report['database_actions_by_datasource'].values())} database actions; "
              "no deployed datasource settings were inspected or changed.")


if __name__ == "__main__":
    main()
