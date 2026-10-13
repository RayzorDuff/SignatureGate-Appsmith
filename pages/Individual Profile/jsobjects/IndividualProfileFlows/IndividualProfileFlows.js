export default {
  routeId() { return String(appsmith.URL?.queryParams?.person_id || "").trim(); },
  state() {
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const state=appsmith.store.individual_profile_state || {};
    if(state.email!==email || state.id!==this.routeId()) return {status:"loading"};
    return state;
  },
  isReady() {return this.state().status==="ready" && qIndividualProfile.data?.[0]?.party_id===this.routeId();},
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
    await storeValue("individual_profile_state_pass",pass);
    await storeValue("individual_profile_state",{id,email:String(appsmith.user?.email||"").trim().toLowerCase(),status:"loading"});

    for(let i=0;i<30 && !(appsmith.user?.email || "").trim();i++) await new Promise(resolve=>setTimeout(resolve,150));
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const current=()=>pass===appsmith.store.individual_profile_state_pass && id===this.routeId() && email===String(appsmith.user?.email||"").trim().toLowerCase();
    const update=async status=>{if(current())await storeValue("individual_profile_state",{id,email,status});};
    if(!id) {await update("missing");return;}
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {await update("invalid");return;}
    try {
      if(!email) throw new Error("Sign-in has not loaded");
      let profileRows;
      try {profileRows=await qIndividualProfile.run({party_id:id});}
      catch(error) {if(!current())return;await new Promise(resolve=>setTimeout(resolve,300));if(!current())return;profileRows=await qIndividualProfile.run({party_id:id});}
      if(!current())return;
      if(profileRows?.[0]?.party_id!==id) {await update("denied");return;}
      const profile=profileRows[0];
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
      if(!current())return;

      await update("ready");
      return profile;
    } catch(error) {await update("error");}
  },
}
