const fs = require('fs')

module.exports = async () => {
  if (fs.existsSync('./testdbs')) {
    fs.rmSync('./testdbs', { recursive: true })
  }

  fs.mkdirSync('./testdbs')
}
