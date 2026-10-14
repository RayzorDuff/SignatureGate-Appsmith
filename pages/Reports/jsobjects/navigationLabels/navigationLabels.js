export default {
  // Generated page copies consume the same registry; these functions format UI copy only.
  // Never pass operational records or executed document text through text().
  label(concept, plural=false) {
    const defaults={member:["Participant","Participants"],practitioner:["Spiritual Practitioner","Spiritual Practitioners"],contributor:["Contributor","Contributors"]};
    const row=(qNavigationTerminology.data || []).find(row=>row.concept_key===concept && row.is_active===true);
    return row?.[plural?"plural_label":"singular_label"] || defaults[concept]?.[plural?1:0] || concept;
  },
  text(copy) {
    return String(copy)
      .replace(/\b(?:Spiritual Practitioners?|Practitioners?|Facilitators?|Participants?|Members?|Membership|Contributors?)\b/gi,original=>{
        const word=original.toLowerCase();
        if(word==="membership") return this.label("member")+" enrollment";
        const concept=word.startsWith("spiritual") || word.startsWith("practitioner") || word.startsWith("facilitator")?"practitioner":word.startsWith("contributor")?"contributor":"member";
        return this.label(concept,word.endsWith("s"));
      });
  },
  accessState() {
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const path=String(appsmith.URL?.pathname || "");
    const state=appsmith.store.navigation_access_state || {};
    return state.email===email && state.path===path ? state : {status:"loading"};
  },
  accessMessage() {
    const status=this.accessState().status;
    if(status==="loading") return "Checking page access…";
    if(status==="error") return "Access lookup did not complete. Use Refresh access to retry.";
    if(status==="unlinked") return "Your sign-in account has no active directory account link.";
    return "";
  },
  async initialize() {
    const pass=`${Date.now()}-${Math.random()}`;
    const path=String(appsmith.URL?.pathname || "");
    await storeValue("navigation_access_pass",pass);
    await storeValue("navigation_access_state",{path,email:String(appsmith.user?.email || "").trim().toLowerCase(),status:"loading"});
    for(let i=0;i<40 && !(appsmith.user?.email || "").trim();i++) await new Promise(resolve=>setTimeout(resolve,150));
    const email=String(appsmith.user?.email || "").trim().toLowerCase();
    const current=()=>pass===appsmith.store.navigation_access_pass && path===String(appsmith.URL?.pathname || "") && email===String(appsmith.user?.email || "").trim().toLowerCase();
    const update=async status=>{if(current()) await storeValue("navigation_access_state",{path,email,status});};
    try {
      if(!email) throw new Error("Sign-in is unavailable");
      let rows;
      try {rows=await qNavigationAccess.run();}
      catch(error) {
        if(!current())return;
        await new Promise(resolve=>setTimeout(resolve,300));
        if(!current())return;
        rows=await qNavigationAccess.run();
      }
      if(!current())return;
      const actor=rows?.[0];
      const linked=!!actor?.person_id && String(actor.email || "").trim().toLowerCase()===email;
      await update(linked?"ready":"unlinked");
      // Label lookup failure must not revoke verified access. Defaults remain usable.
      if(current()) await qNavigationTerminology.run().catch(()=>null);
    } catch(error) {await update("error");}
  }
};
