export default {
  MAX_BUCKETS: 120,

  metricOptions() {
    return [
      { label: "Agreements signed", value: "agreements_signed" },
      { label: "Releases sent", value: "releases_sent" },
      { label: "Number of donations received", value: "donations_count" },
      { label: "Dollars in donations received", value: "donations_dollars" },
      { label: "Member-linked donation count", value: "member_donations_count" },
      { label: "Member-linked donation dollars", value: "member_donations_dollars" },
      { label: "Anonymous cash donation count", value: "anonymous_donations_count" },
      { label: "Anonymous cash donation dollars", value: "anonymous_donations_dollars" },
      { label: "Members created", value: "members_created" },
    ];
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
    const selected = msReportMetrics.selectedOptionValues || [];
    return selected.length
      ? selected
      : this.metricOptions().map(x => x.value);
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
		if (documents && donations) return "Scope: all members and donations";
		if (donations) return "Scope: all donations; assigned members for other metrics";
		if (documents) return "Scope: all members; anonymous cash recorded by you";
		return "Scope: assigned members and anonymous cash recorded by you";
	},
	
	async verifyaccess() {
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

			if (!me?.member_id) {
				showAlert("Access denied: not an active facilitator.", "error");

				if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
					navigateTo("Unauthorized", {}, "SAME_WINDOW");
				}

				return false;
			}

			await storeValue("facilitator_id", me.member_id);
			await storeValue("facilitator_email", (me.email || "").trim().toLowerCase());
			await storeValue("facilitator_is_reviewer", !!me.is_document_reviewer);
			await storeValue("facilitator_is_donations_reviewer", !!me.is_donations_reviewer);
			await storeValue(
				"facilitator_full_name",
				`${me.first_name || ""} ${me.last_name || ""}`.trim()
			);

			return true;
		} catch (e) {
			showAlert("Access check failed: " + (e?.message || e), "error");

			if (appsmith.mode === "DEPLOYED" || appsmith.mode === "PUBLISHED") {
				navigateTo("Unauthorized", {}, "SAME_WINDOW");
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
    const rows = qReportTimeSeries.data || [];
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
    return (qReportTimeSeries.data || [])
      .filter(r => r.metric_key === metricKey)
      .reduce((sum, r) => sum + Number(r.value || 0), 0);
  },
};