#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const cwd = process.cwd();

function runGit(args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const name = runGit(['config', '--get', 'user.name']);
const email = runGit(['config', '--get', 'user.email']);
const branch = runGit(['branch', '--show-current']);

console.log(`name=${name}`);
console.log(`email=${email}`);
console.log(`branch=${branch}`);
