![](https://raw.githubusercontent.com/appsmithorg/appsmith/release/static/appsmith_logo_primary.png)

This app is built using Appsmith. Turn any datasource into an internal app in minutes. Appsmith lets you drag-and-drop components to build dashboards, write logic with JavaScript objects and connect to any API, database or GraphQL source.

![](https://raw.githubusercontent.com/appsmithorg/appsmith/release/static/images/integrations.png)

### [Github](https://github.com/appsmithorg/appsmith) • [Docs](https://docs.appsmith.com/?utm_source=github&utm_medium=social&utm_content=appsmith_docs&utm_campaign=null&utm_term=appsmith_docs) • [Community](https://community.appsmith.com/) • [Tutorials](https://github.com/appsmithorg/appsmith/tree/update/readme#tutorials) • [Youtube](https://www.youtube.com/appsmith) • [Discord](https://discord.gg/rBTTVJp)

##### You can visit the application using the below link

###### [![](https://assets.appsmith.com/git-sync/Buttons.svg) ](https://appsmith.danks.store/applications/6aba2d8df6d579f05d9be929/pages/6aba2d8df6d579f05d9be93a) [![](https://assets.appsmith.com/git-sync/Buttons2.svg)](https://appsmith.danks.store/applications/6aba2d8df6d579f05d9be929/pages/6aba2d8df6d579f05d9be93a/edit)

## Internal RootedOps API routing (Issue #5)

Appsmith server-executed API actions targeting the **same RootedOps Docker deployment** should use private Docker DNS, not the publicly routed `https://*.danks.store` gateway. In the Appsmith datasource editor, configure the existing `N8N` REST API datasource base URL as **`http://n8n:5678`** (no `/webhook` suffix). Existing action paths such as `/webhook/signaturegate/documenso/templates` must remain unchanged. Confirm the actual Appsmith container can resolve `n8n` and reach port 5678 before changing the deployed datasource. This is an internal HTTP hop within the trusted Docker network; do not expose the service port publicly.

**Git Sync limitation:** `datasources/N8N.json` contains the datasource identity only; its connection URL and credentials are not versioned in this repository. Fetching or checking out this branch **does not update the actual datasource base URL**. Configure and verify the connection separately in the corresponding deployed Appsmith instance, after backing up its saved datasource configuration. Avoid altering REST API action paths or adding unsupported datasource fields to Git to work around this limitation.

Apply the same principle to server-executed NocoDB calls where verified reachable: `http://nocodb:8080`. Preserve browser navigation, public QR/links, external webhook ingress, Google/OAuth callbacks, and third-party URLs. Never direct a production Appsmith instance to a test/test2 service or merge the divergent `master` and `chatgpt_development` applications wholesale. Treat `NocoDB danks.store public` as needing per-action classification, not an automatic blanket replacement. See SignatureGate #29 and MushroomProcess #110 for the wider integration audit.

### Auditing all RootedOps services

The tracked `config/internal_service_routing.json` defines desired non-secret internal endpoints for n8n, NocoDB, Listmonk, Documenso and ERPNext. Run:

```sh
python3 scripts/check_internal_service_routing.py
python3 scripts/check_internal_service_routing.py --json
```

The script reads the actual action metadata on the checked-out branch and identifies `N8N`-backed API actions, deliberately leaves the separate `NocoDB danks.store public` datasource for review, and does not expose secrets or modify any Appsmith environment. Follow the two separately maintained branches; no cross-branch merge is needed.

**Appsmith rollout requirement:** From the specific Appsmith deployment, back up the saved datasource; verify Docker DNS and connectivity to each destination from its **actual calling container**. In the Appsmith datasource editor set the existing `N8N` base URL to `http://n8n:5678` and test an existing webhook action without changing its path. Set `NocoDB danks.store` to `http://nocodb:8080` only after its actions and dependency on existing credentials have been reviewed. Do not automatically modify `NocoDB danks.store public`. The Listmonk, Documenso and ERPNext addresses are tracked for the n8n / RootedOps workflow integration, **not** as newly invented Appsmith datasources. Their own n8n workflows and deployed credentials must be audited separately.

**Git Sync alone cannot apply these stored datasource base URLs.** The manifest and audit tool establish a reviewable source of truth, not an Appsmith API-driven reconciler. A fully automated deployment still requires a tested, authenticated deployment integration that updates Appsmith's saved datasource configuration without overriding credentials; none is included here.
