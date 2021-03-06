
const express = require('express')
const path = require('path')
const cors = require('cors')
const compression = require('compression')
const bodyParser = require('body-parser')
const basicAuth = require('express-basic-auth')
const { rebuildBcMaps, getStatus } = require('./businessLogic')

// Initialize express and define a port
const app = express()
const PORT = 3000
let lastTransaction = -1

app.use(cors())

// Tell express to use body-parser's JSON parsing
app.use(bodyParser.json())

// GZIP http sent files for performance
app.use(compression())

// Public folder from where the BC maps will be served
app.use(express.static(path.join(__dirname, '../public')))

app.use('/hook', basicAuth({ users: { leanix: 'leanix' } }))

app.post('/hook', (req, res) => {
  const { body: { type, transactionSequenceNumber, factSheet: { type: fsType } = {} } } = req
  if (type !== 'FactSheetUpdatedEvent' || fsType !== 'BusinessCapability' || lastTransaction >= transactionSequenceNumber) return res.status(200).end()
  console.log(`${new Date().toISOString()} #${transactionSequenceNumber} - ${type} - ${fsType}`)
  lastTransaction = transactionSequenceNumber
  rebuildBcMaps(transactionSequenceNumber)
  res.status(200).end() // Responding is important
})

app.get('/status', (req, res) => res.json(getStatus()))

// Start express on the defined port
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
