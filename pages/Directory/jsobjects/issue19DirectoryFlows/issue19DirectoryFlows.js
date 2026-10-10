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

  async load() {
    for (let attempt = 0; attempt < 20 && !appsmith.user?.email; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!appsmith.user?.email) {
      showAlert('Your account has not loaded. Refresh this page.', 'error');
      return;
    }
    try {
      await Promise.all([qPartyDirectory.run(), qDirectoryCanCreateContributor.run()]);
    } catch (error) {
      showAlert('Directory could not load: ' + (error?.message || error), 'error');
    }
  }
}