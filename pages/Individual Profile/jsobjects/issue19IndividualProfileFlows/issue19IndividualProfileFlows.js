export default {
  async load() {
    for (let attempt = 0; attempt < 30 && (!appsmith.user?.email || !appsmith.URL?.queryParams?.person_id); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!appsmith.user?.email) {
      showAlert('Your account has not loaded. Refresh this page.', 'error');
      return;
    }
    const personId = String(appsmith.URL?.queryParams?.person_id || '').trim();
    if (!personId) {
      showAlert('No individual was selected. Return to Directory and choose View Profile.', 'error');
      return;
    }
    try {
      await qIndividualProfile.run({ person_id: personId });
      if (!qIndividualProfile.data?.[0]?.party_id) {
        showAlert('Record not found or you do not have access to this individual.', 'error');
        return;
      }
      await Promise.all([qIndividualContacts.run(), qIndividualRoles.run(),
        qIndividualAccount.run(), qDirectoryCanManage.run(),
        qProfileCanCreateContributor.run(),
        qIndividualCanEditDonorContacts.run(), qIndividualDonorContacts.run(), qIndividualDonorAddresses.run(),
        qProfileCanCreateMember.run(), qMembershipIdentity.run(),
        qProfileMembershipState.run(),
        qCanAssignPersonContact.run(), qReusablePersonContacts.run(),
        qIndividualContributionHistory.run(), qIndividualProviderIdentities.run(),
        qIndividualContributorStatusState.run(), qIndividualPartyIdentity.run(),
        qIndividualMemberOperationsState.run(), qIndividualMembershipContacts.run(), qIndividualMembershipAddresses.run(), qIndividualMemberAgreements.run(),
        qIndividualPractitionerAssignments.run(), qIndividualAvailablePractitioners.run()]);
    } catch (error) {
      showAlert('Directory could not load: ' + (error?.message || error), 'error');
    }
  }
}
