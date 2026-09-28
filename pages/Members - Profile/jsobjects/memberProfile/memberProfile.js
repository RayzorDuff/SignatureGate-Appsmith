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

	async refresh () {
  const directoryPromise = qMembersDirectory.run();
  const memberId = String(appsmith.store.member_id || "").trim();
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(memberId);

  if (!isUuid) {
    await directoryPromise;
    return [];
  }

  return Promise.allSettled([directoryPromise, qMemberById.run(), qMemberAgreements.run(), qMemberReleases.run(), memberProfile.refreshDonations(), qListFacilitators?.run?.(), qMemberFacilitators?.run?.(), qMemberStorageLocations?.run?.(), qDistinctStorageLocationNames?.run?.(), qMemberAddresses?.run?.(), qMemberPhones?.run?.(), qMemberEmails?.run?.(), qAgreementTypesList.run(), selAgreementType?.selectedOptionValue ? qAgreementTemplatesByType.run({
    type_key: selAgreementType.selectedOptionValue
  }) : Promise.resolve([])]);
},

	async refreshAgreements() {
    if (!selAgreementType.selectedOptionValue) {
				return null;
    }
	
    return await qAgreementTemplatesByType.run({
      type_key: selAgreementType.selectedOptionValue,
    });
  },

	async refreshDonations() {
		const showRejected =
			typeof chkShowRejectedDonations !== "undefined" &&
			Boolean(chkShowRejectedDonations.isChecked);

		return qMemberDonations.run({
			show_rejected: showRejected
		});
	},	
	
	_requireMemberId() {
    let memberId = selMember?.selectedOptionValue;
		
    if (!memberId) {
			if(!appsmith.URL.queryParams.member_id ) {
				showAlert("Select a member first.", "warning");
				return null;
			}
			memberId = appsmith.URL.queryParams.member_id;
			selMember.setSelectedOption(memberId);

		}
    	
		return memberId;
  },

  _requireFacilitator() {
    const facilitatorId = inpFacilitator?.selectedOptionValue;
    if (!facilitatorId) {
      showAlert("Please select a facilitator before creating an agreement.", "warning");
      return null;
    }
		
		storeValue("facilitator_id", facilitatorId);
    return facilitatorId;
  },
	
	 _requireAgreementType() {
    const agreementTypeId = selAgreementType?.selectedOptionValue;
		 
    if (!agreementTypeId) {
      showAlert("Please select an Agreement Type before creating an agreement.", "warning");
      return null;
    }
		
		// This isn't actually happening in the database currently
		//storeValue("agreement_type_id", agreementTypeId);
    return agreementTypeId;
  },
	
	 _requireAgreementTemplate() {
    const agreementTemplateId = selAgreementTemplate?.selectedOptionValue;
		 
    if (!agreementTemplateId) {
      showAlert("Please select an Agreement Type and Template before creating an agreement.", "warning");
      return null;
    }
		
		storeValue("agreement_template_id", agreementTemplateId);
    return agreementTemplateId;
  },

	async ensureMemberAccess() {
		const rows = await qMemberAccessCheck.run();
		const allowed = Array.isArray(rows) ? rows[0]?.allowed : rows?.allowed;
		if (!allowed) {
			showAlert("You do not have access to this member.", "error");
			navigateTo("Members - Directory", {}, "SAME_WINDOW");
			return false;
		}
		return true;
	},
	
	async setMemberId (formMemberId) {
  const memberId = String(formMemberId || "").trim();
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(memberId);
  if (!isUuid) {
    await storeValue("member_id", "");
    if (memberId) showAlert("Select a valid member.", "warning");
    return null;
  }
  await storeValue("member_id", memberId);
  const ok = await memberProfile.ensureMemberAccess();
  if (!ok) return null;
  await memberProfile.refresh();
  return memberId;
},
	
	/* Not needed...
	resetAllWidgets: () => {
    resetWidget('inpCreated', true);
    resetWidget('inpStatus', true);
    resetWidget('inpRoles', true);
    // Add other widgets as needed
  },
	*/
	
  async init () {
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
    let rows = await qCurrentFacilitator.run({
      email
    });
    if (!Array.isArray(rows)) rows = [];
    const me = rows[0];
    if (!me?.member_id) {
      showAlert("Access denied: not an active facilitator for " + email, "error");
      await memberProfile.auditLog("auth.denied", "facilitator", "", {
        email,
        page: appsmith.URL?.pathname,
        mode: appsmith.mode
      });
      if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
        navigateTo("Unauthorized", {}, "SAME_WINDOW");
      }
      return;
    }
    await Promise.all([
      storeValue("facilitator_id", me.member_id),
      storeValue("facilitator_email", (me.email ?? "").trim().toLowerCase()),
      storeValue("facilitator_is_reviewer", me.is_document_reviewer),
      storeValue("facilitator_is_donations_reviewer", me.is_donations_reviewer),
      storeValue("facilitator_full_name", `${me.first_name} ${me.last_name}`.trim()),
      storeValue("NC_PUBLIC_URL", "https://nocodb.danks.store")
    ]);
  } catch (e) {
    showAlert("Access check failed: " + (e?.message || e), "error");
    showAlert("Query error: " + JSON.stringify(qCurrentFacilitator?.error ?? ({})), "error");
    if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
      navigateTo("Unauthorized", {}, "SAME_WINDOW");
    }
    return;
  }

  const directoryRows = await qMembersDirectory.run();
  const directory = Array.isArray(directoryRows) ? directoryRows : [];
  const urlMemberId = String(appsmith.URL.queryParams.member_id || "").trim();
  const storedMemberId = String(appsmith.store.member_id || "").trim();
  const candidate = urlMemberId || storedMemberId;
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(candidate);
  const isAccessible = isUuid && directory.some(row => String(row.member_id || "") === candidate);

  if (!isAccessible) {
    await storeValue("member_id", "");
    if (candidate && isUuid) {
      showAlert("The selected member is not in your accessible member list.", "warning");
    }
    return directory;
  }

  await storeValue("member_id", candidate);
  const ok = await memberProfile.ensureMemberAccess();
  if (!ok) return;
  return memberProfile.refresh();
},

	_normalizeUploadResponse(uploadRes) {
		const r = uploadRes?.data ?? uploadRes;

		const arr =
			Array.isArray(r) ? r :
			Array.isArray(r?.files) ? r.files :
			(r && typeof r === "object") ? [r] :
			[];

		// Require real NocoDB attachment objects.
		const good = arr.filter(x => x && (x.path || x.signedPath));

		if (!good.length) {
			console.log("Unexpected upload response:", uploadRes);
			throw new Error(
				"Upload succeeded but did not return attachment path(s)."
			);
		}

		return good;
	},
	
	async sendDigitalAgreement() {
		const memberId = this._requireMemberId();
		const facilitatorId = this._requireFacilitator();
		const agreementTemplateId = this._requireAgreementTemplate();

		if (!facilitatorId) {
			showAlert("Invalid Facilitator.", "error");
			return;
		}
		if (!agreementTemplateId) {
			showAlert("Invalid Agreement Template.", "error");
			return;
		}
		if (!memberId) {
			showAlert("Invalid Member.", "error");
			return;
		}

		const selectedMemberEmailId = inpEmailAgreementTo?.selectedOptionValue || "";
		let emailRow = null;

		if (selectedMemberEmailId) {
			emailRow = (qMemberEmails.data || []).find(e =>
				e.member_email_id === selectedMemberEmailId &&
				(e.status || "active") === "active"
			) || null;
		}

		if (!emailRow) {
			const emailRows = await qPrimaryMemberEmail.run();
			emailRow = emailRows?.[0] || null;
		}

		const sendEmail = emailRow?.email;

		if (!sendEmail || !emailRow?.member_email_id) {
			showAlert("Select an active member email before sending a digital agreement.", "warning");
			return;
		}

		const createRes = await qCreatePendingAgreement.run({
			member_id: memberId,
			facilitator_id: facilitatorId,
			signature_method: "documenso",
			agreement_template_id: agreementTemplateId,
			status: "pending_email_send",
			evidence_json: "[]",
			member_email_id: emailRow.member_email_id
		});

		const agreementId =
			(typeof createRes === "string" && createRes) ||
			createRes?.member_agreement_id ||
			createRes?.[0]?.member_agreement_id ||
			createRes?.[0]?.member_agreements_id ||
			null;

		if (!agreementId) {
			showAlert("Agreement created, but no member_agreement_id was returned.", "error");
			return;
		}

		await this.auditLog("member_agreement.created", "member_agreement", agreementId, {
			member_id: memberId,
			facilitator_id: facilitatorId,
			agreement_template_id: agreementTemplateId,
			signature_method: "documenso",
			status: "pending_email_send",
			member_email_id: emailRow.member_email_id,
			email_used: sendEmail,
			page: "Members - Profile"
		});

		showAlert("Digital release queued (pending email send).", "success");

		await apiTriggerDocumenso.run({
			member_agreement_id: agreementId,
			externalId: "ma:" + agreementId
		});

		await qMemberAgreements.run();
	},

	async openPaperUpload() {
		const memberId = this._requireMemberId();
		const facilitatorId = this._requireFacilitator();
		const agreementTypeId = this._requireAgreementType();
		const agreementTemplateId =
			selAgreementTemplate?.selectedOptionValue;

		if (!facilitatorId) {
			showAlert("Invalid Facilitator.", "error");
			return;
		}

		if (!memberId) {
			showAlert("Invalid Member.", "error");
			return;
		}

		if (!agreementTypeId) {
			showAlert("Invalid Agreement Type.", "error");
			return;
		}

		// This FilePicker is configured for Base64. Use .files, not
		// .selectedFiles, so each object includes the encoded data n8n needs.
		const raw = FilePicker1?.files || [];
		console.log("FilePicker1.files raw:", raw);

		const files = raw.filter(file =>
			file &&
			typeof file === "object" &&
			typeof file.name === "string" &&
			typeof file.size === "number" &&
			file.size >= 0
		);

		if (!files.length) {
			showAlert(
				"Please choose at least one valid file to upload for the paper agreement.",
				"warning"
			);
			return;
		}

		if (files.length !== raw.length) {
			showAlert(
				"Some selected items were invalid. Remove them and re-select the file(s).",
				"warning"
			);
			return;
		}

		showAlert(`Uploading ${files.length} file(s)...`, "info");

		try {
			const attachments = [];

			// Send one Base64 file per request. This avoids combining all encoded
			// files into one oversized JSON body and gives each file its own timeout.
			for (let i = 0; i < files.length; i++) {
				const file = files[i];

				const encodedData =
					file.data ||
					file.base64 ||
					file.content ||
					file.fileData ||
					file.file;

				if (
					!encodedData ||
					typeof encodedData !== "string"
				) {
					throw new Error(
						`File "${file.name}" does not contain Base64 upload data.`
					);
				}

				showAlert(
					`Uploading file ${i + 1} of ${files.length}: ${file.name}`,
					"info"
				);

				try {
					const uploadRes =
						await apiUploadEvidenceViaN8n.run({
							files: [
								{
									name: file.name,
									type:
										file.type ||
										file.mimeType ||
										file.mimetype ||
										"application/octet-stream",
									size: file.size,
									data: encodedData
								}
							]
						});

					attachments.push(
						...this._normalizeUploadResponse(uploadRes)
					);
				} catch (e) {
					throw new Error(
						`Upload failed for "${file.name}" ` +
						`(${i + 1} of ${files.length}): ` +
						`${e?.message ?? e}`
					);
				}
			}

			const evidenceJson = JSON.stringify(attachments);

			const ins = await qCreatePendingAgreement.run({
				member_id: memberId,
				facilitator_id: facilitatorId,
				agreement_template_id:
					agreementTemplateId || null,
				signature_method: "paper",
				status: "pending_review",
				evidence_json: evidenceJson
			});

			const agreementId =
				ins?.[0]?.member_agreement_id ||
				ins?.member_agreement_id ||
				"";

			await this.auditLog(
				"member_agreement.created",
				"member_agreement",
				agreementId,
				{
					member_id: memberId,
					facilitator_id: facilitatorId,
					agreement_template_id:
						agreementTemplateId || null,
					signature_method: "paper",
					status: "pending_review"
				}
			);

			await this.auditLog(
				"member_agreement.evidence_uploaded",
				"member_agreement",
				agreementId,
				{
					member_id: memberId,
					facilitator_id: facilitatorId,
					agreement_template_id:
						agreementTemplateId || null,
					attachments: attachments.length
				}
			);

			showAlert(
				"Paper agreement uploaded and queued for review.",
				"success"
			);

			await qMemberAgreements.run();
			resetWidget("FilePicker1", true);

			return {
				attachments,
				ins
			};
		} catch (e) {
			console.error("Paper upload failed:", e);

			showAlert(
				`Upload failed: ${e?.message ?? e}`,
				"error"
			);

			throw e;
		}
	},
	
	evidenceLinks(evidenceCell) {
		// evidenceCell might be:
		// - an array of file objects
		// - a JSON string
		// - null
		// - or even nested like [[{...},{...}], [{...}]] depending on your query/table mapping
		const base = (appsmith.store.NC_PUBLIC_URL || "").replace(/\/+$/, "");
		if (!base) return "<span style='color:#999'>Set NC_PUBLIC_URL</span>";

		let ev = evidenceCell;

		// If it's a string, try parse
		if (typeof ev === "string") {
			try { ev = JSON.parse(ev); } catch (e) { /* ignore */ }
		}

		// Normalize:
		// If it's nested arrays, flatten to a single array of file objects.
		if (Array.isArray(ev) && Array.isArray(ev[0])) {
			ev = ev.flat();
		}

		if (!Array.isArray(ev) || ev.length === 0) return "";

		const esc = (s) => String(s ?? "")
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#39;");

		// Build "buttons" as <a> tags styled like buttons
		return ev
// Use for signed paths
//			.filter(f => f && (f.signedPath || f.path))
				.filter(f => f && f.path)
			.map((f, idx) => {
// Use for signed paths
//				const href = `${base}/${f.signedPath || f.path}`; // prefer signedPath
				const href = `${base}/${f.path}`;
				const label = esc(f.title || `File ${idx + 1}`);
				return `<a
					href="${esc(href)}"
					target="_blank"
					rel="noopener noreferrer"
					style="
						display:inline-block;
						margin:2px 6px 2px 0;
						padding:4px 8px;
						border:1px solid #ccc;
						border-radius:6px;
						text-decoration:none;
						font-size:12px;
						color:#111;
						background:#f7f7f7;
					"
				>⬇ ${label}</a>`;
			})
			.join("");
	},

	async cancelDocumensoAgreement(row) {
		if (!row?.member_agreement_id) {
			showAlert("No agreement selected.", "error");
			return;
		}

		if (row.signature_method !== "documenso" || row.status !== "pending_signature") {
			showAlert("Only pending Documenso agreements can be canceled.", "warning");
			return;
		}

		if (!row.documenso_document_id) {
			showAlert("This agreement does not have a Documenso document id to cancel.", "error");
			return;
		}

		const reason = (row.review_notes || "").trim();
		if (!reason) {
			showAlert("Enter Review/Cancel Notes before canceling a Documenso agreement.", "warning");
			return;
		}

		await apiCancelDocumensoAgreement.run({
			member_agreement_id: row.member_agreement_id,
			reason
		});

		showAlert("Documenso agreement canceled.", "success");

		await Promise.allSettled([
			qMemberAgreements.run(),
			qMemberById.run()
		]);
	},
	
	async verifyAgreement(agreementId, reviewNotes, newStatus, memberId, rowEvidence, agreementType) {
		const notes = (reviewNotes || "").trim();

		if (!notes) {
			showAlert("Enter Review/Cancel Notes before approving or rejecting an agreement.", "warning");
			return;
		}

		let ApprovedRejected = "approved";
		if ((newStatus || "").trim() === "rejected") {
			ApprovedRejected = "rejected";
		}
		
		await qVerifyAgreement.run({ member_agreement_id: agreementId, review_notes: notes, new_status: newStatus });

		if (newStatus === "signed") {
			const verifiedEmail = await qVerifyAgreementEmail.run({
				member_agreement_id: agreementId
			});

			if (verifiedEmail?.[0]?.member_email_id) {
				await this.auditLog("member.email.verified", "member", memberId || appsmith.store.member_id, {
					member_id: memberId || appsmith.store.member_id,
					member_email_id: verifiedEmail[0].member_email_id,
					email: verifiedEmail[0].email,
					source: "documenso_signed_agreement",
					member_agreement_id: agreementId
				});
			}
		}
		
		await memberProfile.auditLog("agreement." + ApprovedRejected, "member_agreement", agreementId, {
			member_id: memberId || appsmith.store.member_id,
			status: newStatus,
			review_notes: notes,
			evidence: rowEvidence,
			agreement_type: agreementType
		});

		await qMemberAgreements.run();
		showAlert("Agreement " + ApprovedRejected + ".", "success");
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

	async voidRelease(
		voidReleaseId,
		voidReleaseType,
		voidReason,
		mushroomProcessId,
		airtableRecordId,
		storageLocationName
	) {
		if (!voidReleaseId) {
			showAlert("Please choose a release to void.", "warning");
			return;
		}

		showAlert("Voiding: " + voidReleaseId, "success");

		if (voidReleaseType === "sacrament_release") {
			if (!storageLocationName) {
				showAlert("Cannot unship product because the release has no storage location.", "error");
				return;
			}

			await apiMarkProductUnShipped.run({
				airtable_record_id: airtableRecordId,
				mushroomprocess_product_id: mushroomProcessId,
				storage_location_name: storageLocationName
			});

			showAlert("Release product returned to storage location, " + storageLocationName, "success");
		}

		const voided = await qVoidRelease.run({
			void_reason: voidReason || "Voided by: " + appsmith.store.facilitator_full_name,
			release_id: voidReleaseId
		});

		showAlert(`Release voided: ${voided?.[0]?.release_id || "ok"}`, "success");

		await this.auditLog("release.voided", "release", voided?.[0]?.release_id || voidReleaseId, {
			void_reason: voidReason,
			release_type: voidReleaseType,
			release_id: voidReleaseId,
			voided_by: appsmith.store.facilitator_id,
			mushroomprocess_product_id: mushroomProcessId || null,
			storage_location_name: storageLocationName || null
		});

		await qMemberReleases.run();

		return voided;
	},

  _normText(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  },

  _normEmail(v) {
    return this._normText(v).toLowerCase();
  },

	_toDateOnly(v) {
		if (v === null || v === undefined) return "";
		const s = String(v).trim();
		if (!s) return "";

		// If it's already YYYY-MM-DD, keep it
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

		// If it's ISO datetime, parse and convert to YYYY-MM-DD (UTC-safe)
		const d = new Date(s);
		if (isNaN(d.getTime())) return "";

		return d.toISOString().slice(0, 10); // YYYY-MM-DD
	},

  _diff(oldObj, newObj) {
    const changes = {};
    for (const k of Object.keys(newObj)) {
      const a = oldObj?.[k];
      const b = newObj?.[k];

      // Normalize null/undefined/"" equivalence for diff readability
      const na = (a === null || a === undefined) ? "" : String(a);
      const nb = (b === null || b === undefined) ? "" : String(b);

      if (na !== nb) changes[k] = { from: a ?? null, to: b ?? null };
    }
    return changes;
  },
		
  async openReassignModal(cur_donation_id, cur_donated_at, cur_provider, cur_amount_cents, cur_currency, cur_status, cur_member) {
    // Requires at least one target lot selected in tblLots
    const id = appsmith.store.donation_reassign_row ||
				DonationsTable?.selectedRow ||
				{};
		
    if (!id) {
      showAlert('Select one or more Donation in the Donations table first.', 'warning');
      return;
    }
		
		const donated_at = cur_donated_at ? moment(cur_donated_at).format("YYYY-MM-DD") : "";
    const provider = cur_provider || "";
    const amount = cur_amount_cents ? Math.round(cur_amount_cents / 100 ) + " " + cur_currency : "";
    const status = cur_status  || "";
		
		selReassignDonationMember.setSelectedOption(cur_member || "");
		
		
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
			const oldMemberId = row.member_id;
			const newMemberId = selReassignDonationMember?.selectedOptionValue;

			if (!donationId) {
				showAlert("No donation is selected.", "error");
				return;
			}

			if (!newMemberId) {
				showAlert("Please select the new member.", "warning");
				return;
			}

			if (String(oldMemberId || "") === String(newMemberId || "")) {
				showAlert("That donation is already assigned to this member.", "warning");
				return;
			}

			const res = await qReassignDonationMember.run({
				donation_id: donationId,
				new_member_id: newMemberId
			});

			await memberProfile.auditLog(
				"donation.reassigned",
				"donation",
				donationId,
				{
					donation_id: donationId,
					from_member_id: oldMemberId ?? null,
					to_member_id: newMemberId,
					page: "Members - Profile"
				}
			);

			showAlert("Donation reassigned.", "success");
			closeModal(ReassignDonationModal.name);

			await this.refreshDonations();

			if (typeof qDonationSummary !== "undefined") {
				await qDonationSummary.run();
			}

			if (typeof qMemberById !== "undefined") {
				await qMemberById.run();
			}

			return res;
			
		} catch (e) {
			console.error("reassignDonation failed:", e);
			showAlert("Failed to reassign donation: " + (e?.message || e), "error");
			throw e;
		}
	},
	
	async submitMemberUpdate() {
    const memberId = this._requireMemberId();

		if (!memberId) {
			showAlert("Internal error - no memberID.", "warning");
			return;
		}

    const oldRow = (qMemberById?.data && qMemberById.data[0]) ? qMemberById.data[0] : {};

		const ui = {
			first_name: String(inpFirstName.text || "").trim(),
			last_name: String(inpLastName.text || "").trim(),
			date_of_birth: this._toDateOnly(inpDOB.selectedDate || ""),
			notes: String(inpNotes.text || "").trim()
		};
		
    const changes = this._diff(
      {
        first_name: oldRow.first_name ?? "",
        last_name: oldRow.last_name ?? "",
        date_of_birth: oldRow.date_of_birth ?? "",
        notes: oldRow.notes ?? ""
      },
      ui
    );

    if (Object.keys(changes).length === 0) {
      showAlert("No changes to save.", "info");
      return;
    }

    const res = await qMemberUpdate.run({
      member_id: memberId,
      ...ui
    });

    showAlert("Member updated.", "success");

    await this.auditLog("member.updated", "member", memberId, {
      member_id: memberId,
      changes,
      updated_from_page: "Members - Profile"
    });

    await this.refresh();
    return res;
  },

	async assignFacilitator() {
		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert("Only document reviewers can assign facilitators.", "error");
				return;
			}

			const memberId = appsmith.store.member_id;
			const facilitatorId = selAssignedFacilitator?.selectedOptionValue;
			const notes = inpFacilitatorAssignmentNotes?.text || "";

			if (!memberId) {
				showAlert("No member selected.", "error");
				return;
			}
			if (!facilitatorId) {
				showAlert("Select a facilitator.", "warning");
				return;
			}

			const res = await qAssignMemberFacilitator.run({
				facilitator_id: facilitatorId,
				notes
			});

			await memberProfile.auditLog("member_facilitator.assigned", "member", memberId, {
				member_id: memberId,
				facilitator_id: facilitatorId,
				assigned_by_member_id: appsmith.store.facilitator_id,
				page: "Members - Profile",
				notes
			});

			showAlert("Facilitator assigned.", "success");
			await Promise.allSettled([
				qMemberFacilitators.run(),
				qMembersDirectory.run(),
				qMemberById.run()
			]);
			return res;
			
		} catch (e) {
			showAlert("Failed to assign facilitator: " + (e?.message || e), "error");
			throw e;
		}
	},
	
	async removeFacilitator(member_facilitator_id, facilitator_id, facilitator_name) {
		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert("Only document reviewers can remove facilitators.", "error");
				return;
			}

			if (!member_facilitator_id) {
				showAlert("No facilitator assignment selected.", "warning");
				return;
			}

			const res = await qDeactivateMemberFacilitator.run({
				member_facilitator_id,
				notes: "Removed by " + (appsmith.store.facilitator_full_name || "reviewer")
			});

			await memberProfile.auditLog("member_facilitator.removed", "member", appsmith.store.member_id, {
				member_id: appsmith.store.member_id,
				facilitator_id,
				member_facilitator_id,
				removed_by_member_id: appsmith.store.facilitator_id,
				facilitator_name: facilitator_name || "",
				page: "Members - Profile"
			});

			showAlert("Facilitator removed.", "success");
			await qMemberFacilitators.run();
			return res;
		} catch (e) {
			showAlert("Failed to remove facilitator: " + (e?.message || e), "error");
			throw e;
		}
	},

	async assignStorageLocation() {
		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert("Only document reviewers can assign storage locations.", "error");
				return;
			}

			const member = qMemberById.data?.[0];

			if (!member?.member_id) {
				showAlert("No member selected.", "error");
				return;
			}

			if (!member?.is_facilitator) {
				showAlert("Storage locations can only be assigned to members who are facilitators.", "warning");
				return;
			}

			const storageLocationName =
				inpAssignStorageLocation?.text ||
				"";

			const notes = inpAssignStorageLocationNotes?.text || "";

			if (!storageLocationName.trim()) {
				showAlert("Enter or select a storage location.", "warning");
				return;
			}

			const res = await qAssignMemberStorageLocation.run({
				storage_location_name: storageLocationName.trim(),
				notes
			});

			await memberProfile.auditLog(
				"facilitator_storage_location.assigned",
				"member",
				member.member_id,
				{
					facilitator_id: member.member_id,
					storage_location_name: storageLocationName.trim(),
					assigned_by_member_id: appsmith.store.facilitator_id,
					page: "Members - Profile",
					notes
				}
			);

			showAlert("Storage location assigned.", "success");

			await Promise.allSettled([
				qMemberStorageLocations.run(),
				qDistinctStorageLocationNames?.run?.()
			]);

			return res;
		} catch (e) {
			showAlert("Failed to assign storage location: " + (e?.message || e), "error");
			throw e;
		}
	},
	
	async removeStorageLocation (facilitator_storage_location_access_id, storage_location_name) {
		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert("Only document reviewers can remove storage locations.", "error");
				return;
			}

			if (!facilitator_storage_location_access_id) {
				showAlert("No storage location assignment selected.", "warning");
				return;
			}

			const res = await qDeactivateMemberStorageLocati.run({
				facilitator_storage_location_access_id,
				notes: "Removed by " + (appsmith.store.facilitator_full_name || "reviewer")
			});

			await memberProfile.auditLog(
				"facilitator_storage_location.removed",
				"member",
				appsmith.store.member_id,
				{
					facilitator_id: appsmith.store.member_id,
					facilitator_storage_location_access_id,
					storage_location_name,
					removed_by_member_id: appsmith.store.facilitator_id,
					page: "Members - Profile"
				}
			);

			showAlert("Storage location removed.", "success");
			await qMemberStorageLocations.run();

			return res;
		} catch (e) {
			showAlert("Failed to remove storage location: " + (e?.message || e), "error");
			throw e;
		}
	},

	async unsubscribeMemberEmail(row, reason = "Unsubscribed from Members - Profile") {
		const memberId = row.member_id || appsmith.store.member_id;

		if (!memberId) {
			showAlert("No member email selected.", "error");
			return;
		}		

		const res = await qUnsubscribeMemberEmail.run({
			member_email_id: row.member_email_id,
			reason
		});

		await this.auditLog("member.email.mailing_unsubscribed", "member", memberId, {
			member_id: memberId,
			member_email_id: row.member_email_id,
			email: row.email,
			reason,
			source: "signaturegate_interface"
		});

		showAlert("Email unsubscribed from mailing list.", "success");
		await qMemberEmails.run();
		return Array.isArray(res) ? res[0] : res;
	},

	async setPrimaryMemberEmail(row) {
		const memberId = row.member_id || appsmith.store.member_id;

		await qSetPrimaryMemberEmail.run({
			member_email_id: row.member_email_id
		});

		await this.auditLog("member.email.primary_set", "member", memberId, {
			member_id: memberId,
			member_email_id: row.member_email_id,
			email: row.email,
			page: "Members - Profile"
		});

		showAlert("Primary email updated.", "success");
		await Promise.allSettled([qMemberEmails.run(), qMemberById.run()]);
	},
	
	async subscribeMemberEmail(row, reason = "Subscribed from Members - Profile") {
		const memberId = row.member_id || appsmith.store.member_id;

		if (!memberId) {
			showAlert("No member email selected.", "error");
			return;
		}

		const res = await qSubscribeMemberEmail.run({
			member_email_id: row.member_email_id,
			reason
		});
		
		await this.auditLog("member.email.mailing_subscribed", "member", memberId, {
			member_id: memberId,
			member_email_id: row.member_email_id,
			email: row.email,
			reason,
			source: "signaturegate_interface"
		});		

		showAlert("Email subscribed to mailing list.", "success");
		await qMemberEmails.run();
		return Array.isArray(res) ? res[0] : res;
	},
	
	async addMemberEmail() {
		const memberId = appsmith.store.member_id;

		const res = await qAddMemberEmail.run({
			member_id: memberId,
			email: inpNewMemberEmail.text,
			is_primary:
				chkNewMemberEmailPrimary.isChecked,
			notes: inpNewMemberEmailNotes.text,
			subscribe_to_mailing_list:
				chkNewMemberEmailSubscribeList.isChecked
		});

		const row =
			Array.isArray(res) ? res[0] : res;

		if (!row?.member_email_id) {
			showAlert(
				"Email was not added. It is already active on another member; use the Reassign Email action from the existing row if that is intentional.",
				"warning"
			);
			return;
		}

		await this.auditLog(
			"member.email.added",
			"member",
			memberId,
			{
				member_id: memberId,
				member_email_id:
					row.member_email_id,
				email: inpNewMemberEmail.text,
				is_primary:
					chkNewMemberEmailPrimary.isChecked,
				mailing_subscription_status:
					row?.mailing_subscription_status || null,
				notes:
					inpNewMemberEmailNotes.text || null
			}
		);

		showAlert("Email added.", "success");

		await Promise.allSettled([
			qMemberEmails.run(),
			qMemberById.run()
		]);

		resetWidget("frmAddMemberEmail", true);
	},

	async addMemberPhone() {
		const memberId = appsmith.store.member_id;

		const res = await qAddMemberPhone.run({
			member_id: memberId,
			phone: inpNewMemberPhone.text,
			is_primary:
				chkNewMemberPhonePrimary.isChecked,
			notes: inpNewMemberPhoneNotes.text
		});

		const row =
			Array.isArray(res) ? res[0] : res;

		if (!row?.member_phone_id) {
			showAlert(
				"Phone was not added because this member already has that active phone number.",
				"info"
			);
			return;
		}

		await this.auditLog(
			"member.phone.added",
			"member",
			memberId,
			{
				member_id: memberId,
				member_phone_id:
					row.member_phone_id,
				phone: inpNewMemberPhone.text,
				is_primary:
					chkNewMemberPhonePrimary.isChecked,
				notes:
					inpNewMemberPhoneNotes.text || null
			}
		);

		showAlert("Phone added.", "success");

		await Promise.allSettled([
			qMemberPhones.run(),
			qMemberById.run()
		]);

		resetWidget("frmAddMemberPhone", true);
	},

	async addMemberAddress() {
		const memberId = appsmith.store.member_id;

		const res = await qAddMemberAddress.run({
			member_id: memberId,

			address_type:
				inpNewMemberAddressType?.selectedOptionValue ||
				inpNewMemberAddressType?.text ||
				"home",

			address_1:
				inpNewMemberAddress1.text,

			address_2:
				inpNewMemberAddress2.text,

			city:
				inpNewMemberCity.text,

			state:
				inpNewMemberState.text,

			postal_code:
				inpNewMemberPostalCode.text,

			country:
				inpNewMemberCountry.text || "USA",

			is_primary:
				chkNewMemberAddressPrimary.isChecked,

			notes:
				inpNewMemberAddressNotes.text
		});

		const row =
			Array.isArray(res) ? res[0] : res;

		if (!row?.member_address_id) {
			showAlert(
				"Address was not added.",
				"warning"
			);
			return;
		}

		const wasCreated =
			String(row.created_at || "") ===
			String(row.updated_at || "");

		await this.auditLog(
			wasCreated
				? "member.address.added"
				: "member.address.updated",
			"member",
			memberId,
			{
				member_id: memberId,
				member_address_id:
					row.member_address_id,
				address_identity_key:
					row.address_identity_key || null,
				was_created: wasCreated,

				address_1:
					inpNewMemberAddress1.text,

				address_2:
					inpNewMemberAddress2.text || null,

				city:
					inpNewMemberCity.text,

				state:
					inpNewMemberState.text,

				postal_code:
					inpNewMemberPostalCode.text,

				country:
					inpNewMemberCountry.text || "USA",

				is_primary:
					chkNewMemberAddressPrimary.isChecked,

				notes:
					inpNewMemberAddressNotes.text || null
			}
		);

		showAlert(
			wasCreated
				? "Address added."
				: "Existing address updated without creating a duplicate.",
			"success"
		);

		await Promise.allSettled([
			qMemberAddresses.run(),
			qMemberById.run()
		]);

		resetWidget("frmAddMemberAddress", true);
	},

	async archiveMemberEmail(row, reason = "Archived from Members - Profile") {
		const oldMemberId = row.member_id || appsmith.store.member_id;

		const res = await qArchiveMemberEmail.run({
			member_email_id: row.member_email_id,
			reason
		});

		await this.auditLog("member.email.archived", "member", oldMemberId, {
			member_id: oldMemberId,
			member_email_id: row.member_email_id,
			email: row.email,
			reason
		});

		showAlert("Email archived.", "success");
		await qMemberEmails.run();
	},

	async archiveMemberPhone(row, reason = "Archived from Members - Profile") {
		const oldMemberId = row.member_id || appsmith.store.member_id;

		await qArchiveMemberPhone.run({
			member_phone_id: row.member_phone_id,
			reason
		});

		await this.auditLog("member.phone.archived", "member", oldMemberId, {
			member_id: oldMemberId,
			member_phone_id: row.member_phone_id,
			phone: row.phone,
			reason
		});

		showAlert("Phone archived.", "success");
		await qMemberPhones.run();
	},

	async archiveMemberAddress(row, reason = "Archived from Members - Profile") {
		const oldMemberId = row.member_id || appsmith.store.member_id;

		await qArchiveMemberAddress.run({
			member_address_id: row.member_address_id,
			reason
		});

		await this.auditLog("member.address.archived", "member", oldMemberId, {
			member_id: oldMemberId,
			member_address_id: row.member_address_id,
			address_1: row.address_1,
			city: row.city,
			state: row.state,
			postal_code: row.postal_code,
			reason
		});

		showAlert("Address archived.", "success");
		await qMemberAddresses.run();
	},

	async reassignMemberEmail(row, newMemberId) {
		const oldMemberId = row.member_id || appsmith.store.member_id;

		await qReassignMemberEmail.run({
			member_email_id: row.member_email_id,
			old_member_id: oldMemberId,
			new_member_id: newMemberId
		});

		await this.auditLog("member.email.reassigned", "member", oldMemberId, {
			member_email_id: row.member_email_id,
			email: row.email,
			old_member_id: oldMemberId,
			new_member_id: newMemberId
		});

		await this.auditLog("member.email.received_reassignment", "member", newMemberId, {
			member_email_id: row.member_email_id,
			email: row.email,
			old_member_id: oldMemberId,
			new_member_id: newMemberId
		});

		showAlert("Email reassigned.", "success");
		await qMemberEmails.run();
	},

	async reassignMemberPhone(row, newMemberId) {
		const oldMemberId = row.member_id || appsmith.store.member_id;

		await qReassignMemberPhone.run({
			member_phone_id: row.member_phone_id,
			old_member_id: oldMemberId,
			new_member_id: newMemberId
		});

		await this.auditLog("member.phone.reassigned", "member", oldMemberId, {
			member_phone_id: row.member_phone_id,
			phone: row.phone,
			old_member_id: oldMemberId,
			new_member_id: newMemberId
		});

		await this.auditLog("member.phone.received_reassignment", "member", newMemberId, {
			member_phone_id: row.member_phone_id,
			phone: row.phone,
			old_member_id: oldMemberId,
			new_member_id: newMemberId
		});

		showAlert("Phone reassigned.", "success");
		await qMemberPhones.run();
	},

	async reassignMemberAddress(row, newMemberId) {
		const oldMemberId = row.member_id || appsmith.store.member_id;

		await qReassignMemberAddress.run({
			member_address_id: row.member_address_id,
			old_member_id: oldMemberId,
			new_member_id: newMemberId
		});

		await this.auditLog("member.address.reassigned", "member", oldMemberId, {
			member_address_id: row.member_address_id,
			old_member_id: oldMemberId,
			new_member_id: newMemberId,
			address_1: row.address_1,
			city: row.city,
			state: row.state,
			postal_code: row.postal_code
		});

		await this.auditLog("member.address.received_reassignment", "member", newMemberId, {
			member_address_id: row.member_address_id,
			old_member_id: oldMemberId,
			new_member_id: newMemberId,
			address_1: row.address_1,
			city: row.city,
			state: row.state,
			postal_code: row.postal_code
		});

		showAlert("Address reassigned.", "success");
		await qMemberAddresses.run();
	},
	
	async verifyMemberEmail(row, source = "document_reviewer", notes = "Verified by document reviewer") {
		if (!appsmith.store.facilitator_is_reviewer) {
			showAlert("Only document reviewers can verify emails.", "error");
			return;
		}

		await qVerifyMemberEmail.run({
			member_email_id: row.member_email_id,
			source,
			notes
		});

		await this.auditLog("member.email.verified", "member", row.member_id || appsmith.store.member_id, {
			member_id: row.member_id || appsmith.store.member_id,
			member_email_id: row.member_email_id,
			email: row.email,
			source,
			notes
		});

		showAlert("Email verified.", "success");
		await qMemberEmails.run();
	},
	

};
