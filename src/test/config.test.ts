/*
 * Copyright 2022 Mia srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { symlink } from 'fs/promises'
import path from 'path'

import { expect } from 'chai'

import { parseConfig } from '../config'
import * as defaultConfigs from '../defaults'
import type { EnvironmentVariables } from '../schemas/environmentVariablesSchema'
import { baseVariables, createConfigFile, createTmpDir } from '../utils/test-utils'

const createEnvVars = (configPath: string): EnvironmentVariables => ({
  ...baseVariables,
  SERVICE_CONFIG_PATH: configPath,
})

const defaults = {
  ACL_CONTEXT_BUILDER: undefined,
  ACL_CONTEXT_BUILDER_PATH: '/usr/src/app/config/acl-context-builder.js',
  CONTENT_TYPE_MAP: defaultConfigs.CONTENT_TYPE_MAP,
  ENABLE_CACHE: defaultConfigs.ENABLE_CACHE,
  LANGUAGES_CONFIG: [],
  LANGUAGES_DIRECTORY_PATH: '/usr/static/languages',
  PUBLIC_DIRECTORY_PATH: '/usr/static/public',
  RESOURCES_DIRECTORY_PATH: '/usr/static/configurations',
  USER_PROPERTIES_HEADER_KEY: 'miauserproperties',
}

describe('config injection tests', () => {
  it('should parse an empty configuration', async () => {
    const { name: url, cleanup } = await createConfigFile({})
    const envVars = createEnvVars(url)

    expect(parseConfig(envVars)).to.deep.equal({
      ...defaults,
      PUBLIC_HEADERS_MAP: {},
      SERVICE_CONFIG_PATH: url,
    })

    await cleanup()
  })

  it('should parse a language configuration', async () => {
    const enLabelsMap = { key: 'value' }
    const { cleanup, name: targetPath } = await createTmpDir({
      'en.json': JSON.stringify(enLabelsMap),
    })

    // symlinks directories should be ignored
    const itLabelsMap = { anotherKey: 'anotherValue' }
    const { name: otherPath } = await createTmpDir({
      'it-real.json': JSON.stringify(itLabelsMap),
    })
    const { name: anotherPath } = await createTmpDir({})
    await symlink(anotherPath, path.join(targetPath, 'linkToAnotherDir'), 'dir')
    await symlink(otherPath, path.join(targetPath, 'linkToOtherDir'), 'dir')
    await symlink(path.join(otherPath, 'it-real.json'), path.join(targetPath, 'it.json'), 'file')

    const envVars = {
      ...baseVariables,
      LANGUAGES_DIRECTORY_PATH: targetPath,
    }

    expect(parseConfig(envVars)).to.deep.equal({
      ...defaults,
      LANGUAGES_CONFIG: [
        {
          labelsMap: enLabelsMap,
          languageId: 'en',
        },
        {
          labelsMap: itLabelsMap,
          languageId: 'it',
        },
      ],
      LANGUAGES_DIRECTORY_PATH: targetPath,
      PUBLIC_HEADERS_MAP: {},
      SERVICE_CONFIG_PATH: defaultConfigs.SERVICE_CONFIG_PATH,
    })

    await cleanup()
  })

  it('should parse a configuration with custom acl context builder', async () => {
    const filename = 'acl-context-builder.js'
    const { cleanup, name: targetPath } = await createTmpDir({
      [filename]: 'export default () => { return [] }',
    })
    const aclContextBuilderPath = path.join(targetPath, filename)

    const envVars = {
      ...baseVariables,
      ACL_CONTEXT_BUILDER_PATH: aclContextBuilderPath,
    }

    const config = parseConfig(envVars)
    expect(config.ACL_CONTEXT_BUILDER).to.be.a('function')

    config.ACL_CONTEXT_BUILDER = undefined
    expect(config).to.deep.equal({
      ...defaults,
      ACL_CONTEXT_BUILDER_PATH: aclContextBuilderPath,
      PUBLIC_HEADERS_MAP: {},
      SERVICE_CONFIG_PATH: defaultConfigs.SERVICE_CONFIG_PATH,
    })

    await cleanup()
  })

  it('should parse a content-type configuration with lowercase key', async () => {
    const { name: url, cleanup } = await createConfigFile({
      contentTypeMap: {
        '.js': 'text/plain',
        '.txt, .pdf': ['text/plain', 'charset=utf-8'],
      },
      publicHeadersMap: {
        '/public/index.html': {
          'Content-Type': [['text/plain', 'charset=utf8']],
        },
      },
    })
    const envVars = createEnvVars(url)

    expect(parseConfig(envVars)).to.deep.equal({
      ...defaults,
      CONTENT_TYPE_MAP: {
        ...defaults.CONTENT_TYPE_MAP,
        '.js': 'text/plain',
        '.pdf': 'text/plain; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
      },
      PUBLIC_HEADERS_MAP: {
        '/public/index.html': {
          'content-type': 'text/plain; charset=utf8',
        },
      },
      SERVICE_CONFIG_PATH: url,
    })

    await cleanup()
  })
})
