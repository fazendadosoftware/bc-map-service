const { existsSync, mkdirSync, writeFileSync } = require('fs')
const { Authenticator, GraphQLClient } = require('leanix-js')
const lxr = require('../lxr.json')
const publicFolder = './public'

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

const rebuildBcMaps = async transactionSequenceNumber => {
  if (!existsSync(publicFolder)) mkdirSync(publicFolder)
  const bcMaps = await generateBcMaps()
  if (transactionSequenceNumber) bcMaps.transactionSequenceNumber = transactionSequenceNumber
  writeFileSync(`${publicFolder}/bcMaps.json`, JSON.stringify(bcMaps, null, 2))
  console.log(`${new Date().toISOString()} #${transactionSequenceNumber || 0} - updated bcMaps.json`)
}

authenticator.start()
authenticator.on('authenticated', () => rebuildBcMaps())
authenticator.on('error', err => console.error('authentication error', err))

module.exports = {
  authenticator,
  graphql,
  generateBcMaps,
  rebuildBcMaps
}
