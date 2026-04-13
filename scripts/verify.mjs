import { spawnSync } from "node:child_process";

const steps = [
  { label: "tests", command: ["npm", "run", "test"] },
  { label: "build", command: ["npm", "run", "build"] },
  { label: "typecheck", command: ["npm", "run", "lint"], baseline: true },
];

let hasFailure = false;

for (const step of steps) {
  console.log(`\n== Running ${step.label} ==`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status === 0) {
    console.log(`== ${step.label} passed ==`);
    continue;
  }

  hasFailure = true;
  if (step.baseline) {
    console.error(`== ${step.label} failed (existing baseline check) ==`);
  } else {
    console.error(`== ${step.label} failed ==`);
    break;
  }
}

process.exit(hasFailure ? 1 : 0);
