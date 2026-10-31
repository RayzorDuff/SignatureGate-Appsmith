# Internal service routing (SignatureGate-Appsmith #5)

Related: [SignatureGate #29](https://github.com/RayzorDuff/SignatureGate/issues/29), [MushroomProcess #110](https://github.com/RayzorDuff/MushroomProcess/issues/110), and RootedOps PR #39.

## Appsmith n8n datasource

The Git-synced `datasources/N8N.json` contains only datasource identity and plugin metadata. **Its connection URL is not versioned here**, and changing the Git JSON alone does not update the deployed Appsmith connection.

For an Appsmith instance and n8n service on the **same Docker network**, configure the server-executed `N8N` REST datasource's base URL in that instance's Appsmith editor to:

```text
http://n8n:5678
```

Existing action paths such as `/webhook/signaturegate/documenso/templates` must stay unchanged. Do not insert `/webhook` twice. The Appsmith datasource must be tested from the actual Appsmith application/container, rather than the user's browser or host shell. If the services do not share the expected network, first correct network attachment rather than silently sending requests to a different -test environment.

Apply and verify **independently** for both `master` and `chatgpt_development` deployments/branches. The branches intentionally diverge and must not be merged wholesale to carry this setting. This Git change documents required configuration; it does **not** claim that any live deployment has been changed.

## Safety checks

1. Export/back up the existing Appsmith datasource settings and confirm the deployment's Docker network and `n8n` name resolution.
2. Inventory all server-executed API actions referencing `N8N`, plus any explicit absolute URLs in JS/actions; compare with the deployed Appsmith editor.
3. Update the deployed datasource and smoke-test representative GET and POST actions in an isolated deployment before production rollout.
4. Preserve public browser URLs, QR links, external webhook ingress, OAuth redirect/callback URLs, and third-party integration URLs.
5. Confirm successful requests and no inadvertent public reverse-proxy hop. Roll back by restoring the previous datasource base URL if necessary.

**Do not replace NocoDB datasources solely by their names:** `NocoDB danks.store public` may intentionally represent public access. Audit each action/caller first. Avoid committing tokens, headers, or environment secrets.
