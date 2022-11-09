import fs from 'fs/promises'
import path from 'path'

import type { Config as V1Config, Plugin as V1Plugin } from '@micro-lc/interfaces/v1'
import type { Config as V2Config } from '@micro-lc/interfaces/v2'

import type { Converter } from '../types'

import { buildLayout } from './convert-layout'
import { buildApplications } from './convert-plugins'

export interface V1AuthConfig {
  isAuthNecessary: boolean
  userInfoUrl?: string
  userLogoutUrl?: string
}

const importAuthConfig = async (fileAbsPath: string): Promise<V1AuthConfig> => {
  if (path.extname(fileAbsPath) !== '.json') {
    throw new TypeError(`${fileAbsPath} is not a JSON file`)
  }

  const rawContent = await fs.readFile(fileAbsPath, 'utf-8')
  const input = JSON.parse(rawContent) as V1AuthConfig

  if (input.isAuthNecessary === undefined) {
    throw new TypeError(`${fileAbsPath} is not a valid authentication configuration`)
  }

  return input
}

const importConfig = async (fileAbsPath: string): Promise<V1Config> => {
  if (path.extname(fileAbsPath) !== '.json') {
    throw new TypeError(`${fileAbsPath} is not a JSON file`)
  }

  const rawContent = await fs.readFile(fileAbsPath, 'utf-8')
  return JSON.parse(rawContent) as V1Config
}

const pluginSorter = (pluginA: V1Plugin, pluginB: V1Plugin) => (pluginA.order ?? 0) - (pluginB.order ?? 0)

const flattenDeep = <T = unknown>(input: T[]): T[] => {
  let res: T[] = []

  for (const element of input) {
    if (Array.isArray(element)) {
      res = res.concat(flattenDeep((element)))
    } else {
      res.push(element)
    }
  }

  return res
}

const findDefaultUrl = (sortedPlugins: V1Plugin[]): string | undefined => {
  const flattenedPlugins = flattenDeep<V1Plugin>(sortedPlugins)

  const firstPlugin = flattenedPlugins.find(plugin => {
    return !plugin.content && plugin.integrationMode && plugin.integrationMode !== 'href'
  })

  // TODO: is it correct to prepend a dot?
  return firstPlugin?.pluginUrl ? `.${firstPlugin.pluginUrl}` : undefined
}

const convertShared = (input: V1Config['shared']): V2Config['shared'] => {
  if (!input) { return undefined }

  const { props, ...rest } = input

  return { properties: props, ...rest }
}

export const convertConfig = (v1Auth: V1AuthConfig, v1Config: V1Config): V2Config => {
  const output: V2Config = { version: 2 }

  const oShared = convertShared(v1Config.shared)
  oShared && (output.shared = oShared)

  const iSortedPlugins = (v1Config.plugins ?? []).sort(pluginSorter)
  iSortedPlugins.forEach(plugin => plugin.content?.sort(pluginSorter))

  output.settings = { defaultUrl: findDefaultUrl(iSortedPlugins) }
  output.layout = buildLayout(v1Config, v1Auth, iSortedPlugins)
  output.applications = buildApplications(v1Config)

  return output
}

export const convertConfigFiles: Converter = async ({ logger, fileAbsPaths, dir: outDir }) => {
  const [v1Auth, v1Config] = await Promise
    .all([importAuthConfig(fileAbsPaths[0]), importConfig(fileAbsPaths[1])])
    .catch((err: unknown) => {
      logger.error(`Error converting configuration`)
      throw err
    })

  const v2Config = convertConfig(v1Auth, v1Config)
  const jsonConfig = JSON.stringify(v2Config, null, 2)

  if (outDir) {
    const outputFilePath = path.join(outDir, 'configuration.v2.json')
    await fs.writeFile(outputFilePath, jsonConfig)

    logger.success(`Successfully converted configurations file to ${outputFilePath}`)
    return
  }

  console.log(jsonConfig)
}
