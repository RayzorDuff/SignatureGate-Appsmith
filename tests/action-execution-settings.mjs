// Validate deliberate execution choices against Appsmith v2.4.2's explicit-choice contract.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const guarded = [["Cash Deposits", "apiCashDepositBankAccounts"], ["Contributor Functions", "qMemberDonations"], ["Contributor Functions", "qMembersDirectory"], ["Contributor Functions", "qPendingGivebutterDonations"], ["Facilitator Functions", "apiAvailableStorageProducts"], ["Facilitator Functions", "qAssignedParticipants"], ["Facilitator Functions", "qListFacilitators"], ["Facilitator Functions", "qLocationNameSuggestions"], ["Facilitator Functions", "qMemberById"], ["Facilitator Functions", "qMemberStorageLocations"], ["Facilitator Functions", "qParticipantCandidates"], ["Member Functions", "qAgreementTemplatesByType"], ["Member Functions", "qAgreementTypesList"], ["Member Functions", "qListFacilitators"], ["Member Functions", "qMemberAgreements"], ["Member Functions", "qMemberEmails"], ["Member Functions", "qMemberFacilitators"], ["Member Functions", "qMemberReleases"], ["Member Functions", "qMembersDirectory"], ["Sacrament Release", "apiListAvailableProducts"], ["Sacrament Release", "qAccessibleStorageLocations"], ["Sacrament Release", "qGateCheckAgreement"], ["Sacrament Release", "qListFacilitators"], ["Sacrament Release", "qMembersDirectory"], ["Cash Deposits", "cashDepositFlows-clearDisposition"], ["Cash Deposits", "cashDepositFlows-openDisposition"], ["Cash Deposits", "cashDepositFlows-submitDisposition"], ["Cash Deposits", "qExcludeCashDonation"], ["Cash Deposits", "qReviveCashDonation"]];
for (const [page, action] of guarded) {
 const metadata=JSON.parse(fs.readFileSync(new URL('../pages/'+page+'/queries/'+action+'/metadata.json',import.meta.url),'utf8'));
 const state=metadata.unpublishedAction;
 assert.equal(state.runBehaviour,'MANUAL',page+'/'+action+' must be explicitly invoked after authorization');
 assert.equal(state.userSetOnLoad,true,page+'/'+action+' must preserve the deliberate choice across dependency recalculation');
}
console.log('PASS '+guarded.length+' guarded/manual choices explicitly pinned, including bank and inventory APIs and reconciliation writes');
