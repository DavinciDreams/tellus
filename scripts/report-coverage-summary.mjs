import { appendFile, readFile } from "node:fs/promises";
import process from "node:process";

const summary = JSON.parse(await readFile("coverage/coverage-summary.json", "utf8")).total;
const rows = ["statements", "branches", "functions", "lines"].map((metric) =>
  `| ${metric[0].toUpperCase()}${metric.slice(1)} | ${summary[metric].pct.toFixed(2)}% |`,
);
const markdown = [
  "## Test coverage",
  "",
  "| Metric | Coverage |",
  "| --- | ---: |",
  ...rows,
  "",
].join("\n");

process.stdout.write(markdown);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}
