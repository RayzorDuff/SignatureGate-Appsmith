# Generated navigation and persistent identities

`registry.json` owns menu groups and routes. `labels.js` owns shared presentation and current-account menu initialization. Run `python3 scripts/generate-navigation.py`; `--check` detects drift without writing.

Existing metadata is the source of persistent resource identity. Preserve each JS collection, JS function and query's `gitSyncId`, including identities Appsmith assigns after an object is recreated. Logical `id` and `collectionId` still connect page/object/function names in the native Git representation. Do not derive a replacement sync ID from those names or rotate existing IDs to match a preferred format. Only genuinely new resources receive a fresh UUID-based identity, retained on reapplication. Duplicate/missing identities stop generation before writes.

The generator preserves native metadata extensions, function argument defaults and the existing current-page title geometry. It compares JSON semantically and tolerates native reordering of binding paths/removal of a redundant static-label binding, so normalization alone does not rewrite files.

`navigationLabels.initialize` is the startup action. `label`, `text`, `accessState` and `accessMessage` are synchronous helpers and stay explicitly Manual. They may be evaluated as widget expressions; they must not replace the initializer in the server startup schedule. Deliberate authority queries remain Manual and are invoked by the initializer. Labels and role visibility do not grant database authority.

The operator's recreation checkpoint `3763b0a` preserved new Directory objects, but saved `initialize` as Manual and `label` as On page load. The subsequent correction changes those modes while keeping the recreated identities. Directory's recreated `directoryFlows.load` omits `clientSideExecution` and per-function async metadata; the operator reports the table loads. These fields are not mandatory source acceptance assertions. Preserve native metadata already present elsewhere rather than stripping or requiring it.

Checks:

```bash
python3 tests/navigation-generation.py
python3 scripts/generate-navigation.py --check
node scripts/check-page-load-registration.mjs
node tests/page-startup.mjs
node tests/navigation.mjs
```

The generation regression reproduces the wrong-hook checkpoint, preserves all existing identities/defaults/native extensions, rejects duplicate identities and checks byte-stable reapplication and one-time new-resource IDs. Controller fixtures validate source behavior only. The deployed Appsmith scheduler and page rendering still need focused runtime acceptance. The source audit found no duplicated sync IDs; object recreation helping at runtime does not prove the old sync ID's spelling caused the stored-object problem.

Appsmith Copy to Page checkpoint `d62bc8d` recreated the other 17 navigation objects with native identities but reset all copied initializers to Manual. Copying an object is not evidence that startup registration was copied. Run the identity-preserving generator after a native copy, then inspect/reload the accepted development candidate. The generation regression verifies all 18 initializer/helper dispositions in addition to preserving copied identities; no automatic mode or source-setting pass certifies a deployed schedule.

The operator accepted navigation across all pages on October 18. That acceptance replaces the earlier other-page startup failure; keyboard/mobile and separate workflow outcomes remain distinct gates.

`table-headings.json` owns the current deployment's literal table column titles. In Appsmith 2.4.2 a column title is the editable panel title (`TableWidgetV2/widget/propertyConfig/PanelConfig/index.ts`), not a normal bindable property. Do not wrap these titles in `{{…}}`; native serialization removes those binding paths and the text appears literally. Configurable terminology remains active in supported page labels, selectors, buttons and menu items. Table title changes currently require updating this registry and regenerating; live terminology changes do not rename these headers. This compatibility limitation remains explicit in the release notes.

`redundant-page-headings.json` lists the ten removed standalone titles now supplied by `txtNavigationPage`. Generation rejects their reintroduction. Identity names, section headings, instructions and permission messages remain. `node tests/table-presentation.mjs` checks literal titles, genuine timestamp columns, safe empty/invalid date cells and heading removals. Agreement Templates' Created/Updated fields are text-formatted timestamps; document links remain separate.

Upstream contract reviewed at Appsmith tag v2.4.2, commit `834c591b7ba97c38b44539cefdbbc5bd7ad39328`, including `TableWidgetV2/widget/propertyConfig/PanelConfig/Data/index.ts` (`displayText` is not a bind property). These checks cover source contracts and evaluated cell values, not the installed renderer.

Native Select widgets expose their visible caption as `labelText`. The generator includes that field and repairs missing caption/placeholder binding paths. Table action `buttonLabel` is a bindable cell property, unlike a column title: Directory's Participant/Contributor buttons use safe per-row label vectors from the shared formatter, with empty-table behavior preserved. Profile contact-capacity values stay `member`/`contributor`; only their visible text is formatted.

Terminology Administration now includes a manager-only read-only table of installed concept keys, kinds, singular/plural/short labels, active/reserved state and descriptions. Values are displayed as text, not translated through another concept. Saving refreshes both that table's query and the current navigation-label query. The operational Participant key is `member`; `participant` is a distinct reserved event concept. The generator honors installed labels, including a legacy Member override. Use the audited adoption helper or the administration form to change configuration; do not hide an installed setting in the renderer.

Menu entries and current-page titles for the stable `Member Functions` and `Contributor Functions` routes use the same configured singular labels as other supported captions. Tests evaluate both saved menu bindings on every page and the destination titles with Participant, alternate Attendee and alternate Supporter settings. Internal routes remain compatible; an installed Member override is changed explicitly through the administration API rather than masked in source.
