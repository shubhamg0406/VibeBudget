#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const configPath = path.join(cwd, 'scripts', 'agents.config.json');

function fail(message) {
  console.error(`[agent-start] ${message}`);
  process.exit(1);
}

function runGit(args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const [, , agent, taskSlug] = process.argv;
if (!agent || !taskSlug) {
  fail('Usage: node scripts/agent-start.mjs <agent> <task-slug>');
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

if (!/^[a-z0-9-]+$/.test(taskSlug)) {
  fail('Invalid task slug. Use lowercase letters, numbers, and hyphens only.');
}

const branch = `agent/${agent}/${taskSlug}`;

runGit(['config', 'user.name', agentConfig.name]);
runGit(['config', 'user.email', agentConfig.email]);
runGit(['checkout', '-B', branch]);

const effectiveName = runGit(['config', '--get', 'user.name']);
const effectiveEmail = runGit(['config', '--get', 'user.email']);
const currentBranch = runGit(['branch', '--show-current']);

console.log('Agent workflow initialized');
console.log(`Agent: ${agent}`);
console.log(`Name: ${effectiveName}`);
console.log(`Email: ${effectiveEmail}`);
console.log(`Branch: ${currentBranch}`);
