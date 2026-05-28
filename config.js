const fs = require('fs');
const path = require('path');

let configCache = null;

function loadConfig() {
  if (!configCache) {
    const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8');
    configCache = JSON.parse(raw);
  }
  return configCache;
}

function reloadConfig() {
  configCache = null;
  return loadConfig();
}

module.exports = { loadConfig, reloadConfig };