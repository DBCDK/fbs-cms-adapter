# FBS CMS Adapter
The adapter is a thin layer on top of *FBS CMS API* which allow software running in a browser (or similar) to call the API using a *DÅP token*.

## Using the adapter
The adapter must be called with a DÅP token associated with a client that is configured with FBS credentials. In this way the adapter is able to login to the FBS CMS on behalf of the user. There are differences to how the adapter should be called compared to calling the FBS CMS API directly. 

The adapter requires the DÅP token to be given as authorization bearer header, and values for agencyid and patronid must not be set explicitly in the path. Furthermore, the user should not set the X-session header (the adapter will log in on behalf of the user and set the X-session). Available endpoints in the FBS CMS API may be divided into two categories; accessing anonymous data where agencyid is specified in the path, and accessing user specific data where both agencyid and patronid are specified in the path. The latter requires an authenticated token.

Here are a couple of examples on how to call the adapter:

| Description | Request | Response Body | Response Status Code |
|-------------|---------|---------------| -------------------- |
| The adapter inserts a proper agencyid when call is proxied to the FBS CMS API. |`curl -H "Authorization: Bearer ANONYMOUS_TOKEN" "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"`|  `[{"recordId":"51701763", "reservable":false, "reservations":0, "holdings": []}]`| 200 |
| The adapter inserts a proper agencyid and patronid when call is proxied to the FBS CMS API.  |`curl -H "Authorization: Bearer AUTHENTICATED_TOKEN" "{ADAPTER_HOST}/external/v1/agencyid/patrons/patronid/reservations/v2"`|  `[...]`| 200 |

For the most of the time the adapter will pass raw responses from the FBS CMS API back to the caller. In some circumstances however, the adapter itself return error messages:
| Description | Request | Response Body | Response Status Code |
|-------------|---------|---------------|----------------------|
| Missing authorization header |`curl "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"`|  `{"message":"headers should have required property 'authorization'"}`| 400 |
| Token does not exist |  `curl -H "Authorization: Bearer TOKEN_NON_EXISTING" "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"`  | `{"message":"invalid token"}`  | 403 |
| Token is associated with client not configured with credentials for accessing FBS CMS API |  `curl -H "Authorization: Bearer TOKEN_MISSING_CREDENTIALS" "{ADAPTER_HOST}/external/agencyid/catalog/holdings/v3?recordid=51701763"`  | `{"message":"token must have FBS credentials with 'agencyid', 'username' and 'password'"}`  | 403 |
| Anonymous token is used where authenticated token is required | `curl -H "Authorization: Bearer ANONYMOUS_TOKEN" "{ADAPTER_HOST}/exter-vl/v1/agencyid/patrons/patronid/reservations/v2"` | `{"message":"user authenticated token is required"}` | 403 |

## Setting up the dev environment
Use docker-compose to start the dev server on port 3000.
`docker-compose -f docker-compose-dev.yml up`
This will start a service for mocking HTTP, a Redis and the adapter. The adapter and mock service are restarted automatically when files change in the src folder.

When the dev environment is started, run tests with `npm run cy:open`.

## Environment Variables
- **LOG_LEVEL**
Sets the log level. Supported values are *TRACE, DEBUG, INFO, WARN, ERROR or OFF*
- **SMAUG_URL**
Url pointing at smaug configuration endpoint
- **FBS_CMS_API_URL**
Url pointing at the root of the FBS CMS API. This is where HTTP requests are proxied to. 
- **REDIS_CLUSTER_HOST**
Set this if Redis is running in cluster mode
- **REDIS_HOST**
Set this if Redis is running as a single instance (Used for development)

