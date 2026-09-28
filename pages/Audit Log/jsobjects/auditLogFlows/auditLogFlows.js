export default {
	DOCUMENSO_BASE_URL: "https://documenso.danks.store/t/facilitators",
	GIVEBUTTER_BASE_URL: "https://givebutter.com",
	GIVEBUTTER_DASHBOARD_BASE_URL: "https://dashboard.givebutter.com",
	APPSMITH_MEMBER_PROFILE_PAGE: "Members - Profile",
	NOCODB_BASE_URL: "https://nocodb.danks.store",
	
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
      qAuditLogList.run(),
    ]);	
  },

	formatDetails(row) {
		const details = typeof row.details_json === "string"
			? JSON.parse(row.details_json || "{}")
			: (row.details_json || row.details || {});

		const html = [];

		const memberId = details.member_id || row.detail_member_id;
		const memberName = row.detail_member_name || memberId;

		if (memberId) {
			//html.push(`<b>Member:</b> <a href="javascript:void(0)" onclick="appsmith.triggerEvent('openMemberProfile', '${memberId}')">${memberName}</a>`);
			html.push(`<b>Member:</b> ${memberName}`);
		}

		const facilitatorId = details.facilitator_id || row.detail_facilitator_id;
		const facilitatorName = row.detail_facilitator_name || facilitatorId;

		if (facilitatorId) {
			//html.push(`<b>Facilitator:</b> <a href="javascript:void(0)" onclick="appsmith.triggerEvent('openMemberProfile', '${facilitatorId}')">${facilitatorName}</a>`);
			html.push(`<b>Facilitator:</b> ${facilitatorName}`);
		}

		if (details.documenso_document_id) {
			html.push(`<b>Documenso:</b> <a target="_blank" href="${this.DOCUMENSO_BASE_URL}/documents/${details.documenso_document_id}">${details.documenso_document_id}</a>`);
		}

		if (details.externalId) {
			html.push(`<b>Documenso External ID:</b> ${details.externalId}`);
		}

		if (details.createdAt) {
			html.push(`<b>Created:</b> ${new Date(details.createdAt).toLocaleString()}`);
		}

		if (details.url && details.name) {
			html.push(`<b>Agreement:</b> <a target="_blank" href="${details.url}">${details.name}</a>`);
		}

		if (Array.isArray(details.evidence)) {
			details.evidence.forEach(file => {
				const title = file.title || file.name || "Attachment";
				const path = file.signedPath || file.path || file.url;
				if (path) {
					html.push(`<b>Attachment:</b> <a target="_blank" href="${this.NOCODB_BASE_URL}/${path}">${title}</a>`);
				}
			});
		}
		
		const gb = details.data || {};
		const transactionId = gb.number || gb.transactions?.[0]?.id || gb.id;
		const contactId = gb.contact_id;
		const campaignId = gb.campaign_id;
		const campaignCode = gb.campaign_code;

		if (details.event?.startsWith("transaction.") || transactionId) {
			html.push(`<h4>Givebutter</h4>`);

			if (gb.first_name || gb.last_name) {
				html.push(`<b>Donor:</b> ${gb.first_name || ""} ${gb.last_name || ""}`);
			}

			if (gb.email) html.push(`<b>Email:</b> ${gb.email}`);
			if (gb.phone) html.push(`<b>Phone:</b> ${gb.phone}`);

			if (gb.amount != null) {
				html.push(`<b>Amount:</b> $${Number(gb.amount).toFixed(2)} ${gb.currency || ""}`);
			}

			if (gb.status) html.push(`<b>Status:</b> ${gb.status}`);

			if (gb.transacted_at || gb.created_at) {
				html.push(`<b>Transacted:</b> ${new Date(gb.transacted_at || gb.created_at).toLocaleString()}`);
			}

			if (campaignId) {
				html.push(`<b>Campaign:</b> ${gb.campaign_title || campaignId}`);
			}

			if (campaignCode) {
				html.push(`<b>Public Campaign:</b> <a target="_blank" href="https://givebutter.com/${campaignCode}">${campaignCode}</a>`);
			}

			if (contactId) {
				html.push(`<b>Givebutter Contact:</b> <a target="_blank" href="${this.GIVEBUTTER_DASHBOARD_BASE_URL}/contacts/${contactId}">${contactId}</a>`);
			}

			if (transactionId) {
				html.push(`<b>Givebutter Transaction:</b> <a target="_blank" href="${this.GIVEBUTTER_DASHBOARD_BASE_URL}/transactions/${transactionId}">${transactionId}</a>`);
			}
		}		

		return html.length
			? html.join("<br>")
		    : "";
//			: `<pre>${JSON.stringify(details, null, 2)}</pre>`;
	},
	
	async verifyaccess() {
		try {
			//showAlert("Beginning init. mode=" + appsmith.mode, "warning");

			// Wait briefly for Appsmith user context to hydrate
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

			// IMPORTANT: use return value of run(), not qCurrentFacilitator.data
      let rows = await qCurrentFacilitator.run({ email });

      // 🔴 Appsmith bug fix
      if (!Array.isArray(rows)) rows = [];
      //showAlert("qCurrentFacilitator rows=" + rows.length, "warning");

      const me = rows[0];	

			if (!me?.member_id) {
				showAlert("Access denied: not an active facilitator for " + email, "error");
				
				await this.auditLog("auth.denied","facilitator","", { email, page: appsmith.URL?.pathname, mode: appsmith.mode });if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
					//Only redirect when not in editor
					navigateTo("Unauthorized", {}, "SAME_WINDOW");
				}
				return;
			}

			const facilitator_id = me.member_id;
			const facilitator_email = (me.email ?? "").trim().toLowerCase();
			const is_document_reviewer = me.is_document_reviewer;
			const is_donations_reviewer = me.is_donations_reviewer;

			//showAlert("Access granted for " + facilitator_email + " id=" + facilitator_id + " document reviewer=" + is_document_reviewer + " donations reviewer=" + is_donations_reviewer, "success");

			// May want these enabled in deployed mode:
			storeValue("facilitator_id", facilitator_id);
			storeValue("facilitator_email", facilitator_email);
			storeValue("facilitator_is_reviewer", is_document_reviewer );
			storeValue("facilitator_is_donations_reviewer", is_donations_reviewer);
			storeValue("facilitator_full_name", `${me.first_name} ${me.last_name}`.trim());	

		
			//await this.auditLog("auth.granted","facilitator", facilitator_id, { email: facilitator_email, is_reviewer, is_donations_reviewer page: appsmith.URL?.pathname, mode: appsmith.mode });
		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");
			// Helpful: show query error if present
			showAlert("Query error: " + JSON.stringify(qCurrentFacilitator?.error ?? {}), "error");
			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
				//Only redirect when not in editor
				navigateTo("Unauthorized", {}, "SAME_WINDOW");
			}
			return;
		}
		
    this.refresh();
		
	},
}