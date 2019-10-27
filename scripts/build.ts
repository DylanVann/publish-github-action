import * as path from 'path'
import * as fs from 'fs-extra'

async function build() {
  const outputPath = path.join(__dirname, '../dist/index.js')
  const content = await fs.readFile(outputPath, { encoding: 'utf8' })
  const newContent = content.replace(
    'const getUserAgent = __webpack_require__',
    'const { getUserAgent } = __webpack_require__',
  )
  await fs.writeFile(outputPath, newContent)
}

build()
