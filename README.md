# FBS CMS Adapter

The adapter is a thin layer on top of _FBS CMS API_ which allow software running in a browser (or similar) to call the API using a _DÅP token_.

## Using the adapter

The adapter must be called with a DÅP token associated with a client that is configured with FBS credentials. In this way the adapter is able to login to the FBS CMS on behalf of the user. There are differences to how the adapter should be called compared to calling the FBS CMS API directly:

1. The adapter requires the DÅP token to be given as authorization bearer header.
2. Values for agencyid and patronid must not be set explicitly in the path.\*\*
3. The X-session header required by FBS CMS API shall not be set. The adapter will log in on behalf of the user and set the X-session)\*\*

Available endpoints in the FBS CMS API may be divided into two categories:

1. Accessing anonymous data where `agencyid` is specified in the path
2. Accessing user specific data where both `agencyid` and `patronid` are specified in the path.

For these two types of tokens can be used:

- Anonymous tokens for requests that do not include a Patron ID: `Authorization: Bearer {ANONYMOUS_TOKEN}`
- Authenticated tokens for requests that includes a Patron ID: `Authorization: Bearer {AUTHENTICATED_TOKEN}`

The tokens are aquired through login.bib.dk

## Request parameters

The above requirements gives the following request syntax:

A request to FBS CMS API, consists of a Header with a X-session token, a host and a path:

`curl -H "X-session: {SESSION_TOKEN}" "{FBS_HOST}/{PATH}"`

When using the adapter, the header should be replaced with a DÅP token and FBS_HOST should be replaced with the adapter host:

`curl -H "Authorization: Bearer {TOKEN}" "{ADAPTER_HOST}/{PATH}"`

If the path contains an agencyid parameter and/or a patronid parameter theese should be filled out with the strings `agencyid` and `patronid`:

`/external/v1/{agencyid}/patrons/{patronid}/reservations/v2` becomes `/external/v1/agencyid/patrons/patronid/reservations/v2`

## Examples

Here are a couple of examples on how to call the adapter:

| Description                                                                                 | Request                                                                                                                      | Response Body                                                                     | Response Status Code |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------- |
| The adapter inserts a proper agencyid when call is proxied to the FBS CMS API.              | `curl -H "Authorization: Bearer ANONYMOUS_TOKEN" "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"`   | `[{"recordId":"51701763", "reservable":false, "reservations":0, "holdings": []}]` | 200                  |
| The adapter inserts a proper agencyid and patronid when call is proxied to the FBS CMS API. | `curl -H "Authorization: Bearer AUTHENTICATED_TOKEN" "{ADAPTER_HOST}/external/v1/agencyid/patrons/patronid/reservations/v2"` | `[...]`                                                                           | 200                  |

## CPR required requests

Some requests to FBS CMS API, will require a CPR number to be attached to the body. The adapter will automatically fetch the patrons CPR number, from the `/userinfo` endpoint at `login.bib.dk/userinfo` by using the authenticated token.

The CPR data on the `/userinfo` endpoint will only be available for CPR validated users (nem-id validated e.g.).

List of request requiring CPR to be attached to the body:

| Description                                                        | Method | Request                                                                                                          | Request body                                                          |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The adapter inserts CPR when creating patron request.              | POST   | `curl -H "Authorization: Bearer AUTHENTICATED_TOKEN" "{ADAPTER_HOST}/external/agencyid/patrons/v5"`              | `{props..., "cprNumber": "0102031234"}`                               |
| The adapter inserts CPR when creating patron withguardian request. | POST   | `curl -H "Authorization: Bearer AUTHENTICATED_TOKEN" "{ADAPTER_HOST}/external/agencyid/patrons/withGuardian/v1"` | `{props..., "guardian": { "cprNumber": "0102031234" } }`              |
| The adapter inserts CPR for patron pincode change request.         | PUT    | `curl -H "Authorization: Bearer AUTHENTICATED_TOKEN" "{ADAPTER_HOST}/external/agencyid/patrons/patronid/v3"`     | `{props..., "pincodeChange": { "libraryCardNumber": "0102031234" } }` |

## Custom responses from the Adapter

For the most of the time the adapter will pass raw responses from the FBS CMS API back to the caller. In some circumstances however, the adapter itself return error messages:
| Description | Request | Response Body | Response Status Code |
|-------------|---------|---------------|----------------------|
| Missing authorization header |`curl "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"`| `{"message":"headers should have required property 'authorization'"}`| 400 |
| Token does not exist | `curl -H "Authorization: Bearer TOKEN_NON_EXISTING" "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"` | `{"message":"invalid token"}` | 403 |
| Token is associated with client not configured with credentials for accessing FBS CMS API | `curl -H "Authorization: Bearer TOKEN_MISSING_CREDENTIALS" "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"` | `{"message":"token must have FBS credentials with 'agencyid', 'username' and 'password'"}` | 403 |
| Anonymous token is used where authenticated token is required | `curl -H "Authorization: Bearer ANONYMOUS_TOKEN" "{ADAPTER_HOST}/external/v1/agencyid/patrons/patronid/reservations/v2"` | `{"message":"user authenticated token is required"}` | 403 |
| Authenticate or preauthenticated path is called | `curl -H "Authorization: Bearer SOME_TOKEN" "{ADAPTER_HOST}/external/agencyid/patrons/authenticate/v6"` | `{"message":"not found"}` | 404 |

## Setting up the dev environment

Use docker-compose to start the dev server on port 3000.
`docker-compose -f docker-compose-dev.yml up`
This will start a service for mocking HTTP, a Redis and the adapter. The adapter and mock service are restarted automatically when files change in the src folder.

When the dev environment is started, run tests with `npm run cy:open`.

## Environment Variables

- **LOG_LEVEL**
  Sets the log level. Supported values are _TRACE, DEBUG, INFO, WARN, ERROR or OFF_
- **SMAUG_URL**
  Url pointing at smaug configuration endpoint
- **FBS_CMS_API_URL**
  Url pointing at the root of the FBS CMS API. This is where HTTP requests are proxied to.
- **REDIS_CLUSTER_HOST**
  Set this if Redis is running in cluster mode
- **REDIS_HOST**
  Set this if Redis is running as a single instance (Used for development)
