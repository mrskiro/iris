import { chromium } from "playwright";

/**
 * YYYYMM
 */
const date = (() => {
	const [month] = process.argv.slice(2);
	if (!month) {
		return new Date().toISOString().slice(0, 7).replace(/-/g, "");
	}
	return month.split("=")[1];
})();

(async () => {
	console.log("EMAIL", process.env.EMAIL?.length ?? 0);
	if (
		!process.env.EMAIL ||
		!process.env.PASSWORD ||
		!process.env.LINE_ACCESS_TOKEN
	) {
		process.exit(1);
	}

	const b = await chromium.launch();
	const ctx = await b.newContext();
	const page = await ctx.newPage();

	await page.goto("https://id.zaim.net/");

	await page
		.getByRole("textbox", { name: "メールアドレス・ID" })
		.fill(process.env.EMAIL);
	await page
		.getByRole("textbox", { name: "パスワード" })
		.fill(process.env.PASSWORD);

	await page.getByRole("button", { name: "ログイン" }).click();

	const waitResponse = page.waitForResponse(
		`https://zaim.net/money/details?month=${date}`,
	);

	await page.goto(`https://zaim.net/money?month=${date}`);
	const res = await waitResponse;

	const json = (await res.json()) as {
		items: {
			mode: string;
			calc_desc: string;
			amount: number;
			category_name: string;
		}[];
	};

	const items = json.items.filter((v) => v.calc_desc !== "常に含めない");

	const income = items.reduce((prev, curr) => {
		if (curr.mode !== "income") {
			return prev;
		}
		return prev + curr.amount;
	}, 0);
	const payment = items.reduce((prev, curr) => {
		if (curr.mode !== "payment") {
			return prev;
		}
		return prev + curr.amount;
	}, 0);

	const aggregatedPayment = items.reduce<Record<string, number>>(
		(prev, curr) => {
			if (curr.mode === "income") {
				return prev;
			}

			if (prev[curr.category_name]) {
				prev[curr.category_name] += curr.amount;
			} else {
				prev[curr.category_name] = curr.amount;
			}
			return prev;
		},
		{},
	);

	await ctx.close();
	await b.close();

	await fetch("https://api.line.me/v2/bot/message/broadcast", {
		body: JSON.stringify({
			messages: [
				{
					type: "flex",
					altText: `${formatDate(date)}のレポート💰`,
					contents: {
						type: "bubble",
						body: {
							type: "box",
							layout: "vertical",
							borderWidth: "bold",
							borderColor: "#A98EED",
							cornerRadius: "xl",
							contents: [
								{
									type: "box",
									layout: "vertical",
									contents: [
										{
											type: "text",
											text: "💰レポート",
											weight: "bold",
										},
										{
											type: "text",
											text: formatDate(date),
											size: "xs",
											color: "#aaaaaa",
										},
									],
									spacing: "sm",
								},
								{
									type: "separator",
									margin: "lg",
								},
								{
									type: "box",
									layout: "vertical",
									margin: "lg",
									spacing: "sm",
									contents: Object.entries(aggregatedPayment).map(
										([key, value]) => {
											return {
												type: "box",
												layout: "horizontal",
												contents: [
													{
														type: "text",
														text: key,
														size: "sm",
														color: "#555555",
														flex: 0,
													},
													{
														type: "text",
														text: `${value}円`,
														size: "sm",
														color: "#111111",
														align: "end",
													},
												],
											};
										},
									),
								},

								{
									type: "separator",
									margin: "lg",
								},
								{
									type: "box",
									layout: "horizontal",
									margin: "lg",
									spacing: "sm",
									contents: [
										{
											type: "text",
											text: "収入",
											size: "sm",
											color: "#555555",
											flex: 0,
										},
										{
											type: "text",
											text: `${income}円`,
											size: "sm",
											color: "#111111",
											align: "end",
										},
									],
								},
								{
									type: "box",
									layout: "horizontal",
									contents: [
										{
											type: "text",
											text: "支出",
											size: "sm",
											color: "#555555",
											flex: 0,
										},
										{
											type: "text",
											text: `${payment}円`,
											size: "sm",
											color: "#111111",
											align: "end",
										},
									],
								},
								{
									type: "box",
									layout: "horizontal",
									contents: [
										{
											type: "text",
											text: "差額",
											size: "sm",
											color: "#555555",
											flex: 0,
										},
										{
											type: "text",
											text: `${income - payment}円`,
											size: "sm",
											color: "#111111",
											align: "end",
										},
									],
								},
							],
						},
					},
				},
			],
		}),
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}`,
			"Content-Type": "application/json",
		},
	});
})();

function formatDate(input: string) {
	const year = input.slice(0, 4);
	const month = input.slice(4);
	const monthString = month.replace(/^0+/, "");
	const formattedDate = `${year}年${monthString}月`;
	return formattedDate;
}
