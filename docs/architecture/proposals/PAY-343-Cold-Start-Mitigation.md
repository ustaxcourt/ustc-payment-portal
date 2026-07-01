# PAY-343 Cold Start Mitigation

Especially with our realitivly low amount of traffic expected (20,000 requests a year, accordng to DAWSON's data from 2025), we want to mitigate how long cold-starts can take, so that we don't leave clients waiting while the instance spins up.

### Some Assumptions before we begin
1. Assume a minimum of **20,000 requests** a year, with a max of **100,000 requests** as a max.
2. On Prod, we now have two AZs traffic can go through for High Availability, which can affect how the pinging solution would need to work.

## Pinging via EventBridge
This solution involves setting up EventBridge to ping each of the 3 payment functions once every 5 minutes, in order to keep atleast one instance alive per function at any given time. The primary advantage of pinging for our purposes is **that it is free**. That being said however, it's major disadvantage is that we would need to schedule **6 pings**, one per function across two AZs. AWS also gives a disclaimer that these pings are best effort - a ping can be in progress at the same time as a geniune client request, causing the client to still hit the cold-start we are trying to mitigate.

## Provisioned Concurrency
This solution ensures that there is atleast one warm lambda environment per function warm and ready to go, so that the client doesn't have to wait for a cold-start to finish.

