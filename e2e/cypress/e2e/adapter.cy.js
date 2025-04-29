/// <reference types="cypress" />

const mockHTTPUrl = Cypress.env("mockHTTPUrl");

const validSmaugUser = {
  id: "some-cpr",
  pin: "some-pin",
};

const validUserinfoUser = {
  userId: "some-userId",
  pincode: "some-pincode",
};

const validSmaugFbsCredentials = {
  agencyid: "some-agencyid",
  username: "some-username",
  password: "some-password",
};

const ownAgency = {
  allowedAgencies: "own",
};

const userAgencies = {
  allowedAgencies: "user",
};

const allAgencies = {
  allowedAgencies: "all",
};

describe("Testing the FBS CMS adapter", () => {
  beforeEach(() => {
    resetMockHTTP();
  });

  context("Token validation", () => {
    it("returns error when no token is given", () => {
      /**
       * Expected flow:
       * 1. Request is invalid due to missing token
       */

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body).to.deep.include({
          message: "headers should have required property 'authorization'",
        });
      });
    });

    it("returns error when token is not found", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration, but token is invalid
       */

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({ token: "TOKEN", status: 404, body: "" });

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body).to.deep.include({ message: "invalid token" });
      });
    });

    it("returns error when configuration has invalid fbs credentials", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration
       * 2. smaug configuration fails to validate
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN_WITHOUT_FBS_CREDENTIALS",
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId: "000003",
        },
      });

      mockSmaug({
        token: "TOKEN_WITHOUT_AGENCYID",
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
        },
      });
      mockSmaug({
        token: "TOKEN_WITHOUT_FBS_USERNAME",
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId: "000005",
        },
      });
      mockSmaug({
        token: "TOKEN_WITHOUT_FBS_PASSWORD",
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId: "000004",
        },
      });

      // For each token we send request to adapter
      // expecting to fail smaug configuration validation
      [
        "TOKEN_WITHOUT_FBS_CREDENTIALS",
        "TOKEN_WITHOUT_AGENCYID",
        "TOKEN_WITHOUT_FBS_USERNAME",
        "TOKEN_WITHOUT_FBS_PASSWORD",
      ].forEach((token) => {
        // Setup mocks
        mockFetchUserinfoAuthenticatedTokenSucces(token);

        cy.request({
          url: `/external/agencyid/some/path`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body).to.deep.include({
            message: "Agency is missing FBS credentials",
          });
        });
      });
    });

    it("returns not found when url contains authenticate", () => {
      /**
       * Expected flow:
       * 1. Returns 404 for a request url containing authenticate
       */

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/authenticate/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expect(res.body).to.deep.include({
          message: "not found",
        });
      });
    });

    it("returns not found when url contains preauthenticated", () => {
      /**
       * Expected flow:
       * 1. Returns 404 for a request url containing pre(authenticate)d
       */

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/preauthenticated/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expect(res.body).to.deep.include({
          message: "not found",
        });
      });
    });
  });

  context("Access validation", () => {
    it("returns error when client has no fbs access", () => {
      /**
       * Expected flow:
       * 1. Request is invalid due to missing configuration
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";

      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          agencyId,
        },
      });

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body).to.deep.include({
          message: "Forbidden",
        });
      });
    });
  });

  context("Access anonymous path", () => {
    it("returns fbs cms response, when token has valid FBS credentials", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. The url is replaced with value for agencyId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();

      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: ownAgency,
          agencyId,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });

      // Redis should have updated value
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
    });

    it("returns fbs cms response, when token has valid FBS credentials - POST request", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. The url is replaced with value for agencyId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();

      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          agencyId,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathPostSucces();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: { test: "test" },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });

      // Redis should have updated value
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
    });

    it("returns fbs cms response, when sessionKey is cached", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey is fetched from redis using the token
       * 4. The url is replaced with value for agencyId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();

      mockSmaug({ token, status: 200, body: { fbs: ownAgency, agencyId } });

      redisSet({
        key: redisKey,
        value: "SOME_VALID_SESSION_KEY",
        namespace: "sessionkey",
      });
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });
    });

    it("logs in again when sessionKey is expired", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey is fetched from redis using the token
       * 4. The url is replaced with value for agencyId
       * 5. The request is forwarded to FBS CMS, but it returns 401 due to expired sessionKey
       * 6. sessionKey is refetched from FBS using FBS credentials from smaug configuration
       * 7. The request is then forwarded to FBS CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          agencyId,
        },
      });
      redisSet({
        key: redisKey,
        value: "SOME_EXPIRED_SESSION_KEY",
        namespace: "sessionkey",
      });
      mockFetchFbsCmsAnonymousPathExpiredSessionKey();
      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });

      // Redis should have updated value
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
    });
  });

  context("Access patron path", () => {
    it("returns error when anonymous token is used for accessing /patron/ path", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. Configuration validation fails, due to missing user when accessing authenticated path
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          agencyId,
        },
      });

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patron/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body).to.deep.include({
          message: "user authenticated token is required",
        });
      });
    });

    it("returns fbs cms response for /patronid/ path when token has valid FBS credentials and user", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. patronId is fetched from FBS using sessionKey
       * 5. The url is replaced with values for agencyId and patronId
       * 6. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSucces();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("Using alternative fbs-cms URL, it returns fbs cms response for /patronid/ path when token has valid FBS credentials and user", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       *    fbs credentials contains URL, and this is used instead of the default
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. patronId is fetched from FBS using sessionKey
       * 5. The url is replaced with values for agencyId and patronId
       * 6. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "000002";
      const redisKey = `${agencyId}-${token}`;

      const urlFromCredentials = "/some-url";

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });
      mockFetchFbsSessionKeySucces(urlFromCredentials, agencyId);
      mockFetchFbsPatronIdSucces(urlFromCredentials, agencyId);
      mockFetchFbsCmsAuthenticatedPathSucces(urlFromCredentials, agencyId);

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("Uses cached sessionKey and patronId", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey and patronId are fetched from redis using the token
       * 4. The url is replaced with values for agencyId and patronId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });
      redisSet({
        key: redisKey,
        value: "SOME_VALID_SESSION_KEY",
        namespace: "sessionkey",
      });
      redisSet({ key: redisKey, value: "1234", namespace: "patronid" });
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });
    });

    it("logins again, when sessionKey is expired when fetching patronId", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey is fetched from redis using the token
       * 4. patronId fails to be fetched from FBS due to expired sessionKey
       * 5. sessionKey is refetched from Fbs using FBS credentials from smaug configuration
       * 6. patronId is refetched from FBS using sessionKey
       * 7. The url is replaced with values for agencyId and patronId
       * 8. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });
      redisSet({
        key: redisKey,
        value: "SOME_EXPIRED_SESSION_KEY",
        namespace: "sessionkey",
      });
      mockFetchFbsPatronIdExpiredSessionKey();
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSucces();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("logins again, when sessionKey is expired when calling fbs cms", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey and patronId are fetched from redis using the token
       * 4. The url is replaced with values for agencyId and patronId
       * 5. The request is then forwarded to Fbs CMS, but it returns 401 due to expired sessionKey
       * 6. sessionKey is refetched from Fbs using FBS credentials from smaug configuration
       * 7. patronId is refetched from FBS using sessionKey
       * 8. The url is replaced with values for agencyId and patronId (just in case patronId changed)
       * 9. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });
      redisSet({
        key: redisKey,
        value: "SOME_EXPIRED_SESSION_KEY",
        namespace: "sessionkey",
      });
      redisSet({ key: redisKey, value: "12345", namespace: "patronid" });
      mockFetchFbsCmsAuthenticatedPathExpiredSessionKey();
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSucces();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        "TOKEN";
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("Can fetch CPR data from authorized token (/userinfo) when creating patron", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will contain a cpr number (nem-id login)
       * 3. cpr will get attached to body
       * 4. Patron will be created
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchUserinfoAuthenticatedTokenSucces();
      mockFetchFbsSessionKeySucces();
      mockCreatePatronInjectedCprSucces();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/patrons/v9",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello new patron",
        });
      });
    });

    it("Can fetch CPR data from authorized token (/userinfo) when creating patron withGuardian", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will contain a cpr number (nem-id login)
       * 3. cpr will get attached to body
       * 4. Guardian can create Patron
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchUserinfoAuthenticatedTokenSucces();
      mockFetchFbsSessionKeySucces();
      mockCreatePatronWithGuardianInjectedCprSucces();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/patrons/withGuardian/v3",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          "some-prop": "some-value",
          guardian: { name: "some-name", email: "some-email" },
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello new guardian created patron",
        });
      });
    });

    it("Can fetch CPR data from authorized token (/userinfo) when updating pincode for patron", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will contain a cpr number (nem-id login)
       * 3. cpr will get attached to body
       * 4. Patron can update pincode
       */

      const token = "TOKEN";
      const agencyId = "some-agencyid";

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSucces();
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockUpdatePatronPincodeInjectedCprSucces();

      // Send request to adapter
      cy.request({
        method: "PUT",
        url: "/external/agencyid/patrons/patronid/v8",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          "some-prop": "some-value",
          "some-other-prop": { "some-deeper-prop": "some-deeper-value" },
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "fresh new updated pincode for patron",
        });
      });
    });

    it("Fail when token has no CPR attached (no nem-id signin)", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will NOT contain a cpr number (no nem-id login)
       */

      const token = "TOKEN_WITH_NO_CPR";
      const agencyId = "some-agencyid";

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchUserinfoAuthenticatedTokenNoCPR();
      mockFetchFbsSessionKeySucces();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/patrons/v9",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body).to.deep.include({
          message: "token does not include a cpr",
        });
      });
    });
  });

  describe("selecting authentication path", () => {
    it("should use /authenticate path for borchk validated users", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. patronId is fetched from FBS using sessionKey
       * 5. The url is replaced with values for agencyId and patronId
       * 6. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN_WITH_NO_CPR";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenNoCPR();
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSuccesInstitution();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });
  });

  describe("Dynamic use of agencyId in path", () => {
    it("should accept 'agencyid' in path", () => {
      const token = "TOKEN";
      const agencyId = "some-agencyid";

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchUserinfoAuthenticatedTokenSucces();

      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });
    });

    it("should accept same origin agencyid in path", () => {
      const token = "TOKEN";
      const agencyId = "some-agencyid";

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchUserinfoAuthenticatedTokenSucces();

      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: `/external/${agencyId}/some/path`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });
    });

    it("should accept same origin isil in path", () => {
      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const isil = `DK-${agencyId}`;

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchUserinfoAuthenticatedTokenSucces();

      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: `/external/${isil}/some/path`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });
    });

    it("should fail when an alternative agencyId is given in the url, but client only accepts 'own'", () => {
      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const alternativeAgencyId = `some-other-agencyid`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();

      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchFbsSessionKeySucces(undefined, alternativeAgencyId);
      mockFetchFbsPatronIdSuccesInstitution(undefined, alternativeAgencyId);
      mockFetchFbsCmsAuthenticatedPathSucces(undefined, alternativeAgencyId);

      mockFetchFbsPatronIdSucces(undefined, alternativeAgencyId);

      // Send request to adapter
      cy.request({
        url: `/external/${alternativeAgencyId}/patrons/patronid/some/path`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(405);
        expect(res.body).to.deep.include({
          message: "Method Not Allowed",
        });
      });
    });

    it("should accept when an alternative agencyId is given for a client which accepts 'all'", () => {
      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const alternativeAgencyId = `some-random-agencyid`;

      // rediskey is now based on the url provided agencyid
      const redisKey = `${alternativeAgencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();

      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: allAgencies,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchFbsSessionKeySucces(undefined, alternativeAgencyId);
      mockFetchFbsPatronIdSuccesInstitution(undefined, alternativeAgencyId);
      mockFetchFbsCmsAuthenticatedPathSucces(undefined, alternativeAgencyId);

      mockFetchFbsPatronIdSucces(undefined, alternativeAgencyId);

      // Send request to adapter
      cy.request({
        url: `/external/${alternativeAgencyId}/patrons/patronid/some/path`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("should accept when an alternative agencyId is included in the user's list of agencies", () => {
      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const alternativeAgencyId = `some-other-agencyid`;

      // rediskey is now based on the url provided agencyid
      const redisKey = `${alternativeAgencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();

      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: userAgencies,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchFbsSessionKeySucces(undefined, alternativeAgencyId);
      mockFetchFbsPatronIdSuccesInstitution(undefined, alternativeAgencyId);
      mockFetchFbsCmsAuthenticatedPathSucces(undefined, alternativeAgencyId);

      mockFetchFbsPatronIdSucces(undefined, alternativeAgencyId);

      // Send request to adapter
      cy.request({
        url: `/external/${alternativeAgencyId}/patrons/patronid/some/path`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("should use /authenticate path for borchk validated users", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. patronId is fetched from FBS using sessionKey
       * 5. The url is replaced with values for agencyId and patronId
       * 6. The request is then forwarded to Fbs CMS with succes
       */

      const token = "TOKEN_WITH_NO_CPR";
      const agencyId = "some-agencyid";
      const redisKey = `${agencyId}-${token}`;

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenNoCPR();
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSuccesInstitution();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: redisKey, namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: redisKey, namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("should fail when an alternative agencyId is not included in the user's list of agencies", () => {
      const token = "TOKEN";
      const agencyId = "some-agencyid";
      const alternativeAgencyId = `some-random-agencyid`;

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          user: validSmaugUser,
          agencyId,
        },
      });

      mockFetchUserinfoAuthenticatedTokenSucces();

      // Send request to adapter
      cy.request({
        url: `/external/${alternativeAgencyId}/some/path`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(405);
        expect(res.body).to.deep.include({
          message: "Method Not Allowed",
        });
      });
    });

    it("should fail if alternative isil is given for anonymous token", () => {
      const token = "ANONYMOUS_TOKEN";
      const agencyId = "some-agencyid";
      const alternativeAgencyId = `some-random-agencyid`;

      // Setup mocks
      mockSmaug({
        token,
        status: 200,
        body: {
          fbs: ownAgency,
          agencyId,
        },
      });

      mockFetchUserinfoAnonymousTokenSuccess();
      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: `/external/${alternativeAgencyId}/some/path`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(405);
        expect(res.body).to.deep.include({
          message: "Method Not Allowed",
        });
      });
    });
  });
});

// ----- HELPER FUNCTIONS FOR MOCKING STUFF -----
function mockHTTP({ request, response }) {
  cy.request({
    method: "POST",
    url: mockHTTPUrl,
    body: {
      request,
      response,
    },
  });
}

function resetMockHTTP() {
  cy.request({
    method: "POST",
    url: `${mockHTTPUrl}/reset`,
    body: { namespaces: ["patronid", "sessionid"] },
  });
}

function mockSmaug({ token, status, body }) {
  mockHTTP({
    request: {
      method: "GET",
      path: "/smaug/configuration",
      query: {
        token,
      },
    },
    response: {
      status,
      body,
    },
  });
}

function mockFetchFbsSessionKeySucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/v1/DK-${agencyId}/authentication/login`,
      body: {
        username: validSmaugFbsCredentials.username,
        password: validSmaugFbsCredentials.password,
      },
    },
    response: {
      status: 200,
      body: { sessionKey: "SOME_VALID_SESSION_KEY" },
    },
  });
}

function mockFetchFbsPatronIdSucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/DK-${agencyId}/patrons/preauthenticated/v9`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: validUserinfoUser.userId,
    },
    response: {
      status: 200,
      body: {
        authenticated: true,
        patron: {
          patronId: 1234,
        },
      },
    },
  });
}

function mockFetchFbsPatronIdSuccesInstitution(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/DK-${agencyId}/patrons/authenticate/v9`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: {
        libraryCardNumber: validUserinfoUser.userId,
        pincode: validUserinfoUser.pincode,
      },
    },
    response: {
      status: 200,
      body: {
        patronId: 1234,
        patronType: "COMPANY",
        authenticateStatus: "VALID",
      },
    },
  });
}

function mockFetchFbsPatronIdExpiredSessionKey(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/DK-${agencyId}/patrons/preauthenticated/v9`,
      headers: {
        "x-session": "SOME_EXPIRED_SESSION_KEY",
      },
      body: validUserinfoUser.userId,
    },
    response: {
      status: 401,
      body: {},
    },
  });
}

function mockFetchFbsCmsAnonymousPathSucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/DK-${agencyId}/some/path`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
    },
    response: {
      status: 200,
      body: { message: "from FBS CMS API" },
    },
  });
}

function mockFetchFbsCmsAnonymousPathPostSucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/DK-${agencyId}/some/path`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: {
        test: "test",
      },
    },
    response: {
      status: 200,
      body: { message: "from FBS CMS API" },
    },
  });
}

function mockFetchFbsCmsAnonymousPathExpiredSessionKey(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/DK-${agencyId}/some/path`,
      headers: {
        "x-session": "SOME_EXPIRED_SESSION_KEY",
      },
    },
    response: {
      status: 401,
      body: { message: "key is expired" },
    },
  });
}

function mockFetchFbsCmsAuthenticatedPathSucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/DK-${agencyId}/patrons/1234/some/path`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
    },
    response: {
      status: 200,
      body: { message: "hello patron" },
    },
  });
}

function mockFetchFbsCmsAuthenticatedPathExpiredSessionKey(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/DK-${agencyId}/patrons/12345/some/path`,
      headers: {
        "x-session": "SOME_EXPIRED_SESSION_KEY",
      },
    },
    response: {
      status: 401,
      body: { message: "key is expired" },
    },
  });
}

function mockFetchUserinfoAuthenticatedTokenSucces(token = "TOKEN") {
  mockHTTP({
    request: {
      method: "GET",
      path: `/userinfo`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
    response: {
      status: 200,
      body: {
        attributes: {
          cpr: "some-cpr",
          userId: "some-userId",
          pincode: "some-pincode",
          idpUsed: "nemlogin",
          agencies: [{ agencyId: "some-other-agencyid" }],
        },
      },
    },
  });
}

function mockFetchUserinfoAuthenticatedTokenNoCPR() {
  mockHTTP({
    request: {
      method: "GET",
      path: `/userinfo`,
      headers: {
        authorization: "Bearer TOKEN_WITH_NO_CPR",
      },
    },
    response: {
      status: 200,
      body: {
        attributes: {
          cpr: null,
          userId: "some-userId",
          pincode: "some-pincode",
          idpUsed: "borchk",
          agencies: [{ agencyId: "some-other-agencyid" }],
        },
      },
    },
  });
}

function mockFetchUserinfoAnonymousTokenSuccess() {
  mockHTTP({
    request: {
      method: "GET",
      path: `/userinfo`,
      headers: {
        authorization: "Bearer ANONYMOUS_TOKEN",
      },
    },
    response: {
      status: 200,
      body: {
        attributes: {
          cpr: null,
          userId: "@",
          pincode: "@",
          agencies: [],
        },
      },
    },
  });
}

function mockCreatePatronInjectedCprSucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/DK-${agencyId}/patrons/v9`,
      body: '{"personIdentifier":"some-cpr"}',
    },
    response: {
      status: 200,
      body: { message: "hello new patron" },
    },
  });
}

function mockCreatePatronWithGuardianInjectedCprSucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/DK-${agencyId}/patrons/withGuardian/v3`,
      body: {
        "some-prop": "some-value",
        guardian: {
          name: "some-name",
          email: "some-email",
          personIdentifier: "some-cpr",
        },
      },
    },
    response: {
      status: 200,
      body: { message: "hello new guardian created patron" },
    },
  });
}

function mockUpdatePatronPincodeInjectedCprSucces(
  basePath = "/fbscms",
  agencyId = "some-agencyid"
) {
  mockHTTP({
    request: {
      method: "PUT",
      path: `${basePath}/external/DK-${agencyId}/patrons/1234/v8`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: {
        "some-prop": "some-value",
        "some-other-prop": { "some-deeper-prop": "some-deeper-value" },
        pincodeChange: { libraryCardNumber: "some-cpr" },
      },
    },
    response: {
      status: 200,
      body: {
        message: "fresh new updated pincode for patron",
      },
    },
  });
}

function redisSet({ key, value, namespace }) {
  cy.request({
    method: "POST",
    url: `${mockHTTPUrl}/redis`,
    body: {
      key,
      value,
      namespace,
    },
  });
}

function redisGet({ key, namespace }) {
  return cy
    .request({
      method: "GET",
      url: `${mockHTTPUrl}/redis?key=${key}&namespace=${namespace}`,
    })
    .then((res) => res.body);
}

function omit(key, obj) {
  const { [key]: omitted, ...rest } = obj;
  return rest;
}
