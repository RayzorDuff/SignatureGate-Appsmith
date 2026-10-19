export default {
  recovery() {
    const owner=String(appsmith.user?.email || "").trim().toLowerCase();
    const receipt=appsmith.store["intake_submission:"+owner];
    return owner && receipt?.version===1 && receipt.owner===owner ? receipt : null;
  },
  async checkpoint(owner, changes) {
    if(owner!==String(appsmith.user?.email || "").trim().toLowerCase()) throw new Error("The signed-in account changed. Review the existing intake.");
    const receipt={...(this.recovery() || {}),...changes,version:1,owner};
    // Persist only technical IDs and controlled stage text, never intake form values.
    await storeValue("intake_submission:"+owner,receipt,true);
    return receipt;
  },
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
    if(this.recovery()) {showAlert("This intake has a saved or uncertain outcome. Review Directory and agreements, then use Reset Intake Form for a separate intake.","warning");return;}
    if(appsmith.store.intake_busy===true) return;
    await storeValue("intake_busy",true,false);
    try {return await this.performSubmit();}
    finally {await storeValue("intake_busy",false,false);}
  },
  async performSubmit() {
    let saved=false;
    let phase="checking permission and enrollment details";
    const submissionOwner=String(appsmith.user?.email || "").trim().toLowerCase();
    const stage=message=>{phase=message;showAlert(navigationLabels.text(message),"info");};
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
      showAlert(navigationLabels.text("Member enrollment requires document reviewer permission."), "error");
      return;
    }
    if (contributor && !roles?.is_donations_reviewer) {
      showAlert(navigationLabels.text("Contributor enrollment requires donations reviewer permission."), "error");
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
      showAlert(navigationLabels.text("Contributor enrollment reason is required."), "warning");
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
        showAlert(navigationLabels.text("Spiritual Practitioner is required for member enrollment."), "warning");
        return;
      }
      if (!delivery) {
        showAlert(navigationLabels.text("Agreement delivery is required for member enrollment."), "warning");
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
      if (!["Digital","Later"].includes(delivery)) {
        showAlert("Choose a digital agreement or explicitly create the agreement later.","warning"); return;
      }
      // Stale hidden selection values must not request an agreement in Later mode.
      if (delivery === "Later") { agreementType = null; agreementTemplate = null; }
    }

    const first=(inpIntakeFirstName.text || "").trim();
    const last=(inpIntakeLastName.text || "").trim();
    const companyName=(inpIntakeCompanyName.text || "").trim();
    const dob=individual ? (dateIntakeBirthDate.selectedDate || "").toString().slice(0,10) : "";
    const individualEmail=contactEmail;
    const phone=(inpIntakePhone.text || "").trim();
    if ((individual && (!first || !last)) || (company && !companyName)) {
      showAlert(individual ? "First and last name are required." : "Company name is required.","warning");return;
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
          showAlert(navigationLabels.text(`An active member already matches on ${fields}. ${detail} No new member was created. Contact a document reviewer for access or reassignment if needed.`), "error");
          await this.auditLog("member.create_blocked_duplicate", "member", existing.member_id || "", {
            match_fields: [...new Set(hard.map(d => d.matched_field))], page: "Intake"
          });
          return;
        }
        if (dupes.some(d => String(d.match_severity || "").toLowerCase() === "warning")) {
          showAlert("Potential duplicate warning: creation will continue because no hard duplicate was found.", "warning");
        }

    }
    stage("Preparing an atomic Intake request…");
    const requestId=(await qNewIntakeRequest.run())?.[0]?.request_id;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId || "")) throw new Error("Intake request key unavailable.");
    const payload={kind:company ? "organization" : "individual",participant:Boolean(member),contributor:Boolean(contributor),
      first_name:first,last_name:last,company_name:companyName,email:contactEmail,phone,date_of_birth:dob,
      address,city,state,postal_code:postal,notes:identityNotes,reason,
      participant_subscribe:chkIntakeSubscribeMemberListmonk.isChecked===true,
      contributor_subscribe:chkIntakeSubscribeContributorListmonk.isChecked===true,
      agreement_delivery:delivery || "",agreement_type:agreementType || "",
      agreement_template_id:agreementTemplate || "",practitioner_person_id:practitionerPersonId || ""};
    stage("Saving identity, enrollment, contacts and pending agreement in one transaction…");
    await this.checkpoint(submissionOwner,{state:"uncertain",phase,request_id:requestId});
    saved=true; // A timeout does not establish that the transaction rolled back.
    const receipt=(await qSubmitAtomicIntake.run({owner:submissionOwner,request_id:requestId,payload_json:JSON.stringify(payload)}))?.[0]?.receipt;
    if(receipt?.state!=="committed" || receipt.request_id!==requestId ||
      (member && (!receipt.member_id || (delivery === "Digital" && !receipt.agreement_id)
        || (delivery === "Later" && (receipt.agreement_id || receipt.agreement_deferred !== true)))) || (contributor && !receipt.contributor_id)) {
      throw new Error("The Intake transaction did not return a complete receipt.");
    }
    await this.checkpoint(submissionOwner,{state:"incomplete",member_id:receipt.member_id,person_id:receipt.person_id,
      organization_id:receipt.organization_id,contributor_id:receipt.contributor_id,agreement_id:receipt.agreement_id});
    stage(company ? "Company and Contributor enrollment saved." : "Individual and selected enrollment capacities saved.");
    stage("Contact methods and identity notes saved.");
    if(member) stage(delivery === "Digital" ? "Spiritual Practitioner assignment and pending agreement saved." : "Spiritual Practitioner assignment saved. Create and complete an agreement from Participant Functions before a release.");
    if(member && contactEmail && payload.participant_subscribe) stage("Participant mailing preference saved; Listmonk synchronization queued…");
    if(contributor && contactEmail && payload.contributor_subscribe) stage("Contributor mailing preference saved; Listmonk synchronization queued…");
    let triggerResult=null;
    if(member && delivery === "Digital") {
      stage("Agreement created. Requesting the signing workflow…");
      // The committed agreement is the stable external key. Never auto-retry HTTP.
      triggerResult=await apiTriggerDocumenso.run({member_agreement_id:receipt.agreement_id,externalId:"ma:"+receipt.agreement_id});
      const raw=triggerResult?.data ?? triggerResult;const result=raw?.message ?? raw;
      if(result?.ok===false || result?.success===false || ["failed","error"].includes(result?.status)) throw new Error("Signing workflow did not complete.");
      stage(result?.email_sent===true ? "Agreement email sent (confirmed by signing service)." : "Signing workflow requested. Check agreement status for email delivery.");
    }
    await this.checkpoint(submissionOwner,{state:"completed",phase:"Enrollment completed"});
    showAlert(navigationLabels.text(member && contributor ? "Individual enrolled as Member and Contributor." : member ? "Individual enrolled as Member." : "Contributor enrollment completed."),"success");
    return {memberId:receipt.member_id,contributorId:receipt.contributor_id,
      agreementResult:receipt.agreement_id ? [{member_agreement_id:receipt.agreement_id}] : null,triggerResult};
    } catch(error) {
      if(saved) {
        try {await this.checkpoint(submissionOwner,{state:"needs_review",phase});} catch(checkpointError) { /* Keep the original owner-scoped uncertainty marker. */ }
      }
      showAlert(saved ? "Intake stopped with a committed transaction or an uncertain response during "+phase+". Check the saved Intake receipt and existing identity/agreement; do not submit another intake." : "Intake could not complete during "+phase+". Check details before retrying.",saved ? "warning" : "error");
      return null;
    }
  },

  async inspectRecovery() {
    const existing=this.recovery();
    if(!existing?.request_id) {showAlert("This checkpoint has no durable request key. Review Directory and agreement status before starting a separate intake.","warning");return;}
    const owner=String(appsmith.user?.email || "").trim().toLowerCase();
    try {
      const receipt=(await qIntakeRequestStatus.run({owner,request_id:existing.request_id}))?.[0]?.receipt;
      if(!receipt) {
        showAlert("No committed receipt is visible yet. The request may still be running. Keep this checkpoint and check again before starting a separate intake.","warning");return;
      }
      if(receipt.state!=="committed" || receipt.request_id!==existing.request_id) throw new Error("Unexpected Intake receipt.");
      await this.checkpoint(owner,{state:existing.state==="completed" ? "completed" : "needs_review",
        member_id:receipt.member_id,person_id:receipt.person_id,organization_id:receipt.organization_id,
        contributor_id:receipt.contributor_id,agreement_id:receipt.agreement_id,
        phase:"Enrollment transaction committed; review existing contacts, capacities and agreement/signing status"});
      showAlert("The enrollment transaction committed. Review the existing identity and agreement status. No enrollment or signing request was replayed.","info");
      return receipt;
    } catch(error) {showAlert("The saved Intake receipt could not be checked. Keep the checkpoint and review the existing record before continuing.","warning");}
  },

  async reset() {
    if(appsmith.store.intake_busy===true) {showAlert("Wait for the current intake to finish before resetting.","warning");return;}
    const receipt=this.recovery();
    if(receipt && receipt.state!=="completed" && chkIntakeRecoveryReviewed.isChecked!==true) {
      showAlert("Review Directory, contacts, capacities and agreement status before acknowledging this interrupted intake. Reset starts a separate intake and does not repair saved records.","warning");return;
    }
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
      "selIntakeEntityType",
      "chkIntakeRecoveryReviewed"
    ];

    for (const widgetName of widgets) {
      await resetWidget(widgetName, true);
    }

    if(receipt) await storeValue("intake_submission:"+receipt.owner,null,true);
    showAlert("Intake form reset. Ready for a separate intake.", "info");
  }
};
