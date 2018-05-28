// Useful docs
// See: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference-2-0.html
'use strict';

const async = require('async');
const es = require('../es');
const wiki = require('../wiki');
const utilFuncs = require('../../common/util');

const logger = require('../config').logger.child({module: 'ldap'});

function LdapError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code;
}

require('util').inherits(LdapError, Error);

var _config = {};
var PREFIX = _config.prefix || '';
var LDAP_READ_ALIAS = PREFIX + 'ldap';
const LDAP_OBJECT = 'ldap-object';
const ID_TAG = 'ldap-guid';
const SUMMARY_FIELDS = ['ldap.cn', 'ldap.objectGUID', 'ldap.displayName',
  'ldap.name', 'ldap.description', 'ldap.objectClass', 'ldap.department',
  'ldap.company', 'ldap.distinguishedName', 'ldap.info', 'ldap.givenName', 'ldap.sn',
  'ldapDecoded.userAccountControl', 'common.name'];

function breakSid(sid) {
  const index = sid.lastIndexOf('-');

  return {
    root: sid.substring(0, index),
    rid: +sid.substring(index + 1),
  };
}

function getObjectsById(ids, options, callback) {
  // options is {} with:
  // * summary: true to only get the LDAP summary fields and not the whole thing

  options = options || {};

  if(!Array.isArray(ids))
    ids = [ids];

  if(ids.length === 0)
    return callback(null, []);

  return es.client.mget({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    _source: options.summary ? SUMMARY_FIELDS : true,
    body: { ids: ids }
  }, (err, ldapDocs) => {
    if(err)
      return callback(err);

    return callback(null, ldapDocs.docs.filter(obj => obj.found));
  });
}

function getUnusedAccountsReport(options, callback) {
  // request: { before: '2014-01-01' }
  let beforeDate = options.before ? new Date(options.before) : new Date(2015, 0, 1);
  let afterDate = options.after ? new Date(options.after) : new Date(1970, 0, 1);

  let shouldConditions = [
    // Last seen before the given date
    {
      range: {
        'ldap.lastLogonTimestamp': {
          lt: beforeDate,
          gt: afterDate
        }
      }
    },
  ];

  if(options.never) {
    shouldConditions.push({
      bool: {
        must_not: {
          exists: { field: 'ldap.lastLogonTimestamp' }
        }
      }
    });
  }

  let body = {
    query: {
      bool: {
        should: shouldConditions,
        filter: [
          { term: { 'ldap.objectClass': 'user' } }
        ],
        minimum_should_match: 1,
      }
    },
    sort: '_doc',
    size: 10000,
    _source: [
      'ldap.objectGUID',
      'ldap.distinguishedName',
      'ldap.cn',
      'ldap.displayName',
      'ldap.objectClass',
      'ldap.lastLogonTimestamp',
      'ldap.servicePrincipalName',
      'ldap.pwdLastSet',
      'ldap.operatingSystem',
      'ldap.name',
      'ldap.whenCreated',
      'ldap.samAccountName',
      'ldap.proxyAddresses',
      'ldap.msExchDelegateListLink',
      'ldap.publicDelegates',
      'ldap.altRecipient',
      'ldapDecoded.userAccountControl',
      'common.name',
      'common.email',
    ]
  };

  es.client.search({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    body: body
  }, (err, ldapResults) => {
    if(err)
      return callback(err);

    ldapResults = ldapResults.hits.hits.map(obj => obj._source);

    var ldapMap = new Map(ldapResults.map(obj => [obj.ldap.objectGUID, obj]));

    ldapResults.forEach(obj => {
      obj.wikiArticles = [];
    });

    wiki.getArticlesByLdapGuid([...ldapMap.keys()], {summary: true, hashTags: ['never-logon', 'unused']}, (err, wikiResults) => {
      if(err)
        return callback(err);

      wikiResults.forEach(wikiDoc => {
        uncollapseArray(wikiDoc._source.wiki.rels[ID_TAG]).forEach(guid => {
          const obj = ldapMap.get(guid);

          if(!obj)
            return;

          obj.wikiArticles.push(wikiDoc);
        });
      });

      callback(null, ldapResults);
    });
  });
}

function getObjectsByDN(dns, options, callback) {
  options = options || {};

  if(!Array.isArray(dns))
    dns = [dns];

  dns = dns.map(dn => dn.toLowerCase());

  es.client.search({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    body: {
      query: {
        constant_score: {
          filter: {
            terms: {
              'ldap.distinguishedName': dns
            }
          }
        }
      }
    },
    size: 1000,
    _source: options.summary ? SUMMARY_FIELDS : true
  }, function(err, res) {
    if(err)
      return callback(err);

    return callback(null, res.hits.hits);
  });
}

function getChildren(parentGuid, options, callback) {
  options = options || {};

  es.client.search({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    body: {
      query: {
        constant_score: {
          filter: {
            term: {
              'ldap.parentGUID': parentGuid
            }
          }
        }
      }
    },
    size: 1000,
    _source: options.summary ? SUMMARY_FIELDS : true
  }, function(err, res) {
    if(err)
      return callback(err);

    return callback(null, res.hits.hits);
  });
}

/*function getReferencedByDN(req, callback) {
  es.client.search({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    body: {
      query: {
        bool: {
          filter: {
            terms: {
              'ldap.distinguishedName.raw': {
                index: LDAP_READ_ALIAS,
                type: LDAP_OBJECT,
                id: req.id,
                path: req.field
              }
            }
          }
        }
      },
      fields: req.fields
    }
  }, callback);
}*/

function search(body, callback) {
  es.client.search({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    body: body
  }, callback);
};

function searchForIds(body, callback) {
  return es.getAllEntries({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    body: body,
    _source: false
  }, (err, res) => {
    if(err)
      return callback(err);

    return callback(null, res.map(doc => doc._id));
  });
}

function stringSearch(q, options, callback) {
  /*
    q: the query string

    options: {}
    * from, size: from and size for search
    * all: get all results
    * summary: true for summary fields only
    * idOnly: return only the objectGUIDs
    * correlationOnly: return only correlation-eligible objects (currently users/computers)
  */

  let query = {
    query_string: {
      query: q,
      fields: [
        'common.name^2', 'common.email', 'common.email.simple',
        'common.samName', 'common.samName.simple',
        'common.upn', 'common.upn.simple',
        'common.content'
      ],
    }
  };

  if(options.correlationOnly) {
    // Filter for users only (this includes computers)
    query = {
      bool: {
        must: [query],
        filter: [
          { term: { 'ldap.objectClass': 'person' } }
        ]
      }
    }
  };

  let body = {
    query: query,
    _source: options.idOnly ? 'ldap.objectGUID' : (options.summary ? SUMMARY_FIELDS : true),
  };

  if(options.all) {
    es.getAllEntries({
      index: LDAP_READ_ALIAS,
      type: LDAP_OBJECT,
      body: body
    }, (err, resp) => {
      if(err)
        return callback(err);

      if(options.idOnly) {
        resp = resp.map(obj => obj._source.ldap.objectGUID);
      }

      return callback(null, resp);
    });
  }
  else {
    body.from = options.from;
    body.size = options.size;

    return es.client.search({
      index: LDAP_READ_ALIAS,
      type: LDAP_OBJECT,
      body: body
    }, callback);
  }
}

function getMembershipByDN(dn, callback) {
  // Returns IDs of objects in which the given DN is a member
  return es.client.search({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    body: {
      query: {
        bool: {
          filter: [{
            term: { 'ldap.member': dn }
          }]
        }
      }
    },
    _source: false,
    size: 1000,
  }, (err, res) => {
    if(err)
      return callback(err);

    return callback(null, res.map(doc => doc._id));
  })
}

function getMembershipById(id, callback) {
  // Returns IDs of objects in which the given ID is a member
  return es.client.mget({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    _source: ['ldap.objectSid', 'ldap.distinguishedName', 'ldap.primaryGroupID'],
    body: { ids: [id] }
  }, (err, ldapDocs) => {
    if(err)
      return callback(err);

    if(!ldapDocs.docs[0].found || !ldapDocs.docs[0]._source.ldap || !ldapDocs.docs[0]._source.ldap.objectSid)
      return callback(null, []);

    const obj = ldapDocs.docs[0]._source.ldap;

    const query = [
      { term: { 'ldap.member.raw': obj.distinguishedName } }
    ];

    if(obj.primaryGroupID) {
      const brokenSid = breakSid(obj.objectSid);
      query.push({ term: { 'ldap.objectSid': brokenSid.root + '-' + obj.primaryGroupID } });
    }

    return es.client.search({
      index: LDAP_READ_ALIAS,
      type: LDAP_OBJECT,
      body: {
        query: {
          bool: {
            should: query,
            minimum_should_match: 1,
          }
        }
      },
      _source: SUMMARY_FIELDS,
      sort: '_doc',
      size: 1000,
    }, (err, res) => {
      if(err)
        return callback(err);

      return callback(null, res.hits.hits);
    });
  });
}

function getMembersById(guid, callback) {
  // Returns IDs of object that are members of the given object
  return es.client.mget({
    index: LDAP_READ_ALIAS,
    type: LDAP_OBJECT,
    _source: ['ldap.objectSid', 'ldap.member'],
    body: { ids: [guid] }
  }, (err, ldapDocs) => {
    if(err)
      return callback(err);

    if(!ldapDocs.docs[0].found || !ldapDocs.docs[0]._source.ldap || !ldapDocs.docs[0]._source.ldap.objectSid)
      return callback(null, []);

    const sid = ldapDocs.docs[0]._source.ldap.objectSid;
    const brokenSid = breakSid(sid);

    return es.client.search({
      index: LDAP_READ_ALIAS,
      type: LDAP_OBJECT,
      body: {
        query: {
          bool: {
            should: [
              // Objects in the same domain that have the primaryGroupID set to us
              {
                bool: {
                  filter: [
                    { term: { 'ldap.primaryGroupID': brokenSid.rid } },
                    { prefix: { 'ldap.objectSid': brokenSid.root + '-' } },
                  ]
                }
              },

              // Objects in our ldap.member list
              {
                terms: { 'ldap.distinguishedName.raw': uncollapseArray(ldapDocs.docs[0]._source.ldap.member || []) }
              }
            ],
            minimum_should_match: 1,
          }
        }
      },
      _source: SUMMARY_FIELDS,
      sort: '_doc',
      size: 1000,
    }, (err, res) => {
      if(err)
        return callback(err);

      return callback(null, res.hits.hits);
    });
  });
}

function collapseArray(array) {
  if(array.length === 0)
    return null;

  if(array.length === 1)
    return array[0];

  return array;
}

function uncollapseArray(value) {
  if(Array.isArray(value))
    return value;

  return [value,];
}

function findAdmins(callback) {
  // ldap.primaryGroupID:512 or ldapPrimaryGroup:519 or ldap.primaryGroup:544
  // Members of group that ends in -519 (Enterprise) or -512 (Domain) or -544 (Administrators)
  // S-1-5-32-544

  // ldap.objectClass:domain to get domain SIDs
  var usersByDomain = {
    enterprise: new Set()
  };

  function getDomains(callback) {
    search({
      query: {
        constant_score: {
          filter: {
            term: {
              'ldap.objectClass.raw': 'domain'
            }
          }
        }
      },
      size: 1000,
      _source: ['ldap.objectSid', 'ldap.distinguishedName']
    }, function(err, result) {
      if(err)
        callback(err);

      result = result.hits.hits.map(function(hit) {
        usersByDomain[hit._source.ldap.distinguishedName] = new Set();
        return hit._source.ldap;
      });

      callback(null, result);
    });
  }

  function findByPrimaryGroup(domains, callback) {
    search({
      query: {
        constant_score: {
          filter: {
            terms: {
              'ldap.primaryGroupID': [512, 519, 544]
            }
          }
        }
      },
      size: 1000,
      _source: ['ldap.primaryGroupID', 'ldap.objectGUID', 'ldap.objectSid']
    }, function(err, result) {
      if(err)
        return callback(err);

      result.hits.hits.forEach(function(hit) {
        if(hit._source.ldap.primaryGroupID === 519) {
          // Enterprise admin
          usersByDomain.enterprise.add(hit._source.ldap.objectGUID);
        }
        else {
          // Domain admin
          domains.forEach(function(domain) {
            // If we're in the same domain (begins with the same SID), we're domain admins here
            if(hit._source.ldap.objectSid.indexOf(domain.objectSid) === 0) {
              usersByDomain[domain.distinguishedName].add(hit._source.ldap.objectGUID);
            }
          });
        }
      });

      return callback();
    });
  }

  function getDNs(searchSids, domainDN, callback) {
    //console.error('Searching well-known SIDs ', searchSids);
    var filter = [
      { terms: { 'ldap.objectSid': searchSids } },
    ];

    if(domainDN)
      filter.push({ term: { 'ldapDecoded.parentDistinguishedNameAll': domainDN.toLowerCase() } })

    search({
      query: {
        bool: {
          filter: filter
        }
      },
      size: 1000,
      _source: ['ldap.distinguishedName']
    }, function(err, result) {
      if(err)
        return callback(err);

      //console.error('Initial DNs:', result.hits.hits.map(function(hit) { return hit._source.ldap.distinguishedName; }));

      return callback(null, result.hits.hits.map(function(hit) { return hit._source.ldap.distinguishedName; }));
    });
  }

  function findByWellKnownGroups(domainDN, searchDNs, callback) {
    //console.error('Searching DNs ', searchDNs);

    function recurse(searchDNs, callback) {
      search({
        query: { bool: { filter: { terms: { 'ldap.distinguishedName': searchDNs.map(dn => dn.toLowerCase()) } } } },
        size: 1000,
        _source: ['ldap.member', 'ldap.objectClass', 'ldap.objectGUID'/*, 'ldap.msDS-PrincipalName'*/]
      }, function(err, result) {
        if(err)
          return callback(err);

        var nextDNs = [];

        result.hits.hits.forEach(function(hit) {
          if(hit._source.ldap.objectClass.indexOf('group') !== -1) {
            // It's a group
            if(hit._source.ldap.member) {
              nextDNs = nextDNs.concat(hit._source.ldap.member);
            }
          }
          else {
            //console.error(`Adding ${hit._source.ldap['msDS-PrincipalName']} to ${domainDN}`);
            usersByDomain[domainDN].add(hit._source.ldap.objectGUID);
          }
        });

        if(nextDNs.length === 0)
          return callback();

        return recurse(nextDNs, callback);
      });
    }

    return recurse(searchDNs, callback);
  }

/*      var domainAdminSids = ['S-1-5-32-544'];
      var enterpriseAdminSids = [];

      domainSids.forEach(function(sid) {
        domainAdminSids.push(sid + '-512');
        enterpriseAdminSids.push(sid + '-519');*/
  return getDomains(function(err, domains) {
    if(err)
      return callback(err);

    var tasks = domains.map(function(domain) {
      return function(callback) {
        var searchSids = [
          // BUILTIN\Administrators
          'S-1-5-32-544',

          // DOMAIN\Domain Admins
          domain.objectSid + '-512',
        ];

        // Get the DNs of the above groups first
        getDNs(searchSids, domain.distinguishedName, function(err, searchDNs) {
          if(err)
            return callback(err);

          // Now search for all members
          findByWellKnownGroups(domain.distinguishedName, searchDNs, callback);
        });
      };
    });

    // Also search for enterprise admins
    tasks.push(function(callback) {
      getDNs(domains.map(function(domain) {
        return domain.objectSid + '-519';
      }), null, function(err, searchDNs) {
        if(err)
          return callback(err);

        // Now search for all members
        findByWellKnownGroups('enterprise', searchDNs, callback);
      });
    });

    // Also search by primary groups
    tasks.push(async.apply(findByPrimaryGroup, domains));

    //console.error('Running final task list...');
    async.parallel(tasks, function(err) {
      if(err)
        return callback(err);

      // Remove enterprise users from all other sets (because that's implied)
      domains.forEach(function(domain) {
        usersByDomain.enterprise.forEach(function(guid) {
          usersByDomain[domain.distinguishedName].delete(guid);
        });
      });

      // Fix sets into arrays of objects
      async.forEachOf(usersByDomain, function(guids, domainDN, callback) {
        //console.error(`Fetching final object list for ${domainDN}...`)
        //console.error(guids);
        getObjectsById(Array.from(guids), {}, function(err, users) {
          if(err)
            return callback(err);

          //console.error(users);
          usersByDomain[domainDN] = users.map(function(user) { return user._source; });
          return callback();
        });
      }, function(err) {
        if(err)
          return callback(err);

        return callback(null, usersByDomain);
      });
    });
  });
}

function arrayMap(array, keyFunc) {
  const map = new Map();

  array.forEach(v => {
    const key = keyFunc(v);
    let array = map.get(key);

    if(!array) {
      array = [];
      map.set(key, array);
    }

    array.push(v);
  });

  return map;
}

function getDomainControllerRoles(callback) {
  return search({
    query: {
      bool: {
        filter: [
          { exists: { field: 'ldap.fSMORoleOwner' } }
        ]
      }
    },
    size: 1000,
    _source: ['ldap.fSMORoleOwner', 'ldap.objectClass'],
  }, function(err, result) {
    if(err)
      return callback(err);

    const startLength = 'CN=NTDS Settings,'.length;

    const fsmoOwners = result.hits.hits.map(hit => {
      let type;

      if(hit._source.ldap.objectClass.indexOf('crossRefContainer') !== -1) {
        type = 'crossRefContainer';
      }
      else if(hit._source.ldap.objectClass.indexOf('dMD') !== -1) {
        type = 'dMD';
      }
      else if(hit._source.ldap.objectClass.indexOf('infrastructureUpdate') !== -1) {
        type = 'infrastructureUpdate';
      }
      else if(hit._source.ldap.objectClass.indexOf('rIDManager') !== -1) {
        type = 'rIDManager';
      }
      else if(hit._source.ldap.objectClass.indexOf('domainDNS') !== -1) {
        type = 'domainDNS';
      }

      return {
        type: type,
        fSMORoleOwner: hit._source.ldap.fSMORoleOwner,
        settingsOwner: hit._source.ldap.fSMORoleOwner.substring(startLength),
      };
    }).filter(v => v.type);

    const ownerMap = arrayMap(fsmoOwners, v => v.settingsOwner.toLowerCase());

    return es.client.search({
      index: LDAP_READ_ALIAS,
      type: LDAP_OBJECT,
      body: {
        query: {
          bool: {
            filter: [
              {
                terms: {
                  'ldap.distinguishedName': Array.from(new Set(fsmoOwners.map(v => v.settingsOwner.toLowerCase())))
                }
              }
            ]
          }
        },
        size: 1000,
        _source: ['ldap.distinguishedName', 'ldap.serverReference']
      }
    }, (err, result) => {
      if(err)
        return callback(err);

      result.hits.hits.forEach(v => {
        ownerMap.get(v._source.ldap.distinguishedName.toLowerCase()).forEach(v2 => {
          v2.serverReference = v._source.ldap.serverReference;
        });
      });

      // Identify domain
      fsmoOwners.forEach(v => {
        if(!v.serverReference)
          return;

        const array = utilFuncs.parseDN(v.serverReference);
        v.domain = array[array.length - 2].value + '.' + array[array.length - 1].value;
      });

      return callback(null, fsmoOwners);
    });
  });
}

function createLdapMap(callback) {
  // Try to reduce memory footprint by interning strings as they come through
  const internMap = new Map();

  function intern(str) {
    let result = internMap.get(str);

    if(!result) {
      internMap.set(str, str);
      result = str;
    }

    return result;
  }

  const result = {
    byObjectGuid: new Map(),
    byLowerDN: new Map(),
    byUpperSamName: new Map(),
    bySid: new Map(),
  };

  const entriesStream = es.getEntriesStream({ index: LDAP_READ_ALIAS, _source: [
    'ldap.objectClass',
    'ldap.cn',
    'ldap.name',
    'ldap.objectGUID',
    'ldap.parentGUID',
    'ldap.objectSid',
    'ldap.member',
    'ldap.primaryGroupID',
    'ldap.msDS-PrincipalName',
    'ldap.distinguishedName',
    'ldap.msExchDelegateListLink',
  ] });
  const data = [];

  entriesStream.once('error', callback);
  entriesStream.on('data', function(obj) {
    //console.log('keeping data');

    const newObj = {
      ldap: obj._source.ldap,
      parent: null,
      children: null,
      members: null,
      memberOf: null,
      msExchDelegateListLink: null,
      cn: obj._source.ldap.cn,
      samName: obj._source.ldap['msDS-PrincipalName'],
      distinguishedName: intern(obj._source.ldap.distinguishedName),
      objectSid: intern(obj._source.ldap.objectSid),
      objectGUID: intern(obj._source.ldap.objectGUID),
      parentGUID: intern(obj._source.ldap.parentGUID),
      schemaIDGUID: intern(obj._source.ldap.schemaIDGUID),
      name: obj._source.ldap.name,
      objectClass: obj._source.ldap.objectClass.map(v => intern(v)),
    };

    result.byObjectGuid.set(newObj.ldap.objectGUID, newObj);
    result.byLowerDN.set(newObj.distinguishedName.toLowerCase(), newObj);

    if(newObj.samName)
      result.byUpperSamName.set(newObj.samName.toUpperCase(), newObj);

    if(newObj.objectSid) {
      let sidList = result.bySid.get(newObj.objectSid);

      if(!sidList) {
        sidList = [];
        result.bySid.set(newObj.objectSid, sidList);
      }

      sidList.push(newObj);
    }

    //process.stdout.write(result.byObjectGuid.size + '  \r');

    //console.log(JSON.stringify(obj, null, 2));
  });
  entriesStream.once('end', function() {
    //console.log('calling end callback');
    //callback(null, data);

    const primaryGroupMembers = [];

    for(let obj of result.byObjectGuid.values()) {
      if(obj.ldap.member) {
        obj.members = uncollapseArray(obj.ldap.member).map(dn => result.byLowerDN.get(dn.toLowerCase())).filter(v => v);

        for(let member of obj.members) {
          if(!member.memberOf)
            member.memberOf = [];

          member.memberOf.push(obj);
        }
      }

      // Add members from primary group IDs
      if(obj.ldap.primaryGroupID) {
        const domainSid = breakSid(obj.ldap.objectSid).root;
        const primaryGroupSid = domainSid + '-' + obj.ldap.primaryGroupID;

        const groups = result.bySid.get(primaryGroupSid);

        if(!groups) {
          console.log(`Could not find RID ${obj.ldap.primaryGroupID} of domain ${domainSid}`);
        }
        else {
          groups.forEach(group => {
            primaryGroupMembers.push([obj, group]);
          });
        }
      }

      if(obj.ldap.msExchDelegateListLink) {
        obj.msExchDelegateListLink = uncollapseArray(obj.ldap.msExchDelegateListLink).map(dn => result.byLowerDN.get(dn.toLowerCase()));
      }

      obj.parent = result.byObjectGuid.get(obj.ldap.parentGUID);

      if(obj.parent) {
        if(!obj.parent.children)
          obj.parent.children = [];

        obj.parent.children.push(obj);
      }

      obj.ldap = null;
    }

    for(let pair of primaryGroupMembers) {
      const obj = pair[0];
      const group = pair[1];

      if(!group.members) {
        group.members = [];
      }

      if(!obj.memberOf)
        obj.memberOf = [];

      group.members.push(obj);
      obj.memberOf.push(group);
    }

    return callback(null, result);
  });
}

module.exports = function config(config) {
  _config = config || {};
  PREFIX = _config.prefix || '';
  LDAP_READ_ALIAS = PREFIX + 'ldap';

  return module.exports;
};

function fetchLatestLdapMap(callback) {
  return createLdapMap((err, result) => {
    if(err) {
      logger.error({err: err}, 'Failed to fetch latest LDAP in-memory map.');
      return callback && callback(err);
    }
    else {
      module.exports.memoryMap = result;
      return callback && callback();
    }
  });
}

module.exports.memoryMap = {
  byObjectGuid: new Map(),
  byLowerDN: new Map(),
  byUpperSamName: new Map(),
  bySid: new Map(),
};

module.exports.search = search;
module.exports.stringSearch = stringSearch;
module.exports.getObjectsById = getObjectsById;
module.exports.getObjectsByDN = getObjectsByDN;
module.exports.getChildren = getChildren;
module.exports.findAdmins = findAdmins;
module.exports.getUnusedAccountsReport = getUnusedAccountsReport;
module.exports.fetchLatestLdapMap = fetchLatestLdapMap;
module.exports.collapseArray = collapseArray;
module.exports.uncollapseArray = uncollapseArray;
module.exports.searchForIds = searchForIds;
module.exports.getMembersById = getMembersById;
module.exports.getMembershipByDN = getMembershipByDN;
module.exports.getMembershipById = getMembershipById;
module.exports.getDomainControllerRoles = getDomainControllerRoles;
module.exports.ID_TAG = ID_TAG;
