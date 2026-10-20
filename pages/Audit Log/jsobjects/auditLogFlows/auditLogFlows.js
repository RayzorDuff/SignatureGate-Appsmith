export default {
	DOCUMENSO_BASE_URL: "https://documenso.danks.store/t/facilitators",
	GIVEBUTTER_BASE_URL: "https://givebutter.com",
	GIVEBUTTER_DASHBOARD_BASE_URL: "https://dashboard.givebutter.com",
	APPSMITH_MEMBER_PROFILE_PAGE: "Member Functions",
	NOCODB_BASE_URL: "https://nocodb.danks.store",
	
	async auditLog(action, entity_type, entity_id, payload) {
		try {
			await qAuditLogInsert.run({
				action,
				entity_type,
				entity_id: entity_id ?? "",
				actor_member_id: appsmith.store.facilitator_id ?? "",
				actor_email: ((appsmith.user?.email ?? "").trim().toLowerCase()),
				mode: appsmith.mode ?? "",
				details_json: JSON.stringify(payload ?? {}),
			});
		} catch (e) {
						console.log("audit_log insert failed:", e);
					}
	},

	async refresh() {
		await Promise.allSettled([
      qAuditLogList.run(),
    ]);	
  },

  formatDetails(row={}) {
    let details;
    try {details=typeof row.details_json==="string"?JSON.parse(row.details_json || "{}"):row.details_json || row.details || {};}
    catch(error) {return "Audit details could not be parsed.";}
    if(!details || typeof details!=="object" || Array.isArray(details)) return "Audit details are unavailable.";
    const esc=value=>String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
    const safe=value=>/^https?:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::[0-9]{1,5})?(?:[/?#]|$)/i.test(String(value)) && !/[\u0000-\u0020\u007f]/.test(String(value));
    const link=(title,url)=>safe(url)?`<a target="_blank" rel="noopener noreferrer" href="${esc(url)}">${esc(title)}</a>`:esc(title);
    const route=(base,kind,id)=>`${base}/${kind}/${encodeURIComponent(String(id))}`;
    const html=[];
    const memberId=details.member_id || row.detail_member_id;
    if(memberId) html.push(`<b>${esc(navigationLabels.label("member"))}:</b> ${esc(row.detail_member_name || memberId)}`);
    const practitionerId=details.practitioner_person_id || details.facilitator_id || row.detail_facilitator_id;
    if(practitionerId) html.push(`<b>${esc(navigationLabels.label("practitioner"))}:</b> ${esc(row.detail_facilitator_name || practitionerId)}`);
    if(details.documenso_document_id) html.push(`<b>Documenso:</b> ${link(details.documenso_document_id,route(this.DOCUMENSO_BASE_URL,"documents",details.documenso_document_id))}`);
    if(details.externalId) html.push(`<b>Documenso External ID:</b> ${esc(details.externalId)}`);
    if(details.createdAt) html.push(`<b>Created:</b> ${esc(new Date(details.createdAt).toLocaleString())}`);
    if(details.url && details.name) html.push(`<b>Agreement:</b> ${link(details.name,details.url)}`);
    if(Array.isArray(details.evidence)) for(const file of details.evidence) {
      if(!file || typeof file!=="object")continue;
      const title=file.title || file.name || "Attachment";
      if (file.storage_provider === "google_drive") {
        if (/^[A-Za-z0-9_-]{10,200}$/.test(file.drive_file_id || "")) html.push(`<b>Attachment:</b> ${link(title,"https://drive.google.com/file/d/"+file.drive_file_id+"/view")}`);
        continue;
      }
      const path=file.signedPath || file.path || file.url;
      if(!path)continue;
      const url=/^https?:\/\//i.test(String(path))?String(path):this.NOCODB_BASE_URL+"/"+String(path).replace(/^\/+/,"");
      html.push(`<b>Attachment:</b> ${link(title,url)}`);
    }
    const gb=details.data && typeof details.data==="object"?details.data:{};
    const transactionId=gb.number || gb.transactions?.[0]?.id || gb.id;
    if(String(details.event || "").startsWith("transaction.") || transactionId) {
      html.push("<h4>Givebutter</h4>");
      if(gb.first_name || gb.last_name)html.push(`<b>Donor:</b> ${esc(gb.first_name)} ${esc(gb.last_name)}`);
      if(gb.email)html.push(`<b>Email:</b> ${esc(gb.email)}`);
      if(gb.phone)html.push(`<b>Phone:</b> ${esc(gb.phone)}`);
      if(gb.amount!=null)html.push(`<b>Amount:</b> $${esc(Number(gb.amount).toFixed(2))} ${esc(gb.currency)}`);
      if(gb.status)html.push(`<b>Status:</b> ${esc(gb.status)}`);
      if(gb.transacted_at || gb.created_at)html.push(`<b>Transacted:</b> ${esc(new Date(gb.transacted_at || gb.created_at).toLocaleString())}`);
      if(gb.campaign_id)html.push(`<b>Campaign:</b> ${esc(gb.campaign_title || gb.campaign_id)}`);
      if(gb.campaign_code)html.push(`<b>Public Campaign:</b> ${link(gb.campaign_code,this.GIVEBUTTER_BASE_URL+"/"+encodeURIComponent(String(gb.campaign_code)))}`);
      if(gb.contact_id)html.push(`<b>Givebutter Contact:</b> ${link(gb.contact_id,route(this.GIVEBUTTER_DASHBOARD_BASE_URL,"contacts",gb.contact_id))}`);
      if(transactionId)html.push(`<b>Givebutter Transaction:</b> ${link(transactionId,route(this.GIVEBUTTER_DASHBOARD_BASE_URL,"transactions",transactionId))}`);
    }
    return html.join("<br>");
  },

	async verifyaccess() {
		try {
			//showAlert("Beginning init. mode=" + appsmith.mode, "warning");

			// Wait briefly for Appsmith user context to hydrate
      let email = null;
      for (let i = 0; i < 20; i++) {
        email = (appsmith.user?.email ?? "").trim().toLowerCase();
        if (email) break;
        await new Promise(r => setTimeout(r, 150));
      }

			if (!email) {
				showAlert("Unknown user: appsmith.user.email not available.", "error");
				return;
			}

			// IMPORTANT: use return value of run(), not qCurrentFacilitator.data
      await qPageAccess.run();
      let rows = await qCurrentFacilitator.run({ email });

      // 🔴 Appsmith bug fix
      if (!Array.isArray(rows)) rows = [];
      //showAlert("qCurrentFacilitator rows=" + rows.length, "warning");

      const me = rows[0];	

			if (!me?.person_id) {
				showAlert(navigationLabels.text("Access denied: not an active facilitator for ") + email, "error");
				
				await this.auditLog("auth.denied","facilitator","", { email, page: appsmith.URL?.pathname, mode: appsmith.mode });if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
					//Only redirect when not in editor
					/* Access denied in place; keep navigation available. */
				}
				return;
			}

			const facilitator_id = me.member_id || "";
			const facilitator_email = (me.email ?? "").trim().toLowerCase();
			const is_document_reviewer = me.is_document_reviewer;
			const is_donations_reviewer = me.is_donations_reviewer;

			//showAlert("Access granted for " + facilitator_email + " id=" + facilitator_id + " document reviewer=" + is_document_reviewer + " donations reviewer=" + is_donations_reviewer, "success");

			// May want these enabled in deployed mode:
			storeValue("facilitator_id", facilitator_id);
			storeValue("facilitator_email", facilitator_email);
			storeValue("facilitator_is_reviewer", is_document_reviewer );
			storeValue("facilitator_is_donations_reviewer", is_donations_reviewer);
			storeValue("facilitator_full_name", `${me.first_name} ${me.last_name}`.trim());	

		
			//await this.auditLog("auth.granted","facilitator", facilitator_id, { email: facilitator_email, is_reviewer, is_donations_reviewer page: appsmith.URL?.pathname, mode: appsmith.mode });
		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");
			// Helpful: show query error if present
			showAlert("Query error: " + JSON.stringify(({})), "error");
			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
				//Only redirect when not in editor
				/* Access denied in place; keep navigation available. */
			}
			return;
		}
		
    return await this.refresh();
		
	},
}
