import { existsSync, statSync } from 'fs'
import path from 'path'

import fastifyStaticPlugin from '@fastify/static'

import type { FastifyContext } from '../server'

async function registerPublic(this: FastifyContext) {
  const { config: { PUBLIC_DIRECTORY_PATH }, service } = this
  return service.register(
    fastifyStaticPlugin, {
      prefix: '/public',
      prefixAvoidTrailingSlash: true,
      root: PUBLIC_DIRECTORY_PATH,
    }
  )
}

function registerConfigurations(this: FastifyContext) {
  const { config: { RESOURCES_DIRECTORY_PATH }, service } = this
  service.addRawCustomPlugin('GET', '/configurations/*', async (request, reply) => {
    const { url } = request
    const filename = path.join(RESOURCES_DIRECTORY_PATH, url.replace(/^\/configurations/, ''))
    if (existsSync(filename) && statSync(filename).isFile()) {
      reply.statusCode = 200
      return filename
    }

    return reply.callNotFound()
  })
}

export { registerConfigurations, registerPublic }
