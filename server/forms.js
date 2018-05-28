'use strict';

const express = require('express');
const _config = require('./config');
const logger = _config.logger.child({module: 'forms'});
const path = require('path');
const bodyParser = require('body-parser');
const wiki = require('./wiki');
const d3 = require('d3');
const timestampFormat = d3.timeFormat('%Y-%m-%d %H:%M');
const util = require('../common/util');

function nonStaticCacheControl(res, path, stat) {
  // Tell the browser it must check with us for a new version every time
  // ("no-cache" is another misnomer-- the browser and proxies are allowed
  // to cache the result, but they must check with us for a new version
  // before serving it; to disable all caching, set "no-store")
  res.set('Cache-Control', 'public, no-cache');
}

var formsRouter = express.Router({
  // Route names are case-sensitive
  caseSensitive: true,

  // /foo and /foo/ are not the same
  // (see https://www.npmjs.com/package/express-slash for a helper module)
  strict: true
});

// Set up paths to static files.
//
// By default, files are served up with a max-age of zero. For files that
// we promise not to change, we're supplying a time of 30 days, so the
// browser can skip asking us about those.
formsRouter.use('/js/', express.static(path.join(_config.rootPath, 'static'), {
  // Don't try to serve up the index of a directory
  index: false,

  // Don't bother with last-modified, we've got etags
  lastModified: false,

  // Have the cache check back with us after a year (effectively permanent)
  maxAge: '365d'
}));

// Non-static files
formsRouter.use('/js/', express.static(path.join(_config.rootPath, 'js'), {
  index: false,
  lastModified: false,
  fallthrough: false,
  setHeaders: nonStaticCacheControl
}));

// Forestall mistakes in requesting templates; all of our templates are compiled, not served
formsRouter.all('/template/*', function(req, res) {
  res.sendStatus(404);
});

formsRouter.all('/partials/*', function(req, res) {
  res.sendStatus(404);
});

formsRouter.post('/_service/auth/forms/support-new', bodyParser.json(), function(req, res, next) {
  var user = req.get('Proxy-User') || 'UnknownUser@UNKNOWN.COM';

  //console.log(JSON.stringify(req.body, null, 2));

  if(!req.body || !req.body.productName || !req.body.userCount) {
    req.log.warn('Data transmission invalid in support-new form.');
    res.status(400).send('Invalid request.');
    return next();
  }

  var dataTransmission, dataTransmissionTag;

  switch(req.body.dataTransmission) {
    case 'localOnly':
      dataTransmission = 'Data is only kept locally.';
      dataTransmissionTag = 'local-data';
      break;

    case 'receive':
      dataTransmission = 'Data is only received from the service.';
      dataTransmissionTag = 'received-data';
      break;

    case 'receiveOrSend':
      dataTransmission = 'Company data is sent or received from the service.';
      dataTransmissionTag = 'sent-company-data';
      break;

    default:
      req.log.warn('Data transmission invalid in support-new form.');
      res.status(400).send('Invalid request.');
      return next();
  }

  var article = {
    title: `New support request: ${req.body.productName} (${timestampFormat(new Date())})`,
    body: `${req.body.productDescription}\n\n* Website: ${req.body.productWebsite || '(none given)'}\n* Product deals with "${req.body.dataName}"\n* ${dataTransmission}\n* Main contact is [[${req.body.contactName}]]\n* Request was sent by ${user}${req.body.comments && ('\n\n' + req.body.comments) || ''}`,
    tags: [
      'product-support-request',
      util.buildTag('confidentiality', req.body.confidentialityImpact),
      util.buildTag('integrity', req.body.integrityImpact),
      util.buildTag('availability', req.body.availabilityImpact),
      util.buildTag('user-count', req.body.userCount + ''),
      dataTransmissionTag
    ]
  };

  wiki.createArticle(article, user, function(err, result) {
    if(err)
      return next(err);

    if(_config.mailer) {
      _config.mailer.sendMail({
        from: {name: "Investigator Forms", address: 'investigator@example.com'},
        to: 'InfoSecAlert@example.com',
        subject: 'New support request: ' + req.body.productName,
        text: `${user} submitted a new support request.\n\nhttps://localhost/investigator/wiki/article/${encodeURIComponent(result._id)}`
      }, function(err, mailResult) {
        if(err) {
          req.log.warn({messageId: 'lib/mail/sendMail/failed', data: data, err: err}, 'Sending mail failed outright.');
          return;
        }

        if(mailResult.rejected.length) {
          req.log.warn({messageId: 'lib/mail/sendMail/rejected', data: data, result: result}, `Mail sending failed to the following recipients: ${result.rejected}`);
        }
      });
    }

    res.status(204).send();
  });


});

formsRouter.use('/', express.static(path.join(_config.rootPath, 'forms'), {
  lastModified: false,
  setHeaders: nonStaticCacheControl
}));


module.exports.router = formsRouter;
