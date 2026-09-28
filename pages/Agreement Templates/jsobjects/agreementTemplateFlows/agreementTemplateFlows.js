export default {

	async auditLog(action, entity_type, entity_id, payload) {
		try {
			await qAuditLogInsert.run({
				action,
				entity_type,
				entity_id: entity_id ?? "",
				actor_member_id: appsmith.store.facilitator_id ?? "",
				actor_email: ((appsmith.user?.email ?? "").trim().toLowerCase()),
				mode: appsmith.mode ?? "",
				details_json: JSON.stringify(payload ?? {}),
			});
		} catch (e) {
			console.log("audit_log insert failed:", e);
		}
	},

	async refresh() {
		await Promise.allSettled([
			qAgreementTemplatesList.run(),
			qAgreementTypesList.run(),
		]);
	},

	async verifyaccess() {
		try {
			let email = null;
			for (let i = 0; i < 20; i++) {
				email = (appsmith.user?.email ?? "").trim().toLowerCase();
				if (email) break;
				await new Promise(r => setTimeout(r, 150));
			}

			if (!email) {
				showAlert("Unknown user: appsmith.user.email not available.", "error");
				return;
			}

			let rows = await qCurrentFacilitator.run({ email });
			if (!Array.isArray(rows)) rows = [];

			const me = rows[0];

			if (!me?.member_id) {
				showAlert("Access denied: not an active facilitator for " + email, "error");
				await this.auditLog("auth.denied", "facilitator", "", {
					email,
					page: appsmith.URL?.pathname,
					mode: appsmith.mode
				});
				if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
					navigateTo("Unauthorized", {}, "SAME_WINDOW");
				}
				return;
			}

			const facilitator_id = me.member_id;
			const facilitator_email = (me.email ?? "").trim().toLowerCase();
			const is_document_reviewer = me.is_document_reviewer;
			const is_donations_reviewer = me.is_donations_reviewer;

			storeValue("facilitator_id", facilitator_id);
			storeValue("facilitator_email", facilitator_email);
			storeValue("facilitator_is_reviewer", is_document_reviewer);
			storeValue("facilitator_is_donations_reviewer", is_donations_reviewer);
			storeValue("facilitator_full_name", `${me.first_name} ${me.last_name}`.trim());

		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");
			showAlert("Query error: " + JSON.stringify(qCurrentFacilitator?.error ?? {}), "error");
			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
				navigateTo("Unauthorized", {}, "SAME_WINDOW");
			}
			return;
		}

		this.refresh();
	},

	linkify(inputText) {
		const s = String(inputText || "");
		let replacedText = s.replace(/((https?|ftp):\/\/[\w\d&@#/%?=~_|!:,.;]+[-A-Z0-9+&@#/%=~_|])/ig, function(url) {
			return '<a href="' + url + '" target="_blank">' + url + '</a>';
		});
		replacedText = replacedText.replace(/(^|[^/])(www\.[\S]+(\b|$))/gim,function(match, capture1, capture2) {
			return capture1 + '<a href="http://' + capture2 + '" target="_blank">' + capture2 + '</a>';
		});
		return replacedText;
	},

	_normArray(v) {
		if (v == null) return [];
		if (Array.isArray(v)) return v.map(String);
		if (typeof v === "string") {
			const s = v.trim();
			if (!s) return [];
			const stripped = s.replace(/^\{|\}$/g, "");
			return stripped.split(",").map(x => x.trim()).filter(Boolean);
		}
		return [];
	},

	_deepEqual(a, b) {
		return JSON.stringify(a) === JSON.stringify(b);
	},

	_normInt(v) {
		if (v === null || v === undefined) return null;
		if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
		const s = String(v).trim();
		if (!s) return null;
		const n = Number(s);
		return Number.isFinite(n) ? Math.trunc(n) : null;
	},

	_normText(v) {
		if (v === null || v === undefined) return "";
		return String(v).trim();
	},

	_diff(oldRow, newRow) {
		const changes = {};
		const keys = [
			"name",
			"version",
			"required_for",
			"doc_url",
			"active",
			"documenso_template_id",
			"documenso_template_envelope_id",
			"documenso_member_recipient_id",
			"documenso_facilitator_recipient_id",
		];

		for (const k of keys) {
			let oldV = oldRow?.[k];
			let newV = newRow?.[k];

			if (k === "required_for") {
				oldV = this._normArray(oldV);
				newV = this._normArray(newV);
			} else if (k === "documenso_template_id" || k === "documenso_member_recipient_id" || k === "documenso_facilitator_recipient_id") {
				oldV = this._normInt(oldV);
				newV = this._normInt(newV);
			} else if (k === "documenso_template_envelope_id" || k === "doc_url" || k === "name" || k === "version") {
				oldV = this._normText(oldV);
				newV = this._normText(newV);
			} else if (k === "active") {
				oldV = !!oldV;
				newV = !!newV;
			}

			const same = JSON.stringify(oldV ?? null) === JSON.stringify(newV ?? null);
			if (!same) changes[k] = { from: oldV ?? null, to: newV ?? null };
		}
		return changes;
	},

	normalizeDocumensoTemplate(raw) {
		const t = raw?.json || raw || {};
		const recipients = Array.isArray(t.recipients) ? t.recipients.slice() : [];
		const signerRecipients = recipients
			.filter(r => String(r.role || "").toUpperCase() === "SIGNER" || r.signingOrder)
			.sort((a, b) => (this._normInt(a.signingOrder) ?? 999) - (this._normInt(b.signingOrder) ?? 999));

		const memberRecipient = signerRecipients.find(r => this._normInt(r.signingOrder) === 1) || signerRecipients[0] || null;
		const facilitatorRecipient = signerRecipients.find(r => this._normInt(r.signingOrder) === 2) || signerRecipients[1] || null;

		return {
			template_id: this._normInt(t.id ?? t.templateId ?? t.template_id),
			envelope_id: this._normText(t.envelopeId ?? t.envelope_id ?? t.id),
			title: this._normText(t.title ?? t.name ?? t.envelopeId ?? t.id),
			type: this._normText(t.type),
			recipient_count: recipients.length,
			member_recipient_id: this._normInt(memberRecipient?.id),
			facilitator_recipient_id: this._normInt(facilitatorRecipient?.id),
			recipients
		};
	},

	async loadDocumensoTemplates() {
		const response = await apiListDocumensoTemplates.run();
		const body = response?.body ?? response ?? {};
		const rows = Array.isArray(body?.data)
			? body.data
			: Array.isArray(response)
				? response
				: [];

		const templates = rows
			.map(t => this.normalizeDocumensoTemplate(t))
			.filter(t => t.envelope_id);

		await storeValue("documenso_templates", templates, false);
		showAlert(`Loaded ${templates.length} Documenso template${templates.length === 1 ? "" : "s"}.`, "success");
		return templates;
	},

	documensoTemplateOptions() {
		const rows = appsmith.store.documenso_templates || [];
		return rows.map(t => ({
			label: `${t.title || t.envelope_id}${t.envelope_id ? " — " + t.envelope_id : ""}`,
			value: t.envelope_id
		}));
	},

	selectedDocumensoTemplate() {
		const selectedEnvelopeId = this._normText(selCreateDocumensoTemplate.selectedOptionValue);
		return (appsmith.store.documenso_templates || []).find(t => t.envelope_id === selectedEnvelopeId) || null;
	},

	createRowFromForm() {
		const selected = this.selectedDocumensoTemplate();

		return {
			name: this._normText(inpCreateAgreementName.text),
			version: this._normText(inpCreateAgreementVersion.text),
			required_for: this._normArray(selCreateAgreementTypes.selectedOptionValues),
			doc_url: this._normText(inpCreateAgreementURL.text),
			active: !!inpCreateAgreementActive.isChecked,
			documenso_template_id: selected?.template_id ?? null,
			documenso_template_envelope_id: selected?.envelope_id ?? "",
			documenso_member_recipient_id: selected?.member_recipient_id ?? null,
			documenso_facilitator_recipient_id: selected?.facilitator_recipient_id ?? null
		};
	},

	validateCreateRow(row) {
		if (!row.name) throw new Error("Agreement Name is required.");
		if (!row.version) throw new Error("Version is required.");
		if (!row.doc_url) throw new Error("Paper template URL is required.");
		if (!row.required_for.length) throw new Error("At least one Agreement Type is required.");
		if (!row.documenso_template_envelope_id) throw new Error("Select a Documenso template.");
		if (!row.documenso_member_recipient_id) throw new Error("The selected Documenso template does not have a signer recipient to use as the member.");
	},

	async createTemplateFromForm() {
		const row = this.createRowFromForm();
		this.validateCreateRow(row);

		const res = await this.saveTemplate(row);
		resetWidget("frmNewTemplate", true);
		await storeValue("documenso_templates", appsmith.store.documenso_templates || [], false);
		return res;
	},

	async saveTemplate(row, multiselect) {
		const templates = qAgreementTemplatesList?.data || [];
		const isExisting = !!row?.agreement_template_id;

		const oldRow = isExisting
			? templates.find(t => t.agreement_template_id === row.agreement_template_id)
			: null;

		if (multiselect) { row.required_for = multiselect; }
		const requiredForArr = this._normArray(row.required_for);

		const normalizedRow = {
			...row,
			required_for: requiredForArr,
			documenso_template_id: this._normInt(row.documenso_template_id),
			documenso_template_envelope_id: this._normText(row.documenso_template_envelope_id),
			documenso_member_recipient_id: this._normInt(row.documenso_member_recipient_id),
			documenso_facilitator_recipient_id: this._normInt(row.documenso_facilitator_recipient_id),
		};

		const changes = this._diff(oldRow, normalizedRow);

		if (isExisting && Object.keys(changes).length === 0) {
			showAlert("No changes to save.", "info");
			return;
		}

		const auditDetails = {
			agreement_template_id: row.agreement_template_id ?? null,
			changes,
			saved_from_page: "Agreement Templates"
		};

		const params = {
			agreement_template_id: row.agreement_template_id,
			name: this._normText(row.name),
			version: this._normText(row.version),
			required_for_json: JSON.stringify(requiredForArr),
			doc_url: this._normText(row.doc_url),
			active: !!row.active,
			documenso_template_id: (normalizedRow.documenso_template_id ?? "").toString(),
			documenso_template_envelope_id: this._normText(row.documenso_template_envelope_id),
			documenso_member_recipient_id: (normalizedRow.documenso_member_recipient_id ?? "").toString(),
			documenso_facilitator_recipient_id: (normalizedRow.documenso_facilitator_recipient_id ?? "").toString(),
			actor: appsmith.store.facilitator_email || appsmith.user?.email || "unknown",
			audit_details: JSON.stringify(auditDetails)
		};

		if (!params.name) throw new Error("Template name is required.");
		if (!params.version) throw new Error("Template version is required.");

		let res;
		if (isExisting) {
			res = await qAgreementTemplateUpdate.run(params);
			showAlert("Template updated.", "success");
		} else {
			res = await qAgreementTemplateInsert.run(params);
			showAlert("Template created.", "success");
		}

		await qAgreementTemplatesList.run();
		return res;
	},

}