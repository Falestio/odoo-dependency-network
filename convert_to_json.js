const fs = require("fs");
const path = require("path");

function findManifestFiles(addonsPath) {
  const manifestFiles = [];
  function walk(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        walk(fullPath);
      } else if (
        file.name === "__manifest__.py" ||
        file.name === "__openerp__.py"
      ) {
        manifestFiles.push(fullPath);
      }
    }
  }
  walk(addonsPath);
  return manifestFiles;
}

function parseManifest(manifestFilePath) {
  const moduleName = path.basename(path.dirname(manifestFilePath));
  let dependencies = [];

  try {
    const content = fs.readFileSync(manifestFilePath, "utf-8");

    const dependsMatch = content.match(
      /['"]depends['"][\s]*:[\s]*\[([\s\S]*?)\]/
    );

    if (dependsMatch && dependsMatch[1]) {
      const dependsContent = dependsMatch[1].trim();

      if (dependsContent) {
        const dependsMatches = dependsContent.match(/['"]([^'"]*)['"]/g);

        if (dependsMatches) {
          dependencies = dependsMatches.map((dep) =>
            dep.replace(/^['"]|['"]$/g, "")
          );
        }
      }
    }
  } catch (e) {
    console.error(`Error parsing manifest ${manifestFilePath}: ${e}`);
  }

  return { moduleName, dependencies };
}

function createDependencyJson(addonsPath) {
  const manifestFiles = findManifestFiles(addonsPath);

  if (!manifestFiles.length) {
    console.log(`No manifest files found in ${addonsPath}`);
    return;
  }

  const moduleDependencies = {};

  for (const mfPath of manifestFiles) {
    const { moduleName, dependencies } = parseManifest(mfPath);
    if (moduleName) {
      moduleDependencies[moduleName] = dependencies;
    }
  }

  fs.writeFileSync(
    path.join(process.cwd(), "module_dependencies.json"),
    JSON.stringify(moduleDependencies, null, 2),
    "utf-8"
  );

  console.log("Module dependencies saved to module_dependencies.json");
  console.log(`Total modules: ${Object.keys(moduleDependencies).length}`);
}

if (require.main === module) {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the path to your Odoo addons folder: ", (addonsPath) => {
    if (fs.existsSync(addonsPath) && fs.statSync(addonsPath).isDirectory()) {
      createDependencyJson(addonsPath);
    } else {
      console.log(`The path '${addonsPath}' is not a valid directory.`);
    }
    rl.close();
  });
}
