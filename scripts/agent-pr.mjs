#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const configPath = path.join(cwd, 'scripts', 'agents.config.json');

function fail(message) {
  console.error(`[agent-pr] ${message}`);
  process.exit(1);
}

function runGit(args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function runGh(args) {
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const args = process.argv.slice(2);
const approvedFlag = '--approved';
const hasApproval = args.includes(approvedFlag);
const filtered = args.filter((arg) => arg !== approvedFlag);

if (!hasApproval) {
  fail('Refusing to create PR without explicit approval. Re-run with --approved.');
}

if (filtered.length < 2) {
  fail('Usage: node scripts/agent-pr.mjs <agent> "<title>" [base=main] --approved');
}
const agent = filtered[0];
let title = '';
let baseArg = '';
if (filtered.length === 2) {
  title = filtered[1];
} else {
  title = filtered.slice(1, -1).join(' ');
  baseArg = filtered[filtered.length - 1];
}

if (!fs.existsSync(configPath)) {
  fail(`Missing config file: ${configPath}`);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const agentConfig = config.agents?.[agent];
if (!agentConfig) {
  const keys = Object.keys(config.agents || {}).join(', ');
  fail(`Unknown agent "${agent}". Valid agents: ${keys}`);
}

const defaultBase = config.defaultBaseBranch || 'main';
const base = baseArg || defaultBase;
const expectedPrefix = `agent/${agent}/`;
const currentBranch = runGit(['branch', '--show-current']);

if (!currentBranch.startsWith(expectedPrefix)) {
  fail(`Current branch "${currentBranch}" must start with "${expectedPrefix}".`);
}

let upstream = '';
try {
  upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
} catch {
  fail(`No upstream configured for branch "${currentBranch}". Push with: git push -u origin ${currentBranch}`);
}
const aheadRaw = runGit(['rev-list', '--left-right', '--count', `${upstream}...HEAD`]);
const [, aheadStr] = aheadRaw.split('\t');
const aheadCount = Number.parseInt(aheadStr, 10);
if (Number.isNaN(aheadCount)) {
  fail('Could not determine ahead/behind status for branch.');
}
if (aheadCount > 0) {
  fail(`Branch has ${aheadCount} unpushed commit(s). Push before creating PR.`);
}

const repoStatus = runGit(['status', '--porcelain']);
if (repoStatus.length > 0) {
  fail('Working tree has uncommitted changes. Commit/stash before creating PR.');
}

const prTitle = `[${agent}] ${title}`;
const body = [
  `## Agent Source`,
  `- Agent: ${agent}`,
  `- Commit identity: ${agentConfig.name} <${agentConfig.email}>`,
  '',
  `## Approval`,
  `- Owner approval marker: approved`,
  '',
  `## Validation Checklist`,
  `- [ ] Relevant tests run`,
  `- [ ] Lint/type-check completed if applicable`,
  `- [ ] Risk/rollback notes documented`,
].join('\n');

try {
  const output = runGh(['pr', 'create', '--base', base, '--head', currentBranch, '--title', prTitle, '--body', body]);
  console.log(output);
} catch (error) {
  const stderr = error.stderr?.toString?.().trim();
  if (stderr) {
    fail(stderr);
  }
  fail(error.message);
}
