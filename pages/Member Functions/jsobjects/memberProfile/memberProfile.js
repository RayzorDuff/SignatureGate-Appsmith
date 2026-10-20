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

  async openPaperUpload(checkOnly = false) {
    if (appsmith.store.paper_upload_busy === true) return;
    await storeValue("paper_upload_busy", true);
    const owner = String(appsmith.user?.email || "").trim().toLowerCase();
    const checkpoint = appsmith.store.paper_upload_checkpoint;
    const currentOwner = () => owner && owner === String(appsmith.user?.email || "").trim().toLowerCase();
    let dispatched = false;
    try {
      if (!owner) throw new Error("Sign in before uploading a paper agreement.");
      if (checkOnly === "cancel") {
        if (checkpoint?.owner !== owner || checkpoint.state !== "uncertain") throw new Error("No unresolved paper upload belongs to this account.");
        const reason = String(inpPaperUploadRecoveryReason.text || "").trim();
        if (!reason) throw new Error("A cancellation reason is required.");
        const receipt = (await qCancelPaperUploadRequest.run({...checkpoint,reason}))?.[0]?.receipt;
        if (!currentOwner()) return;
        if (receipt?.state !== "cancelled") throw new Error("Cancellation could not be confirmed; check the saved request.");
        await storeValue("paper_upload_checkpoint", null);
        await resetWidget("FilePicker1", true);
        await closeModal("mdlPaperUploadRecovery");
        showAlert("Pending upload cancelled. Inspect any stored file before starting a separate attempt.", "info");
        return;
      }
      // An unresolved dispatch is recovered by a read, never a second storage upload.
      if (checkpoint?.owner === owner && checkpoint.state !== "committed") {
        showAlert("Checking the saved paper upload request…", "info");
        const receipt = (await qPaperUploadReceipt.run({request_id:checkpoint.request_id}))?.[0]?.receipt;
        if (!currentOwner()) return;
        if (receipt?.state === "committed") {
          await storeValue("paper_upload_checkpoint", {...checkpoint,state:"committed"});
          await qMemberAgreements.run();
          showAlert("Paper agreement saved and awaiting Document Reviewer approval. No file was sent again.", "success");
        } else if (receipt?.state === "cancelled") {
          await storeValue("paper_upload_checkpoint", null);
          await resetWidget("FilePicker1", true);
          showAlert("The pending paper upload was cancelled. Select a new file for a separate attempt.", "info");
        } else {
          showAlert("The previous paper upload is unresolved. Check its workflow execution before retrying; no second file was sent.", "warning");
        }
        return;
      }
      if (checkOnly) {
        showAlert(checkpoint?.owner === owner ? "The last paper upload is saved. Refresh Agreements to review it." : "No paper upload request is saved for this account.", "info");
        return;
      }
      if (checkpoint?.owner === owner && checkpoint.state === "committed") {
        showAlert("This paper upload is saved. Select a new file before starting a separate upload.", "info");
        return;
      }
      const memberId = this._requireMemberId();
      const practitionerId = this._requireFacilitator();
      if (!memberId || !practitionerId) return;
      const permission = (await qMemberWriteAccess.run())?.[0];
      if (!currentOwner()) return;
      if (permission?.allowed !== true) throw new Error("Staff permission for the selected Participant is required.");
      const selectedTemplate = selAgreementTemplate.selectedOptionValue;
      const templateId = selectedTemplate ? this._requireAgreementTemplate() : "";
      if (selectedTemplate && !templateId) return;
      const storageProvider = selPaperStorageProvider.selectedOptionValue;
      if (!["google_drive", "nocodb"].includes(storageProvider)) throw new Error("Select Google Drive or NocoDB paper storage.");
      const files = FilePicker1.files || [];
      if (files.length !== 1) throw new Error("Select one signed PDF, PNG or JPEG document, up to 5 MiB.");
      const file = files[0];
      if (!["application/pdf","image/png","image/jpeg"].includes(file.type || file.mimeType) || typeof file.data !== "string" || file.data.length > 6990600) throw new Error("Select one signed PDF, PNG or JPEG document, up to 5 MiB, using Base64 file data.");
      showAlert("Checking paper upload permission and preparing the request…", "info");
      const requestId = (await qNewPaperUploadRequest.run({member_id:memberId}))?.[0]?.request_id;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || "")) throw new Error("Paper upload request key unavailable.");
      if (!currentOwner() || memberId !== selMember.selectedOptionValue || practitionerId !== inpFacilitator.selectedOptionValue || storageProvider !== selPaperStorageProvider.selectedOptionValue) throw new Error("Selection changed; review the Participant and practitioner before uploading.");
      const pending = {owner,member_id:memberId,practitioner_person_id:practitionerId,storage_provider:storageProvider,request_id:requestId,state:"uncertain"};
      await storeValue("paper_upload_checkpoint", pending);
      if (!currentOwner()) return;
      showAlert("Uploading the signed paper document and saving it for review…", "info");
      dispatched = true;
      const response = await apiUploadEvidenceViaN8n.run({request_id:requestId,member_id:memberId,practitioner_person_id:practitionerId,agreement_template_id:templateId,storage_provider:storageProvider,files:[{name:file.name,type:file.type || file.mimeType,data:file.data}]});
      const receipt = response?.data ?? response;
      if (!currentOwner()) return;
      if (receipt?.state !== "committed" || receipt.request_id !== requestId || !receipt.member_agreement_id) throw new Error("Paper upload response is not confirmed.");
      await storeValue("paper_upload_checkpoint", {...pending,state:"committed"});
      showAlert("Paper document stored. Agreement saved pending Document Reviewer approval.", "info");
      await resetWidget("FilePicker1", true);
      await qMemberAgreements.run();
      showAlert("Paper agreement uploaded for review. No email was required or sent.", "success");
    } catch (error) {
      if (!currentOwner()) return;
      const saved = appsmith.store.paper_upload_checkpoint?.owner === owner && appsmith.store.paper_upload_checkpoint?.state === "committed";
      showAlert(saved ? "Paper agreement saved; refresh Agreements before taking another action." : dispatched ? "Paper upload outcome is uncertain. Use Check saved paper upload; do not upload it again." : (error?.message || "Paper upload could not start."), saved || dispatched ? "warning" : "error");
    } finally {
      await storeValue("paper_upload_busy", false);
    }
  },

	evidenceLinks(evidenceCell) {
		// evidenceCell might be:
		// - an array of file objects
		// - a JSON string
		// - null
		// - or even nested like [[{...},{...}], [{...}]] depending on your query/table mapping
		const base = (appsmith.store.NC_PUBLIC_URL || "").replace(/\/+$/, "");


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
        .filter(f => f && (f.storage_provider === "google_drive"
          ? /^[A-Za-z0-9_-]{10,200}$/.test(f.drive_file_id || "")
          : (!f.storage_provider || f.storage_provider === "nocodb") && f.path && base))
			.map((f, idx) => {
// Use for signed paths
//				const href = `${base}/${f.signedPath || f.path}`; // prefer signedPath
        const href = f.storage_provider === "google_drive"
          ? "https://drive.google.com/file/d/" + f.drive_file_id + "/view"
          : `${base}/${f.path}`;
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
