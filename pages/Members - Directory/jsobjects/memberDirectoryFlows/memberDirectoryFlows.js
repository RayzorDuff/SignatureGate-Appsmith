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
      qMembersDirectory.run(),
    ]);	
		if (tblMembers.selectedRow?.member_id) {
      await qMemberPreview.run();
    }
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

  openSelected() {
    const id = tblMembers.selectedRow?.member_id;
    if (!id) return showAlert("Select a member first.", "warning");
    navigateTo("Members – Profile", { member_id: id });
  },

  newMember() {
    navigateTo("Members – Intake");
  }
}