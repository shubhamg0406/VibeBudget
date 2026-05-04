import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Menu,
  Moon,
  SunMedium,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Theme } from "../types";

interface DocsProps {
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
}

interface DocSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  children?: { id: string; label: string }[];
}

const SECTIONS: DocSection[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "hosted-vs-self-hosted", label: "Hosted vs Self-Hosted", icon: Globe },
  {
    id: "setup",
    label: "Setup Guides",
    icon: FileText,
    children: [
      { id: "local-setup", label: "Local Setup" },
      { id: "firebase-setup", label: "Firebase Setup" },
      { id: "firebase-auth", label: "Firebase Auth (Google)" },
      { id: "firestore", label: "Firestore Database" },
      { id: "service-account", label: "Firebase Admin / Service Account" },
      { id: "vercel-hosting", label: "Vercel Hosting" },
      { id: "env-vars", label: "Environment Variables" },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Globe,
    children: [
      { id: "ai-providers", label: "AI: Gemini & DeepSeek" },
      { id: "google-workspace", label: "Google Drive & Sheets" },
      { id: "plaid", label: "Plaid Bank Feed" },
      { id: "teller", label: "Teller Bank Feed" },
    ],
  },
  {
    id: "user-guide",
    label: "User Guide",
    icon: BookOpen,
    children: [
      { id: "dashboard", label: "Dashboard" },
      { id: "transactions", label: "Transactions & Income" },
      { id: "settings", label: "Settings & Data Hub" },
      { id: "integrations-guide", label: "Integrations" },
      { id: "imports", label: "Imports" },
    ],
  },
  { id: "troubleshooting", label: "Troubleshooting", icon: FileText },
];

const CONTENTS: Record<string, React.ReactNode> = {
  "overview": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">VibeBudget Documentation</h1>
      <p className="text-sm leading-relaxed text-fintech-muted">
        VibeBudget is an open-source personal finance tracker. Track spending, set budgets,
        analyze trends — all without locking your data into a proprietary system.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Core Features</h3>
          <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Dashboard with KPIs, trends, and budget targets</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Transaction ledger with search, filters, and sorting</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Category-level spending and income analysis</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Multi-currency support with exchange rates</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />CSV/Excel import/export</li>
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Integrations</h3>
          <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Google Sign-In (Firebase Auth)</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Google Drive backup / restore</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Google Sheets two-way sync</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />AI chat (Gemini / DeepSeek)</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Bank feeds (Plaid / Teller)</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Product Principles</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li><strong className="text-[var(--app-text)]">Clarity first</strong> — dashboards emphasize decisions, not noise.</li>
          <li><strong className="text-[var(--app-text)]">Local-first feel</strong> with cloud safety nets.</li>
          <li><strong className="text-[var(--app-text)]">User-controlled data</strong> movement through Drive/Sheets integrations.</li>
          <li><strong className="text-[var(--app-text)]">BYOK (Bring Your Own Key)</strong> — every paid service is optional and self-configured.</li>
        </ul>
      </div>
    </div>
  ),

  "hosted-vs-self-hosted": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Hosted vs Self-Hosted</h1>

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)] bg-[var(--app-panel-strong)]">
              <th className="p-3 font-bold">Aspect</th>
              <th className="p-3 font-bold">Hosted (Official)</th>
              <th className="p-3 font-bold">Self-Hosted</th>
            </tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr className="border-b border-[var(--app-border)]"><td className="p-3 font-medium text-[var(--app-text)]">Firebase project</td><td className="p-3">Managed by VibeBudget</td><td className="p-3">Your own project</td></tr>
            <tr className="border-b border-[var(--app-border)]"><td className="p-3 font-medium text-[var(--app-text)]">Hosting</td><td className="p-3">Managed (vercel)</td><td className="p-3">Your Vercel or Node.js host</td></tr>
            <tr className="border-b border-[var(--app-border)]"><td className="p-3 font-medium text-[var(--app-text)]">Data namespace</td><td className="p-3">Managed</td><td className="p-3"><code className="bg-[var(--app-ghost)] px-1 rounded">prod</code> or custom</td></tr>
            <tr className="border-b border-[var(--app-border)]"><td className="p-3 font-medium text-[var(--app-text)]">Service account</td><td className="p-3">Managed</td><td className="p-3">Required via <code className="bg-[var(--app-ghost)] px-1 rounded">FIREBASE_ADMIN_CREDENTIALS_JSON</code></td></tr>
            <tr className="border-b border-[var(--app-border)]"><td className="p-3 font-medium text-[var(--app-text)]">AI key</td><td className="p-3">Your key or default</td><td className="p-3">Your key via <code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_API_KEY</code></td></tr>
            <tr className="border-b border-[var(--app-border)]"><td className="p-3 font-medium text-[var(--app-text)]">Bank feeds</td><td className="p-3">Your credentials</td><td className="p-3">Your credentials</td></tr>
            <tr><td className="p-3 font-medium text-[var(--app-text)]">Cost</td><td className="p-3">Free (your infra = wallet)</td><td className="p-3">Free (your infra)</td></tr>
          </tbody>
        </table>
      </div>

      <p className="text-sm text-fintech-muted">
        The hosted version is managed by the VibeBudget team. Self-hosting means you own
        the Firebase project, Vercel deployment, API keys, and data. No subscription required.
      </p>
    </div>
  ),

  "local-setup": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Local Setup</h1>

      <div className="space-y-4">
        <Step number={1} title="Clone the repo">
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>git clone https://github.com/your-org/vibebudget.git
cd vibebudget</code></pre>
        </Step>

        <Step number={2} title="Install dependencies">
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>npm install</code></pre>
        </Step>

        <Step number={3} title="Copy environment template">
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>cp .env.example .env.local</code></pre>
        </Step>

        <Step number={4} title="Fill Firebase values">
          <p className="mt-2 text-xs text-fintech-muted">
            Create a Firebase project, enable Authentication (Google provider) and Firestore.
            Copy the web app config values into <code className="bg-[var(--app-ghost)] px-1 rounded">.env.local</code>.
          </p>
        </Step>

        <Step number={5} title="Set the data namespace">
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>VITE_FIREBASE_DATA_NAMESPACE="local-dev"
FIREBASE_DATA_NAMESPACE="local-dev"</code></pre>
          <p className="mt-1 text-xs text-fintech-muted">
            This keeps local data isolated from production.
          </p>
        </Step>

        <Step number={6} title="Add a service account (optional for local)">
          <p className="mt-2 text-xs text-fintech-muted">
            Download a service account JSON from Firebase Console → Project Settings → Service accounts.
            Set <code className="bg-[var(--app-ghost)] px-1 rounded">FIREBASE_ADMIN_CREDENTIALS_PATH</code> pointing to the file.
          </p>
        </Step>

        <Step number={7} title="Start the app">
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>npm run dev</code></pre>
          <p className="mt-1 text-xs text-fintech-muted">
            Starts API server on port 3000 and Vite dev server on port 8888.
          </p>
        </Step>
      </div>
    </div>
  ),

  "firebase-setup": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Firebase Setup</h1>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Checklist</h3>
          <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Create a Firebase project at <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-fintech-accent underline">Firebase Console</a></li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Enable Authentication → Google provider</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Create Firestore Database (start in test mode)</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Add authorized domains: <code className="bg-[var(--app-ghost)] px-1 rounded">localhost</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">127.0.0.1</code>, your production domain</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Copy web app config (6 <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_*</code> values)</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Deploy <code className="bg-[var(--app-ghost)] px-1 rounded">firestore.rules</code> via Firebase CLI</li>
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Required Environment Variables</h3>
          <p className="mt-1 text-xs text-fintech-muted">All six are required and validated at startup in <code className="bg-[var(--app-ghost)] px-1 rounded">src/firebase.ts</code>:</p>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)]">
                <th className="pb-2 font-bold">Variable</th>
                <th className="pb-2 font-bold">Source</th>
              </tr>
            </thead>
            <tbody className="text-fintech-muted">
              <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_API_KEY</td><td>Firebase Web App Config → apiKey</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_AUTH_DOMAIN</td><td>{`{project_id}.firebaseapp.com`}</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_PROJECT_ID</td><td>Firebase Project ID</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_STORAGE_BUCKET</td><td>{`{project_id}.firebasestorage.app`}</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_MESSAGING_SENDER_ID</td><td>Firebase Web App Config → messagingSenderId</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_APP_ID</td><td>Firebase Web App Config → appId</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),

  "firebase-auth": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Firebase Auth — Google Provider</h1>
      <p className="text-sm text-fintech-muted">
        Google Sign-In is the only authentication method. Configured in Firebase Console → Authentication → Sign-in method → Google.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Setup Steps</h3>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-xs text-fintech-muted">
          <li>Go to Firebase Console → Authentication → Sign-in method</li>
          <li>Enable the Google provider</li>
          <li>Add authorized domains: <code className="bg-[var(--app-ghost)] px-1 rounded">localhost</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">127.0.0.1</code>, your production URL</li>
          <li>Configure OAuth consent screen in GCP Console if using Google Drive/Sheets APIs</li>
        </ol>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Common Issues</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li><strong className="text-[var(--app-text)]">Popup blocked</strong> — Allow popups for the domain; embedded browsers fall back to redirect auth</li>
          <li><strong className="text-[var(--app-text)]">unauthorized-domain</strong> — Add your domain to Firebase Auth authorized domains list</li>
          <li><strong className="text-[var(--app-text)]">Sign-in loops</strong> — Check that <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_AUTH_DOMAIN</code> matches the Firebase project</li>
        </ul>
      </div>
    </div>
  ),

  "firestore": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Firestore Database</h1>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Data Structure</h3>
        <p className="mt-2 text-xs text-fintech-muted">
          All user data is namespaced under:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>/environments/{`{namespace}`}/users/{`{uid}`}/</code></pre>
        <p className="mt-2 text-xs text-fintech-muted">
          Collections: <code className="bg-[var(--app-ghost)] px-1 rounded">expenseCategories</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">incomeCategories</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">transactions</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">income</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">preferences</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">sheetsConfig</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">driveConnection</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">plaidConnection</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">tellerConnection</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">aiConfig</code>
        </p>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Namespace Resolution</h3>
        <p className="mt-2 text-xs text-fintech-muted">The namespace is resolved in this order (from <code className="bg-[var(--app-ghost)] px-1 rounded">src/firebase.ts</code>):</p>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-xs text-fintech-muted">
          <li><code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_DATA_NAMESPACE</code> env var (if set)</li>
          <li><code className="bg-[var(--app-ghost)] px-1 rounded">"test"</code> in test mode</li>
          <li><code className="bg-[var(--app-ghost)] px-1 rounded">"local-dev"</code> in development</li>
          <li><code className="bg-[var(--app-ghost)] px-1 rounded">"prod"</code> in production</li>
        </ol>
        <p className="mt-3 text-xs text-fintech-muted">
          The server also checks <code className="bg-[var(--app-ghost)] px-1 rounded">FIREBASE_DATA_NAMESPACE</code> and <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_DATA_NAMESPACE</code> with similar fallback.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Security Rules</h3>
        <p className="mt-2 text-xs text-fintech-muted">
          Deploy the included <code className="bg-[var(--app-ghost)] px-1 rounded">firestore.rules</code> to enforce per-user access:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules</code></pre>
        <p className="mt-2 text-xs text-fintech-muted">
          No composite indexes are required for the current data model.
        </p>
      </div>
    </div>
  ),

  "service-account": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Firebase Admin / Service Account</h1>
      <p className="text-sm text-fintech-muted">
        The server-side AI chat uses Firebase Admin SDK to verify ID tokens and read Firestore data.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Configuration Methods</h3>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]">
              <th className="pb-2 font-bold">Method</th>
              <th className="pb-2 font-bold">Env Var</th>
              <th className="pb-2 font-bold">Notes</th>
            </tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Inline JSON</td><td className="py-1.5 pr-4 font-mono">FIREBASE_ADMIN_CREDENTIALS_JSON</td><td className="py-1.5">Best for Vercel</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">File path</td><td className="py-1.5 pr-4 font-mono">FIREBASE_ADMIN_CREDENTIALS_PATH</td><td className="py-1.5">Best for local dev</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Application default</td><td className="py-1.5 pr-4 font-mono">(none)</td><td className="py-1.5">Works on GCP/GCE</td></tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">How to Get the JSON</h3>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-xs text-fintech-muted">
          <li>Firebase Console → Project Settings → Service accounts</li>
          <li>Click "Generate new private key"</li>
          <li>Save the downloaded JSON file</li>
          <li>For Vercel: paste the full JSON as <code className="bg-[var(--app-ghost)] px-1 rounded">FIREBASE_ADMIN_CREDENTIALS_JSON</code> (single line, escaped)</li>
          <li>For local dev: set <code className="bg-[var(--app-ghost)] px-1 rounded">FIREBASE_ADMIN_CREDENTIALS_PATH</code> to the file path</li>
        </ol>
      </div>
    </div>
  ),

  "vercel-hosting": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Vercel Hosting</h1>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Required Environment Variables</h3>
        <p className="mt-2 text-xs text-fintech-muted">
          Set these in Vercel → Project → Settings → Environment Variables:
        </p>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]">
              <th className="pb-2 font-bold">Variable</th>
              <th className="pb-2 font-bold">Required</th>
            </tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_API_KEY</td><td className="py-1.5">Yes</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_AUTH_DOMAIN</td><td className="py-1.5">Yes</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_PROJECT_ID</td><td className="py-1.5">Yes</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_STORAGE_BUCKET</td><td className="py-1.5">Yes</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_MESSAGING_SENDER_ID</td><td className="py-1.5">Yes</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_APP_ID</td><td className="py-1.5">Yes</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_DATA_NAMESPACE</td><td className="py-1.5">Yes (use <code className="bg-[var(--app-ghost)] px-1 rounded">prod</code>)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">FIREBASE_DATA_NAMESPACE</td><td className="py-1.5">Yes (server-side, must match client)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">FIREBASE_ADMIN_CREDENTIALS_JSON</td><td className="py-1.5">Yes for AI chat</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">GEMINI_API_KEY</td><td className="py-1.5">For AI features</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">PLAID_ENCRYPTION_PEPPER</td><td className="py-1.5">For Plaid feed</td></tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Deploy Command</h3>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs"><code>npx vercel --prod --yes</code></pre>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Verification Checklist</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Open production URL and sign in with Google</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Add a test transaction and confirm persistence</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Verify namespace: documents under <code className="bg-[var(--app-ghost)] px-1 rounded">/environments/prod/users/{`{uid}`}/...</code></li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Test AI chat if <code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_API_KEY</code> is configured</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Test Drive/Sheets connections if APIs enabled</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Check Vercel Function logs for errors</li>
        </ul>
      </div>
    </div>
  ),

  "env-vars": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Environment Variables</h1>

      <p className="text-sm text-fintech-muted">All env vars used by VibeBudget, organized by category:</p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Firebase (Client — <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_</code> prefix)</h3>
        <p className="mt-1 text-xs text-fintech-muted">Required. Bundled into the frontend.</p>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Variable</th><th className="pb-2 font-bold">Description</th></tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_API_KEY</td><td className="py-1.5">Firebase Web API key</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_AUTH_DOMAIN</td><td className="py-1.5">{`{project}.firebaseapp.com`}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_PROJECT_ID</td><td className="py-1.5">Firebase project ID</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_STORAGE_BUCKET</td><td className="py-1.5">{`{project}.firebasestorage.app`}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_MESSAGING_SENDER_ID</td><td className="py-1.5">Firebase sender ID</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_APP_ID</td><td className="py-1.5">Firebase app ID</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_FIRESTORE_DATABASE_ID</td><td className="py-1.5">Optional custom database ID</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_FIREBASE_DATA_NAMESPACE</td><td className="py-1.5">Data isolation: <code className="bg-[var(--app-ghost)] px-1 rounded">local-dev</code> for dev, <code className="bg-[var(--app-ghost)] px-1 rounded">prod</code> for production</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_TEST_MODE</td><td className="py-1.5">Set to <code className="bg-[var(--app-ghost)] px-1 rounded">mock</code> for testing without Firebase</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_TEST_USER_EMAIL</td><td className="py-1.5">Default email in mock test mode</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">VITE_PLAID_SERVER_URL</td><td className="py-1.5">Plaid API server URL (optional)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Server-Side (no <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_</code> prefix)</h3>
        <p className="mt-1 text-xs text-fintech-muted">Stay on the server. Never exposed to the client.</p>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Variable</th><th className="pb-2 font-bold">Description</th></tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">FIREBASE_DATA_NAMESPACE</td><td className="py-1.5">Server-side namespace (must match client)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">FIREBASE_ADMIN_CREDENTIALS_JSON</td><td className="py-1.5">Full service account JSON (escaped, single line)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">FIREBASE_ADMIN_CREDENTIALS_PATH</td><td className="py-1.5">Path to service account JSON file (local dev)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">GEMINI_API_KEY</td><td className="py-1.5">Gemini API key for server-side AI chat</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">GEMINI_MODEL</td><td className="py-1.5">Gemini model name (default: <code className="bg-[var(--app-ghost)] px-1 rounded">gemini-2.5-flash</code>)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">AI_CHAT_CACHE_TTL_MS</td><td className="py-1.5">Cache TTL for AI chat Firestore reads (default: 300000)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">ALLOW_FIREBASE_REST_FALLBACK</td><td className="py-1.5">Enable REST fallback for Firestore (default: <code className="bg-[var(--app-ghost)] px-1 rounded">false</code>)</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono text-[var(--app-text)]">PLAID_ENCRYPTION_PEPPER</td><td className="py-1.5">Required for Plaid token encryption</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  ),

  "ai-providers": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">AI — Gemini & DeepSeek</h1>
      <p className="text-sm text-fintech-muted">
        The AI assistant (chat widget) and document OCR use a configurable AI provider. Configured in Settings → AI Chat.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Gemini (Default)</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li>Get an API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-fintech-accent underline">Google AI Studio</a></li>
          <li>Enable the Generative Language API in GCP Console</li>
          <li>Model: <code className="bg-[var(--app-ghost)] px-1 rounded">gemini-2.5-flash</code> (default, fast), <code className="bg-[var(--app-ghost)] px-1 rounded">gemini-2.5-pro</code> (best accuracy), <code className="bg-[var(--app-ghost)] px-1 rounded">gemini-2.5-flash-lite</code> (fastest)</li>
          <li>Server env var: <code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_API_KEY</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_MODEL</code></li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">DeepSeek</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li>Get an API key from <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-fintech-accent underline">platform.deepseek.com</a></li>
          <li>Model: <code className="bg-[var(--app-ghost)] px-1 rounded">deepseek-chat</code> (V3, general), <code className="bg-[var(--app-ghost)] px-1 rounded">deepseek-reasoner</code> (R1, reasoning)</li>
          <li>There is no server-side <code className="bg-[var(--app-ghost)] px-1 rounded">DEEPSEEK_API_KEY</code> env var fallback — keys must be provided via the Settings UI at runtime</li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Configuration</h3>
        <p className="mt-2 text-xs text-fintech-muted">
          The per-user AI config is persisted to Firestore via <code className="bg-[var(--app-ghost)] px-1 rounded">saveUserProfilePatch({`{ aiConfig }`})</code>.
          This includes the API key — clear it from Settings if you prefer server-only keys.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Common Failures</h3>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Symptom</th><th className="pb-2 font-bold">Fix</th></tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4"><code className="bg-[var(--app-ghost)] px-1 rounded">AI API key is not configured</code></td><td className="py-1.5">Set <code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_API_KEY</code> or configure in Settings</td></tr>
            <tr><td className="py-1.5 pr-4">Gemini/DeepSeek 4xx errors</td><td className="py-1.5">Invalid key, insufficient quota, or disabled API</td></tr>
            <tr><td className="py-1.5 pr-4">Rate limit reached</td><td className="py-1.5">Wait or upgrade to paid tier</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  ),

  "google-workspace": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Google Drive & Sheets</h1>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Google Drive — Backup & Restore</h3>
        <p className="mt-2 text-xs text-fintech-muted">
          Creates a "VibeBudget" folder in your Drive and saves a <code className="bg-[var(--app-ghost)] px-1 rounded">budget.json</code> backup.
        </p>
        <p className="mt-2 text-xs text-fintech-muted">
          Scope: <code className="bg-[var(--app-ghost)] px-1 rounded">https://www.googleapis.com/auth/drive.file</code>
        </p>
        <p className="mt-2 text-xs text-fintech-muted">
          Configured in: Settings → Cloud Sync → Drive
        </p>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Google Sheets — Two-Way Sync</h3>
        <p className="mt-2 text-xs text-fintech-muted">
          Pull data from a Google Sheet or push app data to a sheet. Deduplication is built-in.
        </p>
        <p className="mt-2 text-xs text-fintech-muted">
          Scopes: <code className="bg-[var(--app-ghost)] px-1 rounded">https://www.googleapis.com/auth/spreadsheets</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">https://www.googleapis.com/auth/drive.file</code>
        </p>
        <p className="mt-2 text-xs text-fintech-muted">
          Configured in: Settings → Cloud Sync → Google Sheets
        </p>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Required GCP APIs</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" /><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline">Google Drive API</a></li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" /><a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline">Google Sheets API</a></li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">OAuth Consent Screen</h3>
        <p className="mt-2 text-xs text-fintech-muted">
          For Drive/Sheets OAuth to work, configure the OAuth consent screen in GCP Console → APIs & Services → OAuth consent screen:
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-fintech-muted">
          <li>Choose "External" user type</li>
          <li>Add the scopes: <code className="bg-[var(--app-ghost)] px-1 rounded">../auth/drive.file</code>, <code className="bg-[var(--app-ghost)] px-1 rounded">../auth/spreadsheets</code></li>
          <li>Add test users (your email)</li>
          <li>Publish when going to production</li>
        </ul>
      </div>
    </div>
  ),

  "plaid": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Plaid Bank Feed</h1>
      <p className="text-sm text-fintech-muted">
        Plaid connects VibeBudget to bank accounts for automated transaction import.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">What You Need</h3>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-fintech-muted">
          <li>A <a href="https://dashboard.plaid.com" target="_blank" rel="noopener noreferrer" className="text-fintech-accent underline">Plaid Dashboard</a> account</li>
          <li>Client ID and Secret (sandbox/development/production)</li>
          <li><code className="bg-[var(--app-ghost)] px-1 rounded">PLAID_ENCRYPTION_PEPPER</code> set in server env</li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Credential Storage</h3>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Data</th><th className="pb-2 font-bold">Where</th></tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4">Client ID, Secret, Environment</td><td className="py-1.5">Browser session only</td></tr>
            <tr><td className="py-1.5 pr-4">Encrypted access_token</td><td className="py-1.5">Firestore (per-user)</td></tr>
            <tr><td className="py-1.5 pr-4">PLAID_ENCRYPTION_PEPPER</td><td className="py-1.5">Server env var only</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  ),

  "teller": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Teller Bank Feed</h1>
      <p className="text-sm text-fintech-muted">
        Teller is an alternative bank feed provider using mTLS for authentication.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">What You Need</h3>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-fintech-muted">
          <li>A <a href="https://dashboard.teller.io" target="_blank" rel="noopener noreferrer" className="text-fintech-accent underline">Teller Dashboard</a> account</li>
          <li>Application ID, Certificate PEM, Private Key PEM</li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Credential Storage</h3>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Data</th><th className="pb-2 font-bold">Where</th></tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4">Application ID, Certificate, Private Key</td><td className="py-1.5">Browser session only</td></tr>
            <tr><td className="py-1.5 pr-4">Access token</td><td className="py-1.5">Firestore (per-user)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Common Issues</h3>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-fintech-muted">
          <li>Certificate PEM must include <code className="bg-[var(--app-ghost)] px-1 rounded">-----BEGIN CERTIFICATE-----</code> headers</li>
          <li>Private key PEM must include <code className="bg-[var(--app-ghost)] px-1 rounded">-----BEGIN RSA PRIVATE KEY-----</code> headers</li>
          <li>Access tokens are short-lived — reconnect if sync fails with 401</li>
        </ul>
      </div>
    </div>
  ),

  "dashboard": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-sm text-fintech-muted">
        The home screen shows your financial KPIs at a glance.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">What You See</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Total income, total spent, balance, and tracked targets</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Budget pace and target-performance indicators</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Prior-period comparison context</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Date range controls (this month, last month, 3/6/12 months, YTD, custom)</li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Tips</h3>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-fintech-muted">
          <li>Use date range presets before reviewing charts</li>
          <li>Add entries daily for better trend accuracy</li>
          <li>Check the "Getting Started" checklist for onboarding steps</li>
        </ul>
      </div>
    </div>
  ),

  "transactions": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Transactions & Income</h1>
      <p className="text-sm text-fintech-muted">
        A unified ledger for both expense and income records.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Features</h3>
        <ul className="mt-3 space-y-2 text-xs text-fintech-muted">
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Quick add/edit/delete entries</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Search + advanced filters (type, category, amount, date)</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Sort by date or amount</li>
          <li className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fintech-accent" />Multi-currency support with base currency conversion</li>
        </ul>
      </div>
    </div>
  ),

  "settings": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings & Data Hub</h1>
      <p className="text-sm text-fintech-muted">
        Configure everything from currency to integrations to data management.
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Data Hub</h3>
          <p className="mt-1 text-xs text-fintech-muted">
            Import/export CSV, Excel, and budget JSON backups. Manage individual data domains
            (expense categories, income categories, expenses, income).
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Currency</h3>
          <p className="mt-1 text-xs text-fintech-muted">
            Set your base currency and configure custom exchange rates for multi-currency tracking.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Cloud Sync</h3>
          <p className="mt-1 text-xs text-fintech-muted">
            Connect Google Drive for <code className="bg-[var(--app-ghost)] px-1 rounded">budget.json</code> backup/restore.
            Connect Google Sheets for two-way data sync with custom column mapping.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Finance Feeds</h3>
          <p className="mt-1 text-xs text-fintech-muted">
            Configure Plaid or Teller credentials for automated bank transaction imports.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">AI Chat</h3>
          <p className="mt-1 text-xs text-fintech-muted">
            Choose Gemini or DeepSeek provider, select model, and enter your API key.
            Falls back to server-side <code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_API_KEY</code> if no per-user config is saved.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Maintenance</h3>
          <p className="mt-1 text-xs text-fintech-muted">
            Wipe specific data domains or perform controlled resets. Export full budget as JSON before destructive operations.
          </p>
        </div>
      </div>
    </div>
  ),

  "integrations-guide": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
      <p className="text-sm text-fintech-muted">
        VibeBudget supports optional integrations configured in Settings.
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <h3 className="text-sm font-bold">Available Integrations</h3>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Integration</th><th className="pb-2 font-bold">Purpose</th><th className="pb-2 font-bold">Config Location</th></tr>
          </thead>
          <tbody className="text-fintech-muted">
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Google Auth</td><td className="py-1.5 pr-4">Sign-in</td><td className="py-1.5">Firebase Console</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Google Drive</td><td className="py-1.5 pr-4">Backup & restore</td><td className="py-1.5">Settings → Cloud Sync</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Google Sheets</td><td className="py-1.5 pr-4">Two-way data sync</td><td className="py-1.5">Settings → Cloud Sync</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Gemini AI</td><td className="py-1.5 pr-4">Chat & document OCR</td><td className="py-1.5">Settings → AI Chat</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">DeepSeek AI</td><td className="py-1.5 pr-4">Chat & document OCR</td><td className="py-1.5">Settings → AI Chat</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Plaid</td><td className="py-1.5 pr-4">Bank transaction import</td><td className="py-1.5">Settings → Finance Feeds</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium text-[var(--app-text)]">Teller</td><td className="py-1.5 pr-4">Bank transaction import</td><td className="py-1.5">Settings → Finance Feeds</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  ),

  "imports": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Imports</h1>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">CSV Import</h3>
          <p className="mt-2 text-xs text-fintech-muted">
            Upload CSV files for expenses, income, and categories. Auto-detects comma vs tab delimiters.
            Supports date formats (MM-DD-YYYY, YYYY-MM-DD) and numeric amount parsing.
          </p>
          <p className="mt-2 text-xs text-fintech-muted">
            Templates available in Settings → Data Hub for each data domain.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Google Sheets Import</h3>
          <p className="mt-2 text-xs text-fintech-muted">
            Connect a Google Sheet and pull data into VibeBudget. Supports:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-fintech-muted">
            <li>Custom column mapping</li>
            <li>Incremental and full-reconcile modes</li>
            <li>Auto-sync on a configurable interval</li>
            <li>Content-based deduplication</li>
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Import Deduplication</h3>
          <p className="mt-2 text-xs text-fintech-muted">
            Imports check for duplicates by <code className="bg-[var(--app-ghost)] px-1 rounded">source_id</code> and field matching.
            Duplicate records are skipped by default. Use "Include duplicates" in commit options to force re-import.
          </p>
        </div>
      </div>
    </div>
  ),

  "troubleshooting": (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Troubleshooting</h1>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Google Sign-In Failures</h3>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Issue</th><th className="pb-2 font-bold">Fix</th></tr>
            </thead>
            <tbody className="text-fintech-muted">
              <tr><td className="py-1.5 pr-4">Popup blocked or closed</td><td className="py-1.5">Allow popups for the domain; VibeBudget auto-falls back to redirect auth in embedded browsers</td></tr>
              <tr><td className="py-1.5 pr-4">unauthorized-domain</td><td className="py-1.5">Add domain to Firebase Console → Auth → Authorized domains</td></tr>
              <tr><td className="py-1.5 pr-4">Sign-in loops</td><td className="py-1.5">Verify <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_AUTH_DOMAIN</code> matches the Firebase project</td></tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Firebase Env / Config Failures</h3>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Issue</th><th className="pb-2 font-bold">Fix</th></tr>
            </thead>
            <tbody className="text-fintech-muted">
              <tr><td className="py-1.5 pr-4">"Missing Firebase environment variables" on load</td><td className="py-1.5">Fill all <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_*</code> in <code className="bg-[var(--app-ghost)] px-1 rounded">.env.local</code> or Vercel env vars</td></tr>
              <tr><td className="py-1.5 pr-4">"Cannot read properties of undefined"</td><td className="py-1.5">Verify all six Firebase config values against Firebase Console</td></tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Firestore Issues</h3>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Issue</th><th className="pb-2 font-bold">Fix</th></tr>
            </thead>
            <tbody className="text-fintech-muted">
              <tr><td className="py-1.5 pr-4">"Missing or insufficient permissions"</td><td className="py-1.5">Deploy <code className="bg-[var(--app-ghost)] px-1 rounded">firestore.rules</code>; verify namespace matches env var</td></tr>
              <tr><td className="py-1.5 pr-4">Data in Firestore but app shows nothing</td><td className="py-1.5">Namespace mismatch — check <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_DATA_NAMESPACE</code> vs actual document paths</td></tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">AI Chat Issues</h3>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Issue</th><th className="pb-2 font-bold">Fix</th></tr>
            </thead>
            <tbody className="text-fintech-muted">
              <tr><td className="py-1.5 pr-4"><code className="bg-[var(--app-ghost)] px-1 rounded">AI API key is not configured</code></td><td className="py-1.5">Set <code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_API_KEY</code> in env or configure per-user in Settings → AI Chat</td></tr>
              <tr><td className="py-1.5 pr-4">AI chat works locally but fails on Vercel</td><td className="py-1.5">Add <code className="bg-[var(--app-ghost)] px-1 rounded">FIREBASE_ADMIN_CREDENTIALS_JSON</code> to Vercel env vars</td></tr>
              <tr><td className="py-1.5 pr-4">Firestore quota exceeded / 503</td><td className="py-1.5">Increase <code className="bg-[var(--app-ghost)] px-1 rounded">AI_CHAT_CACHE_TTL_MS</code> or upgrade Firebase plan</td></tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Deployment Issues</h3>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Issue</th><th className="pb-2 font-bold">Fix</th></tr>
            </thead>
            <tbody className="text-fintech-muted">
              <tr><td className="py-1.5 pr-4">Build fails on Vercel</td><td className="py-1.5">Verify all <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_*</code> are set in Vercel env; run <code className="bg-[var(--app-ghost)] px-1 rounded">npm run build</code> locally</td></tr>
              <tr><td className="py-1.5 pr-4">Deployed app shows white screen</td><td className="py-1.5">Check Vercel deploy logs for build errors; verify env vars</td></tr>
              <tr><td className="py-1.5 pr-4">Serverless function timeout (504)</td><td className="py-1.5">AI chat or bank feed sync may exceed 10s Hobby plan limit; upgrade to Pro</td></tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <h3 className="text-sm font-bold">Quick Reference</h3>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)]"><th className="pb-2 font-bold">Issue</th><th className="pb-2 font-bold">Check First</th></tr>
            </thead>
            <tbody className="text-fintech-muted">
              <tr><td className="py-1.5 pr-4">Google sign-in</td><td className="py-1.5">Firebase Console → Auth → Authorized domains</td></tr>
              <tr><td className="py-1.5 pr-4">Firebase env errors</td><td className="py-1.5"><code className="bg-[var(--app-ghost)] px-1 rounded">.env.local</code> or Vercel env vars; <code className="bg-[var(--app-ghost)] px-1 rounded">src/firebase.ts</code> validation</td></tr>
              <tr><td className="py-1.5 pr-4">Data not visible</td><td className="py-1.5">Namespace: <code className="bg-[var(--app-ghost)] px-1 rounded">VITE_FIREBASE_DATA_NAMESPACE</code></td></tr>
              <tr><td className="py-1.5 pr-4">Service account</td><td className="py-1.5"><code className="bg-[var(--app-ghost)] px-1 rounded">FIREBASE_ADMIN_CREDENTIALS_JSON</code> or path</td></tr>
              <tr><td className="py-1.5 pr-4">AI chat fails</td><td className="py-1.5"><code className="bg-[var(--app-ghost)] px-1 rounded">GEMINI_API_KEY</code> env var</td></tr>
              <tr><td className="py-1.5 pr-4">Drive/Sheets fails</td><td className="py-1.5">GCP → APIs → Enabled APIs; OAuth consent screen</td></tr>
              <tr><td className="py-1.5 pr-4">Plaid fails</td><td className="py-1.5"><code className="bg-[var(--app-ghost)] px-1 rounded">PLAID_ENCRYPTION_PEPPER</code> env var</td></tr>
              <tr><td className="py-1.5 pr-4">Stale UI</td><td className="py-1.5">Hard reload (Cmd+Shift+R); unregister service worker</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
};

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fintech-accent/15 text-xs font-bold text-fintech-accent">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function useActiveSection(sectionIds: string[]): [string, (id: string) => void] {
  const [active, setActive] = useState(sectionIds[0]);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id.replace("section-", ""));
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );

    for (const ref of sectionRefs.current.values()) {
      observer.observe(ref);
    }

    return () => observer.disconnect();
  }, [sectionIds]);

  const scrollTo = (id: string) => {
    setActive(id);
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return [active, scrollTo];
}

export const Docs: React.FC<DocsProps> = ({ theme, onToggleTheme, onBack }) => {
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLight = theme === "light";

  const [observedActive, scrollToSection] = useActiveSection(
    Object.keys(CONTENTS),
  );

  const handleSectionClick = (id: string) => {
    setActiveSection(id);
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  const toggleSection = (label: string) => {
    const section = SECTIONS.find((s) => s.label === label);
    if (!section) return;
    if (section.children) {
      handleSectionClick(section.children[0].id);
    } else {
      handleSectionClick(section.id);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col gap-1">
      <div className="mb-3 px-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-fintech-muted/60">
          Documentation
        </h2>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.id}>
          <button
            onClick={() => handleSectionClick(section.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-xs font-medium transition-colors ${
              activeSection === section.id || section.children?.some((c) => c.id === activeSection)
                ? "bg-fintech-accent/10 text-fintech-accent"
                : "text-fintech-muted hover:bg-[var(--app-ghost)] hover:text-[var(--app-text)]"
            }`}
          >
            <section.icon size={15} />
            <span>{section.label}</span>
          </button>
          {section.children && (
            <div className="ml-3 mt-0.5 flex flex-col border-l border-[var(--app-border)] pl-3">
              {section.children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => handleSectionClick(child.id)}
                  className={`rounded-md px-3 py-1.5 text-left text-xs transition-colors ${
                    activeSection === child.id
                      ? "text-fintech-accent font-semibold"
                      : "text-fintech-muted hover:text-[var(--app-text)]"
                  }`}
                >
                  {child.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--app-shell)] text-[var(--app-text)]">
      <header
        className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-[var(--app-shell)]/80 px-4 backdrop-blur-xl sm:px-6"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-fintech-muted transition-colors hover:bg-[var(--app-ghost)] hover:text-[var(--app-text)]"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Back to app</span>
          </button>
          <div className="h-5 w-px bg-[var(--app-divider)]" />
          <span className="text-sm font-bold tracking-tight">Docs</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-fintech-muted transition-colors hover:bg-[var(--app-ghost)] lg:hidden"
            aria-label="Open docs navigation"
          >
            <Menu size={18} />
          </button>
          <button
            onClick={onToggleTheme}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-1.5 text-xs font-semibold text-fintech-muted transition-colors hover:text-fintech-accent"
            aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
          >
            {isLight ? <Moon size={14} /> : <SunMedium size={14} />}
            <span className="hidden sm:inline">{isLight ? "Dark" : "Light"}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r py-6 lg:block"
          style={{ borderColor: "var(--app-border)" }}
        >
          {sidebarContent}
        </aside>

        <main className="min-h-[calc(100vh-3.5rem)] flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                id={`section-${activeSection}`}
              >
                {CONTENTS[activeSection] || (
                  <p className="text-sm text-fintech-muted">Section not found.</p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-[100] bg-black/40 lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-[101] w-72 overflow-y-auto border-r bg-[var(--app-shell)] py-6 lg:hidden"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="mb-4 flex items-center justify-between px-4">
                <h2 className="text-sm font-bold">Documentation</h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-fintech-muted hover:bg-[var(--app-ghost)]"
                  aria-label="Close docs navigation"
                >
                  <X size={18} />
                </button>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
