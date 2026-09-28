export default {
  async load() {
    for (let attempt = 0; attempt < 20 && !appsmith.user?.email; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!appsmith.user?.email) {
      showAlert('Your account has not loaded. Refresh this page.', 'error');
      return;
    }
    try {
      await qIndividualProfile.run();
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