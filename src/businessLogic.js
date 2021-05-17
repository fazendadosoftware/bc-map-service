const { existsSync, mkdirSync, writeFileSync } = require('fs')
const { Authenticator, GraphQLClient } = require('leanix-js')
const fetch = require('node-fetch')
const FormData = require('form-data')
const lxr = require('../lxr.json')
const publicFolder = './public'

const status = { transaction: -1, lastUpdate: null }

const authenticator = new Authenticator(lxr.instance, lxr.apiToken)
const graphql = new GraphQLClient(authenticator)

const generateBcMaps = async () => {
  const maxHierarchyLevel = 4
  let query = `
  {
    allFactSheets(filter: {facetFilters: [{facetKey: "FactSheetTypes", keys: ["BusinessCapability"]}, {facetKey: "hierarchyLevel", keys: ["1"]}]}, sort: [{key: "level", order: desc}]) {
      edges {
        node {
          id
          type
          name
          description
          level
          {{children}}
        }
      }
    }
  }
  `.replace(/\s\s+/g, ' ')
  const childrenFragment = '...on BusinessCapability { children:relToChild { edges { node { id factSheet { id type name description level {{children}} } } } } }'
  query = [...Array(maxHierarchyLevel).keys()]
    .reduce((accumulator, _, level) => accumulator.replace('{{children}}', level < (maxHierarchyLevel - 1) ? childrenFragment : ''), query)

  const unrollChildren = node => {
    let { id, description = null, factSheet = null, children: { edges: children = null } = {} } = node
    if (children === null && factSheet !== null) ({ description = null, children: { edges: children = [] } = {} } = factSheet)
    if (description === null) description = '{}'
    try {
      description = JSON.parse(description === null ? '{}' : description)
    } catch (error) {
      console.error(error)
      description = {}
    }

    const { childrenOrder = [] } = description
    if (childrenOrder.length) {
      const childIdx = childrenOrder.reduce((accumulator, factSheetId, i) => ({ ...accumulator, [factSheetId]: i }), {})
      children = children.sort(({ node: { factSheet: { id: A } } }, { node: { factSheet: { id: B } } }) => {
        const idxA = childIdx[A]
        const idxB = childIdx[B]
        return idxA < idxB ? -1 : idxA > idxB ? 1 : 0
      })
    }

    children = children.map(({ node }) => unrollChildren(node))
    node = { ...(factSheet === null ? node : factSheet), relToParentId: factSheet === null ? null : id, children }
    delete node.description
    return { ...node, ...description }
  }

  const bcMaps = await graphql.executeGraphQL(query)
    .then(({ allFactSheets: { edges } }) => edges.map(({ node }) => unrollChildren(node)))
    .then(bcMaps => bcMaps.filter(({ published }) => !!published))

  const { workspaceId, instance } = authenticator
  return { workspaceId, instance, timestamp: new Date().toISOString(), bcMaps }
}

const rebuildBcMaps = async (transactionSequenceNumber = 0) => {
  status.transaction = transactionSequenceNumber
  if (!existsSync(publicFolder)) mkdirSync(publicFolder)
  const bcMaps = await generateBcMaps()
  if (transactionSequenceNumber) bcMaps.transactionSequenceNumber = transactionSequenceNumber
  writeFileSync(`${publicFolder}/bcMaps.json`, JSON.stringify(bcMaps, null, 2))
  const form = new FormData()
  form.append('file', Buffer.from(JSON.stringify(bcMaps), 'utf-8'), { contentType: 'application/json', name: 'file', filename: 'bcmaps.json' })
  form.append('folderPath', '/bcmaps')
  form.append('options', JSON.stringify({ access: 'PUBLIC_INDEXABLE', overwrite: true }))
  try {
    if (!lxr.hapikey) throw Error('No hapikey in lxr.json!')
    const options = { method: 'POST', body: form }
    const response = await fetch(`https://api.hubapi.com/files/v3/files?hapikey=${lxr.hapikey}`, options)
    const { ok, status: statusCode } = response
    const data = await response.json()
    if (ok && statusCode === 201) {
      status.ok = true
      status.url = data.url
      status.error = null
      console.log(`${new Date().toISOString()} #${transactionSequenceNumber || 0} - updated bcMaps.json`)
    } else throw Error(JSON.stringify({ statusCode, ...data }))
  } catch (error) {
    console.log(`${new Date().toISOString()} #${transactionSequenceNumber || 0} - error updating bcMaps.json`, error)
    status.ok = false
    status.error = error.message
  } finally {
    status.lastUpdate = new Date().toISOString()
  }
}

authenticator.start()
authenticator.on('authenticated', () => rebuildBcMaps())
authenticator.on('error', err => console.error('authentication error', err))

module.exports = {
  authenticator,
  graphql,
  generateBcMaps,
  rebuildBcMaps,
  getStatus: () => status
}
