export default {
  async load() {
    for (let attempt = 0; attempt < 30 && !appsmith.user?.email; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!appsmith.user?.email) {
      showAlert('Your account has not loaded. Refresh this page.', 'error');
      return;
    }
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
        qCompanyContributorStatusState.run(), qCompanyPartyIdentity.run(),qCompanyReassignTargets.run()]);
			return profile;
    } catch (error) {
      showAlert('Directory could not load: ' + (error?.message || error), 'error');
    }
  },
	
}