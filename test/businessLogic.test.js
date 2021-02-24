const { authenticator, graphql, rebuildBcMaps } = require('../src/businessLogic')

describe('Business Logic', function () {
  describe('generates the Business Capability Map', function () {
    beforeEach(async () => {
      await authenticator.start()
    })
    afterEach(async () => {
      await authenticator.stop()
    })
    it('queries the workspace', async function () {
      const query = '{allFactSheets{totalCount}}'
      const result = await graphql.executeGraphQL(query)
      console.log(`There are ${result.allFactSheets.totalCount} factSheets in workspace ${authenticator.workspaceName}`)
    })

    it('generates the bc map', async function () {
      this.timeout(60000)
      await rebuildBcMaps()
    })
  })
})
