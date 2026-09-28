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
          details_json: JSON.stringify(payload ?? {})
        });
      } catch (e) {
        console.log("audit_log insert failed:", e);
      }
  },

  async refresh() {
      await qMembersDirectory.run();
      const initialMemberId = String(appsmith.store.member_id || "").trim() || String(appsmith.URL.queryParams.member_id || "").trim();
      if (initialMemberId) {
        await storeValue("member_id", initialMemberId);
        return await releaseFlows.refreshGate(initialMemberId);
      }
      return [];
  },

  async verifyaccess() {
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
        let rows = await qCurrentFacilitator.run({ email });
        if (!Array.isArray(rows)) rows = [];
        const me = rows[0];
        if (!me?.person_id) {
          showAlert("Access denied: a practitioner appointment is required for " + email, "error");
          await releaseFlows.auditLog("auth.denied", "person", "", { email, required_role: "practitioner", page: appsmith.URL?.pathname, mode: appsmith.mode });
          if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
            navigateTo("Unauthorized", {}, "SAME_WINDOW");
          }
          return;
        }
        const practitionerPersonId = me.person_id;
        await Promise.all([
          storeValue("practitioner_person_id", practitionerPersonId),
          storeValue("facilitator_id", me.legacy_member_id || practitionerPersonId),
          storeValue("facilitator_email", (me.email ?? "").trim().toLowerCase()),
          storeValue("facilitator_is_reviewer", me.is_document_reviewer),
          storeValue("facilitator_is_donations_reviewer", me.is_donations_reviewer),
          storeValue("facilitator_full_name", me.display_name || `${me.first_name || ""} ${me.last_name || ""}`.trim()),
          storeValue("practitioner_singular_label", me.practitioner_singular_label || "Practitioner"),
          storeValue("practitioner_plural_label", me.practitioner_plural_label || "Practitioners")
        ]);
      } catch (e) {
        showAlert("Access check failed: " + (e?.message || e), "error");
        showAlert("Query error: " + JSON.stringify(qCurrentFacilitator?.error ?? {}), "error");
        if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
          navigateTo("Unauthorized", {}, "SAME_WINDOW");
        }
        return;
      }
      return await releaseFlows.refresh();
  },

  async setMemberId(memberId) {
      const id = String(memberId || "").trim();
      if (!id) {
        await storeValue("member_id", "");
        await storeValue("release_practitioner_person_id", "");
        return [];
      }
      await storeValue("member_id", id);
      return await releaseFlows.refreshGate(id);
  },

  async refreshGate(thisSelected) {
      const selectedMember = String(thisSelected || selMember.selectedOptionValue || appsmith.store.member_id || "").trim();
      if (!selectedMember) return [];
      await storeValue("member_id", selectedMember);
      const [gateRows, practitionerRows] = await Promise.all([
        qGateCheckAgreement.run({ member_id: selectedMember, release_type: "sacrament_release" }),
        qListFacilitators.run({ member_id: selectedMember })
      ]);
      const practitioners = Array.isArray(practitionerRows) ? practitionerRows : [];
      const prior = String(selFacilitator.selectedOptionValue || appsmith.store.release_practitioner_person_id || appsmith.store.practitioner_person_id || "").trim();
      const selectedPractitioner = practitioners.some(row => String(row.practitioner_person_id || row.member_id) === prior)
        ? prior
        : String(practitioners[0]?.practitioner_person_id || practitioners[0]?.member_id || "").trim();
      await storeValue("release_practitioner_person_id", selectedPractitioner);
      if (selectedPractitioner) {
        await selFacilitator.setSelectedOption(selectedPractitioner);
      }
      await qAccessibleStorageLocations.run({
        member_id: selectedMember,
        practitioner_person_id: selectedPractitioner || null
      });
      await apiListAvailableProducts.run();
      return gateRows;
  },

  async issueRelease() {
      const member_id = String(selMember.selectedOptionValue || appsmith.store.member_id || "").trim() || null;
      const release_type = "sacrament_release";
      if (!member_id) {
        showAlert("Select a member.", "warning");
        return;
      }
      const product = tblProducts.selectedRow;
      const storage_location_name = product?.storage_location || null;
      if (!storage_location_name) {
        showAlert("Select an available sacrament product.", "warning");
        return;
      }
      await releaseFlows.auditLog("release.attempt", "member", member_id, {
        member_id,
        release_type,
        page: appsmith.URL?.pathname
      });
      const membership = await qReleaseMemberActive.run({ member_id });
      if (membership?.[0]?.is_active !== true) {
        showAlert("Select an active member before releasing sacrament.", "error");
        return;
      }
      const gateRows = await qGateCheckAgreement.run({ member_id, release_type });
      const gateRow = Array.isArray(gateRows) && gateRows.length > 0 ? gateRows[0] : null;
      const hasAgreement = !!gateRow?.member_agreement_id;
      const isReviewer = appsmith.store.facilitator_is_reviewer === true || appsmith.store.facilitator_is_reviewer === "true";
      const notes = inpNotes.text || "";
      const reviewerOverride = !hasAgreement && isReviewer;
      if (!hasAgreement && !isReviewer) {
        showAlert("Not eligible. The member must sign an agreement authorizing sacrament release before the transfer can be recorded.", "error");
        return;
      }
      if (reviewerOverride && !notes.trim()) {
        showAlert("Notes are required when a document reviewer records a sacrament release without a signed agreement.", "warning");
        return;
      }
      if (!product?.mushroomprocess_product_id) {
        showAlert("Select a product to issue.", "warning");
        return;
      }
      const practitioner_person_id = String(selFacilitator.selectedOptionValue || appsmith.store.release_practitioner_person_id || "").trim() || null;
      const practitionerLabel = String(((qTerminology.data || []).find(x => x.concept_key === "practitioner") || {}).singular_label || appsmith.store.practitioner_singular_label || "Practitioner");
      if (!practitioner_person_id) {
        showAlert(`Select a ${practitionerLabel.toLowerCase()}.`, "warning");
        return;
      }
      const allowedLocations = await qAccessibleStorageLocations.run({ member_id, practitioner_person_id });
      if (!(allowedLocations || []).some(row => row.storage_location_name === storage_location_name)) {
        showAlert(`${practitionerLabel} does not have access to the selected storage location.`, "error");
        return;
      }
      const quantity = 1;
      const unit = "g";
      await apiMarkProductShipped.run();
      showAlert(`Shipped: ${product.mushroomprocess_product_id}`, "success");
      const ins = await qCreateRelease.run({
        member_id,
        member_agreement_id: gateRow?.member_agreement_id || null,
        mushroomprocess_product_id: product.mushroomprocess_product_id,
        item_name: product.item_name || release_type,
        quantity,
        unit,
        net_weight_g: String(product.net_weight_g || "").replace(/[a-zA-Z]+$/, "") || null,
        strain: product.strain || null,
        practitioner_person_id,
        storage_location_name,
        override_reason: reviewerOverride ? notes : null,
        notes
      });
      const releaseId = ins?.[0]?.release_id || ins?.release_id || "";
      showAlert(`Sacrament release recorded: ${releaseId || "ok"}`, "success");
      await apiListAvailableProducts.run();
      return ins;
  }
};