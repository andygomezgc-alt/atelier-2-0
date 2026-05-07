// Metro bundler config tuned for the pnpm monorepo. Without this Metro
// fails to resolve workspace packages (@atelier/shared, @atelier/i18n)
// because pnpm puts them under .pnpm/<pkg>/node_modules instead of the
// flat layout Metro expects by default.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch every workspace package so edits hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the project's own node_modules first, then the
//    workspace root. pnpm hoists nothing, so both must be searched.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Enable symlinks (pnpm uses them for workspace links).
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
