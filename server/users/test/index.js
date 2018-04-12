// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

const es = require('../../es.js');
const async = require('async');
const users = require('../index.js');
const wsapi = require('../../wsapi.js');
const config = require('../../config.js');
require('../wsapi.js');

function createTestUsers(userList, options, callback) {
  // articles: array of wiki objects ({title: '', body: '', tags: []})
  // knownTags: object or map mapping tag to type, used for creating the mapping
  const time = (new Date()).toISOString();

  const bulkItems = [].concat(...userList.map(user => {
    var result = [
      { index: { _id: user.upn, _type: users.USER } },
      user.settings
    ];

    return result;
  }));

  return users.createIndex(err => {
    if(err)
      return callback(err);

    //console.error('Bulk loading users...');

    return es.client.bulk({
      refresh: true,
      index: users.USER_WRITE_ALIAS,
      body: bulkItems
    }, (err, resp) => {
      if(err)
        return callback(err);

      return callback();
    });
  });
}

function createSampleUsers(options, callback) {
  // options parameter is optional
  if(!callback) {
    callback = options;
    options = {};
  }

  return createTestUsers([
    {
      upn: 'Carson@FLIPFLOP.COM',
      settings: {
        userControls: {
          admin: true,
        }
      }
    },
    {
      upn: 'Dingus@FLIPFLOP.COM',
      settings: {
        userControls: {
          admin: false,
        }
      }
    },
  ], options, callback);
};

function callWsapi(id, user, data, callback, notifyCallback) {
  return wsapi.emit(id, {user: user, data: data, log: config.logger}, callback, notifyCallback || function() {});
}

describe('Users', function() {
  const CARSON = 'Carson@FLIPFLOP.COM';

  describe('Internal API', function() {
    beforeEach(function(done) {
      return async.series([
        users.deleteIndex,
        createSampleUsers,
      ], done);
    });

    afterEach(function(done) {
      return users.deleteIndex(done);
    });

    describe('get', function() {
      it('gets a user object', function(done) {
        return users.get(CARSON, function(err, user) {
          if(err)
            return done(err);

          expect(user.upn).to.equal(CARSON);
          expect(user.getSettings().userControls.admin).to.be.true;
          return done();
        });
      });

      it('returns null for a nonexistent user', function(done) {
        return users.get('bark bark', function(err, user) {
          if(err)
            return done(err);

          expect(user).to.be.null;
          return done();
        });
      });
    });

    describe('delete', function() {
      it('deletes a single user', function(done) {
        return users.delete(CARSON, function(err) {
          if(err)
            return done(err);

          return users.get(CARSON, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.be.null;
            return done();
          });
        });
      });

      it('deletes a user already in the cache', function(done) {
        return users.get(CARSON, function(err, user) {
          if(err)
            return done(err);

          expect(user).to.not.be.null;

          return users.delete(CARSON, function(err) {
            if(err)
              return done(err);

            return users.get(CARSON, function(err, user) {
              if(err)
                return done(err);

              expect(user).to.be.null;
              return done();
            });
          });
        });
      });
    });
  });

  describe('WSAPI', function() {
    beforeEach(function(done) {
      return async.series([
        users.deleteIndex,
        createSampleUsers,
      ], done);
    });

    afterEach(function(done) {
      return users.deleteIndex(done);
    });

    describe('create', function() {
      it('creates a new user', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}});
        const NEW_UPN = 'Fark@FARK.COM';

        callWsapi('user/create', user, {upn: NEW_UPN, settings: {userControls: {blink: 'blonk'}}}, function(err) {
          if(err)
            return done(err);

          return users.get(NEW_UPN, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.exist;
            expect(user.getSettings().userControls.blink).to.equal('blonk');
            return done();
          });
        });
      });

      it('raises an error if the caller doesn\'t have editUsers', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}});
        const NEW_UPN = 'Fark@FARK.COM';

        callWsapi('user/create', user, {upn: NEW_UPN, settings: {userControls: {blink: 'blonk'}}}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('Request denied.');
          return done();
        });
      });
    });

    describe('set-user-controls', function() {
      it('updates a user\'s controls', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}});

        callWsapi('user/set-user-controls', user, {upn: CARSON, userControls: {blink: 'blonk'}}, function(err) {
          if(err)
            return done(err);

          return users.get(CARSON, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.exist;
            expect(user.getSettings().userControls.blink).to.equal('blonk');
            return done();
          });
        });
      });

      it('raises an error if the user doesn\'t exist', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}});

        callWsapi('user/set-user-controls', user, {upn: 'CARSON', userControls: {blink: 'blonk'}}, function(err) {
          expect(err).to.exist;
          return done();
        });
      });

      it('raises an error if the caller doesn\'t have editUsers', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}});

        callWsapi('user/set-user-controls', user, {upn: CARSON, userControls: {blink: 'blonk'}}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('Request denied.');
          return done();
        });
      });
    });   // end set-user-controls

    describe('get', function() {
      it('gets a single user', function(done) {
        callWsapi('user/get', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}}), {upn: CARSON}, function(err, user) {
          if(err)
            return done(err);

          expect(user.upn).to.equal(CARSON);
          expect(user.settings.userControls).to.deep.equal({admin: true});
          done();
        });
      });

      it('raises an error if the user doesn\'t exist', function(done) {
        callWsapi('user/get', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}}), {upn: 'Fake@FAKE.ORG'}, function(err) {
          expect(err).to.exist;
          return done();
        });
      });
    });   // endget

    describe('delete', function() {
      it('deletes a single user', function(done) {
        callWsapi('user/delete', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}}), {upn: CARSON}, function(err) {
          if(err)
            return done(err);

          return users.get(CARSON, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.be.null;
            return done();
          });
        });
      });

      it('raises an error if the user doesn\'t exist', function(done) {
        callWsapi('user/delete', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}}), {upn: 'Fake@FAKE.ORG'}, function(err) {
          expect(err).to.exist;
          return done();
        });
      });

      it('raises an error if the caller doesn\'t have editUsers', function(done) {
        callWsapi('user/delete', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}}), {upn: CARSON}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('Request denied.');
          return done();
        });
      });
    });   // enddelete


  });
});

module.exports = {
  createTestUsers: createTestUsers
};
