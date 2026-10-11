export default {
  async openProfile(row) {
    const id = String(row?.party_id || '').trim();
    const kind = String(row?.party_kind || '').trim();
    if (!id || !['individual', 'organization'].includes(kind)) {
      showAlert('Directory selection is missing a valid party ID or type.', 'error');
      return;
    }
    const organization = kind === 'organization';
    await storeValue(organization ? 'selected_organization_profile_id' : 'selected_individual_profile_id', id);
    navigateTo(organization ? 'Company Profile' : 'Individual Profile',
      organization ? { organization_id: id } : { person_id: id }, 'SAME_WINDOW');
  },

  async openMemberFunctions(row) {
    if (row?.party_kind !== 'individual' || !row?.member_id || row?.membership_status !== 'active') {
      showAlert('Member Functions is available only to active members.', 'warning');
      return;
    }
    await storeValue('member_id', String(row.member_id));
    navigateTo('Member Functions', { member_id: String(row.member_id) }, 'SAME_WINDOW');
  },

  async openContributorFunctions(row) {
    if (!row?.contributor_id || row?.contributor_status !== 'active') {
      showAlert('Contributor Functions is available only to active contributors.', 'warning');
      return;
    }
    const selection = 'contributor:' + String(row.contributor_id);
    await storeValue('donation_donor_selection', selection);
    navigateTo('Contributor Functions', { contributor_id: String(row.contributor_id) }, 'SAME_WINDOW');
  },

  openSacramentRelease(row) {
    if (row?.party_kind !== 'individual' || !row?.member_id || row?.membership_status !== 'active') {
      showAlert('Sacrament Release is available only to active members.', 'warning');
      return;
    }
    navigateTo('Sacrament Release', { member_id: String(row.member_id) }, 'SAME_WINDOW');
  },

  async load() {
    for (let attempt = 0; attempt < 20 && !appsmith.user?.email; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!appsmith.user?.email) {
      showAlert('Your account has not loaded. Refresh this page.', 'error');
      return;
    }
    try {
      await Promise.all([qPartyDirectory.run(),
			]);
    } catch (error) {
      showAlert('Directory could not load: ' + (error?.message || error), 'error');
    }
  }
}