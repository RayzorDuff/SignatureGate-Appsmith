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
		await Promise.allSettled([
			qMemberStorageLocations?.run?.(), 
			qDistinctStorageLocationNames?.run?.(),
			
		]);

		const initialMemberId =
			String(appsmith.store.member_id || "").trim() ||
			String(appsmith.URL.queryParams.member_id || "").trim();

		if (initialMemberId) {
			await storeValue("member_id", initialMemberId);
		}

	},
	
	async assignStorageLocation() {
		try {
			if (!appsmith.store.facilitator_is_reviewer) {
				showAlert("Only document reviewers can assign storage locations.", "error");
				return;
			}

			const member = qMemberById.data?.[0];

			if (!member?.member_id) {
				showAlert("No member selected.", "error");
				return;
			}

			if (!member?.is_facilitator) {
				showAlert("Storage locations can only be assigned to members who are facilitators.", "warning");
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
				member.member_id,
				{
					facilitator_id: member.member_id,
					storage_location_name: storageLocationName.trim(),
					assigned_by_member_id: appsmith.store.facilitator_id,
					page: "Members - Profile",
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
				appsmith.store.member_id,
				{
					facilitator_id: appsmith.store.member_id,
					facilitator_storage_location_access_id,
					storage_location_name,
					removed_by_member_id: appsmith.store.facilitator_id,
					page: "Members - Profile"
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