export default {
  accessState() {
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const state=appsmith.store.terminology_access || {};
    return email && state.email===email ? state : {status:"loading"};
  },
  hasAccess() { return this.accessState().status==="ready"; },
  accessMessage() {
    const status=this.accessState().status;
    if(status==="error") return "Terminology access could not be checked. Retry access.";
    if(status==="data_error") return "Directory Manager access is verified, but terminology could not load. Retry access.";
    if(status==="loading_terms") return "Directory Manager access verified. Loading organization terminology…";
    if(status==="unlinked") return "Your sign-in needs an active directory account link. Ask a Directory Manager to verify account ownership.";
    if(status==="denied") return "You need Directory Manager permission to administer terminology.";
    return "Checking Terminology Administration access…";
  },
  async initialize() {
    const pass=`${Date.now()}-${Math.random()}`;
    await storeValue("terminology_access_pass",pass);
    await storeValue("terminology_access",{status:"loading",email:String(appsmith.user?.email || "").trim().toLowerCase()});
    for(let i=0;i<30 && !(appsmith.user?.email || "").trim();i++) await new Promise(resolve=>setTimeout(resolve,150));
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const current=()=>pass===appsmith.store.terminology_access_pass && email===String(appsmith.user?.email || "").trim().toLowerCase();
    let phase="access";
    try {
      if(!email) throw new Error("Sign-in has not loaded");
      let rows;
      try {rows=await qTerminologyAccess.run();}
      catch(error) { if(!current()) return; await new Promise(resolve=>setTimeout(resolve,300)); if(!current()) return; rows=await qTerminologyAccess.run(); }
      if(!current()) return;
      const access=rows?.[0];
      if(access?.account_active!==true || access.allowed!==true) {
        await storeValue("terminology_access",{email,status:access?.account_active!==true?"unlinked":"denied"});
        return;
      }
      phase="terms";
      await storeValue("terminology_access",{email,status:"loading_terms"});
      try {await qTerminology.run();}
      catch(error) {if(!current()) return; await new Promise(resolve=>setTimeout(resolve,300)); if(!current()) return; await qTerminology.run();}
      if(current()) await storeValue("terminology_access",{email,status:"ready"});
    } catch(error) {
      if(current()) await storeValue("terminology_access",{email,status:phase==="terms"?"data_error":"error"});
    }
  },
  async save() {
    if(appsmith.store.terminology_busy===true) return;
    const params={concept:selTerminologyConcept.selectedOptionValue,singular:(inpTermSingular.text||"").trim(),plural:(inpTermPlural.text||"").trim(),short:(inpTermShort.text||"").trim()||null,active:selTermActive.selectedOptionValue==="true",reason:(inpTermReason.text||"").trim()};
    if(!params.concept || !params.singular || !params.plural || !params.reason) {showAlert("Enter concept, singular, plural and a reason.","warning");return;}
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    let saved=false;
    await storeValue("terminology_busy",true);
    try {
      const access=(await qTerminologyAccess.run())?.[0];
      if(!email || email!==String(appsmith.user?.email||"").trim().toLowerCase() || access?.allowed!==true || access?.account_active!==true) {showAlert("Directory Manager permission is required. Reload after an account change.","error");return;}
      showAlert("Saving organization terminology…","info");
      const rows=await qSetTerminology.run(params); saved=true;
      await qTerminology.run();
      await qNavigationTerminology.run();
      showAlert(rows?.[0]?.changed===true?"Terminology updated.":"No terminology changes were needed.","success");
    } catch(error) {showAlert(saved?"Terminology saved, but refresh failed. Reload; do not repeat the change.":"Terminology could not be saved.",saved?"warning":"error");}
    finally {await storeValue("terminology_busy",false);}
  }
};
