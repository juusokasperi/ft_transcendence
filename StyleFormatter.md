# Formatter Setup

Everyone should have the **Prettier – Code formatter** extension installed.

# Contribution & CI Guidelines

This project enforces consistent formatting and type safety through Prettier and TypeScript checks.  
Before opening a pull request, please follow the instructions below.

---

## 🔧 Usage

### Format fix

Automatically fix formatting issues:

```bash
# works in root/client/backend
npm run fix
```

### Type checking

Verify type safety:

```bash
# works in client/backend folder
npm run typecheck
```

---

## ✅ TODO Before Submitting a PR

1. Run type checking and you have to fix all warnings/errors:

   ```bash
   npm run typecheck
   ```

2. Run code formatter and it will fix automatically issues:

   ```bash
   npm run fix
   ```

3. Once all checks pass locally, open your pull request.

---

## EXTRA

**Ignore a block:**

```js
// prettier-ignore-start
db.pragma('journal_mode = WAL'); // Some code
// prettier-ignore-end
```

**Format check (Optional, Used in CI)**

Run Prettier in check mode:

```bash
# works in root
npm run check
```
