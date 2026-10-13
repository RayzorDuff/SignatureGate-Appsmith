export default {
  async loadAccess() {
    for(let i=0;i<20 && !(appsmith.user?.email || "").trim();i++) await new Promise(resolve=>setTimeout(resolve,150));
    return qPageAccess.run();
  },
  
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
    if(appsmith.store.intake_busy===true) return;
    await storeValue("intake_busy",true);
    try {return await this.performSubmit();}
    finally {await storeValue("intake_busy",false);}
  },
  async performSubmit() {
    let saved=false;
    let phase="checking permission and enrollment details";
    const stage=message=>{phase=message;showAlert(message,"info");};
    try {
    stage("Checking permissions and enrollment details…");
    const access = (await qPageAccess.run())?.[0];
    if (access?.can_intake !== true) { showAlert("Intake requires reviewer permission.", "error"); return; }
    const contactEmail = String(inpIntakeEmail.text || "").trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { showAlert("Enter a valid email address.", "warning"); return; }
    const phoneDigits=String(inpIntakePhone.text||"").replace(/\D/g,"");
    if(phoneDigits && !(phoneDigits.length===10 || (phoneDigits.length===11 && phoneDigits.startsWith("1")))) {showAlert("Enter a valid US phone number.","warning");return;}
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
      if (!actor?.person_id || actor.is_document_reviewer !== true) {
        showAlert("Document Reviewer permission required.", "error");
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

    const identityNotes = (inpIntakeIdentityNotes.text || "").trim();
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
      if (delivery === "Paper") {
        showAlert("Paper agreement upload is pending integration validation. No record or file was sent.","warning"); return;
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
        stage("Checking for an existing Participant…");
        const dupRows = await qCheckMemberDuplicate.run({
          first_name: first, last_name: last, email: individualEmail,
          phone, date_of_birth: dob
        });
        const dupes = Array.isArray(dupRows) ? dupRows : [];
        const hard = dupes.filter(d => String(d.match_severity || "").toLowerCase() === "hard");
        if (hard.length) {
          const existing = hard[0];
          const inaccessible = hard.filter(d => d.is_accessible !== true && String(d.is_accessible).toLowerCase() !== "true");
          const fields = [...new Set(hard.map(d => ({ email: "email address", "members.email": "email address", phone: "phone number", "members.phone": "phone number", "name+dob": "name and date of birth", name: "name" })[String(d.matched_field || "").toLowerCase()] || "identifying information"))].join(", ");
          const elsewhere = inaccessible.some(d => d.access_scope === "other_facilitator");
          const detail = inaccessible.length
            ? (elsewhere ? "The matching member is assigned to another practitioner." : "The matching member is outside your accessible directory.")
            : "An existing member is accessible in Directory.";
          showAlert(`An active member already matches on ${fields}. ${detail} No new member was created. Contact a document reviewer for access or reassignment if needed.`, "error");
          await this.auditLog("member.create_blocked_duplicate", "member", existing.member_id || "", {
            match_fields: [...new Set(hard.map(d => d.matched_field))], page: "Intake"
          });
          return;
        }
        if (dupes.some(d => String(d.match_severity || "").toLowerCase() === "warning")) {
          showAlert("Potential duplicate warning: creation will continue because no hard duplicate was found.", "warning");
        }

        stage("Creating the individual and Participant enrollment…");
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
          showAlert("Participant creation returned an incomplete result. Review the directory before submitting another intake.", "warning");
          return;
        }

        saved=true;
        stage("Individual and Participant enrollment created. Saving contact methods…");
        const memberPersonRows = await qGetMemberPerson.run({ member_id: memberId });
        memberPersonId = memberPersonRows?.[0]?.person_id || null;
        if (!memberPersonId) {
          throw new Error("Participant identity could not be resolved.");
        }

        if (identityNotes) await qSetIntakeIdentityNotes.run({party_kind: "individual", party_id: memberPersonId, notes: identityNotes, reason: "Initial intake"});

        const e = individualEmail ? await qAddMemberEmail.run({
          member_id: memberId,
          email: individualEmail,
          notes: "Created from Intake",
          subscribe_to_mailing_list: chkIntakeSubscribeMemberListmonk.isChecked
        }) : [];
        memberEmailId = e?.[0]?.member_email_id || null;
        if(individualEmail && !memberEmailId) throw new Error("Participant email could not be saved.");
        if(individualEmail && chkIntakeSubscribeMemberListmonk.isChecked) stage("Participant mailing preference saved; Listmonk synchronization queued…");
        let phoneId = null;
        if (phone) {
          const p = await qAddMemberPhone.run({ member_id: memberId, phone, notes: "Created from Intake" });
          phoneId = p?.[0]?.member_phone_id || null;
          if(!phoneId) throw new Error("Participant phone could not be saved.");
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

        stage("Contacts saved. Assigning the Spiritual Practitioner…");
        await qAssignMemberPractitioner.run({
          member_id: memberId,
          practitioner_person_id: practitionerPersonId,
          reason: "Initial member enrollment",
          notes: ""
        });

        if (contributor) {
          stage("Practitioner assigned. Adding Contributor capacity…");
          contributorId = (await qEnablePersonContributor.run({
            person_id: memberPersonId, reason
          }))?.[0]?.contributor_id;
          if (!contributorId) throw new Error("Contributor capacity was not created.");

          const contributorEmail = individualEmail ? await qAddContributorEmailForDualCapacity.run({
            person_id: memberPersonId,
            email: individualEmail,
            reason,
            subscribe_to_mailing_list: chkIntakeSubscribeContributorListmonk.isChecked
          }) : [];
					
          if (individualEmail && !contributorEmail?.[0]?.contributor_email_id) {
            throw new Error("Contributor email was not created.");
          }

          if(individualEmail && chkIntakeSubscribeContributorListmonk.isChecked) stage("Contributor mailing preference saved; Listmonk synchronization queued…");
          for(const [source_table,source_id] of [["member_phones",phoneId],["member_addresses",memberAddressId]]) {
            if(source_id && !(await qAssignIntakeContactRole.run({person_id:memberPersonId,source_table,source_id,reason}))?.[0]?.contact_id) throw new Error("Shared Contributor contact role could not be saved.");
          }
          await qLinkContributorMember.run({
            contributor_id: contributorId, member_id: memberId,
            actor_member_id: actor.member_id, reason
          });

        }
      } else {
        stage("Creating the individual and Contributor enrollment…");
        const created = await qCreateContributor.run({
          party_kind: "individual", first_name: first, last_name: last,
          email: individualEmail, phone, reason,
          subscribe_to_mailing_list: chkIntakeSubscribeContributorListmonk.isChecked
        });
        saved=true;
        stage("Contributor enrollment created. Saving contact details…");
        if(individualEmail && chkIntakeSubscribeContributorListmonk.isChecked) stage("Contributor mailing preference saved; Listmonk synchronization queued…");
        contributorId = created?.[0]?.contributor_id;
        memberPersonId = created?.[0]?.party_id;
        if (!contributorId || !memberPersonId) throw new Error("Contributor creation did not return the new individual identity.");

        if (identityNotes) await qSetIntakeIdentityNotes.run({party_kind: "individual", party_id: memberPersonId, notes: identityNotes, reason: "Initial intake"});

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
      stage("Creating the company and Contributor enrollment…");
      const created = await qCreateContributor.run({
        party_kind: "organization", organization_name: companyName,
        first_name: "", last_name: "",
        email: (inpIntakeEmail.text || "").trim(),
        phone: (inpIntakePhone.text || "").trim(), reason,
        subscribe_to_mailing_list: chkIntakeSubscribeContributorListmonk.isChecked
      });
      saved=true;
      stage("Company Contributor enrollment created. Saving contact details…");
      if(contactEmail && chkIntakeSubscribeContributorListmonk.isChecked) stage("Contributor mailing preference saved; Listmonk synchronization queued…");
      contributorId = created?.[0]?.contributor_id;
      const organizationId = created?.[0]?.party_id;
      if (!contributorId || !organizationId) throw new Error("Company contributor creation did not return the organization identity.");

      if (identityNotes) await qSetIntakeIdentityNotes.run({party_kind: "organization", party_id: organizationId, notes: identityNotes, reason: "Initial intake"});

      if (hasCompleteAddress) {
        await qAddContributorAddress.run({
          party_kind: "organization", party_id: organizationId,
          address_1: address, address_2: "", city, state, postal_code: postal, reason
        });
      }
    }

    if (member) {
      const evidence="[]";
      stage("Enrollment and contacts saved. Creating the agreement…");
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
      if(!agreementId) throw new Error("Agreement creation returned an incomplete result.");
      stage("Agreement created. Requesting the signing workflow…");
      if (delivery === "Digital" && agreementId) {
        triggerResult = await apiTriggerDocumenso.run({
          member_agreement_id: agreementId, externalId: "ma:" + agreementId
        });
        const raw=triggerResult?.data ?? triggerResult;
        const result=raw?.message ?? raw;
        if(result?.ok===false || result?.success===false || ["failed","error"].includes(result?.status)) throw new Error("Signing workflow did not complete.");
        stage(result?.email_sent===true?"Agreement email sent (confirmed by signing service).":"Signing workflow requested. Check agreement status for email delivery.");
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
    } catch(error) {
      showAlert(saved?"Intake stopped after saving records during "+phase+". Review the existing identity and agreement before continuing; do not submit another intake.":"Intake could not complete during "+phase+". Check details before retrying.",saved?"warning":"error");
      return null;
    }
  },

  async reset() {
    const widgets = [
      "inpIntakeFirstName",
      "inpIntakeLastName",
      "inpIntakeEmail",
      "inpIntakePhone",
      "inpIntakeIdentityNotes",
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
