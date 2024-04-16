const fs = require("fs");
const dtsGen = require("dts-gen");
const path = require("path");
const ini = require("ini");
const _ = require("lodash");

function resolveRootPath() {
  const __dirname = path.resolve();
  const dirpath = path.resolve(__dirname);
  if (dirpath.includes("node_modules")) {
    return dirpath.split("node_modules")[0];
  }
  return path.resolve(dirpath, "../..");
}

// https://stackoverflow.com/a/175787/10012118
function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}

function parseIni(text) {
  const obj = ini.parse(text);
  return _.cloneDeepWith(obj, (value) => {
    if (isNumeric(value)) {
      return _.toNumber(value);
    }
  });
}

function generateConfigTypes() {
  const rootPath = resolveRootPath();

  const rawConfig = fs.readFileSync(
    path.join(rootPath, "default.config.ini"),
    "utf-8"
  );

  const config = parseIni(rawConfig);

  const result = dtsGen
    .generateIdentifierDeclarationFile("IBkConfig", config)
    .replace("declare const IBkConfig:", "declare interface IBkConfig");

  fs.writeFileSync(
    path.join(rootPath, "apps/studio/src/typings/bkconfig.d.ts"),
    result
  );
}

module.exports = {
  parseIni,
  generateConfigTypes,
};
