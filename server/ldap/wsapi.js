'use strict';

const wsapi = require('../wsapi.js');
const ldap = require('./index.js');

wsapi.on('ldap/get-objects-by-id', function(request, callback, notifyCallback) {
  ldap.getObjectsById(request.data.ids, request.data.options, callback);
});

wsapi.on('ldap/get-objects-by-dn', function(request, callback, notifyCallback) {
  ldap.getObjectsByDN(request.data.dns, request.data.options, callback);
});

wsapi.on('ldap/get-members-by-id', function(request, callback, notifyCallback) {
  ldap.getMembersById(request.data.id, callback);
});

wsapi.on('ldap/get-membership-by-id', function(request, callback, notifyCallback) {
  ldap.getMembershipById(request.data.id, callback);
});

wsapi.on('ldap/get-children', function(request, callback, notifyCallback) {
  ldap.getChildren(request.data.parentGuid, request.data.options, callback);
});

wsapi.on('ldap/string-search', function(request, callback, notifyCallback) {
  // { q: 'this is a query', from: from, size: size }
  return ldap.stringSearch(request.data.q, {summary: true, from: request.data.from, size: request.data.size}, callback);
});

wsapi.on('ldap/wiki-review-search', function(request, callback, notifyCallback) {
  // { q: 'this is a query' }
  let queryString = {
    query_string: {
      query: request.data.q,
      fields: [
        'common.name^2', 'common.email',
        'common.samName', 'common.samName.standard',
        'common.upn', 'common.upn.standard',
        'common.content'
      ],
    }
  };

  let body = {
    query: {
      bool: {
        should: request.data.q ? [queryString] : [],
        filter: [
          // Stick to user and computer accounts for now
          { term: { 'ldap.objectClass': 'user' } }
        ],
        minimum_should_match: request.data.q ? 1 : 0,
      }
    }
  };

  ldap.searchForIds(body, callback);
});

wsapi.on('ldap/reports/unused-accounts', function(request, callback, notifyCallback) {
  return ldap.getUnusedAccountsReport(request.data || {}, callback);
});

wsapi.on('ldap/reports/admins', function(request, callback, notifyCallback) {
  return ldap.findAdmins(callback);
});

wsapi.on('ldap/reports/domain-controller-roles', function(request, callback, notifyCallback) {
  return ldap.getDomainControllerRoles(callback);
});


ldap.fetchLatestLdapMap();

// For now, reload LDAP every ten minutes
setInterval(ldap.fetchLatestLdapMap, 10 * 60 * 1000);

wsapi.service.on('ldap/update-ldap-map', function(request, callback, notifyCallback) {
  return ldap.fetchLatestLdapMap(callback);
});
