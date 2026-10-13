// Generated page copies consume the same registry; these functions format UI copy only.
// Never pass operational records or executed document text through text().
export default {
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
  }
};
