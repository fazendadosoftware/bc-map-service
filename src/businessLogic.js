const { existsSync, mkdirSync, writeFileSync } = require('fs')
const { Authenticator, GraphQLClient } = require('leanix-js')
const lxr = require('../lxr.json')
const publicFolder = './public'

const authenticator = new Authenticator(lxr.instance, lxr.apiToken)
const graphql = new GraphQLClient(authenticator)

const generateBcMaps = async () => {
  await authenticator.start()
  const query = `
  {
    allFactSheets(filter: {facetFilters: [{facetKey: "FactSheetTypes", keys: ["BusinessCapability"]}]}, sort: [{key: "level", order: desc}]) {
      edges {
        node {
          id
          type
          name
          description
          level
          ... on BusinessCapability {
            parentId: relToParent {
              edges {
                node {
                  factSheet {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  `.replace(/\s\s+/g, ' ')
  const businessCapabilities = await graphql.executeGraphQL(query)
    .then(
      ({ allFactSheets: { edges } }) => edges
        .map(({ node }) => {
          let { description = null, parentId: { edges: [{ node: { factSheet: { id: parentId = null } = {} } = {} } = {}] } } = node
          delete node.description
          if (description === null) description = '{}'
          try {
            description = JSON.parse(description === null ? '{}' : description)
          } catch (error) {
            console.error(error)
            description = {}
          }
          return { ...node, parentId, ...description }
        })
    )
  const businessCapabilityIndex = businessCapabilities
    .reduce((accumulator, businessCapability) => ({ ...accumulator, [businessCapability.id]: businessCapability }), {})
  const businessCapabilityMapIndex = Object.values(businessCapabilityIndex)
    .reduce((accumulator, businessCapability) => {
      const { parentId = null } = businessCapability
      delete businessCapability.parentId
      delete businessCapability.level
      if (parentId !== null) {
        const parent = accumulator[parentId]
        if (!Array.isArray(accumulator[parentId].children)) parent.children = []
        parent.children.push(businessCapability)
        delete accumulator[businessCapability.id]
      }
      return accumulator
    }, businessCapabilityIndex)
  const bcMaps = Object.values(businessCapabilityMapIndex)
  const { workspaceId, instance } = authenticator
  authenticator.stop()
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

module.exports = {
  authenticator,
  graphql,
  generateBcMaps,
  rebuildBcMaps
}
