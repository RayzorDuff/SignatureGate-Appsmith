export default {
  
	async auditLog(action, entity_type, entity_id, payload) {
    try {
      await qAuditLog.run({
        actor_email: (appsmith.user?.email || "").trim().toLowerCase(),
        action, entity_type, entity_id: entity_id || "",
        details_json: JSON.stringify(payload || {})
      });
    } catch (e) { console.log("Intake audit log failed:", e); }
  },

  async submit() {
    const entity = selIntakeEntityType.selectedOptionValue;
    const individual = entity === "Individual";
    const company = entity === "Company";
    const member = individual && chkIntakeMember.isChecked;
    const contributor = (individual && chkIntakeContributor.isChecked) ||
      (company && chkCompanyContributor.isChecked);

    if (!member && !contributor) {
      showAlert("Select at least one enrollment capacity.", "warning");
      return;
    }

    const email = (appsmith.user?.email || "").trim().toLowerCase();
    let actor = null;
    if (member) {
      const actorRows = await qCurrentFacilitator.run({ email });
      actor = Array.isArray(actorRows) ? actorRows[0] : null;
      if (!actor?.member_id) {
        showAlert("The current user is not an active facilitator.", "error");
        return;
      }
    }

    const rolesRows = await qIntakeActorRoles.run({ email });
    const roles = Array.isArray(rolesRows) ? rolesRows[0] : rolesRows;
    if (member && !roles?.is_document_reviewer) {
      showAlert("Member enrollment requires document reviewer permission.", "error");
      return;
    }
    if (contributor && !roles?.is_donations_reviewer) {
      showAlert("Contributor enrollment requires donations reviewer permission.", "error");
      return;
    }
    if (member && contributor && !roles?.is_directory_manager) {
      showAlert("Enrolling the same individual in both capacities requires directory manager permission.", "error");
      return;
    }

    const address = (inpIntakeAddress.text || "").trim();
    const city = (inpIntakeCity.text || "").trim();
    const state = (inpIntakeState.text || "").trim();
    const postal = (inpIntakePostalCode.text || "").trim();

    const addressParts = [address, city, state, postal];
    const hasAnyAddress = addressParts.some(Boolean);
    const hasCompleteAddress = addressParts.every(Boolean);
    if (hasAnyAddress && !hasCompleteAddress) {
      showAlert("If providing a mailing address, please provide street address, city, state, and ZIP / Postal code.", "warning");
      return;
    }

    if (individual || company) {
      const contactMethods = [
        !!(inpIntakeEmail.text || "").trim(),
        !!(inpIntakePhone.text || "").trim(),
        hasCompleteAddress
      ].filter(Boolean).length;
      if (contactMethods < 2) {
        showAlert("At least two contact methods are required: email, phone, or mailing address.", "warning");
        return;
      }
    }

    const reason = contributor ? (inpContributorReason.text || "").trim() : "";
    if (contributor && !reason) {
      showAlert("Contributor enrollment reason is required.", "warning");
      return;
    }

    // Preflight every Member enrollment gate before creating the Member.
    // This prevents a deterministic downstream validation failure from
    // leaving a partially-created Member behind.
    let delivery = null;
    let practitionerPersonId = null;
    let agreementType = null;
    let agreementTemplate = null;
    if (member) {
      delivery = selAgreementDelivery.selectedOptionValue;
      practitionerPersonId = selIntakePractitioner.selectedOptionValue;
      agreementType = selAgreementType.selectedOptionValue;
      agreementTemplate = selAgreementTemplate.selectedOptionValue;

      if (!practitionerPersonId) {
        showAlert("Spiritual Practitioner is required for member enrollment.", "warning");
        return;
      }
      if (!delivery) {
        showAlert("Agreement delivery is required for member enrollment.", "warning");
        return;
      }
      if (delivery === "Digital" && (!agreementType || !agreementTemplate)) {
        showAlert("Agreement Type and Agreement Template are required for a Digital Agreement.", "warning");
        return;
      }
      if (delivery === "Digital" && !((inpIntakeEmail.text || "").trim())) {
        showAlert("Email is required to send a Digital Agreement.", "warning");
        return;
      }
      if (delivery === "Paper" && !(FilePickerAgreement.files || []).length) {
        showAlert("Select a paper agreement file to upload.", "warning");
        return;
      }
    }

    let memberId = null;
    let memberPersonId = null;
    let contributorId = null;
    let memberEmailId = null;
    let agreementResult = null;
    let triggerResult = null;

    if (individual) {
      const first = (inpIntakeFirstName.text || "").trim();
      const last = (inpIntakeLastName.text || "").trim();
      const individualEmail = (inpIntakeEmail.text || "").trim();
      const phone = (inpIntakePhone.text || "").trim();
      const dob = (dateIntakeBirthDate.selectedDate || "").toString().slice(0, 10);

      if (!first || !last) {
        showAlert("First and last name are required.", "warning");
        return;
      }
      if (member) {
        const dupRows = await qCheckMemberDuplicate.run({
          first_name: first, last_name: last, email: individualEmail,
          phone, date_of_birth: dob
        });
        const dupes = Array.isArray(dupRows) ? dupRows : [];
        const hard = dupes.filter(d => String(d.match_severity || "").toLowerCase() === "hard");
        if (hard.length) {
          const existing = hard[0];
          showAlert("An active member already matches this intake. No new member was created.", "error");
          await this.auditLog("member.create_blocked_duplicate", "member", existing.member_id || "", {
            match_fields: [...new Set(hard.map(d => d.matched_field))], page: "Intake"
          });
          return;
        }
        if (dupes.some(d => String(d.match_severity || "").toLowerCase() === "warning")) {
          showAlert("Potential duplicate warning: creation will continue because no hard duplicate was found.", "warning");
        }

        const created = await qCreateMember.run({
          first_name: first, last_name: last, email: individualEmail, phone,
          date_of_birth: dob, created_by_facilitator_id: actor.member_id
        });
        memberId = created?.[0]?.member_id;
        const duplicateBlocked = created?.[0]?.duplicate_blocked === true;
        if (duplicateBlocked) {
          showAlert("Member creation was blocked because the database detected a duplicate.", "error");
          return;
        }
        if (!memberId) {
          showAlert("Member creation returned an incomplete result. No duplicate was reported, but the new member could not be resolved.", "error");
          return;
        }

        const memberPersonRows = await qGetMemberPerson.run({ member_id: memberId });
        memberPersonId = memberPersonRows?.[0]?.person_id || null;
        if (!memberPersonId) {
          showAlert("Member was created, but its person identity could not be resolved.", "error");
          return;
        }

        const e = await qAddMemberEmail.run({
          member_id: memberId,
          email: individualEmail,
          notes: "Created from Intake",
          subscribe_to_mailing_list: chkIntakeSubscribeMemberListmonk.isChecked
        });
        memberEmailId = e?.[0]?.member_email_id || null;
        let phoneId = null;
        if (phone) {
          const p = await qAddMemberPhone.run({ member_id: memberId, phone, notes: "Created from Intake" });
          phoneId = p?.[0]?.member_phone_id || null;
        }

        let memberAddressId = null;
        if (hasCompleteAddress) {
          const addressResult = await qAddMembershipAddress.run({
            person_id: memberPersonId, address_1: address, address_2: "",
            city, state, postal_code: postal, reason: "Initial Intake"
          });
          memberAddressId = addressResult?.[0]?.member_address_id ||
            addressResult?.[0]?.issue19_add_membership_address || null;
        }

        await qAssignMemberPractitioner.run({
          member_id: memberId,
          practitioner_person_id: practitionerPersonId,
          reason: "Initial member enrollment",
          notes: ""
        });

        if (contributor) {
          contributorId = (await qEnablePersonContributor.run({
            person_id: memberPersonId, reason
          }))?.[0]?.contributor_id;
          if (!contributorId) throw new Error("Contributor capacity was not created.");

          const contributorEmail = await qAddContributorEmailForDualCapacity.run({
            person_id: memberPersonId,
            email: individualEmail,
            reason,
            subscribe_to_mailing_list: chkIntakeSubscribeContributorListmonk.isChecked
          });
					const queueCheck = await qCheckContributorListmonkQueue.run({
						contributor_email_id: contributorEmail?.[0]?.contributor_email_id
					});
					console.log("Contributor Listmonk queue immediately after enqueue:", queueCheck);
					
          if (!contributorEmail?.[0]?.contributor_email_id) {
            throw new Error("Contributor email was not created.");
          }

          await qLinkContributorMember.run({
            contributor_id: contributorId, member_id: memberId,
            actor_member_id: actor.member_id, reason
          });

        }
      } else {
        const created = await qCreateContributor.run({
          party_kind: "individual", first_name: first, last_name: last,
          email: individualEmail, phone, reason,
          subscribe_to_mailing_list: chkIntakeSubscribeContributorListmonk.isChecked
        });
        contributorId = created?.[0]?.contributor_id;
        memberPersonId = created?.[0]?.party_id;
        if (!contributorId || !memberPersonId) throw new Error("Contributor creation did not return the new individual identity.");

        if (hasCompleteAddress) {
          await qAddContributorAddress.run({
            party_kind: "individual", party_id: memberPersonId,
            address_1: address, address_2: "", city, state, postal_code: postal, reason
          });
        }
      }
    } else if (company) {
      const companyName = (inpIntakeCompanyName.text || "").trim();
      if (!companyName) {
        showAlert("Company name is required.", "warning");
        return;
      }
      const created = await qCreateContributor.run({
        party_kind: "organization", organization_name: companyName,
        first_name: "", last_name: "",
        email: (inpIntakeEmail.text || "").trim(),
        phone: (inpIntakePhone.text || "").trim(), reason,
        subscribe_to_mailing_list: chkIntakeSubscribeContributorListmonk.isChecked
      });
      contributorId = created?.[0]?.contributor_id;
      const organizationId = created?.[0]?.party_id;
      if (!contributorId || !organizationId) throw new Error("Company contributor creation did not return the organization identity.");

      if (hasCompleteAddress) {
        await qAddContributorAddress.run({
          party_kind: "organization", party_id: organizationId,
          address_1: address, address_2: "", city, state, postal_code: postal, reason
        });
      }
    }

    if (member) {
      let evidence = "[]";
      if (delivery === "Paper") {
        const attachments = [];
        for (const file of (FilePickerAgreement.files || [])) {
          const encodedData = file.data || file.base64 || file.content || file.fileData || file.file;
          if (!encodedData) throw new Error("File " + file.name + " does not contain Base64 upload data.");
          const upload = await apiUploadEvidenceViaN8n.run({
            files: [{name:file.name,type:file.type || file.mimeType || "application/octet-stream",size:file.size,data:encodedData}]
          });
          const raw = upload?.data ?? upload;
          const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.files) ? raw.files : (raw && typeof raw === "object" ? [raw] : []);
          attachments.push(...arr.filter(x => x && (x.path || x.signedPath)));
        }
        if (!attachments.length) throw new Error("Paper agreement upload returned no attachment paths.");
        evidence = JSON.stringify(attachments);
      }

			console.log("Intake agreement parameters:", {
				member_id: memberId,
				practitioner_person_id: practitionerPersonId,
				agreement_template_id: delivery === "Digital" ? agreementTemplate : "",
				signature_method: delivery === "Digital" ? "documenso" : "paper",
				status: delivery === "Digital" ? "pending_email_send" : "pending_review",
				member_email_id: memberEmailId || ""
			});
			
      agreementResult = await qCreateIntakeAgreement.run({
        member_id: memberId,
        practitioner_person_id: practitionerPersonId,
        agreement_template_id: delivery === "Digital" ? agreementTemplate : "",
        signature_method: delivery === "Digital" ? "documenso" : "paper",
        status: delivery === "Digital" ? "pending_email_send" : "pending_review",
        evidence_json: evidence,
        member_email_id: memberEmailId || ""
      });

      const agreementId = agreementResult?.[0]?.member_agreement_id;
      if (delivery === "Digital" && agreementId) {
        triggerResult = await apiTriggerDocumenso.run({
          member_agreement_id: agreementId, externalId: "ma:" + agreementId
        });
      }
    }

    await this.auditLog("intake.completed", entity.toLowerCase(), memberId || contributorId || "", {
      member_id: memberId, contributor_id: contributorId,
      member_enrolled: member, contributor_enrolled: contributor, page: "Intake"
    });

    showAlert(
      member && contributor ? "Individual enrolled as Member and Contributor." :
      member ? "Individual enrolled as Member." :
      "Contributor enrollment completed.",
      "success"
    );
    return {memberId, contributorId, agreementResult, triggerResult};
  },

  async reset() {
    const widgets = [
      "inpIntakeFirstName",
      "inpIntakeLastName",
      "inpIntakeEmail",
      "inpIntakePhone",
      "inpIntakeCompanyName",
      "dateIntakeBirthDate",
      "inpIntakeAddress",
      "inpIntakeCity",
      "inpIntakeState",
      "inpIntakePostalCode",
      "inpContributorReason",
      "selAgreementType",
      "selAgreementTemplate",
      "selAgreementDelivery",
      "selIntakePractitioner",
      "FilePickerAgreement",
      "chkIntakeMember",
      "chkIntakeContributor",
      "chkIntakeSubscribeMemberListmonk",
      "chkIntakeSubscribeContributorListmonk",
      "chkCompanyContributor",
      "selIntakeEntityType"
    ];

    for (const widgetName of widgets) {
      await resetWidget(widgetName, true);
    }

    showAlert("Intake form reset.", "info");
  }
};