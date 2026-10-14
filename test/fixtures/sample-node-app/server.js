import { createServer } from 'node:http'
import process from 'node:process'

createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('Hello from hanamii CLI\n')
}).listen(Number(process.env.PORT || 8080), '0.0.0.0')
