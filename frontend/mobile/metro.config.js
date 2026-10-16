// Налаштування під npm workspaces: за замовчуванням Metro шукає модулі лише
// в теці проєкту й не бачить ні спільного пакета, ні залежностей, піднятих
// у корінь монорепо.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Стежити за змінами і в спільному пакеті, а не лише у своїй теці.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Без цього дві копії react могли б потрапити у бандл.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
