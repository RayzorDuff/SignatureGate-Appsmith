export default {

  async refresh() {
    for (let i=0;i<20 && !(appsmith.user?.email || "").trim();i++) await new Promise(resolve=>setTimeout(resolve,150));
    const access = (await qPageAccess.run())?.[0];
    if (access?.can_cash_deposits !== true) return [];
    await Promise.allSettled([
      qCashDepositCurrentFacilitator.run(),
      qCashDepositCashOnHand.run(),
      qCashDepositBatches.run(),
      apiCashDepositBankAccounts.run()
    ]);
  },

  facilitatorId() {
    return qPageAccess.data?.[0]?.can_cash_deposits === true ? (qPageAccess.data?.[0]?.person_id || "") : "";
  },

  selectedDonation() {
    return tblCashDeposits.selectedRow || {};
  },

  selectedBatch() {
    const storedId = String(appsmith.store.cash_deposit_batch_id || "").trim();
    if (storedId) {
      const stored = (qCashDepositBatches.data || []).find(
        row => row.deposit_batch_id === storedId
      );
      if (stored) return stored;
    }

    return tblCashDepositBatches.selectedRow || {};
  },

  isDonationsReviewer() {
    return qPageAccess.data?.[0]?.is_donations_reviewer === true
      && String(qPageAccess.data?.[0]?.email || "").trim().toLowerCase() === String(appsmith.user?.email || "").trim().toLowerCase();
  },

  requireDonationsReviewer() {
    const id = this.requireFacilitator();
    if (!id) return "";
    if (!this.isDonationsReviewer()) {
      showAlert("Only a donations reviewer can review or confirm cash deposits.", "error");
      return "";
    }
    return id;
  },

  requireFacilitator() {
    const id = this.facilitatorId();
    if (!id) {
      showAlert("Donations Reviewer permission is required to manage cash deposits.", "error");
      return "";
    }
    return id;
  },

  async setHideIneligible(checked) {
    await storeValue("cash_deposit_hide_ineligible", checked !== false);
    await qCashDepositCashOnHand.run();
  },

  async clearDisposition() {
    await storeValue("cash_reconciliation_intent", null);
  },

  async openDisposition(donationId, mode) {
    const access = (await qPageAccess.run())?.[0];
    if (access?.can_cash_deposits !== true || access?.is_donations_reviewer !== true ||
        String(access?.email || "").trim().toLowerCase() !== String(appsmith.user?.email || "").trim().toLowerCase()) {
      showAlert("Donations Reviewer permission is required.", "error");
      return false;
    }
    const id = String(donationId || "").trim();
    const donation = id
      ? (tblCashDeposits.processedTableData || []).find(row => String(row.donation_id || "").trim() === id)
      : this.selectedDonation();
    const expected = mode === "revive" ? "deposit_reconciliation_excluded" : mode === "exclude" ? "cash_on_hand" : "";
    if (!expected || !donation?.donation_id || donation.operational_status !== expected) {
      showAlert("Select an eligible cash donation for this action.", "warning");
      return false;
    }
    await storeValue("cash_reconciliation_intent", {
      donation_id: donation.donation_id, mode,
      actor_email: String(appsmith.user?.email || "").trim().toLowerCase()
    });
    await storeValue("cash_reconciliation_busy", false);
    await Promise.all([resetWidget("inpCashDispositionReason", true), resetWidget("inpCashDispositionNotes", true)]);
    await showModal("mdlCashDisposition");
    return true;
  },

  async excludeDonationFromReconciliation(donationId) {
    return this.openDisposition(donationId, "exclude");
  },

  async reviveDonationFromReconciliation(donationId) {
    return this.openDisposition(donationId, "revive");
  },

  async submitDisposition() {
    if (appsmith.store.cash_reconciliation_busy === true) return false;
    const intent = appsmith.store.cash_reconciliation_intent;
    const reason = String(inpCashDispositionReason.text || "").trim();
    const notes = String(inpCashDispositionNotes.text || "").trim();
    if (!intent?.donation_id || !["exclude", "revive"].includes(intent.mode)) {
      showAlert("Choose a reconciliation action first.", "warning");
      return false;
    }
    if (!reason) {
      showAlert("A reason is required for this reconciliation change.", "warning");
      return false;
    }
    await storeValue("cash_reconciliation_busy", true);
    let committed = false;
    try {
      const access = (await qPageAccess.run())?.[0];
      const email = String(appsmith.user?.email || "").trim().toLowerCase();
      if (!email || email !== intent.actor_email || String(access?.email || "").trim().toLowerCase() !== email || access?.can_cash_deposits !== true || access?.is_donations_reviewer !== true) {
        await this.clearDisposition();
        showAlert("Access changed. No reconciliation change was made.", "error");
        return false;
      }
      const query = intent.mode === "revive" ? qReviveCashDonation : qExcludeCashDonation;
      await query.run({donation_id: intent.donation_id, reason, notes: notes || null});
      committed = true;
      await this.clearDisposition();
      await closeModal("mdlCashDisposition");
      await qCashDepositCashOnHand.run();
      showAlert(intent.mode === "revive"
        ? "Cash donation revived and returned to Cash on Hand."
        : "Cash donation excluded from deposit reconciliation.", "success");
      return intent.donation_id;
    } catch (error) {
      if (committed) {
        await this.clearDisposition();
        showAlert("Reconciliation change saved, but the display refresh failed. Reload the page; do not repeat the change.", "warning");
        return intent.donation_id;
      }
      showAlert("Reconciliation change failed: " + (error?.message || error), "error");
      return false;
    } finally {
      await storeValue("cash_reconciliation_busy", false);
    }
  },

  async verifyDonation() {
    const donation = this.selectedDonation();
    const reviewerId = this.requireDonationsReviewer();

    if (!reviewerId || !donation.donation_id) {
      showAlert("Select a cash donation to verify.", "warning");
      return;
    }

    if (donation.operational_status !== "pending_review") {
      showAlert("Only a cash donation pending review can be verified.", "warning");
      return;
    }

    await qReviewCashDonation.run({
      donation_id: donation.donation_id,
      reviewer_id: reviewerId,
      new_status: "verified",
      review_notes: "Verified for cash handling"
    });

    showAlert("Cash donation verified and moved to Cash on Hand.", "success");
    await this.refresh();
  },

  async rejectDonation() {
    const donation = this.selectedDonation();
    const reviewerId = this.requireDonationsReviewer();

    if (!reviewerId || !donation.donation_id) {
      showAlert("Select a cash donation to reject.", "warning");
      return;
    }

    if (donation.operational_status !== "pending_review") {
      showAlert("Only a cash donation pending review can be rejected.", "warning");
      return;
    }

    await qReviewCashDonation.run({
      donation_id: donation.donation_id,
      reviewer_id: reviewerId,
      new_status: "rejected",
      review_notes: "Rejected cash donation"
    });

    showAlert("Cash donation rejected.", "success");
    await this.refresh();
  },

  async createBatch() {
    const preparerId = this.requireDonationsReviewer();
    if (!preparerId) return;

    const result = await qCreateCashDepositBatch.run({
      preparer_id: preparerId,
      deposit_date: inpCashDepositDate.selectedDate
        ? moment(inpCashDepositDate.selectedDate).format("YYYY-MM-DD")
        : moment().format("YYYY-MM-DD"),
      deposit_slip_number: inpCashDepositSlipNumber.text || null,
      notes: "Cash deposit batch created from Cash Deposits"
    });

    const batch = result?.[0] || {};
    if (batch.deposit_batch_id) {
      await storeValue("cash_deposit_batch_id", batch.deposit_batch_id);
      showAlert("Deposit batch created.", "success");
    }

    await this.refresh();
  },

  async addSelectedDonationToBatch() {
    const donation = this.selectedDonation();
    const batch = this.selectedBatch();
    const actorId = this.requireDonationsReviewer();

    if (!actorId) return;

    if (!donation.donation_id) {
      showAlert("Select a cash donation first.", "warning");
      return;
    }

    if (!batch.deposit_batch_id || batch.status !== "draft") {
      showAlert("Select a draft deposit batch first.", "warning");
      return;
    }

    if (donation.operational_status !== "cash_on_hand") {
      showAlert("Only Cash on Hand donations can be added to a deposit batch.", "warning");
      return;
    }

    await qAddCashDepositItem.run({
      deposit_batch_id: batch.deposit_batch_id,
      donation_id: donation.donation_id,
      actor_id: actorId
    });

    // Preserve the batch the user just modified across the refresh. Appsmith
    // may otherwise default the table selection back to the first row.
    await storeValue("cash_deposit_batch_id", batch.deposit_batch_id);
    showAlert("Cash donation added to the deposit batch.", "success");
    await this.refresh();
  },

  async printBatch(batchId) {
    const reviewerId = this.requireDonationsReviewer();
    if (!reviewerId) return;

    const id = String(
      batchId || this.selectedBatch()?.deposit_batch_id || ""
    ).trim();

    if (!id) {
      showAlert("Select a deposit batch to print.", "warning");
      return;
    }

    const batch = (qCashDepositBatches.data || []).find(
      row => row.deposit_batch_id === id
    ) || {};

    if (!["prepared", "confirmed"].includes(batch.status)) {
      showAlert("Only prepared or completed deposit batches can be printed.", "warning");
      return;
    }

    if (typeof jspdf === "undefined" || !jspdf.jsPDF) {
      showAlert(
        "The PDF library is not installed in this Appsmith app. Install the jsPDF library, then retry.",
        "error"
      );
      return;
    }

    const rows = await qCashDepositBatchPrint.run({
      deposit_batch_id: id
    });

    if (!rows?.length) {
      showAlert("No deposit detail was found for this batch.", "warning");
      return;
    }

    const first = rows[0];
    const doc = new jspdf.jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter"
    });

    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 36;
    const contentWidth = pageWidth - (margin * 2);
    let y = 44;

    const money = cents => "$" + (Number(cents || 0) / 100).toFixed(2);
    const dateOnly = value => value ? moment(value).format("YYYY-MM-DD") : "";
    const dateTime = value => value ? moment(value).format("YYYY-MM-DD HH:mm") : "";
    const text = value => String(value ?? "")
      .replace(/[\u0000-\u001f]/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/–|—/g, "-")
      .replace(/…/g, "...")
      .replace(/[^\x20-\x7E]/g, "?")
      .trim();
    const donorName = row => row.donor_name
      || (row.donor_kind === "anonymous" ? "Anonymous" : "Unidentified donor");

    const addHeader = continuation => {
      y = 44;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(
        continuation ? "CASH DEPOSIT RECORD - CONTINUED" : "CASH DEPOSIT RECORD",
        margin,
        y
      );
      y += 20;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      if (!continuation) {
        doc.text("Batch: " + text(first.deposit_batch_id), margin, y);
        doc.text("Status: " + text(first.status), 390, y);
        y += 13;
        doc.text("Deposit date: " + dateOnly(first.deposit_date), margin, y);
        doc.text("Slip/reference: " + text(first.deposit_slip_number), 260, y);
        y += 13;
        doc.text("Destination: " + text(first.destination_bank_account), margin, y);
        y += 13;
        doc.text("Prepared by: " + text(first.preparer_email), margin, y);
        doc.text("Prepared: " + dateTime(first.prepared_at), 330, y);
        y += 13;

        if (first.status === "confirmed") {
          doc.text("Confirmed by: " + text(first.verifier_email), margin, y);
          doc.text("Confirmed: " + dateTime(first.confirmed_at), 330, y);
          y += 13;
        }

        if (text(first.batch_notes)) {
          doc.text("Batch notes: " + text(first.batch_notes), margin, y);
          y += 13;
        }

        y += 8;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Date", margin, y);
      doc.text("Donor", 90, y);
      doc.text("Type", 215, y);
      doc.text("Contribution ID", 270, y);
      doc.text("Amount", 380, y);
      doc.text("Reference", 430, y);
      y += 5;
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
    };

    const addFooter = pageNumber => {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(
        "SignatureGate cash deposit record - Page " + pageNumber,
        margin,
        pageHeight - 22
      );
    };

    addHeader(false);

    rows.forEach(row => {
      const donorLines = doc.splitTextToSize(text(donorName(row)), 115);
      const referenceLines = doc.splitTextToSize(text(row.provider_reference), 72);
      const notes = text(row.donation_notes || row.review_notes);
      const noteLines = notes
        ? doc.splitTextToSize("Notes: " + notes, contentWidth)
        : [];
      const lineCount = Math.max(
        donorLines.length,
        referenceLines.length,
        noteLines.length,
        1
      );
      const rowHeight = Math.max(24, (lineCount * 9) + (noteLines.length ? 10 : 4));

      if (y + rowHeight > pageHeight - 42) {
        addFooter(doc.getNumberOfPages());
        doc.addPage();
        addHeader(true);
      }

      const rowTop = y;
      doc.setFontSize(7);
      doc.text(dateOnly(row.donated_at), margin, rowTop);
      doc.text(donorLines, 90, rowTop);
      doc.text(text(row.donor_kind), 215, rowTop);
      doc.text(text(row.donation_id).slice(0, 12), 270, rowTop);
      doc.text(money(row.item_amount_cents), 380, rowTop);
      doc.text(referenceLines, 430, rowTop);

      if (noteLines.length) {
        doc.setFontSize(6.5);
        doc.text(noteLines, margin, rowTop + (lineCount * 9));
      }

      doc.setFontSize(7);
      doc.line(margin, rowTop + rowHeight - 3, pageWidth - margin, rowTop + rowHeight - 3);
      y = rowTop + rowHeight + 5;
    });

    if (y > pageHeight - 150) {
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      addHeader(true);
    }

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Tally", margin, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Contributions: " + rows.length, margin, y);
    doc.text("Expected amount: " + money(first.expected_amount_cents), 220, y);
    y += 14;

    if (first.status === "confirmed") {
      doc.text("Verified amount: " + money(first.actual_amount_cents), margin, y);
      doc.text("Completed: " + dateTime(first.confirmed_at), 220, y);
      y += 14;
    }

    doc.text("Prepared: " + dateTime(first.prepared_at), margin, y);
    y += 14;

    if (first.status === "confirmed") {
      doc.text("Verified by: " + text(first.verifier_email), margin, y);
      y += 14;
    }

    if (text(first.batch_notes)) {
      doc.text("Notes: " + text(first.batch_notes), margin, y);
    }

    addFooter(doc.getNumberOfPages());

    const fileDate = dateOnly(first.deposit_date) || moment().format("YYYY-MM-DD");
    const fileName = "cash-deposit-" + fileDate + "-" + id.slice(0, 8) + ".pdf";
    const dataUrl = doc.output("dataurlstring");
    download(dataUrl, fileName, "application/pdf");

    showAlert("Deposit record PDF downloaded.", "success");
  },

  async prepareBatch() {
    const batch = this.selectedBatch();
    const actorId = this.requireDonationsReviewer();

    if (!actorId) return;

    if (!batch.deposit_batch_id || batch.status !== "draft") {
      showAlert("Select a draft deposit batch to prepare.", "warning");
      return;
    }

    if (Number(batch.item_count || 0) < 1) {
      showAlert(
        "The selected batch has no active donations. Add a Cash on Hand donation before preparing it.",
        "warning"
      );
      return;
    }

    const slip = (inpCashDepositSlipNumber.text || "").trim();
    const bankAccount = String(
      inpCashDepositBankAccount.selectedOptionValue || ""
    ).trim();
    const depositDate = inpCashDepositDate.selectedDate
      ? moment(inpCashDepositDate.selectedDate).format("YYYY-MM-DD")
      : moment().format("YYYY-MM-DD");

    if (!slip) {
      showAlert("Enter the deposit slip or reference number before preparing the batch.", "warning");
      return;
    }

    if (!bankAccount) {
      showAlert("Select the destination ERPNext bank account before preparing the batch.", "warning");
      return;
    }

    await qPrepareCashDepositBatch.run({
      deposit_batch_id: batch.deposit_batch_id,
      actor_id: actorId,
      deposit_date: depositDate,
      deposit_slip_number: slip,
      destination_bank_account: bankAccount,
      notes: null
    });

    await storeValue("cash_deposit_batch_id", batch.deposit_batch_id);
    showAlert("Deposit batch prepared.", "success");
    await this.refresh();
  },

  async confirmBatch() {
    const batch = this.selectedBatch();
    const verifierId = this.requireDonationsReviewer();

    if (!verifierId) return;

    if (!batch.deposit_batch_id || batch.status !== "prepared") {
      showAlert("Select a prepared deposit batch to confirm.", "warning");
      return;
    }

    const actualAmount = Number(inpCashDepositActualAmount.text);
    const depositDate = inpCashDepositDate.selectedDate
      ? moment(inpCashDepositDate.selectedDate).format("YYYY-MM-DD")
      : (batch.deposit_date || moment().format("YYYY-MM-DD"));
    const slip = (inpCashDepositSlipNumber.text || batch.deposit_slip_number || "").trim();

    if (!actualAmount || actualAmount <= 0) {
      showAlert("Enter the actual deposited amount before confirming.", "warning");
      return;
    }

    if (!slip) {
      showAlert("Enter the deposit slip or reference number before confirming.", "warning");
      return;
    }

    await qConfirmCashDepositBatch.run({
      deposit_batch_id: batch.deposit_batch_id,
      verifier_id: verifierId,
      actual_amount_cents: Math.round(actualAmount * 100),
      deposit_date: depositDate,
      deposit_slip_number: slip,
      notes: null
    });

    await storeValue("cash_deposit_batch_id", batch.deposit_batch_id);

    try {
      const response = await apiSyncCashDepositToERPNext.run({
        deposit_batch_id: batch.deposit_batch_id,
        mode: "test"
      });
      const result = response?.message || response || {};

      if (result.ok === true && result.status === "succeeded") {
        const erpDocument = [result.erp_doctype, result.erp_name]
          .filter(Boolean)
          .join(" ");
        showAlert(
          "Deposit batch confirmed and synchronized to ERPNext"
            + (erpDocument ? " as " + erpDocument + "." : "."),
          "success"
        );
      } else if (result.ok === true && result.status === "test_skipped") {
        showAlert(
          "Test deposit confirmed. Production ERP synchronization was intentionally skipped.",
          "info"
        );
      } else {
        showAlert(
          "Deposit batch confirmed, but ERP synchronization did not complete. "
            + "Use Retry ERP Sync after reviewing the synchronization status.",
          "warning"
        );
      }
    } catch (error) {
      showAlert(
        "Deposit batch confirmed, but the ERP synchronization request failed. "
          + "The confirmed deposit is retained and can be retried.",
        "warning"
      );
    }

    await this.refresh();
  },

  async retryERPSync() {
    const batch = this.selectedBatch();
    const reviewerId = this.requireDonationsReviewer();

    if (!reviewerId) return;

    if (!batch.deposit_batch_id || batch.status !== "confirmed") {
      showAlert("Select a confirmed deposit batch to retry ERP synchronization.", "warning");
      return;
    }

    if (batch.erp_sync_status === "succeeded") {
      showAlert("This deposit batch is already synchronized to ERPNext.", "info");
      return;
    }

    try {
      const response = await apiSyncCashDepositToERPNext.run({
        deposit_batch_id: batch.deposit_batch_id,
        mode: "test"
      });
      const result = response?.message || response || {};

      if (result.ok === true && result.status === "succeeded") {
        const erpDocument = [result.erp_doctype, result.erp_name]
          .filter(Boolean)
          .join(" ");
        showAlert(
          "ERP synchronization completed"
            + (erpDocument ? " as " + erpDocument + "." : "."),
          "success"
        );
      } else if (result.ok === true && result.status === "test_skipped") {
        showAlert("Test-mode ERP synchronization was intentionally skipped.", "info");
      } else {
        showAlert(
          "ERP synchronization did not complete. Review the synchronization status and retry when appropriate.",
          "warning"
        );
      }
    } catch (error) {
      showAlert(
        "ERP synchronization request failed. The confirmed deposit remains available for retry.",
        "error"
      );
    }

    await this.refresh();
  }
};
