import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL(
  "../pages/Facilitator Functions/" + path, import.meta.url
), "utf8");
const listPath = "widgets/lstAssignStorageLocation/";
const list = JSON.parse(read(listPath + "lstAssignStorageLocation.json"));
const label = JSON.parse(read(listPath + "ContainerAssignStorageLocation/txtAssignStorageLocation.json"));
const appsmith = { store: { facilitator_is_reviewer: true } };
let loads = 0;
const assignments = [];
const context = vm.createContext({
  appsmith,
  storeValue: async (key, value) => { appsmith.store[key] = value; },
  showAlert: () => {},
  qMemberById: { data: [], run: async () => {} },
  qMemberStorageLocations: { run: async () => {} },
  qAssignedParticipants: { run: async () => {} },
  qParticipantCandidates: { run: async () => {} },
  qDistinctStorageLocationNames: {
    run: async () => { loads++; },
    data: [
      { storage_location_name: " Shelf A " },
      { storage_location_name: "Shelf A" },
      { storage_location_name: "Cabinet" },
      { storage_location_name: "" },
      { storage_location_name: null },
      null,
    ],
  },
  qAssignMemberStorageLocation: { run: async input => { assignments.push(input); } },
  navigationLabels: { text: text => text },
  inpAssignStorageLocation: { text: "", setValue: value => { context.inpAssignStorageLocation.text = value; } },
  inpAssignStorageLocationNotes: { text: "" },
});
const evaluate = binding => vm.runInContext(binding.slice(2, -2), context);
const suggestions = () => Array.from(evaluate(list.listData), row => row.name);
vm.runInContext(
  read("jsobjects/facilitatorFlows/facilitatorFlows.js").replace(/^export default/m, "globalThis.facilitatorFlows ="),
  context,
);
const flows = context.facilitatorFlows;
flows.auditLog = async () => {};

await flows.setSelectedFacilitatorId("practitioner-a");
assert.equal(loads, 1, "load reviewer-scoped locations on first selection");
context.qMemberById.data = [{ member_id: "practitioner-a", is_facilitator: true }];
assert.equal(evaluate(list.isVisible), true);
assert.deepEqual(suggestions(), ["Cabinet", "Shelf A"]);
context.inpAssignStorageLocation.text = "sHe";
assert.deepEqual(suggestions(), ["Shelf A"]);
context.currentItem = evaluate(list.listData)[0];
assert.equal(evaluate(label.text), "Shelf A");
evaluate(list.onItemClick);
assert.equal(context.inpAssignStorageLocation.text, "Shelf A");

await flows.setSelectedFacilitatorId("practitioner-b");
assert.deepEqual(suggestions(), [], "hide suggestions while the previous practitioner is still loaded");
await flows.assignStorageLocation();
assert.equal(assignments.length, 0, "reject assignment during a stale selection");
context.qMemberById.data = [{ member_id: "practitioner-b", is_facilitator: true }];
context.inpAssignStorageLocation.text = " New location ";
assert.deepEqual(suggestions(), []);
await flows.assignStorageLocation();
assert.equal(assignments[0].storage_location_name, "New location");

context.qDistinctStorageLocationNames.data = undefined;
assert.deepEqual(suggestions(), []);
appsmith.store.facilitator_is_reviewer = false;
assert.equal(evaluate(list.isVisible), false);
assert.deepEqual(suggestions(), []);
console.log("PASS reviewer storage suggestions, row selection, stale selection guard and manual assignment");
