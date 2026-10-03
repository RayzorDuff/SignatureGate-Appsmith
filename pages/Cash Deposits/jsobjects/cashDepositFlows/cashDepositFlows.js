export default {

  async refresh() {
    await Promise.allSettled([
      qCashDepositCurrentFacilitator.run(),
      qCashDepositCashOnHand.run(),
      qCashDepositBatches.run()
    ]);
  },

  facilitatorId() {
    return qCashDepositCurrentFacilitator.data?.[0]?.member_id
      || appsmith.store.facilitator_id
      || "";
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
    return qCashDepositCurrentFacilitator.data?.[0]?.is_donations_reviewer === true
      || appsmith.store.facilitator_is_donations_reviewer === true;
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
      showAlert("You must be an active Spiritual Practitioner to manage cash deposits.", "error");
      return "";
    }
    return id;
  },

  async setHideIneligible(checked) {
    await storeValue("cash_deposit_hide_ineligible", checked !== false);
    await qCashDepositCashOnHand.run();
  },

  async excludeDonationFromReconciliation() {
    const donation = this.selectedDonation();
    const reviewerId = this.requireDonationsReviewer();

    if (!reviewerId) return;

    if (!donation.donation_id) {
      showAlert("Select a cash donation to exclude from deposit reconciliation.", "warning");
      return;
    }

    if (donation.operational_status !== "cash_on_hand") {
      showAlert("Only a Cash on Hand donation can be excluded from deposit reconciliation.", "warning");
      return;
    }

    await qExcludeCashDonation.run({
      donation_id: donation.donation_id,
      actor_id: reviewerId,
      reason: "Historical cash donation could not be reconciled to a physical deposit.",
      notes: "Excluded from future cash-deposit batching; original donation record retained."
    });

    showAlert("Cash donation excluded from deposit reconciliation.", "success");
    await qCashDepositCashOnHand.run();
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
    const preparerId = this.requireFacilitator();
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
    const actorId = this.requireFacilitator();

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
    const actorId = this.requireFacilitator();

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
    const bankAccount = (inpCashDepositBankAccount.text || "").trim();
    const depositDate = inpCashDepositDate.selectedDate
      ? moment(inpCashDepositDate.selectedDate).format("YYYY-MM-DD")
      : moment().format("YYYY-MM-DD");

    if (!slip) {
      showAlert("Enter the deposit slip or reference number before preparing the batch.", "warning");
      return;
    }

    if (!bankAccount) {
      showAlert("Enter the destination bank account before preparing the batch.", "warning");
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
    showAlert("Deposit batch confirmed.", "success");
    await this.refresh();
  }
};
