/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../command'
import { ONE_FISH_IMAGE, TWO_FISH_IMAGE } from '../images'

const FRAME_RATE_MS = 1000 / 30

export default class SwimCommand extends IronfishCommand {
  static description = 'See the hex fish swim'
  static hidden = true

  async start(): Promise<void> {
    await this.parse(SwimCommand)

    const images = [ONE_FISH_IMAGE, TWO_FISH_IMAGE]
    const image = images[Math.round(Math.random() * (images.length - 1))]
    const pixels = this.getPixels(image)
    let last = Date.now()
    let elapsed = 0

    for (;;) {
      // Calculate elapsed time for calculating elapsed frames
      const now = Date.now()
      elapsed += now - last
      last = now

      // Calculate elapsed frames
      let frames = Math.floor(elapsed / FRAME_RATE_MS)
      elapsed -= FRAME_RATE_MS * frames

      // Update for each elapsed frame
      while (frames-- > 0) {
        pixels.unshift(pixels.pop() as Array<string>)
      }

      // Render the current frame
      // eslint-disable-next-line no-console
      console.clear()
      this.renderPixels(pixels)
      this.log('The hex fish are coming...')
      await CliUx.ux.wait(32)
    }

    // eslint-disable-next-line no-console
    console.clear()
  }

  getPixels(image: string): Array<Array<string>> {
    const rows = image.split('\n')
    const rowToGetWidth = Math.round(rows.length / 2)
    const width = rows[rowToGetWidth].length
    const height = rows.length

    const pixels = new Array<Array<string>>()
    for (let x = 0; x < width; ++x) {
      const col = []

      for (let y = 0; y < height; ++y) {
        col.push(rows[y][x])
      }

      pixels.push(col)
    }

    return pixels
  }

  renderPixels(pixels: Array<Array<string>>): void {
    const rows = new Array<string>()
    const height = pixels[0].length
    const width = pixels.length

    for (let y = 0; y < height; ++y) {
      const row = []

      for (let x = 0; x < width; ++x) {
        row.push(pixels[x][y])
      }

      rows.push(row.join(''))
    }

    this.log(rows.join('\n'))
  }
}
