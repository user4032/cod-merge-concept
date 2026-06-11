# COD Account Merge - Concept Proposal

A proof-of-concept for a Cross-Account Merge feature for Call of Duty / Warzone.

## The Problem
Players who have content spread across two Activision accounts
(e.g. one on Xbox Live, one on Steam) have no official way to
consolidate their skins, progress, and stats into a single profile.

## The Proposal
A one-time, user-controlled merge tool with per-category options:

| Category          | Options                        |
|-------------------|-------------------------------|
| Operator skins    | Merge unique / Keep main / Skip |
| Weapon blueprints | Merge unique / Keep main / Skip |
| Account level     | Take higher / Skip             |
| Battle Pass       | Take higher / Skip             |
| CoD Points        | Sum both / Keep main / Skip    |
| Stats             | Sum both / Take higher / Skip  |

## How It Works
1. **Preview** - user sees exactly what will change, no data is modified
2. **Confirm** - user types the account name to prevent accidents
3. **Execute** - all operations run inside a single database transaction;
   if anything fails, everything rolls back automatically
4. **Done** - secondary account is deactivated

## Stack
- PostgreSQL (schema in `/schema.sql`)
- Node.js + Express + TypeScript (backend in `/mergeService.ts` and `/merge.ts`)

## Security
- Ownership check: both accounts must belong to the same authenticated user
- Duplicate merge prevention: already-merged pairs are rejected
- Full rollback on any failure: zero risk of partial data corruption
