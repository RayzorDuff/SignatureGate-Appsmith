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
      await Promise.all([qPartyDirectory.run(), qDirectoryCanCreateContributor.run()]);
    } catch (error) {
      showAlert('Directory could not load: ' + (error?.message || error), 'error');
    }
  }
}