export default {
  MAX_BUCKETS: 120,

  metricOptions() {
    const options = [
      { label: "Agreements signed", value: "agreements_signed" },
      { label: "Releases sent", value: "releases_sent" },
      { label: "Number of donations received", value: "donations_count" },
      { label: "Dollars in donations received", value: "donations_dollars" },
      { label: "Participant-linked donation count", value: "member_donations_count" },
      { label: "Participant-linked donation dollars", value: "member_donations_dollars" },
      { label: "Anonymous cash donation count", value: "anonymous_donations_count" },
      { label: "Anonymous cash donation dollars", value: "anonymous_donations_dollars" },
      { label: "Individual contributor donation count", value: "individual_donations_count" },
      { label: "Individual contributor donation dollars", value: "individual_donations_dollars" },
      { label: "Company contributor donation count", value: "organization_donations_count" },
      { label: "Company contributor donation dollars", value: "organization_donations_dollars" },
      { label: "Unresolved donation count", value: "unresolved_donations_count" },
      { label: "Unresolved donation dollars", value: "unresolved_donations_dollars" },
      { label: "Participants created", value: "members_created" },
    ];

    const donationMetrics = new Set([
      "donations_count",
      "donations_dollars",
      "member_donations_count",
      "member_donations_dollars",
      "anonymous_donations_count",
      "anonymous_donations_dollars",
      "individual_donations_count", "individual_donations_dollars",
      "organization_donations_count", "organization_donations_dollars",
      "unresolved_donations_count", "unresolved_donations_dollars",
    ]);

    return options.filter(
      option =>
        !donationMetrics.has(option.value) ||
        (appsmith.store.reports_actor_email === String(appsmith.user?.email || "").trim().toLowerCase()
          && appsmith.store.facilitator_is_donations_reviewer === true)
    );
  },

  bucketOptions() {
    return [
      { label: "Day", value: "day" },
      { label: "Week", value: "week" },
      { label: "Month", value: "month" },
      { label: "Year", value: "year" },
    ];
  },

  selectedMetricKeys() {
    const allowed = this.metricOptions().map(x => x.value);
    const selected = msReportMetrics.selectedOptionValues || [];
    return selected.length ? selected.filter(key => allowed.includes(key)) : allowed;
  },

  selectedMetricKeysJson() {
    return JSON.stringify(this.selectedMetricKeys());
  },

  normalizeBucket() {
    const v = String(selReportBucket.selectedOptionValue || "month").toLowerCase();
    return ["day", "week", "month", "year"].includes(v) ? v : "month";
  },

  normalizePeriods() {
    const n = Number(inpReportPeriods.text || 12);
    if (!Number.isFinite(n)) return 12;
    return Math.max(1, Math.min(Math.floor(n), this.MAX_BUCKETS));
  },

  hasCustomRange() {
    return !!(dpReportStart.selectedDate && dpReportEnd.selectedDate);
  },

	scopeLabel() {
		const documents = appsmith.store.facilitator_is_reviewer === true;
		const donations = appsmith.store.facilitator_is_donations_reviewer === true;
		if (documents && donations) return "Scope: all participants and donations";
		if (donations) return "Scope: all donations; assigned participants for other metrics";
		if (documents) return "Scope: all participants; donation financials restricted";
		return "Scope: assigned participants; donation financials restricted";
	},
	
	async verifyaccess() {
    // Clear prior page/account state before accepting the current canonical actor.
    await Promise.all([
      storeValue("reports_actor_email", ""),
      storeValue("facilitator_id", ""),
      storeValue("facilitator_email", ""),
      storeValue("facilitator_is_reviewer", false),
      storeValue("facilitator_is_donations_reviewer", false),
      storeValue("facilitator_full_name", "")
    ]);
		try {
			let email = null;

			for (let i = 0; i < 20; i++) {
				email = (appsmith.user?.email || "").trim().toLowerCase();
				if (email) break;
				await new Promise(r => setTimeout(r, 150));
			}

			if (!email) {
				showAlert("Unknown user: appsmith.user.email not available.", "error");
				return false;
			}

			let rows = await qCurrentFacilitator.run({ email });
			if (!Array.isArray(rows)) rows = [];

			const me = rows[0];

			if (!me?.person_id || !(me.is_practitioner === true || me.is_document_reviewer === true || me.is_donations_reviewer === true)) {
				showAlert("Access denied: practitioner or reviewer permission required.", "error");

				if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
					/* Access denied in place; keep navigation available. */
				}

				return false;
			}

			await storeValue("facilitator_id", me.member_id || "");
			await storeValue("facilitator_email", (me.email || "").trim().toLowerCase());
			await storeValue("facilitator_is_reviewer", !!me.is_document_reviewer);
			await storeValue("facilitator_is_donations_reviewer", !!me.is_donations_reviewer);
			await storeValue(
				"facilitator_full_name",
				`${me.first_name || ""} ${me.last_name || ""}`.trim()
			);

			await storeValue("reports_actor_email", email);
			return true;
		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");

			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
				/* Access denied in place; keep navigation available. */
			}

			return false;
		}
	},

  validateInputs() {
    const selected = this.selectedMetricKeys();

    if (!selected.length) {
      showAlert("Select at least one data set.", "warning");
      return false;
    }

    const periods = this.normalizePeriods();

    if (periods > this.MAX_BUCKETS) {
      showAlert(`Please limit the report to ${this.MAX_BUCKETS} buckets or fewer.`, "warning");
      return false;
    }

    if (this.hasCustomRange()) {
      const start = new Date(dpReportStart.selectedDate);
      const end = new Date(dpReportEnd.selectedDate);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        showAlert("Invalid start or end date.", "warning");
        return false;
      }

      if (start > end) {
        showAlert("Start date must be before end date.", "warning");
        return false;
      }
    }

    return true;
  },

  async run() {
    const ok = await this.verifyaccess();
    if (!ok) return [];

    if (!this.validateInputs()) return [];

    const params = {
      bucket: this.normalizeBucket(),
      periods: String(this.normalizePeriods()),
      start_date: this.hasCustomRange() ? dpReportStart.selectedDate : "",
      end_date: this.hasCustomRange() ? dpReportEnd.selectedDate : "",
      metric_keys_json: this.selectedMetricKeysJson(),
    };

    return qReportTimeSeries.run(params);
  },

  chartOptions() {
    const sameActor = appsmith.store.reports_actor_email === String(appsmith.user?.email || "").trim().toLowerCase();
    const rows = sameActor ? (qReportTimeSeries.data || []) : [];
    const metricKeys = this.selectedMetricKeys();
    const metricMeta = Object.fromEntries(
      this.metricOptions().map(x => [x.value, x])
    );

    const bucketLabels = [...new Set(rows.map(r => r.bucket_label))];

    const series = metricKeys.map(metricKey => {
      const meta = metricMeta[metricKey] || { label: metricKey, value: metricKey };

      return {
        name: meta.label,
        type: "bar",
        data: bucketLabels.map(label => {
          const row = rows.find(
            r => r.bucket_label === label && r.metric_key === metricKey
          );

          return Number(row?.value || 0);
        }),
      };
    });

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
      },
      legend: {
        type: "scroll",
        top: 0,
      },
      grid: {
        left: 70,
        right: 30,
        bottom: bucketLabels.length > 16 ? 90 : 50,
        top: 60,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: bucketLabels,
        axisLabel: {
          rotate: bucketLabels.length > 16 ? 45 : 0,
        },
      },
      yAxis: {
        type: "value",
      },
      series,
    };
  },

  totalFor(metricKey) {
    if (appsmith.store.reports_actor_email !== String(appsmith.user?.email || "").trim().toLowerCase()
        || !this.metricOptions().some(option => option.value === metricKey)) return 0;
    return (qReportTimeSeries.data || [])
      .filter(r => r.metric_key === metricKey)
      .reduce((sum, r) => sum + Number(r.value || 0), 0);
  },
};