const fs = require('fs')
const dir = './build'

if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true })
}
