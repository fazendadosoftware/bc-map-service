
const express = require('express')
const path = require('path')
const compression = require('compression')
const bodyParser = require('body-parser')
const basicAuth = require('express-basic-auth')
const { rebuildBcMaps } = require('./businessLogic')

// Initialize express and define a port
const app = express()
const PORT = 3000
let lastTransaction = -1

// Tell express to use body-parser's JSON parsing
app.use(bodyParser.json())
// GZIP http sent files for performance
app.use(compression())

app.use('/hook', basicAuth({ users: { leanix: 'leanix' } }))

// Public folder from where the BC maps will be served
app.use(express.static(path.join(__dirname, 'build')))

app.post('/hook')
app.post('/hook', (req, res) => {
  const { body: { type, transactionSequenceNumber, factSheet: { type: fsType } = {} } } = req
  if (type !== 'FactSheetUpdatedEvent' || fsType !== 'BusinessCapability' || lastTransaction >= transactionSequenceNumber) return res.status(200).end()
  console.log(transactionSequenceNumber, type, fsType)
  lastTransaction = transactionSequenceNumber
  rebuildBcMaps(transactionSequenceNumber)
  res.status(200).end() // Responding is important
})

// Start express on the defined port
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
