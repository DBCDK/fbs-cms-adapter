# FBS CMS Adapter
The adapter is a thin layer on top of *FBS CMS API* which allow software running in a browser (or similar) to call the API using a *DÅP token*. The adapter is responsible for user authentication ... More to come

## Using the adapter
...

## Setting up the dev environment
Use docker-compose to start the dev server on port 3000.
`docker-compose -f docker-compose-dev.yml up`
This will start a service for mocking HTTP, a Redis and the adapter. The adapter and mock service are restarted automatically when files change in the src folder.

When the dev environment is started, run tests with `npm run cy:open`.

