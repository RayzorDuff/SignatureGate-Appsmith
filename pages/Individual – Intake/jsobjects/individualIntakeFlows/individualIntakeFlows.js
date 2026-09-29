export default {
  async submit() {
    const partyKind = selIntakePartyKind.selectedOptionValue;
    const capacity = selIntakeCapacity.selectedOptionValue;
    const firstName = (inpIntakeFirstName.text || "").trim();
    const lastName = (inpIntakeLastName.text || "").trim();
    const organizationName = (inpIntakeOrganizationName.text || "").trim();
    const email = (inpIntakeEmail.text || "").trim().toLowerCase();
    const phone = (inpIntakePhone.text || "").trim();
    const dateOfBirth = (inpIntakeDOB.selectedDate || "").toString().slice(0, 10);
    const reason = (inpIntakeReason.text || "").trim();
    const notes = (inpIntakeNotes.text || "").trim();
    const access = qIndividualIntakeAccess.data?.[0] || {};

    if (!partyKind || !capacity || !reason) {
      showAlert("Identity type, capacity, and reason are required.", "warning");
      return;
    }
    if (partyKind === "individual" && (!firstName || !lastName)) {
      showAlert("First and last name are required for an individual.", "warning");
      return;
    }
    if (partyKind === "organization" && capacity !== "contributor") {
      showAlert("Companies currently enter through Contributor capacity.", "warning");
      return;
    }
    if (partyKind === "organization" && !organizationName) {
      showAlert("Company name is required.", "warning");
      return;
    }
    if (email && !inpIntakeEmail.isValid) {
      showAlert("Enter a valid email address.", "warning");
      return;
    }
    if (phone && !inpIntakePhone.isValid) {
      showAlert("Enter a valid phone number.", "warning");
      return;
    }
    if ((capacity === "member" || capacity === "both") && access.can_member !== true) {
      showAlert("Document reviewer permission is required to create a Member capacity.", "error");
      return;
    }
    if ((capacity === "contributor" || capacity === "both") && access.can_contributor !== true) {
      showAlert("Donations reviewer permission is required to create a Contributor capacity.", "error");
      return;
    }
    if (capacity === "both" && access.can_both !== true) {
      showAlert("Member + Contributor intake requires document reviewer, donations reviewer, and directory manager permissions.", "error");
      return;
    }

    let personId = null;
    let memberId = null;
    let contributorId = null;

    if (capacity === "member" || capacity === "both") {
      const created = await qCreateMember.run({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        date_of_birth: dateOfBirth,
        notes,
        is_facilitator: false,
        created_by_facilitator_id: ""
      });
      const row = Array.isArray(created) ? created[0] : created;

      if (!row?.member_id) {
        showAlert("Member creation did not return a member ID. No new identity was created.", "error");
        return;
      }

      memberId = row.member_id;

      const personRows = await qMemberPersonId.run({ member_id: memberId });
      const personRow = Array.isArray(personRows) ? personRows[0] : personRows;
      personId = personRow?.person_id || null;

      if (!personId) {
        showAlert("The new Member was created, but its canonical person identity could not be resolved. Stop before retrying.", "error");
        return;
      }

      if (email) {
        await qAddMemberEmail.run({ member_id: memberId, email, reason });
      }
      if (phone) {
        await qAddMemberPhone.run({ member_id: memberId, phone, reason });
      }

      if (capacity === "both") {
        const contributorResult = await qEnableContributor.run({
          person_id: personId,
          reason
        });
        const contributorRow = Array.isArray(contributorResult)
          ? contributorResult[0]
          : contributorResult;
        contributorId = contributorRow?.contributor_id || contributorRow;

        if (!contributorId) {
          showAlert("Member was created, but Contributor capacity could not be enabled. Review the Individual Profile before retrying.", "error");
          return;
        }

        if (email) {
          await qAddContributorEmail.run({ person_id: personId, email, reason });
        }
        if (phone) {
          await qAddContributorPhone.run({ person_id: personId, phone, reason });
        }
      }
    } else {
      const created = await qCreateContributor.run({
        party_kind: partyKind,
        first_name: firstName,
        last_name: lastName,
        organization_name: organizationName,
        email,
        phone,
        reason
      });
      const row = Array.isArray(created) ? created[0] : created;

      if (!row?.contributor_id || !row?.party_id) {
        showAlert("Contributor creation did not return the new identity. Review the database result before retrying.", "error");
        return;
      }

      contributorId = row.contributor_id;
      personId = partyKind === "individual" ? row.party_id : null;
    }

    await storeValue("new_intake_person_id", personId || "");
    await storeValue("new_intake_member_id", memberId || "");
    await storeValue("new_intake_contributor_id", contributorId || "");

    showAlert(
      (partyKind === "organization" ? "Company" : "Individual") + " created successfully.",
      "success"
    );
    resetWidget("Individual_IntakeForm", true);
  }
};
