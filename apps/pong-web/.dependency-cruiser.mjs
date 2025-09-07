/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-out-from-shared",
      severity: "error",
      from: { path: "^src/shared" },
      to: { pathNot: "^src/shared" },
    },
    {
      name: "game-only-shared",
      severity: "error",
      from: { path: "^src/game" },
      to: { pathNot: "^(src/game|src/shared)" },
    },
    {
      name: "client-only-shared",
      severity: "error",
      from: { path: "^src/client" },
      to: { pathNot: "^(src/client|src/shared)" },
    },
    {
      name: "app-no-server",
      severity: "error",
      from: { path: "^src/app" },
      to: { path: "^src/server" },
    },
    {
      name: "server-no-client-or-app",
      severity: "error",
      from: { path: "^src/server" },
      to: { path: "^(src/client|src/app)" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    baseDir: ".",
    doNotFollow: { path: "node_modules" },
    includeOnly: "^src",
  },
};
