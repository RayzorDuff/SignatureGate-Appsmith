export default {
  routeId() { return String(appsmith.URL?.queryParams?.organization_id || "").trim(); },
  state() {
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const state=appsmith.store.company_profile_state || {};
    if(state.email!==email || state.id!==this.routeId()) return {status:"loading"};
    return state;
  },
  isReady() {return this.state().status==="ready" && qCompanyProfile.data?.[0]?.party_id===this.routeId();},
  statusMessage() {
    const state=this.state();
    if(state.status==="missing") return "Choose a profile from Directory. Saved selections are not opened automatically.";
    if(state.status==="invalid") return "This profile link is invalid. Return to Directory and choose View Profile.";
    if(state.status==="denied") return "No accessible profile was found for this link. Return to Directory.";
    if(state.status==="error") return "This profile could not load completely. Reload or return to Directory.";
    if(state.status==="ready" && !this.isReady()) return "Profile selection changed while loading. Reload the selected profile.";
    return "Loading the selected profile…";
  },
  async load() {
    const pass=`${Date.now()}-${Math.random()}`;
    const id=this.routeId();
    await storeValue("company_profile_state_pass",pass);
    await storeValue("company_profile_state",{id,email:String(appsmith.user?.email||"").trim().toLowerCase(),status:"loading"});
    await storeValue("company_contact_people_organization",null);
    for(let i=0;i<30 && !(appsmith.user?.email || "").trim();i++) await new Promise(resolve=>setTimeout(resolve,150));
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const current=()=>pass===appsmith.store.company_profile_state_pass && id===this.routeId() && email===String(appsmith.user?.email||"").trim().toLowerCase();
    const update=async status=>{if(current())await storeValue("company_profile_state",{id,email,status});};
    if(!id) {await update("missing");return;}
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {await update("invalid");return;}
    try {
      if(!email) throw new Error("Sign-in has not loaded");
      let profileRows;
      try {profileRows=await qCompanyProfile.run({party_id:id});}
      catch(error) {if(!current())return;await new Promise(resolve=>setTimeout(resolve,300));if(!current())return;profileRows=await qCompanyProfile.run({party_id:id});}
      if(!current())return;
      if(profileRows?.[0]?.party_id!==id) {await update("denied");return;}
      const profile=profileRows[0];
      await Promise.all([qCompanyContacts.run(),
        qCompanyCanEditDonorContacts.run(), qCompanyDonorContacts.run(), qCompanyDonorAddresses.run(),
        qCompanyContributionHistory.run(), qCompanyProviderIdentities.run(),
        qCompanyContributorStatusState.run(), qCompanyPartyIdentity.run(),qCompanyReassignTargets.run(),
        qCompanyContactPeople.run({organization_id:id}), qCompanyContactCandidates.run({organization_id:id}),
        qCompanyContactPeopleAccess.run({organization_id:id})]);

      if(!current())return;
      await storeValue("company_contact_people_organization",id);
      await update("ready");
      return profile;
    } catch(error) {await update("error");}
  },
  async linkContactPerson() {
    return this.changeContactPerson(true);
  },
  async archiveContactPerson() {
    return this.changeContactPerson(false);
  },
  async changeContactPerson(active) {
    if (appsmith.store.company_contact_people_busy === true) return null;
    if(!this.isReady()) {showAlert("Reload the selected company profile before changing relationships.","warning");return null;}
    const organizationId = appsmith.store.company_contact_people_organization;
    const routeId = String(appsmith.URL?.queryParams?.organization_id || "").trim();
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
          routeId !== String(appsmith.URL?.queryParams?.organization_id || "").trim()) {
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
