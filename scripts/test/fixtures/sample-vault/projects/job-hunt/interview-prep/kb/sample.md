---
topic: sample
prefix: sm
created: 2026-10-01
count: 3
level: medium
streak: 0
---

# Sample Bank

Synthetic question bank for the generator tests. The questions are generic and invented.

## Index

| ID | Key | Kind | Level | Status | Due | Seen | Label |
|----|-----|------|-------|--------|-----|------|-------|
| sm-001 | http.cache.immutable.filename | scenario | medium | queued | none | 1 | cache headers on an unchanged filename |
| sm-002 | sql.index.leftmost.prefix | scenario | fundamentals | queued | none | 0 | composite index and the leftmost prefix |
| sm-003 | git.rebase.shared.branch | compare | senior | queued | none | 0 | rebasing a branch other people pulled |

## Questions

### sm-001
key: http.cache.immutable.filename
kind: scenario
level: medium
deck: seed
first asked: none
answer: B

**Stem**
A static file is served with a one year max-age and you deploy a fix under the same filename. Returning visitors still see the old file. What is the right fix going forward?

**Options**
A. Shorten max-age to one second on every asset
B. Put a content hash in the filename so each deploy produces a new URL
C. Ask users to clear their browser cache after each release

**Why**
A long max-age is only safe when the URL changes whenever the content does. A hashed filename gives that and keeps the long cache. A throws away caching, and C pushes the problem onto users.

**Rubric**
1. States that a long max-age needs a URL that changes with the content.
2. Names a content hash or version in the filename as the mechanism.

**Model answer**
Cache the asset for a long time but fingerprint the filename, so a new deploy is a new URL and old caches simply never match.

**Attempts**
2026-10-10 mcq B pass tier0

### sm-002
key: sql.index.leftmost.prefix
kind: scenario
level: fundamentals
deck: seed
first asked: none
answer: A

**Stem**
A table has one composite index on (last_name, first_name). Which filter can use it?

**Options**
A. WHERE last_name = 'Smith'
B. WHERE first_name = 'Ada'
C. WHERE first_name LIKE '%da'

**Why**
A composite index is ordered by its first column, then the second, so a filter must constrain the leading column to use it. B skips the leading column and C starts with a wildcard.

**Rubric**
1. States the leading column must be constrained.
2. Explains the index is ordered by the first column first.

**Model answer**
Only the filter on last_name can use it, because the index is sorted by last_name and then first_name.

**Attempts**

### sm-003
key: git.rebase.shared.branch
kind: compare
level: senior
deck: seed
first asked: none
answer: C

**Stem**
A teammate already pulled your feature branch. You want a linear history before merging. What should you do?

**Options**
A. Rebase and force push without telling anyone
B. Delete the branch and recreate it from main
C. Merge main into the branch, or agree on a rebase with the teammate first

**Why**
Rebasing rewrites commits, so anyone who already pulled the branch ends up with diverged history. Merging is safe on a shared branch, and a rebase is fine when everyone agrees to reset.

**Rubric**
1. States that a rebase rewrites commits.
2. Names the divergence problem for people who already pulled.

**Model answer**
Rebasing rewrites history, so on a shared branch I merge main in, or coordinate the rebase so nobody is left with diverged commits.

**Attempts**
