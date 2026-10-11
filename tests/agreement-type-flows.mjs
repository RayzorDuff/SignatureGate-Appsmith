import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../pages/Agreement Templates/jsobjects/agreementTemplateFlows/agreementTemplateFlows.js', import.meta.url), 'utf8');
function fixture(overrides = {}) {
  const calls = { writes: [], alerts: [], resets: [], activeRefreshes: 0, adminRefreshes: 0, stores: {} };
  const actor = { person_id: 'reviewer-person', member_id: null, email: 'reviewer@example.test', first_name: 'Test', last_name: 'Reviewer', is_document_reviewer: true };
  const context = {
    appsmith: { user: { email: actor.email }, store: {}, mode: 'EDIT', URL: {} },
    qCurrentFacilitator: { data: [actor], run: async () => [actor] },
    qAuditLogInsert: { run: async () => [] },
    qAgreementTemplatesList: { run: async () => [] },
    qAgreementTypesList: { run: async () => { calls.activeRefreshes++; return []; } },
    qAgreementTypesAdminList: { data: [], run: async () => { calls.adminRefreshes++; return []; } },
    qCreateAgreementType: { run: async params => { calls.writes.push(params); return [params]; } },
    inpAgreementTypeKey: { text: ' New_Type ' },
    inpAgreementTypeName: { text: ' New Type ' },
    inpAgreementTypeOrder: { text: '100' },
    inpAgreementTypeActive: { isChecked: true },
    inpAgreementTypeDescription: { text: ' Description ' },
    showAlert: (message, level) => calls.alerts.push({ message, level }),
    resetWidget: (name, children) => calls.resets.push({ name, children }),
    storeValue: async (key, value) => { calls.stores[key] = value; },
    navigateTo: () => { throw new Error('Unexpected navigation'); },
    console, setTimeout, ...overrides
  };
  const flows = vm.runInNewContext(source.replace(/^export default/, 'globalThis.flows ='), context);
  return { flows, context, calls };
}

{
  const { flows, calls } = fixture();
  await flows.verifyaccess();
  assert.equal(calls.stores.facilitator_id, '', 'canonical reviewer needs no member ID and clears stale compatibility ID');
  assert.equal(calls.stores.facilitator_is_reviewer, true);
  assert.equal(calls.activeRefreshes, 1);
  assert.equal(calls.adminRefreshes, 1);
}
{
  const { flows, calls } = fixture();
  const created = await flows.createAgreementTypeFromForm();
  assert.equal(created.type_key, 'new_type');
  assert.equal(calls.writes[0].display_name, 'New Type');
  assert.equal(calls.writes[0].sort_order, 100);
  assert.equal(calls.writes[0].description, 'Description');
  assert.equal(Object.hasOwn(calls.writes[0], 'actor_email'), false, 'actor comes directly from signed-in email in SQL action');
  assert.equal(calls.resets[0].name, 'frmNewAgreementType');
  assert.equal(calls.activeRefreshes, 1);
  assert.equal(calls.adminRefreshes, 1);
  assert.equal(calls.alerts.at(-1).level, 'success');
}
for (const [widget, value] of [
  ['inpAgreementTypeKey', '1invalid'], ['inpAgreementTypeKey', 'a'.repeat(65)],
  ['inpAgreementTypeName', '   '], ['inpAgreementTypeOrder', ''],
  ['inpAgreementTypeOrder', '1.5'], ['inpAgreementTypeOrder', '2147483648'],
  ['inpAgreementTypeOrder', '-2147483649']
]) {
  const { flows, calls } = fixture({ [widget]: { text: value } });
  assert.equal(await flows.createAgreementTypeFromForm(), null);
  assert.equal(calls.writes.length, 0, `${widget}=${value} must not write`);
  assert.equal(calls.resets.length, 0);
}
{
  const { flows, calls } = fixture({ qAgreementTypesAdminList: { data: [{ type_key: 'NEW_TYPE', active: false }] } });
  assert.equal(await flows.createAgreementTypeFromForm(), null, 'inactive or differently cased existing keys cannot be duplicated');
  assert.equal(calls.writes.length, 0);
}
{
  const { flows, calls } = fixture({ qCurrentFacilitator: { data: [{ is_document_reviewer: false }] } });
  assert.equal(await flows.createAgreementTypeFromForm(), null);
  assert.equal(calls.writes.length, 0);
}
{
  const { flows, calls } = fixture({ qCreateAgreementType: { run: async () => { throw new Error('permission denied'); } } });
  assert.equal(await flows.createAgreementTypeFromForm(), null);
  assert.equal(calls.resets.length, 0, 'failed creation preserves form input');
  assert.match(calls.alerts.at(-1).message, /permission denied/);
}
{
  const { flows, calls } = fixture({ inpAgreementTypeActive: { isChecked: false }, inpAgreementTypeOrder: { text: '-10' } });
  assert.equal((await flows.createAgreementTypeFromForm()).active, false);
  assert.equal(calls.writes[0].sort_order, -10);
  assert.match(calls.alerts.at(-1).message, /as inactive/);
}
{
  const { flows, calls } = fixture({ qAgreementTypesList: { run: async () => { throw new Error('offline'); } } });
  assert.equal((await flows.createAgreementTypeFromForm()).type_key, 'new_type');
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.resets.length, 1);
  assert.match(calls.alerts.at(-1).message, /was created, but the selectors could not refresh/);
  assert.equal(calls.alerts.at(-1).level, 'warning');
}
console.log('PASS Agreement Type flow validation, canonical nonmember access, creation, denial and refresh recovery');
