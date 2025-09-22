import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.env.DIST_DIR || 'apps/backend/dist');

function rewriteImports(dir: string) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      rewriteImports(fullPath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      // Convert all .ts imports to .js
      content = content.replace(/\.ts(['"])/g, '.js$1');
      console.log(`rewriting ${fullPath}`);
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

rewriteImports(distDir);

console.log(`Imports rewritten in ${distDir}`);

// import fs from "fs";
// import path from "path";
//
// function rewriteImports(dir: string) {
//   const files = fs.readdirSync(dir, { withFileTypes: true });
//   for (const file of files) {
//     const fullPath = path.join(dir, file.name);
//     if (file.isDirectory()) {
//       rewriteImports(fullPath);
//     } else if (file.name.endsWith(".js")) {
//       let content = fs.readFileSync(fullPath, "utf-8");
//       content = content.replace(/(from\s+['"]\.\/[^'"]+)\.ts(['"])/g, "$1.js$2");
//       fs.writeFileSync(fullPath, content, "utf-8");
//     }
//   }
// }
//
// rewriteImports(path.resolve("apps/backend/dist"));
// console.log("Imports rewritten to .js in dist/");
//
//
// import path from "path";
// import fs from "fs";
// import { ModuleKind, Project } from "ts-morph";
//
// const ROOT = process.cwd(); // repo root
// const DIST_DIR = path.join(ROOT, "apps/backend/dist"); // backend build output
//
// // Only rewrite imports in .js files in dist
// function findJsFiles(dir: string): string[] {
//   const files: string[] = [];
//   function walk(current: string) {
//     const entries = fs.readdirSync(current, { withFileTypes: true });
//     for (const entry of entries) {
//       const full = path.join(current, entry.name);
//       if (entry.isDirectory()) {
//         walk(full);
//       } else if (entry.isFile() && full.endsWith(".js")) {
//         files.push(full);
//       }
//     }
//   }
//   walk(dir);
//   return files;
// }
//
// const jsFiles = findJsFiles(DIST_DIR);
//
// if (!jsFiles.length) {
//   console.warn(`No .js files found in ${DIST_DIR}. Did you build the backend?`);
//   process.exit(0);
// }
//
// console.log(`Found ${jsFiles.length} JS files in dist, rewriting imports...`);
//
// // ts-morph project
// const project = new Project({
//   compilerOptions: {
//     allowJs: true,
//     checkJs: false,
//     module: ModuleKind.NodeNext,
//   },
// });
//
// // Add all JS files to the project
// jsFiles.forEach((f) => project.addSourceFileAtPath(f));
//
// // Rewrite imports ending with .ts → .js
// project.getSourceFiles().forEach((sf) => {
//   sf.getImportDeclarations().forEach((imp) => {
//     const spec = imp.getModuleSpecifierValue();
//     if (spec.endsWith(".ts")) {
//       const newSpec = spec.replace(/\.ts$/, ".js");
//       imp.setModuleSpecifier(newSpec);
//     }
//   });
// });
//
// // Save all changes
// project.saveSync();
//
// console.log("Rewrite complete!");
