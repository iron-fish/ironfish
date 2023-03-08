const { resolve } = require('path');
const { rm, readdir } = require('fs/promises');

// Get fully resolved paths of all sub-directories in a directory
async function getDirectories(dir) {
  return (await readdir(dir, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => resolve(dir, dirent.name))
}

// Recursively get all sub-directories including the root directory
async function getDirectoriesRecursivePlusRoot(dir) {
  const subDirs = await getDirectories(dir)

  const list = await Promise.all(subDirs.map((subDir) => getDirectoriesRecursivePlusRoot(subDir)))
  return [dir, ...list.flat()]
}

async function run() {
    const dirs = (await getDirectoriesRecursivePlusRoot(process.env.PWD))
    .filter((d) => {
      return !d.includes('node_modules') && d.endsWith('__fixtures__')
    })

    for(const dir of dirs) {
      await rm(dir, { recursive: true, force: true });

      console.log(`Deleted ${dir}`);
    }
}

run()
