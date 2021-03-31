const base = require('../config/jest.config.base')
const pkg = require('./package.json')

module.exports = {
  ...base,
  displayName: pkg.name,
  globalSetup: './jest.setup.js',
  setupFilesAfterEnv: ['./jest.setup.env.js'],
}
