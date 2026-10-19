export default {
	
	async auditLog(action, entity_type, entity_id, payload) {
		try {
			await qAuditLogInsert.run({
				action,
				entity_type,
				entity_id: entity_id ?? "",
				member_id: appsmith.store.member_id ?? "",
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

  // Load the catalog before choosing a type. Widget selection can lag a query response.
  const catalogPromise = (async () => {
    try {
      const types = await qAgreementTypesList.run({ member_id: memberId });
      const selected = selAgreementType.selectedOptionValue;
      const typeKey = (types || []).some(row => row.type_key === selected)
        ? selected : (types?.[0]?.type_key || "");
      await selAgreementType.setSelectedOption(typeKey);
      return await memberProfile.refreshAgreements(typeKey);
    } catch (error) {
      showAlert("Agreement choices could not be loaded. Refresh before creating an agreement.", "warning");
      throw error;
    }
  })();
  return Promise.allSettled([directoryPromise, qMemberById.run(), qMemberAgreements.run(), qMemberReleases.run(), qListFacilitators?.run?.(), qMemberFacilitators?.run?.(), qMemberEmails?.run?.(), catalogPromise]);
  },

  async refreshAgreements(typeKey) {
    // Explicit parameters take precedence over a previous widget selection.
    const selectedType = typeKey ?? selAgreementType.selectedOptionValue ?? "";
    await selAgreementTemplate.setSelectedOption("");
    await storeValue("agreement_template_id", "");
    const rows = await qAgreementTemplatesByType.run({
      type_key: selectedType,
      member_id: appsmith.store.member_id || "",
    });
    if (selectedType && !(rows || []).length) {
      showAlert("No active agreement templates are available for the selected type.", "warning");
    }
    return rows;
  },

	_requireMemberId() {
    let memberId = selMember?.selectedOptionValue;
		
    if (!memberId) {
			if(!appsmith.URL.queryParams.member_id ) {
				showAlert(navigationLabels.text("Select a member first."), "warning");
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
      showAlert(navigationLabels.text("Please select a facilitator before creating an agreement."), "warning");
      return null;
    }
		
		// The selected agreement facilitator is not the authenticated audit actor.
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
		
    const typeKey = selAgreementType.selectedOptionValue;
    const template = (qAgreementTemplatesByType.data || []).find(row =>
      row.agreement_template_id === agreementTemplateId && row.active === true &&
      Array.isArray(row.required_for) && row.required_for.includes(typeKey));
    const activeType = (qAgreementTypesList.data || []).some(row => row.type_key === typeKey);
    if (!template || !activeType) {
      showAlert("Select an active template for the current agreement type before creating an agreement.", "warning");
      return null;
    }
    storeValue("agreement_template_id", agreementTemplateId);
    return agreementTemplateId;
  },

	async ensureMemberAccess() {
		const rows = await qMemberAccessCheck.run();
		const allowed = Array.isArray(rows) ? rows[0]?.allowed : rows?.allowed;
		if (!allowed) {
			showAlert(navigationLabels.text("You do not have access to this member."), "error");
			await storeValue("member_id", "");
			return false;
		}
		return true;
	},
	
	async setMemberId (formMemberId) {
  const memberId = String(formMemberId || "").trim();
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(memberId);
  if (!isUuid) {
    await storeValue("member_id", "");
    if (memberId) showAlert(navigationLabels.text("Select a valid member."), "warning");
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
    await Promise.all([storeValue("facilitator_id", ""), storeValue("facilitator_is_reviewer", false), storeValue("facilitator_is_donations_reviewer", false)]);

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
			await qPageAccess.run();
            let rows = await qCurrentFacilitator.run({
				email
			});
			if (!Array.isArray(rows)) rows = [];
			const me = rows[0];
			if (!me?.email || !me?.can_member_functions) {
				showAlert("Access denied: document reviewer permission required for " + email, "error");
				await memberProfile.auditLog("auth.denied", "facilitator", "", {
					email,
					page: appsmith.URL?.pathname,
					mode: appsmith.mode
				});
				if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
					/* Access denied in place; keep navigation available. */
				}
				return;
			}
			await Promise.all([
				storeValue("facilitator_id", me.member_id || ""),
				storeValue("facilitator_email", (me.email ?? "").trim().toLowerCase()),
				storeValue("facilitator_is_reviewer", me.is_document_reviewer),
				storeValue("facilitator_is_donations_reviewer", me.is_donations_reviewer),
				storeValue("facilitator_full_name", `${me.first_name} ${me.last_name}`.trim()),
				storeValue("NC_PUBLIC_URL", "https://nocodb.danks.store")
			]);
		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");
			console.error("Member Functions initialization failed:", e);
			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
				/* Access denied in place; keep navigation available. */
			}
			return;
		}

		const directoryRows = await qMembersDirectory.run();
		const directory = Array.isArray(directoryRows) ? directoryRows : [];
		const urlMemberId = String(appsmith.URL.queryParams.member_id || "").trim();
		const storedMemberId = String(appsmith.store.member_id || "").trim();
		const access = qPageAccess.data?.[0] || {};
        const staff = access.is_document_reviewer === true || access.is_practitioner === true;
        const candidate = staff ? (urlMemberId || storedMemberId) : String(access.member_id || '');
		const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(candidate);
		const isAccessible = isUuid && directory.some(row => String(row.member_id || "") === candidate);

		if (!isAccessible) {
			await storeValue("member_id", "");
			if (candidate && isUuid) {
				showAlert(navigationLabels.text("The selected member is not in your accessible member list."), "warning");
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
    if(appsmith.store.member_signing_busy===true) return;
    await storeValue("member_signing_busy",true);
    try {return await this.sendDigitalAgreementSteps();}
    finally {await storeValue("member_signing_busy",false);}
  },
  async sendDigitalAgreementSteps() {
    let saved=false;
    try {
    showAlert("Checking agreement permission and recipient…","info");
    const permission = (await qMemberWriteAccess.run())?.[0];
    if (permission?.allowed !== true) { showAlert(navigationLabels.text("Staff permission is required for this action; Participant access is read-only."), "error"); return; }

		const memberId = this._requireMemberId();
		const facilitatorId = this._requireFacilitator();
		const agreementTemplateId = this._requireAgreementTemplate();

		if (!facilitatorId) {
			showAlert(navigationLabels.text("Invalid Facilitator."), "error");
			return;
		}
		if (!agreementTemplateId) {
			showAlert("Invalid Agreement Template.", "error");
			return;
		}
		if (!memberId) {
			showAlert(navigationLabels.text("Invalid Member."), "error");
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
			showAlert(navigationLabels.text("Select an active member email before sending a digital agreement."), "warning");
			return;
		}

		showAlert("Creating the pending agreement…","info");
		const createRes = await qCreatePendingAgreement.run({
			member_id: memberId,
			facilitator_id: facilitatorId,
			signature_method: "documenso",
			agreement_template_id: agreementTemplateId,
			status: "pending_email_send",
			evidence_json: "[]",
			member_email_id: emailRow.member_email_id
		});

		saved=true;
		const agreementId =
			(typeof createRes === "string" && createRes) ||
			createRes?.member_agreement_id ||
			createRes?.[0]?.member_agreement_id ||
			createRes?.[0]?.member_agreements_id ||
			null;

		if (!agreementId) {
			throw new Error("Agreement identifier could not be resolved.");
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

		showAlert("Agreement created. Requesting the signing workflow…", "info");

		const response=await apiTriggerDocumenso.run({
			member_agreement_id: agreementId,
			externalId: "ma:" + agreementId
		});

    const raw=response?.data ?? response;
    const result=raw?.message ?? raw;
    if(result?.ok===false || result?.success===false || ["failed","error"].includes(result?.status)) throw new Error("Signing workflow did not complete.");
    showAlert(result?.email_sent===true?"Agreement email sent (confirmed by signing service).":"Signing workflow requested. Check agreement status for email delivery.","info");
    await qMemberAgreements.run();
    showAlert("Digital agreement request completed.","success");
    } catch(error) {
      showAlert(saved?"Agreement saved, but the signing request or refresh did not complete. Review the pending agreement; do not create another.":"Agreement request could not complete before creation.",saved?"warning":"error");
    }
  },

	async openPaperUpload() {
    const permission = (await qMemberWriteAccess.run())?.[0];
    if (permission?.allowed !== true) {
      showAlert(navigationLabels.text("Staff permission is required; Participant access is read-only."), "error");
      return;
    }
    // Fail closed until the upload destination and authorization are validated.
    showAlert("Paper evidence upload is pending integration validation. No file was sent.", "warning");
    return;
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
    const permission = (await qMemberWriteAccess.run())?.[0];
    if (permission?.allowed !== true) { showAlert(navigationLabels.text("Staff permission is required for this action; Participant access is read-only."), "error"); return; }

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
    const permission = (await qMemberWriteAccess.run())?.[0];
    if (permission?.allowed !== true) { showAlert(navigationLabels.text("Staff permission is required for this action; Participant access is read-only."), "error"); return; }
    if ((await qPageAccess.run())?.[0]?.is_document_reviewer !== true) { showAlert("Document Reviewer permission required.", "error"); return; }

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
	
	async voidRelease(
		voidReleaseId,
		voidReleaseType,
		voidReason,
		mushroomProcessId,
		airtableRecordId,
		storageLocationName
	) {
    const permission = (await qMemberWriteAccess.run())?.[0];
    if (permission?.allowed !== true) { showAlert(navigationLabels.text("Staff permission is required for this action; Participant access is read-only."), "error"); return; }
    if ((await qPageAccess.run())?.[0]?.is_document_reviewer !== true) { showAlert("Document Reviewer permission required.", "error"); return; }

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


	async assignFacilitator() {
    const permission = (await qMemberWriteAccess.run())?.[0];
    if (permission?.allowed !== true) { showAlert(navigationLabels.text("Staff permission is required for this action; Participant access is read-only."), "error"); return; }
    if ((await qPageAccess.run())?.[0]?.is_document_reviewer !== true) { showAlert("Document Reviewer permission required.", "error"); return; }

		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert(navigationLabels.text("Only document reviewers can assign facilitators."), "error");
				return;
			}

			const memberId = appsmith.store.member_id;
			const facilitatorId = selAssignedFacilitator?.selectedOptionValue;
			const notes = inpFacilitatorAssignmentNotes?.text || "";

			if (!memberId) {
				showAlert(navigationLabels.text("No member selected."), "error");
				return;
			}
			if (!facilitatorId) {
				showAlert(navigationLabels.text("Select a facilitator."), "warning");
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

			showAlert(navigationLabels.text("Facilitator assigned."), "success");
			await Promise.allSettled([
				qMemberFacilitators.run(),
				qMembersDirectory.run(),
				qMemberById.run()
			]);
			return res;
			
		} catch (e) {
			showAlert(navigationLabels.text("Failed to assign facilitator: ") + (e?.message || e), "error");
			throw e;
		}
	},
	
	async removeFacilitator(member_facilitator_id, facilitator_id, facilitator_name) {
    const permission = (await qMemberWriteAccess.run())?.[0];
    if (permission?.allowed !== true) { showAlert(navigationLabels.text("Staff permission is required for this action; Participant access is read-only."), "error"); return; }
    if ((await qPageAccess.run())?.[0]?.is_document_reviewer !== true) { showAlert("Document Reviewer permission required.", "error"); return; }

		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert(navigationLabels.text("Only document reviewers can remove facilitators."), "error");
				return;
			}

			if (!member_facilitator_id) {
				showAlert(navigationLabels.text("No facilitator assignment selected."), "warning");
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

			showAlert(navigationLabels.text("Facilitator removed."), "success");
			await qMemberFacilitators.run();
			return res;
		} catch (e) {
			showAlert(navigationLabels.text("Failed to remove facilitator: ") + (e?.message || e), "error");
			throw e;
		}
	},	

};
