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
      qListFacilitators.run(),
			qAgreementTypesList.run(),
			(selAgreementType?.selectedOptionValue ? qAgreementTemplatesByType.run({
      	type_key: selAgreementType.selectedOptionValue,
    	}) : Promise.resolve([])),
    ]);	
  },

	async refreshAgreements() {
    if (!selAgreementType.selectedOptionValue) {
				return null;
    }
	
    return await qAgreementTemplatesByType.run({
      type_key: selAgreementType.selectedOptionValue,
    });
  },
	
	async verifyaccess() {
		try {
			let email = null;
			for (let i = 0; i < 20; i++) {
				email = (appsmith.user?.email ?? "").trim().toLowerCase();
				if (email) break;
				await new Promise(r => setTimeout(r, 150));
			}
			if (!email) { showAlert("Unknown user: appsmith.user.email not available.", "error"); return; }
			const access = qIndividualIntakeAccess.data?.[0] || {};
			if (!access.can_member && !access.can_contributor) {
				showAlert("Access denied: this intake requires document reviewer or donations reviewer permission.", "error");
				if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") navigateTo("Unauthorized", {}, "SAME_WINDOW");
				return;
			}
			const rows = await qCurrentFacilitator.run({ email });
			const me = Array.isArray(rows) ? rows[0] : null;
			if (me?.member_id) {
				await storeValue("facilitator_id", me.member_id);
				await storeValue("facilitator_email", (me.email ?? "").trim().toLowerCase());
				await storeValue("facilitator_is_reviewer", me.is_document_reviewer);
				await storeValue("facilitator_is_donations_reviewer", me.is_donations_reviewer);
				await storeValue("facilitator_full_name", `${me.first_name} ${me.last_name}`.trim());
			}
			await this.refresh();
		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");
			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") navigateTo("Unauthorized", {}, "SAME_WINDOW");
		}
	},
	
	_normalizeUploadResponse(uploadRes) {
		const r = uploadRes?.data ?? uploadRes;

		const arr =
			Array.isArray(r) ? r :
			Array.isArray(r?.files) ? r.files :
			(r && typeof r === "object") ? [r] :
			[];

		const good = arr.filter(
			x => x && (x.path || x.signedPath)
		);

		if (!good.length) {
			console.log(
				"Unexpected upload response:",
				uploadRes
			);

			throw new Error(
				"Upload succeeded but did not return attachment path(s)."
			);
		}

		return good;
	},
	
  async submitMember() {
		const first = inpFirstName.text.trim();
		const last = inpLastName.text.trim();
		const email = (inpEmail.text || "").trim();
		const phone = (inpPhone.text || "").trim();
		const dateOfBirth = (inpDOB.selectedDate || "").toString().slice(0, 10);
		const partyKind = selIntakePartyKind.selectedOptionValue || "individual";
		const capacity = selIntakeCapacity.selectedOptionValue || "member";
		const organizationName = first;
		const intakeReason = (inpNotes.text || "").trim() || "Individual Intake";
		const intakeAccess = qIndividualIntakeAccess.data?.[0] || {};
		if ((capacity === "member" || capacity === "both") && !intakeAccess.can_member) { showAlert("Document reviewer permission is required for Member intake.", "error"); return; }
		if ((capacity === "contributor" || capacity === "both") && !intakeAccess.can_contributor) { showAlert("Donations reviewer permission is required for Contributor intake.", "error"); return; }
		if (capacity === "both" && !intakeAccess.can_directory_manager) { showAlert("Directory manager permission is required to add Contributor capacity to an existing person.", "error"); return; }
		if (partyKind === "organization" && capacity !== "contributor") { showAlert("Company intake currently supports Contributor capacity only.", "warning"); return; }

		await storeValue("memberDupes", []);

		if (partyKind === "individual" && (!first || !last)) {
			showAlert("First and last name are required for an individual.", "warning");
			return;
		}
		if (partyKind === "organization" && !organizationName) {
			showAlert("Company Name is required.", "warning");
			return;
		}

		if (phone && !inpPhone.isValid) {
			showAlert(
				"Enter a valid phone number before creating the member.",
				"warning"
			);
			return;
		}
		if (partyKind === "organization" || capacity === "contributor") {
			if (partyKind === "organization" && !organizationName) { showAlert("Company Name is required.", "warning"); return; }
			if (partyKind === "individual" && (!first || !last)) { showAlert("First and Last Name are required.", "warning"); return; }
			if (phone && !inpPhone.isValid) { showAlert("Enter a valid phone number.", "warning"); return; }
			const created = await qCreateContributor.run({
				party_kind: partyKind,
				first_name: partyKind === "individual" ? first : "",
				last_name: partyKind === "individual" ? last : "",
				organization_name: organizationName,
				email, phone, reason: intakeReason
			});
			const row = Array.isArray(created) ? created[0] : created;
			if (!row?.contributor_id) { showAlert("Contributor creation did not return a contributor ID.", "error"); return; }
			await storeValue("new_contributor_id", row.contributor_id);
			await storeValue("new_intake_person_id", row.party_kind === "individual" ? row.party_id : "");
			showAlert(`${partyKind === "organization" ? "Company" : "Individual"} contributor created successfully.`, "success");
			resetWidget("Members_IntakeForm", true);
			return { contributorId: row.contributor_id, partyId: row.party_id };
		}
		const wantsAgreement = inpCreateRelease.isChecked;
		const uploadPaper = typeof inpUploadRelease !== "undefined" ? inpUploadRelease.isChecked : false;
		const facilitatorId = typeof inpFacilitator !== "undefined" ? (inpFacilitator.selectedOptionValue || "").trim() : "";
		const agreementTypeId = typeof selAgreementType !== "undefined" ? (selAgreementType.selectedOptionValue || "").trim() : "";
		const agreementTemplateId = typeof selAgreementTemplate !== "undefined" ? (selAgreementTemplate.selectedOptionValue || "").trim() : "";
		if (wantsAgreement) {
			if (!facilitatorId) {
				showAlert("Please select a facilitator before creating an agreement.", "warning");
				return;
			}
			if (uploadPaper) {
				if (!agreementTypeId) {
					showAlert("Please select an Agreement Type before creating an agreement.", "warning");
					return;
				}
			} else {
				if (!agreementTypeId || !agreementTemplateId) {
					showAlert("Please select an Agreement Type and Template before creating an agreement.", "warning");
					return;
				}
			}
			if (!uploadPaper && !email) {
				showAlert("Email is required to send a digital agreement.", "warning");
				return;
			}
		}
		if (!phone && !inpNotes.text.trim()) {
			showAlert("Notes are required when no phone number is provided.", "warning");
			return;
		}

		const duplicateParams = {
			first_name: first,
			last_name: last,
			email,
			phone,
			date_of_birth: dateOfBirth
		};
		const dup = await qCheckMemberDuplicate.run(duplicateParams);
		const dupes = Array.isArray(dup) ? dup : [];
		if (dupes.length > 0) {
			await storeValue("memberDupes", dupes);
		}

		const isTrue = value => value === true || String(value || "").toLowerCase() === "true";
		const fieldLabel = field => ({
			"email": "email address",
			"members.email": "email address",
			"phone": "phone number",
			"members.phone": "phone number",
			"name+dob": "name and date of birth",
			"name": "first and last name"
		}[String(field || "").toLowerCase()] || "identifying information");
		const summarizeFields = rows => [...new Set(rows.map(d => fieldLabel(d.matched_field)))].join(", ");

		const hardDupes = dupes.filter(d => String(d.match_severity || "").toLowerCase() === "hard");
		const inaccessibleHardDupes = hardDupes.filter(d => !isTrue(d.is_accessible));
		if (inaccessibleHardDupes.length > 0) {
			const fields = summarizeFields(inaccessibleHardDupes);
			const assignedElsewhere = inaccessibleHardDupes.some(d => d.access_scope === "other_facilitator");
			const scopeMessage = assignedElsewhere
				? "is managed by another facilitator"
				: "is not available in your member list";
			showAlert(
				`An active member with the same ${fields} already exists and ${scopeMessage}. No new member was created. Contact a document reviewer to request access or reassignment.`,
				"error"
			);
			await this.auditLog("member.create_blocked_duplicate", "member", "", {
				match_fields: [...new Set(inaccessibleHardDupes.map(d => d.matched_field))],
				access_scopes: [...new Set(inaccessibleHardDupes.map(d => d.access_scope))],
				page: "Members - Intake"
			});
			return;
		}

		if (hardDupes.length > 0) {
			const existing = hardDupes[0];
			const existingName = [existing.first_name, existing.last_name].filter(Boolean).join(" ") || "Existing member";
			const existingId = existing.member_id ? ` (ID ${existing.member_id})` : "";
			showAlert(
				`Member already exists in your accessible member list: ${existingName}${existingId}. Matched ${summarizeFields(hardDupes)}. Open Members - Directory to continue with the existing record.`,
				"error"
			);
			await this.auditLog("member.create_blocked_duplicate", "member", existing.member_id || "", {
				match_fields: [...new Set(hardDupes.map(d => d.matched_field))],
				access_scope: existing.access_scope,
				page: "Members - Intake"
			});
			return;
		}

		const warningDupes = dupes.filter(d => String(d.match_severity || "").toLowerCase() === "warning");
		if (warningDupes.length > 0) {
			const accessibleWarnings = warningDupes.filter(d => isTrue(d.is_accessible));
			const inaccessibleWarnings = warningDupes.filter(d => !isTrue(d.is_accessible));
			const warningParts = [];
			if (accessibleWarnings.length > 0) {
				const names = [...new Set(accessibleWarnings.map(d => [d.first_name, d.last_name].filter(Boolean).join(" ")).filter(Boolean))];
				warningParts.push(`Your accessible member list contains a possible match on ${summarizeFields(accessibleWarnings)}${names.length ? ` (${names.slice(0, 2).join(", ")})` : ""}.`);
			}
			if (inaccessibleWarnings.length > 0) {
				warningParts.push(`A member outside your accessible list has the same ${summarizeFields(inaccessibleWarnings)}.`);
			}
			showAlert(`Potential duplicate warning: ${warningParts.join(" ")} Creation will continue because no hard duplicate was found.`, "warning");
		}

		const signatureMethod = uploadPaper ? "paper" : "documenso";
		const agreementStatus = uploadPaper ? "pending_review" : "pending_email_send";
		let evidence_json = null;
		const inserted = await qCreateMember.run({
			first_name: first,
			last_name: last,
			email,
			phone,
			date_of_birth: dateOfBirth,
			notes: inpNotes.text || "",
			is_facilitator: inpIsFacilitator.isChecked,
			created_by_facilitator_id: appsmith.store.facilitator_id || ""
		});
		const memberId = inserted?.[0]?.member_id;
		if (!memberId) {
			const latestDupes = await qCheckMemberDuplicate.run(duplicateParams);
			const latestRows = Array.isArray(latestDupes) ? latestDupes : [];
			await storeValue("memberDupes", latestRows);

			const latestHardDupes = latestRows.filter(
				d => String(d.match_severity || "").toLowerCase() === "hard"
			);
			const latestFields = latestHardDupes.length
				? summarizeFields(latestHardDupes)
				: "identifying information";
			const inaccessible = latestHardDupes.filter(
				d => !isTrue(d.is_accessible)
			);
			const assignedElsewhere = inaccessible.some(
				d => d.access_scope === "other_facilitator"
			);
			const message = inaccessible.length
				? (
					`An active member with the same ${latestFields} already exists and ` +
					(
						assignedElsewhere
							? "is managed by another facilitator."
							: "is not available in your member list."
					) +
					" No new member was created. Contact a document reviewer to request access or reassignment."
				)
				: (
					`An active member with the same ${latestFields} already exists. ` +
					"No new member was created. Open Members - Directory to continue with the existing record."
				);

			await this.auditLog("member.create_blocked_duplicate", "member", "", {
				match_fields: [...new Set(latestHardDupes.map(d => d.matched_field))],
				access_scopes: [...new Set(latestHardDupes.map(d => d.access_scope))],
				blocked_by: "database_guard",
				page: "Members - Intake"
			});

			showAlert(message, "error");
			return;
		}
		if (email) {
			const emailRows = await qAddMemberEmailForNewMember.run({
				member_id: memberId,
				email,
				is_primary: true,
				notes: "Created from Members - Intake",
				subscribe_to_mailing_list: chkIntakeSubscribeListmonk.isChecked
			});
			if (!emailRows?.[0]?.member_email_id) {
				showAlert("Member was created, but the email contact was not added because it is already active on another member.", "warning");
			}
		}
		if (phone) {
			const phoneRows = await qAddMemberPhoneForNewMember.run({
				member_id: memberId,
				phone,
				is_primary: true,
				notes: "Created from Members - Intake"
			});
			if (!phoneRows?.[0]?.member_phone_id) {
				showAlert("Member was created, but this phone already exists on the member profile and was not duplicated.", "info");
			}
		}
		if (capacity === "both") {
			const personRows = await qMemberPersonId.run({ member_id: memberId });
			const personId = Array.isArray(personRows) ? personRows[0]?.person_id : personRows?.person_id;
			if (!personId) { showAlert("Member was created, but its canonical person identity could not be resolved.", "error"); return; }
			const contributorRows = await qEnableContributor.run({ person_id: personId, reason: intakeReason });
			const contributor = Array.isArray(contributorRows) ? contributorRows[0] : contributorRows;
			if (!contributor?.contributor_id) { showAlert("Member was created, but Contributor capacity could not be enabled.", "error"); return; }
			if (email) await qAddContributorEmail.run({ person_id: personId, email, reason: intakeReason });
			if (phone) await qAddContributorPhone.run({ person_id: personId, phone, reason: intakeReason });
			await storeValue("new_contributor_id", contributor.contributor_id);
		}
		showAlert(`Member created (ID ${memberId}).`, "success");
		await storeValue("new_member_id", memberId);
		await memberFlows.auditLog("member.created", "member", memberId, {
			first_name: first,
			last_name: last,
			created_by_facilitator_id: facilitatorId ?? "",
			duplicate_warnings: warningDupes
		});
		const res = await qAssignMemberFacilitator.run({
			member_id: memberId,
			facilitator_id: facilitatorId,
			notes: inpNotes.text || null
		});
		await memberFlows.auditLog("member_facilitator.assigned", "member", memberId, {
			member_id: memberId,
			facilitator_id: facilitatorId,
			assigned_by_member_id: appsmith.store.facilitator_id,
			page: "Members - Intake",
			notes: inpNotes.text || null
		});
		showAlert("Facilitator for member assigned.", "success");
		let agRes = null;
		let triggerRes = null;
		if (wantsAgreement) {
			if (uploadPaper) {
				const raw = FilePicker1?.files ?? [];
				console.log("FilePicker1.files raw:", raw);
				const files = raw.filter(f => f && typeof f === "object" && typeof f.name === "string" && typeof f.size === "number" && f.size >= 0);
				if (!files.length) {
					showAlert("Please choose at least one valid file to upload for the paper agreement.", "warning");
					return;
				}
				if (files.length !== raw.length) {
					showAlert(`Some selected items were invalid (null/non-file). Remove them and re-select the file(s).`, "warning");
					return;
				}
				const bad = files.find(f => typeof f !== "object" || !(("name" in f)) || !(("size" in f)));
				if (bad) {
					console.log("Bad file entry:", bad, raw);
					showAlert("One of the selected items isn't a valid file. Try removing it and re-selecting files.", "error");
					return;
				}
				showAlert(`Uploading ${files.length} file(s)...`, "info");

				try {
					const attachments = [];

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

					evidence_json = JSON.stringify(attachments);

					showAlert(
						"Paper agreement uploaded and queued for review.",
						"success"
					);
				} catch (e) {
					console.error("Paper upload failed:", e);

					showAlert(
						`Paper agreement upload failed: ${e?.message ?? e}`,
						"error"
					);

					throw e;
				}
			}
			resetWidget("FilePicker1", true);
			agRes = await qCreatePendingAgreement.run({
				member_id: memberId,
				facilitator_id: facilitatorId,
				agreement_template_id: agreementTemplateId,
				signature_method: signatureMethod,
				status: agreementStatus,
				evidence_json: evidence_json
			});
			if (uploadPaper) {
				const _agId2 = agRes?.[0]?.member_agreement_id || agRes?.member_agreement_id || "";
				let _attCount = 0;
				try {
					const _ev = evidence_json ? JSON.parse(evidence_json) : [];
					_attCount = Array.isArray(_ev) ? _ev.length : 0;
				} catch (e) {}
				await memberFlows.auditLog("member_agreement.evidence_uploaded", "member_agreement", _agId2, {
					member_id: memberId,
					facilitator_id: facilitatorId ?? "",
					attachments: _attCount
				});
			}
			const _agId = agRes?.[0]?.member_agreement_id || agRes?.member_agreement_id || agRes?.member_agreements_id || agRes?.[0]?.member_agreements_id || "";
			await memberFlows.auditLog("member_agreement.created", "member_agreement", _agId, {
				member_id: memberId,
				facilitator_id: facilitatorId ?? "",
				signature_method: signatureMethod ?? "",
				status: agreementStatus ?? ""
			});
			if (!uploadPaper) {
				showAlert("Digital release queued (pending email send).", "success");
				const agreementId = agRes?.[0]?.member_agreement_id || agRes?.member_agreement_id || agRes?.[0]?.member_agreements_id || null;
				triggerRes = await apiTriggerDocumenso.run({
					member_agreement_id: agreementId,
					externalId: `ma:${agreementId}`
				});
				showAlert("Email sent.", "success");
			}
		}
		resetWidget("Members_IntakeForm", true);
		resetWidget("FilePicker1", true);
		return {
			memberId,
			agRes,
			triggerRes,
			duplicateWarnings: warningDupes
		};
	}

};
