export default {
  async load() {
    for (let attempt = 0; attempt < 30 && !appsmith.user?.email; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!appsmith.user?.email) {
      showAlert('Your account has not loaded. Refresh this page.', 'error');
      return;
    }
    await storeValue("company_contact_people_organization", null);
    const organizationId = String(appsmith.URL?.queryParams?.organization_id || appsmith.store.selected_organization_profile_id || '').trim();
    if (!organizationId) {
      showAlert('No company was selected. Return to Directory and choose View Profile.', 'error');
      return;
    }
    try {
      const profileRows = await qCompanyProfile.run({party_id: organizationId});
      if (!profileRows?.[0]?.party_id) {
        showAlert('Company lookup returned no accessible record for the selected organization.', 'error');
        return;
      }
			const profile = profileRows[0];
      await Promise.all([qCompanyContacts.run(),
        qCompanyCanEditDonorContacts.run(), qCompanyDonorContacts.run(), qCompanyDonorAddresses.run(),
        qCompanyContributionHistory.run(), qCompanyProviderIdentities.run(),
        qCompanyContributorStatusState.run(), qCompanyPartyIdentity.run(),qCompanyReassignTargets.run(),
        qCompanyContactPeople.run({organization_id:organizationId}), qCompanyContactCandidates.run({organization_id:organizationId}),
        qCompanyContactPeopleAccess.run({organization_id:organizationId})]);
      await storeValue("company_contact_people_organization", organizationId);
			return profile;
    } catch (error) {
      showAlert('Directory could not load: ' + (error?.message || error), 'error');
    }
  },
  async linkContactPerson() {
    return this.changeContactPerson(true);
  },
  async archiveContactPerson() {
    return this.changeContactPerson(false);
  },
  async changeContactPerson(active) {
    if (appsmith.store.company_contact_people_busy === true) return null;
    const organizationId = appsmith.store.company_contact_people_organization;
    const routeId = String(appsmith.URL?.queryParams?.organization_id || appsmith.store.selected_organization_profile_id || "").trim();
    if (!organizationId || organizationId !== routeId || qCompanyProfile.data?.[0]?.party_id !== organizationId) {
      showAlert("Reload this company profile before changing contact people.","warning"); return null;
    }
    const reason = String(inpCompanyContactPersonReason.text || "").trim();
    const personId = active ? selCompanyContactPerson.selectedOptionValue : tblCompanyContactPeople.selectedRow?.person_id;
    const rows = qCompanyContactPeople.data || [];
    const prior = rows.find(row => row.organization_id === organizationId && row.person_id === personId);
    if (!reason || !personId || (!active && prior?.status !== "active")) {
      showAlert("Select the individual and enter a reason.","warning"); return null;
    }
    if (active && !(qCompanyContactCandidates.data || []).some(row => row.person_id === personId)) {
      showAlert("Choose an individual from the current accessible directory.","warning"); return null;
    }
    const email = String(appsmith.user?.email || "").trim().toLowerCase();
    await storeValue("company_contact_people_busy",true);
    let changed = null;
    try {
      const access = (await qCompanyContactPeopleAccess.run({organization_id:organizationId}))?.[0];
      if (!email || access?.can_manage !== true || email !== String(appsmith.user?.email || "").trim().toLowerCase() ||
          routeId !== String(appsmith.URL?.queryParams?.organization_id || appsmith.store.selected_organization_profile_id || "").trim()) {
        showAlert("Company contact management permission is required. Reload after an account or company change.","error"); return null;
      }
      changed = (await qSetCompanyContactPerson.run({organization_id:organizationId,person_id:personId,active,
        expected_updated_at:prior?.updated_at || "",reason}))?.[0];
      if (!changed?.organization_contact_person_id) throw new Error("No changed relationship was returned.");
      const refresh = await Promise.allSettled([qCompanyContactPeople.run({organization_id:organizationId}),
        qCompanyContactCandidates.run({organization_id:organizationId})]);
      await resetWidget("inpCompanyContactPersonReason",true);
      await resetWidget("selCompanyContactPerson",true);
      showAlert(refresh.some(result=>result.status === "rejected") ? "Contact relationship saved, but refresh failed. Reload; do not repeat the change."
        : active ? "Company contact person linked." : "Company contact person archived.",refresh.some(result=>result.status === "rejected") ? "warning" : "success");
      return changed;
    } catch (error) {
      showAlert(changed ? "Contact relationship saved, but the display could not update. Reload; do not repeat the change."
        : "Contact relationship change failed: " + (error?.message || error),changed ? "warning" : "error");
      return changed;
    } finally { await storeValue("company_contact_people_busy",false); }
  },
}