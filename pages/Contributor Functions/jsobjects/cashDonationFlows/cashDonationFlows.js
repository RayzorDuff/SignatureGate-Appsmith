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

			if (!me?.email || !(me.is_document_reviewer || me.is_donations_reviewer)) {
				showAlert("Access denied: reviewer permission required for " + email, "error");
				
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

	async linkPendingGivebutterDonation() {
		try {
			if (!appsmith.store.facilitator_is_donations_reviewer) {
				showAlert("Only donations reviewers can review donations.", "error");
				return;
			}

			const donation = tblPendingGivebutterDonations.selectedRow;
			const notes = inpDonationNotes.text || "";

			if (!donation?.donation_id) {
				showAlert("Select a pending donation.", "warning");
				return;
			}

			if (donation.provider === "cash") {
				await qIgnorePendingDonation.run({
					donation_id: donation.donation_id,
					new_status: "verified",
					review_notes: notes || "Verified cash donation"
				});
				await this.auditLog("donation.cash.verified", "donation", donation.donation_id, {
					donation_id: donation.donation_id,
					contributor_id: donation.contributor_id || null,
					member_id: donation.member_id || null,
					donor_kind: donation.donor_kind,
					amount_cents: donation.amount_cents,
					review_notes: notes || "Verified cash donation"
				});
				showAlert("Cash donation verified.", "success");
				await qPendingGivebutterDonations.run();
				return;
			}

			if (donation.provider !== "givebutter" || donation.donor_kind !== "unresolved") {
				showAlert("Only unresolved Givebutter donations can be assigned.", "error");
				return;
			}

			const choice = selDonationMember.selectedOptionValue;
			if (!choice || choice === "__anonymous__") {
				showAlert("Select an existing contributor/member or a new contributor type.", "warning");
				return;
			}

			const result = await qLinkDonationToMember.run({
				donation_id: donation.donation_id,
				contributor_choice: choice,
				review_notes: notes
			});
			const resolved = result?.[0] || {};

			await this.auditLog("donation.givebutter.resolved", "donation", donation.donation_id, {
				donation_id: donation.donation_id,
				contributor_choice: choice,
				contributor_id: resolved.contributor_id || null,
				member_id: resolved.member_id || null,
				provider_reference: donation.actual_provider_reference || donation.provider_reference,
				review_notes: notes
			});

			const createdLabel = choice === "__new_organization__"
				? "Organization contributor created and donation assigned."
				: choice === "__new_individual__"
					? "Individual contributor created and donation assigned."
					: "Givebutter donation assigned to contributor.";
			showAlert(createdLabel, "success");
			await Promise.allSettled([
				qPendingGivebutterDonations.run(),
				qMembersDirectory.run()
			]);
		} catch (e) {
			showAlert("Failed to review donation: " + (e?.message || e), "error");
			throw e;
		}
	},

	async submitDonation() {
		try {
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

			await this.auditLog("donation.cash.created", "donation", donation.donation_id || "", {
				donor_kind: isAnonymous ? "anonymous" : "identified",
				contributor_id: donation.contributor_id || null,
				member_id: donation.member_id || null,
				amount_cents,
				donated_at,
				notes
			});

			showAlert(
				isAnonymous
					? "Anonymous cash donation recorded (pending review)."
					: "Contributor cash donation recorded (pending review).",
				"success"
			);
			await qPendingGivebutterDonations.run();
			return donation.donation_id || "";
		} catch (e) {
			const rawMessage =
				e?.message ||
				qInsertCashDonation?.error?.message ||
				qInsertCashDonation?.error ||
				"Cash donation could not be recorded.";
			const message =
				typeof rawMessage === "string"
					? rawMessage
					: JSON.stringify(rawMessage);
			console.error("Cash donation submission failed:", e, qInsertCashDonation?.error);
			showAlert("Cash donation could not be recorded: " + message, "error");
			return "";
		}
	},

	async verifyDonation(
		donationId,
		reviewNotes,
		newStatus,
		memberId,
		amountCents,
		donatedAt
	) {
		const notes = String(reviewNotes || "").trim();

		if (!notes) {
			showAlert(
				"Enter review notes before verifying or rejecting a donation.",
				"warning"
			);
			return;
		}

		await qVerifyDonation.run({
			donation_id: donationId,
			review_notes: notes,
			new_status: newStatus
		});

		await this.auditLog(
			"donation." + newStatus,
			"donation",
			donationId,
			{
				member_id: memberId || appsmith.store.member_id,
				status: newStatus,
				review_notes: notes,
				amount_cents: amountCents,
				donated_at: donatedAt
			}
		);

		await this.refreshDonations();

		showAlert(
			newStatus === "rejected"
				? "Donation rejected."
				: "Donation verified.",
			"success"
		);
	},	

 async openReassignModal(cur_donation_id, cur_donated_at, cur_provider, cur_amount_cents, cur_currency, cur_status, cur_member, cur_contributor) {
    // Requires at least one target lot selected in tblLots
    const id = appsmith.store.donation_reassign_row ||
				DonationsTable?.selectedRow ||
				null;
		
    if (!id?.donation_id) {
      showAlert('Select a donation in the Donations table first.', 'warning');
      return;
    }
		
		const donated_at = cur_donated_at ? moment(cur_donated_at).format("YYYY-MM-DD") : "";
    const provider = cur_provider || "";
    const amount = cur_amount_cents ? Math.round(cur_amount_cents / 100 ) + " " + cur_currency : "";
    const status = cur_status  || "";
		
		const currentSelection = (qMembersDirectory.data || []).find(item =>
      (cur_contributor && String(item.contributor_id || "") === String(cur_contributor)) ||
      (!cur_contributor && cur_member && String(item.member_id || "") === String(cur_member))
    );
    selReassignDonationMember.setSelectedOption(currentSelection?.selection_value || "");
		
		
		//if (!await this.verifyInoculateLots()) return showAlert("Select valid lots to package.", "warning");
		
		txtReassignDonationContent.setText(`${donated_at} | ${provider} | ${amount} | ${status}`.trim());
		txtReassignDonationID.setText(cur_donation_id);
		
    // Refresh source lots list + locations
    Promise.allSettled([qMembersDirectory.run()]).finally(() => {
      showModal(ReassignDonationModal.name);
    });
  },

	async reassignDonation() {
		try {
			if (!appsmith.store.facilitator_is_donations_reviewer) {
				showAlert("You do not have permission to reassign donations.", "error");
				return;
			}

			const row =
				appsmith.store.donation_reassign_row ||
				DonationsTable?.selectedRow ||
				{};

			const donationId = row.donation_id || txtReassignDonationID.text || "";
			const oldMemberId = row.member_id || null;
			const oldContributorId = row.contributor_id || null;
			const contributorChoice = selReassignDonationMember?.selectedOptionValue;

			if (!donationId) {
				showAlert("No donation is selected.", "error");
				return;
			}

			if (!contributorChoice) {
				showAlert("Please select the contributor to assign this donation to.", "warning");
				return;
			}

			const currentChoice = oldContributorId
				? `contributor:${oldContributorId}`
				: oldMemberId ? `member:${oldMemberId}` : "";
			if (currentChoice && currentChoice === contributorChoice) {
				showAlert("That donation is already assigned to this contributor.", "warning");
				return;
			}

			const res = await qReassignDonationMember.run({
				donation_id: donationId,
				contributor_choice: contributorChoice
			});
			if (!Array.isArray(res) || !res[0]?.donation_id) {
				throw new Error("The donation was not reassigned. Confirm the selected contributor is active and try again.");
			}

			await this.auditLog(
				"donation.reassigned",
				"donation",
				donationId,
				{
					donation_id: donationId,
					from_member_id: oldMemberId,
					from_contributor_id: oldContributorId,
					to_contributor_choice: contributorChoice,
					to_contributor_id: res[0].contributor_id || null,
					to_member_id: res[0].member_id || null,
					page: "Contributor Functions"
				}
			);

			showAlert("Donation reassigned.", "success");
			closeModal(ReassignDonationModal.name);

			await this.refreshDonations();


			return res;
			
		} catch (e) {
			console.error("reassignDonation failed:", e);
			showAlert("Failed to reassign donation: " + (e?.message || e), "error");
			throw e;
		}
	},
	
	async ignorePendingDonation() {
		const donation = tblPendingGivebutterDonations.selectedRow;
		if (!donation?.donation_id) {
			showAlert("Select a pending donation.", "warning");
			return;
		}

		const isCash = donation.provider === "cash";
		const newStatus = isCash ? "rejected" : "ignored";
		const notes = inpDonationNotes.text || (
			isCash ? "Rejected cash donation" : "Donation does not apply to a member"
		);

		await qIgnorePendingDonation.run({
			donation_id: donation.donation_id,
			new_status: newStatus,
			review_notes: notes
		});

		await this.auditLog(
			isCash ? "donation.cash.rejected" : "donation.ignored",
			"donation",
			donation.donation_id,
			{
				donation_id: donation.donation_id,
				donor_kind: donation.donor_kind,
				member_id: donation.member_id || null,
				provider: donation.provider,
				provider_reference: donation.actual_provider_reference || donation.provider_reference,
				status: newStatus,
				review_notes: notes,
				reviewed_by: appsmith.store.facilitator_id
			}
		);

		showAlert(isCash ? "Cash donation rejected." : "Donation ignored.", "success");
		await qPendingGivebutterDonations.run();
	},

	async createMemberFromPendingDonation() {
		const donation = tblPendingGivebutterDonations.selectedRow;
		const notes = inpDonationNotes.text || "Created member from Givebutter donation";

		if (!appsmith.store.facilitator_is_donations_reviewer) {
			showAlert("Only donations reviewers can create members from donations.", "error");
			return;
		}
		if (!donation?.donation_id) {
			showAlert("Select a pending Givebutter donation.", "warning");
			return;
		}
		if (donation.provider !== "givebutter" || donation.donor_kind !== "unresolved") {
			showAlert("Only unresolved Givebutter donations can create a member.", "error");
			return;
		}

		const created = await qCreateMemberFromDonation.run({
			donation_id: donation.donation_id,
			review_notes: notes,
			subscribe_to_mailing_list: chkGivebutterSubscribeListmonk.isChecked
		});
		const member = created?.[0];
		if (!member?.member_id) {
			showAlert("Member was not created.", "error");
			return;
		}

		await this.auditLog("donation.member_created", "donation", donation.donation_id, {
			donation_id: donation.donation_id,
			created_member_id: member.member_id,
			provider_reference: donation.actual_provider_reference || donation.provider_reference,
			review_notes: notes
		});
		showAlert("Member and linked contributor created; donation assigned.", "success");
		await Promise.allSettled([
			qPendingGivebutterDonations.run(),
			qMembersDirectory.run()
		]);
		navigateTo("Member Functions", { member_id: member.member_id }, "SAME_WINDOW");
	},
	

};
