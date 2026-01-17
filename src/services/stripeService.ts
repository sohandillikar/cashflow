import "dotenv/config";
import { DaemoFunction } from "daemo-engine";
import { z } from "zod";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export class StripeService {
	// Helper method to group charges by time period
	private groupChargesByPeriod(
		charges: Stripe.Charge[],
		groupBy: "day" | "week" | "month",
	) {
		const grouped = new Map<string, { revenue: number; count: number }>();

		charges.forEach((charge) => {
			const date = new Date(charge.created * 1000); // Convert from Unix timestamp
			let periodKey: string;

			switch (groupBy) {
				case "day":
					periodKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
					break;
				case "week":
					// Get ISO week (Monday-based)
					const weekStart = new Date(date);
					weekStart.setDate(date.getDate() - date.getDay() + 1); // Monday
					periodKey = weekStart.toISOString().split("T")[0];
					break;
				case "month":
					periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
					break;
			}

			const existing = grouped.get(periodKey) || { revenue: 0, count: 0 };
			grouped.set(periodKey, {
				revenue: existing.revenue + charge.amount / 100,
				count: existing.count + 1,
			});
		});

		// Convert to array and sort by period
		return Array.from(grouped.entries())
			.map(([period, data]) => ({
				period,
				revenue: Math.round(data.revenue * 100) / 100,
				transactionCount: data.count,
			}))
			.sort((a, b) => a.period.localeCompare(b.period));
	}

	// Helper method to generate insights
	private generateInsights(
		periodData: Array<{
			period: string;
			revenue: number;
			transactionCount: number;
		}>,
		totalRevenue: number,
	): string[] {
		const insights: string[] = [];

		// Find best and worst performing periods
		if (periodData.length > 0) {
			const sortedByRevenue = [...periodData].sort(
				(a, b) => b.revenue - a.revenue,
			);
			const best = sortedByRevenue[0];
			const worst = sortedByRevenue[sortedByRevenue.length - 1];

			insights.push(
				`Highest revenue period: ${best.period} with $${best.revenue.toFixed(2)}`,
			);
			if (periodData.length > 1)
				insights.push(
					`Lowest revenue period: ${worst.period} with $${worst.revenue.toFixed(2)}`,
				);
		}

		// Average transaction value insight
		const avgPerPeriod =
			periodData.length > 0 ? totalRevenue / periodData.length : 0;
		insights.push(`Average revenue per period: $${avgPerPeriod.toFixed(2)}`);

		// Transaction volume insight
		const totalTransactions = periodData.reduce(
			(sum, p) => sum + p.transactionCount,
			0,
		);
		if (totalTransactions > 0)
			insights.push(
				`Processed ${totalTransactions} successful transactions during this period.`,
			);

		return insights;
	}

	@DaemoFunction({
		description:
			"Analyze revenue trends over a specified time period. Returns aggregated revenue data with insights on growth, patterns, and key metrics.",
		inputSchema: z.object({
			startDate: z.string().describe("Start date in YYYY-MM-DD format"),
			endDate: z.string().describe("End date in YYYY-MM-DD format"),
			groupBy: z
				.enum(["day", "week", "month"])
				.default("day")
				.describe("How to group the revenue data"),
		}),
		outputSchema: z.object({
			summary: z.object({
				totalRevenue: z.number().describe("Total revenue in the period"),
				transactionCount: z
					.number()
					.describe("Total number of successful transactions"),
				averageTransaction: z.number().describe("Average transaction amount"),
			}),
			periodData: z.array(
				z.object({
					period: z.string().describe("Date or period label"),
					revenue: z.number().describe("Revenue for this period"),
					transactionCount: z
						.number()
						.describe("Number of successful transactions during this period"),
				}),
			),
			insights: z.array(z.string()).describe("Key insights and observations"),
		}),
	})
	async analyzeRevenueTrends(args: {
		startDate: string;
		endDate: string;
		groupBy: "day" | "week" | "month";
	}) {
		try {
			const { startDate, endDate, groupBy } = args;

			// Convert dates to Unix timestamps (Stripe uses seconds)
			const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
			const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

			// Fetch all successful charges in the date range
			const charges: Stripe.Charge[] = [];
			let hasMore = true;
			let startingAfter: string | undefined = undefined;

			while (hasMore) {
				const response: Stripe.ApiList<Stripe.Charge> =
					await stripe.charges.list({
						created: {
							gte: startTimestamp,
							lte: endTimestamp,
						},
						limit: 100,
						starting_after: startingAfter,
					});

				// Only include successful charges
				const successfulCharges = response.data.filter(
					(charge) => charge.status === "succeeded",
				);
				charges.push(...successfulCharges);

				hasMore = response.has_more;
				if (hasMore && response.data.length > 0)
					startingAfter = response.data[response.data.length - 1].id;
			}

			// Calculate summary metrics
			const totalRevenue =
				charges.reduce((sum, charge) => sum + charge.amount, 0) / 100; // Convert from cents
			const transactionCount = charges.length;
			const averageTransaction =
				transactionCount > 0 ? totalRevenue / transactionCount : 0;

			// Group charges by period
			const groupedData = this.groupChargesByPeriod(charges, groupBy);

			// Generate insights
			const insights = this.generateInsights(groupedData, totalRevenue);

			return {
				summary: {
					totalRevenue,
					transactionCount,
					averageTransaction: Math.round(averageTransaction * 100) / 100,
				},
				periodData: groupedData,
				insights,
			};
		} catch (error) {
			console.error("Error analyzing revenue trends:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return {
				status: "error",
				message: `Failed to analyze revenue trends: ${errorMessage}`,
			};
		}
	}

	@DaemoFunction({
		description:
			"Get the current date, time, and weekday. Use this function for date or time sensitive queries, instead of assuming or guessing the date or time.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			date: z.string().describe("Current date in YYYY-MM-DD format"),
			time: z.string().describe("Current time in HH:MM:SS format (24-hour)"),
			weekday: z
				.string()
				.describe("Current day of the week (e.g., Monday, Tuesday)"),
		}),
	})
	async currentDatetime() {
		const now = new Date();
		const weekdays = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const date = now.toISOString().split("T")[0];
		const time = now.toTimeString().split(" ")[0];
		const weekday = weekdays[now.getDay()];
		return {
			date,
			time,
			weekday,
		};
	}
}