# Formatter Setup

Everyone should have the **Prettier – Code formatter** extension installed.

## Usage

- **Format check:**

  ```bash
  npm run format
  ```

- **Write fixes:**

  ```bash
  npm run format:write
  ```

- **Ignore a block:**

  ```js
  // prettier-ignore-start
  db.pragma('journal_mode = WAL'); // Some code
  // prettier-ignore-end
  ```
