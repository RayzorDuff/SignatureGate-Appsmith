export default {

	async initialize() {
		await qTerminologyAccess.run();
		await qTerminology.run();
	}

}
