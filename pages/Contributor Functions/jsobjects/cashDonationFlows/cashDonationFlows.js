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
			qPendingGivebutterDonations.run(),
		]);

		// Contributor donor selection is independent of the global Member Functions selection.
		await cashDonationFlows.refreshDonations();
	},
	
	async refreshDonations() {
		const showRejected =
			typeof chkShowRejectedDonations !== "undefined" &&
			Boolean(chkShowRejectedDonations.isChecked);

		const selectionValue = String(
			selDonationMember?.selectedOptionValue ||
			appsmith.store.donation_donor_selection ||
			""
		).trim();

		return qMemberDonations.run({
			show_rejected: showRejected,
			selection_value: selectionValue
		});
	},	
	
	async verifyaccess() {
    await Promise.all([storeValue("facilitator_id", ""), storeValue("facilitator_is_reviewer", false), storeValue("facilitator_is_donations_reviewer", false)]);

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
      await qPageAccess.run();
            let rows = await qCurrentFacilitator.run({ email });

      // 🔴 Appsmith bug fix
      if (!Array.isArray(rows)) rows = [];
      //showAlert("qCurrentFacilitator rows=" + rows.length, "warning");

      const me = rows[0];	

			if (!me?.email || !me.can_contributor_functions) {
				showAlert("Access denied: reviewer permission required for " + email, "error");
				
				await this.auditLog("auth.denied","facilitator","", { email, page: appsmith.URL?.pathname, mode: appsmith.mode });if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
					//Only redirect when not in editor
					/* Access denied in place; keep navigation available. */
				}
				return;
			}

			const facilitator_id = me.member_id || "";
			const facilitator_email = (me.email ?? "").trim().toLowerCase();
			const is_document_reviewer = me.is_document_reviewer;
			const is_donations_reviewer = me.is_donations_reviewer;

			//showAlert("Access granted for " + facilitator_email + " id=" + facilitator_id + " document reviewer=" + is_document_reviewer + " donations reviewer=" + is_donations_reviewer, "success");

			// May want these enabled in deployed mode:
			await storeValue("facilitator_id", facilitator_id);
			await storeValue("facilitator_email", facilitator_email);
			await storeValue("facilitator_is_reviewer", is_document_reviewer );
			await storeValue("facilitator_is_donations_reviewer", is_donations_reviewer);
			storeValue("facilitator_full_name", `${me.first_name} ${me.last_name}`.trim());	

		
			//await this.auditLog("auth.granted","facilitator", facilitator_id, { email: facilitator_email, is_reviewer, is_donations_reviewer page: appsmith.URL?.pathname, mode: appsmith.mode });
		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");
			// Helpful: show query error if present
			showAlert("Query error: " + JSON.stringify(({})), "error");
			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
				//Only redirect when not in editor
				/* Access denied in place; keep navigation available. */
			}
			return;
		}
		
		return await this.refresh();
		
	},
	
	_normalizeUploadResponse(uploadRes) {
		const r = uploadRes?.data ?? uploadRes;

		const arr =
			Array.isArray(r) ? r :
			Array.isArray(r?.files) ? r.files :
			(r && typeof r === "object") ? [r] :
			[];

		// Require real attachment objects (path or signedPath)
		const good = arr.filter(x => x && (x.path || x.signedPath));

		if (!good.length) {
			console.log("Unexpected upload response:", uploadRes);
			throw new Error("Upload succeeded but did not return attachment path(s).");
		}

		return good;
	},

  async reviewActor(enroll = false) {
    const actor = (await qPageAccess.run())?.[0];
    const email = String(appsmith.user?.email || "").trim().toLowerCase();
    if (!email || String(actor?.email || "").trim().toLowerCase() !== email || actor?.is_donations_reviewer !== true ||
        (enroll && (actor?.is_document_reviewer !== true || actor?.is_directory_manager !== true))) {
      showAlert(enroll ? "Participant enrollment requires Directory Manager, Document Reviewer and Donations Reviewer permissions."
        : "Donations Reviewer permission is required.", "error");
      return false;
    }
    return actor;
  },

  async runReviewWrite(query, params, message, enroll = false, after = null) {
    if (appsmith.store.provider_review_busy === true) return null;
    await storeValue("provider_review_busy", true);
    let record = null;
    try {
      if (!await this.reviewActor(enroll)) return null;
      const result = await query.run(params);
      record = Array.isArray(result) ? result[0] : result;
      if (!record?.donation_id && !record?.member_id) throw new Error("No changed record was returned.");
      const refreshed = await Promise.allSettled([qPendingGivebutterDonations.run(),qMembersDirectory.run(),this.refreshDonations()]);
      if (after) await after(record);
      if (refreshed.some(item => item.status === "rejected")) {
        showAlert("Change saved, but the display refresh failed. Reload; do not repeat the change.", "warning");
      } else showAlert(message, "success");
      return record;
    } catch (error) {
      showAlert(record ? "Change saved, but the display could not finish updating. Reload; do not repeat the change."
        : "Review failed: " + (error?.message || error), record ? "warning" : "error");
      return record;
    } finally {
      await storeValue("provider_review_busy", false);
    }
  },

  async linkPendingGivebutterDonation() {
    const donation = tblPendingGivebutterDonations.selectedRow;
    if (!donation?.donation_id) { showAlert("Select a pending donation.","warning"); return; }
    const notes = String(inpDonationNotes.text || "").trim();
    if (donation.provider === "cash") {
      return this.runReviewWrite(qIgnorePendingDonation,{donation_id:donation.donation_id,new_status:"verified",review_notes:notes},"Cash donation verified.");
    }
    if (donation.provider !== "givebutter" || donation.donor_kind !== "unresolved") {
      showAlert("Select an unresolved Givebutter donation.","warning"); return;
    }
    const choice = selDonationMember.selectedOptionValue;
    if (!choice || choice === "__anonymous__") { showAlert("Select an existing party or a new contributor type.","warning"); return; }
    return this.runReviewWrite(qLinkDonationToMember,{donation_id:donation.donation_id,contributor_choice:choice,review_notes:notes},
      choice.startsWith("__new_") ? "Contributor created and donation assigned." : "Donation assigned to contributor.");
  },

	async submitDonation() {
    let recordedId = "";
		try {
      const actor = (await qPageAccess.run())?.[0];
      if (actor?.can_contributor_functions !== true) { showAlert("Cash entry requires reviewer or assigned practitioner permission.", "error"); return ""; }
			const choice =
				selDonationMember.selectedOptionValue ||
				"";
			const isAnonymous = choice === "__anonymous__";

			if (!choice) {
				showAlert("Select a contributor, member, or Anonymous cash donor.", "warning");
				return;
			}
			if (choice === "__new_individual__" || choice === "__new_organization__") {
				showAlert("New contributor choices are available only while resolving a Givebutter donation.", "warning");
				return;
			}

			const amount = Number(inpDonationAmount.text);
			if (!amount || amount <= 0) {
				showAlert("Enter a positive amount.", "warning");
				return;
			}

			const amount_cents = Math.round(amount * 100);
			const donated_at = inpDonationDate.selectedDate || moment().format("YYYY-MM-DD");
			const notes = inpDonationNotes.text || "";
			const res = await qInsertCashDonation.run({
				contributor_choice: choice,
				is_anonymous: isAnonymous,
				amount_cents,
				donated_at,
				notes
			});
			const donation = res?.[0] || {};

      recordedId = donation.donation_id || "";
      if (!recordedId) throw new Error("Cash entry returned no donation identifier.");

			const refreshes = await Promise.allSettled([this.refreshDonations(), actor.is_donations_reviewer ? qPendingGivebutterDonations.run() : Promise.resolve([])]);
      if (refreshes.some(result => result.status === "rejected")) showAlert("Cash donation was recorded, but a list could not refresh. Refresh the page; do not record it again.", "warning");
      else {
			showAlert(
				isAnonymous
					? "Anonymous cash donation recorded (pending review)."
					: "Contributor cash donation recorded (pending review).",
				"success"
			);
      }
			return recordedId;
		} catch (e) {
			const rawMessage =
				e?.message ||
				e?.message ||
				e ||
				"Cash donation could not be recorded.";
			const message =
				typeof rawMessage === "string"
					? rawMessage
					: JSON.stringify(rawMessage);
			console.error("Cash donation submission failed:", e, e);
			showAlert(recordedId ? "Cash donation was recorded, but the display could not refresh. Do not record it again." : "Cash donation could not be recorded: " + message, recordedId ? "warning" : "error");
			return recordedId || "";
		}
	},

  async verifyDonation(donationId, reviewNotes, newStatus, memberId, amountCents, donatedAt) {
    const notes = String(reviewNotes || "").trim();
    if (!notes) { showAlert("Enter review notes before verifying or rejecting a donation.","warning"); return; }
    return this.runReviewWrite(qVerifyDonation,{donation_id:donationId,review_notes:notes,new_status:newStatus},
      newStatus === "rejected" ? "Donation rejected." : "Donation verified.");
  },

  async clearReassign() {
    await storeValue("donation_reassign_row", null);
    await storeValue("donation_reassign_actor", null);
  },

  async openReassignModal(cur_donation_id, cur_donated_at, cur_provider, cur_amount_cents, cur_currency, cur_status, cur_member, cur_contributor) {
    if (!await this.reviewActor()) return;
    const id = String(cur_donation_id || "").trim();
    const row = (DonationsTable.processedTableData || []).find(item => String(item.donation_id || "") === id)
      || (String(DonationsTable.selectedRow?.donation_id || "") === id ? DonationsTable.selectedRow : null);
    if (!row) { showAlert("Select a donation row first.","warning"); return; }
    await qMembersDirectory.run();
    await storeValue("donation_reassign_row", {...row});
    await storeValue("donation_reassign_actor", String(appsmith.user?.email || "").trim().toLowerCase());
    const choice = (qMembersDirectory.data || []).find(item =>
      row.contributor_id ? item.contributor_id === row.contributor_id : row.member_id && item.member_id === row.member_id);
    await selReassignDonationMember.setSelectedOption(choice?.selection_value || "");
    await resetWidget("inpDonationReassignReason",true);
    await txtReassignDonationID.setText(id);
    await txtReassignDonationContent.setText(`${String(row.donated_at || "").slice(0,10)} | ${row.provider || ""} | ${(Number(row.amount_cents || 0)/100).toFixed(2)} ${row.currency || ""} | ${row.status || ""}`);
    await showModal("ReassignDonationModal");
  },

  async reassignDonation() {
    const row = appsmith.store.donation_reassign_row;
    const choice = String(selReassignDonationMember.selectedOptionValue || "");
    const reason = String(inpDonationReassignReason.text || "").trim();
    if (!row?.donation_id) { showAlert("Open a donation's reassignment dialog first.","warning"); return; }
    if (appsmith.store.donation_reassign_actor !== String(appsmith.user?.email || "").trim().toLowerCase()) {
      await this.clearReassign(); showAlert("Account changed. No reassignment was made.","error"); return;
    }
    if (!choice || !reason) { showAlert("Choose the contributor and enter a correction reason.","warning"); return; }
    return this.runReviewWrite(qReassignDonationMember,{donation_id:row.donation_id,contributor_choice:choice,reason},"Donation reassigned.",false,
      async () => { await this.clearReassign(); await closeModal("ReassignDonationModal"); });
  },

  async ignorePendingDonation() {
    const donation = tblPendingGivebutterDonations.selectedRow;
    if (!donation?.donation_id) { showAlert("Select a pending donation.","warning"); return; }
    const cash = donation.provider === "cash";
    return this.runReviewWrite(qIgnorePendingDonation,{donation_id:donation.donation_id,new_status:cash?"rejected":"ignored",review_notes:String(inpDonationNotes.text || "").trim()},
      cash ? "Cash donation rejected." : "Donation ignored.");
  },

  async createMemberFromPendingDonation() {
    const donation = tblPendingGivebutterDonations.selectedRow;
    if (!donation?.donation_id || donation.provider !== "givebutter" || donation.donor_kind !== "unresolved") {
      showAlert("Select an unresolved Givebutter donation.","warning"); return;
    }
    return this.runReviewWrite(qCreateMemberFromDonation,{donation_id:donation.donation_id,review_notes:String(inpDonationNotes.text || "").trim(),subscribe_to_mailing_list:chkGivebutterSubscribeListmonk.isChecked === true},
      "Participant and linked contributor created.",true,async record => {
        await navigateTo("Member Functions",{member_id:record.member_id},"SAME_WINDOW");
      });
  },
};
