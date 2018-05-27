// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

import 'mocha';
import { expect } from 'chai';
import * as es from '../../es';
import * as async from 'async';
import users = require('../index');
import * as wsapi from '../../wsapi';
import config = require('../../config');

export function createTestUsers(userList: { upn: string; settings: users.Settings }[], callback: (err?: any) => void) {
  // articles: array of wiki objects ({title: '', body: '', tags: []})
  // knownTags: object or map mapping tag to type, used for creating the mapping
  const time = (new Date()).toISOString();

  const bulkItems = ([] as any[]).concat(...userList.map(user => {
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

function createSampleUsers(callback: (err?: any) => void) {
  return createTestUsers([
    {
      upn: 'Carson@FLIPFLOP.COM',
      settings: {
        userControls: {
          admin: true,
        },
        userSettings: {},
      }
    },
    {
      upn: 'Dingus@FLIPFLOP.COM',
      settings: {
        userControls: {
          admin: false,
        },
        userSettings: {},
      }
    },
  ], callback);
};

function callWsapi(id: string, user: users.User, data: any, callback: (err: any, result?: any) => void) {
  return wsapi.emit(id, {user: user, data: data, log: config.logger}, callback, function() {});
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
        return users.getUser(CARSON, function(err, user) {
          if(err)
            return done(err);

          expect(user).to.exist;

          if(user) {
            expect(user.upn).to.equal(CARSON);
            expect(user.getSettings().userControls.admin).to.be.true;
          }


          return done();
        });
      });

      it('returns null for a nonexistent user', function(done) {
        return users.getUser('bark bark', function(err, user) {
          if(err)
            return done(err);

          expect(user).to.be.null;
          return done();
        });
      });
    });

    describe('delete', function() {
      it('deletes a single user', function(done) {
        return users.deleteUser(CARSON, function(err) {
          if(err)
            return done(err);

          return users.getUser(CARSON, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.be.null;
            return done();
          });
        });
      });

      it('deletes a user already in the cache', function(done) {
        return users.getUser(CARSON, function(err, user) {
          if(err)
            return done(err);

          expect(user).to.not.be.null;

          return users.deleteUser(CARSON, function(err) {
            if(err)
              return done(err);

            return users.getUser(CARSON, function(err, user) {
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
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}, userSettings: {}});
        const NEW_UPN = 'Fark@FARK.COM';

        callWsapi('user/create', user, {upn: NEW_UPN, settings: {userControls: {blink: 'blonk'}}}, function(err) {
          if(err)
            return done(err);

          return users.getUser(NEW_UPN, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.exist;

            if(user)
              expect(user.getSettings().userControls.blink).to.equal('blonk');

            return done();
          });
        });
      });

      it('raises an error if the caller doesn\'t have editUsers', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}, userSettings: {}});
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
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}, userSettings: {}});

        callWsapi('user/set-user-controls', user, {upn: CARSON, userControls: {blink: 'blonk'}}, function(err) {
          if(err)
            return done(err);

          return users.getUser(CARSON, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.exist;

            if(user)
              expect(user.getSettings().userControls.blink).to.equal('blonk');

            return done();
          });
        });
      });

      it('raises an error if the user doesn\'t exist', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}, userSettings: {}});

        callWsapi('user/set-user-controls', user, {upn: 'CARSON', userControls: {blink: 'blonk'}}, function(err) {
          expect(err).to.exist;
          return done();
        });
      });

      it('raises an error if the caller doesn\'t have editUsers', function(done) {
        const user = new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}, userSettings: {}});

        callWsapi('user/set-user-controls', user, {upn: CARSON, userControls: {blink: 'blonk'}}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('Request denied.');
          return done();
        });
      });
    });   // end set-user-controls

    describe('get', function() {
      it('gets a single user', function(done) {
        callWsapi('user/get', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}, userSettings: {}}), {upn: CARSON}, function(err, user) {
          if(err)
            return done(err);

          expect(user.upn).to.equal(CARSON);
          expect(user.settings.userControls).to.deep.equal({admin: true});
          done();
        });
      });

      it('raises an error if the user doesn\'t exist', function(done) {
        callWsapi('user/get', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}, userSettings: {}}), {upn: 'Fake@FAKE.ORG'}, function(err) {
          expect(err).to.exist;
          return done();
        });
      });
    });   // endget

    describe('delete', function() {
      it('deletes a single user', function(done) {
        callWsapi('user/delete', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}, userSettings: {}}), {upn: CARSON}, function(err) {
          if(err)
            return done(err);

          return users.getUser(CARSON, function(err, user) {
            if(err)
              return done(err);

            expect(user).to.be.null;
            return done();
          });
        });
      });

      it('raises an error if the user doesn\'t exist', function(done) {
        callWsapi('user/delete', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: true}, userSettings: {}}), {upn: 'Fake@FAKE.ORG'}, function(err) {
          expect(err).to.exist;
          return done();
        });
      });

      it('raises an error if the caller doesn\'t have editUsers', function(done) {
        callWsapi('user/delete', new users.User('Fake@FAKE.ORG', {userControls: {editUsers: false}, userSettings: {}}), {upn: CARSON}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('Request denied.');
          return done();
        });
      });
    });   // enddelete


  });
});
