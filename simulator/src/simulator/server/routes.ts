/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import express, { Router } from 'express'
import { Simulator } from '../simulator'

const routes = Router()

routes.get('/', (req, res) => {
  return res.json({ message: 'Hello World' })
})

routes.get('/nodes', (req, res) => {
  return res.json({ message: 'Hello World' })
})
export default routes

class SimulationRouter {
  simulator: Simulator
  constructor(simulator: Simulator) {
    this.simulator = simulator
  }

  getRoutes() {
    const routes = Router()

    routes.get('/', (req, res) => {
      return res.json({ message: 'Hello World' })
    })

    routes.get('/nodes', (req, res) => {
      return res.json({ message: 'Hello World' })
    })

    return routes
  }
}
