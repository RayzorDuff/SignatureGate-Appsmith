export default {

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
		const selectedId =
			String(appsmith.store.selected_facilitator_id || appsmith.store.facilitator_id || "").trim();

		if (!selectedId) return [];

		await storeValue("selected_facilitator_id", selectedId);

		return Promise.allSettled([
			qMemberById.run(),
			qMemberStorageLocations.run(),
			qDistinctStorageLocationNames.run()
		]);
	},

	async setSelectedFacilitatorId(value) {
		const selectedId = String(value || "").trim();
		await storeValue("selected_facilitator_id", selectedId || null);

		if (!selectedId) {
			return null;
		}

		await Promise.allSettled([
			qMemberById.run(),
			qMemberStorageLocations.run()
		]);

		return selectedId;
	},
	
	async assignStorageLocation() {
		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert("Only document reviewers can assign storage locations.", "error");
				return;
			}

			const facilitator = qMemberById.data?.[0];

			if (!facilitator?.member_id) {
				showAlert("No facilitator selected.", "error");
				return;
			}

			if (!facilitator?.is_facilitator) {
				showAlert("The selected person is not an active facilitator.", "warning");
				return;
			}

			const storageLocationName =
				inpAssignStorageLocation?.text ||
				"";

			const notes = inpAssignStorageLocationNotes?.text || "";

			if (!storageLocationName.trim()) {
				showAlert("Enter or select a storage location.", "warning");
				return;
			}

			const res = await qAssignMemberStorageLocation.run({
				storage_location_name: storageLocationName.trim(),
				notes
			});

			await facilitatorFlows.auditLog(
				"facilitator_storage_location.assigned",
				"member",
				facilitator.member_id,
				{
					facilitator_id: facilitator.member_id,
					storage_location_name: storageLocationName.trim(),
					assigned_by_member_id: appsmith.store.facilitator_id,
					page: "Facilitator Functions",
					notes
				}
			);

			showAlert("Storage location assigned.", "success");

			await Promise.allSettled([
				qMemberStorageLocations.run(),
				qDistinctStorageLocationNames?.run?.()
			]);

			return res;
		} catch (e) {
			showAlert("Failed to assign storage location: " + (e?.message || e), "error");
			throw e;
		}
	},
	
	async removeStorageLocation (facilitator_storage_location_access_id, storage_location_name) {
		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert("Only document reviewers can remove storage locations.", "error");
				return;
			}

			if (!facilitator_storage_location_access_id) {
				showAlert("No storage location assignment selected.", "warning");
				return;
			}

			const res = await qDeactivateMemberStorageLocati.run({
				facilitator_storage_location_access_id,
				notes: "Removed by " + (appsmith.store.facilitator_full_name || "reviewer")
			});

			await facilitatorFlows.auditLog(
				"facilitator_storage_location.removed",
				"member",
				appsmith.store.selected_facilitator_id || appsmith.store.facilitator_id,
				{
					facilitator_id: appsmith.store.selected_facilitator_id || appsmith.store.facilitator_id,
					facilitator_storage_location_access_id,
					storage_location_name,
					removed_by_member_id: appsmith.store.facilitator_id,
					page: "Facilitator Functions"
				}
			);

			showAlert("Storage location removed.", "success");
			await qMemberStorageLocations.run();

			return res;
		} catch (e) {
			showAlert("Failed to remove storage location: " + (e?.message || e), "error");
			throw e;
		}
	},
	
		
}