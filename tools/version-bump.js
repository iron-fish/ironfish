/**
 * Bumps the patch version of npm packages, and updates the dependencies of other npm
 * packages to use the new version.
 *
 * Does not bump the Rust version by default -- call `node version-bump.js rust` to bump
 * the Rust package version.
 *
 * Flags:
 *   rust - Bumps the @ironfish/rust-nodejs package version.
 */

const fs = require('fs/promises');
const path = require('path')

const CLI_PACKAGE = path.join(__dirname, '../ironfish-cli/package.json')
const NODE_PACKAGE = path.join(__dirname, '../ironfish/package.json')
const RUST_PACKAGE = path.join(__dirname, '../ironfish-rust-nodejs/package.json')

const shouldBumpIronfishRust = process.argv.find((a) => a.includes('rust'))
const isPatchRelease = process.argv.find((a) => a.includes('patch'))
const isMajorRelease = process.argv.find((a) => a.includes('major'))

const bumpVersion = (version) => {
  if (isMajorRelease) {
    return bumpMajor(version)
  } else if (isPatchRelease) {
    return bumpPatch(version)
  } else {
    return bumpDefault(version)
  }
}

const bumpMajor = (version) => {
  const { major, minor, patch } = parseVersion(version)
  return `${parseInt(major) + 1}.0.0`
}

const bumpDefault = (version) => {
  const { major, minor, patch } = parseVersion(version)
  return `${major}.${parseInt(minor) + 1}.0`
}

const bumpPatch = (version) => {
  const { major, minor, patch } = parseVersion(version)
  return `${major}.${minor}.${parseInt(patch) + 1}`
}

const parseVersion = (version) => {
  const versions = version.split('.')
  return {
    major: versions[0],
    minor: versions[1],
    patch: versions[2],
  }
}

const readPackage = async (path) => {
  let data
  try {
    data = await fs.readFile(path, 'utf8')
  } catch (err) {
    console.log(`Error reading ${path}: ${err}`);
    throw err
  }

  return JSON.parse(data)
}

const writePackage = async (path, package) => {
  const toWrite = JSON.stringify(package, null, 2) + '\n'

  try {
    await fs.writeFile(path, toWrite, 'utf8')
  } catch (err) {
    console.log(`Error writing ${path}: ${err}`);
    throw err
  }
}

const getDirectories = async source =>
  (await fs.readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

const bumpNodeAndCliPackage = async (shouldBumpRust) => {
  const nodePackage = await readPackage(NODE_PACKAGE)
  const cliPackage = await readPackage(CLI_PACKAGE)

  // Bump node package and packages that depend on it
  const newNodeVersion = bumpVersion(nodePackage.version)
  nodePackage.version = newNodeVersion
  cliPackage.dependencies[nodePackage.name] = newNodeVersion

  // Bump the CLI
  cliPackage.version = bumpVersion(cliPackage.version)

  writePackage(NODE_PACKAGE, nodePackage)
  writePackage(CLI_PACKAGE, cliPackage)
}

const bumpRustPackage = async () => {
  const deps = await getDirectories(path.join(__dirname, '../ironfish-rust-nodejs/npm/'))

  for (const dep of deps) {
    const package = path.join(__dirname, '../ironfish-rust-nodejs/npm/', dep, 'package.json')
    const depPackage = await readPackage(package)
    depPackage.version = bumpVersion(depPackage.version)
    await writePackage(package, depPackage)
  }

  const nodePackage = await readPackage(NODE_PACKAGE)
  const cliPackage = await readPackage(CLI_PACKAGE)
  const rustPackage = await readPackage(RUST_PACKAGE)

  const newRustVersion = bumpVersion(rustPackage.version)

  rustPackage.version = newRustVersion
  nodePackage.dependencies[rustPackage.name] = newRustVersion
  cliPackage.dependencies[rustPackage.name] = newRustVersion

  await writePackage(NODE_PACKAGE, nodePackage)
  await writePackage(CLI_PACKAGE, cliPackage)
  await writePackage(RUST_PACKAGE, rustPackage)
}

// Main script
const main = async () => {
  if (shouldBumpIronfishRust) {
    await bumpRustPackage()
  }

  await bumpNodeAndCliPackage()
}

main().then(() => {
  console.log('Finished.')
}).catch((e) => {
  console.error(`An error occurred: ${e}`)
})
