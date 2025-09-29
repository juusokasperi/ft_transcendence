import { Project } from "ts-morph";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(__dirname, ".."); // adjust if script is deeper

// Gather all tsconfig.json files under apps/* and packages/*
function findTsconfigs(dir: string): string[] {
  const configs: string[] = [];

  function walk(current: string) {
    const files = fs.readdirSync(current);
    for (const f of files) {
      const full = path.join(current, f);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (f === "tsconfig.json" || f === "tsconfig.build.json") {
        configs.push(full);
      }
    }
  }

  walk(dir);
  return configs;
}

const tsconfigs = [
  ...findTsconfigs(path.join(ROOT, "apps")),
  ...findTsconfigs(path.join(ROOT, "packages")),
];

console.log("Found tsconfigs:", tsconfigs);

tsconfigs.forEach((tsconfigPath) => {
  const project = new Project({ tsConfigFilePath: tsconfigPath });
  project.getSourceFiles().forEach((sf) => {
    sf.getImportDeclarations().forEach((imp) => {
      const spec = imp.getModuleSpecifierValue();
      if (spec.match(/^\.{1,2}\/.*\.ts$/)) {
        const newSpec = spec.replace(/\.ts$/, "");
        imp.setModuleSpecifier(newSpec);
      }
    });
  });
  project.saveSync();
});

console.log("Import rewrites complete");

