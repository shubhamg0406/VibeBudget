# VibeBudget — Project Brief

## Core Goal

VibeBudget is a personal budgeting application that helps users understand their spending, track income, set category targets, and stay in control of monthly cash flow — without spreadsheet sprawl. It serves as a single financial command center: fast daily logging, clean trend visualizations, and practical visibility into where money is going.

## What the App Does

- **Track expenses & income** in a unified timeline ledger
- **Set category budgets** (targets) and monitor progress in real time
- **Analyze spending patterns** across flexible date ranges with prior-period comparisons
- **Import data** from CSV, Excel, Google Sheets, Android notification history
- **Export / backup** to Google Drive (`budget.json`)
- **Two-way sync** with Google Sheets for external editing
- **AI-powered chat assistant** (Gemini 2.5 Flash) for natural language budget questions
- **Multi-currency support** with configurable base currency and exchange rates
- **Recurring transaction management** (monthly rules with auto-generation)
- **Dark/light theme** toggle
- **PWA** (Progressive Web App) with service worker caching
- **Capacitor** mobile shell for native Android deployment

## Target Users

- Individuals managing monthly budgets
- Users transitioning from spreadsheets to a structured budgeting workflow
- Anyone who wants to track income + expenses together (not just spending)

## Product Principles

- **Clarity first** — dashboards emphasize decisions, not noise
- **Local-first feel** with cloud safety nets (Firestore + Drive + Sheets)
- **User-controlled data movement** through Drive/Sheets integrations
- **Privacy** — single-user, no shared budgets, namespace-isolated data

## Deployment

- Production: https://vibebudget-chi.vercel.app
- Hosting: Vercel (SPA + serverless API routes)
- Firebase: Auth (Google Sign-In), Firestore (primary data store)
- Server: Express.js + SQLite for local dev; Vercel serverless for `/api/chat` and `/api/ai-chat`
