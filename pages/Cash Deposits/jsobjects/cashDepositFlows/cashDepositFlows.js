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
    const selected = tblCashDepositBatches.selectedRow || {};
    if (selected.deposit_batch_id) return selected;
    const storedId = String(appsmith.store.cash_deposit_batch_id || "").trim();
    return (qCashDepositBatches.data || []).find(
      row => row.deposit_batch_id === storedId
    ) || {};
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
      deposit_date: inpCashDepositDate.selectedDate || moment().format("YYYY-MM-DD"),
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

    showAlert("Cash donation added to the deposit batch.", "success");
    await this.refresh();
  },

  async prepareBatch() {
    const batch = this.selectedBatch();
    const actorId = this.requireFacilitator();

    if (!actorId) return;

    if (!batch.deposit_batch_id || batch.status !== "draft") {
      showAlert("Select a draft deposit batch to prepare.", "warning");
      return;
    }

    const slip = (inpCashDepositSlipNumber.text || "").trim();
    const bankAccount = (inpCashDepositBankAccount.text || "").trim();
    const depositDate = inpCashDepositDate.selectedDate || moment().format("YYYY-MM-DD");

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
    const depositDate = inpCashDepositDate.selectedDate || batch.deposit_date || moment().format("YYYY-MM-DD");
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

    showAlert("Deposit batch confirmed.", "success");
    await this.refresh();
  }
};
