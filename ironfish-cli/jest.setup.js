const fs = require('fs')

module.exports = async () => {
  if (fs.existsSync('./testdbs')) {
    fs.rmdirSync('./testdbs', { recursive: true })
  }

  fs.mkdirSync('./testdbs')
}
