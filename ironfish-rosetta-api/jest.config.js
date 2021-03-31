const base = require('../config/jest.config.base')
const pkg = require('./package.json')

module.exports = {
  ...base,
  testEnvironment: '../config/jestNodeEnvironment',
  watchPlugins: ['../config/jestWatchPlugin'],
  displayName: pkg.name,
}
