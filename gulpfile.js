'use strict';

const gulp = require('gulp');
const packageJson = require('./package.json');
const watch = require('gulp-watch');
const es = require('event-stream');
const debug = require('gulp-debug');
const preprocess = require('gulp-preprocess');
const rename = require('gulp-rename');
const del = require('del');
const fs = require('fs');
const ms = require('ms');
const browserify = require('browserify');
const watchify = require('watchify');
const source = require('vinyl-source-stream');
const ngHtml2Js = require('browserify-ng-html2js');
const transform = require('vinyl-transform');
const uglify = require('gulp-uglify');
const buffer = require('vinyl-buffer');
const sourcemaps = require('gulp-sourcemaps');
const babelify = require('babelify');
const onceConcat = require('gulp-concat');
const continuousConcat = require('gulp-continuous-concat');

let concat = onceConcat;

const configFile = require('./server/config.js');

const config = {
  DEBUG: true,
  EXPERIMENTAL: false,
  CLIENT_VERSION: packageJson.version,
  SECURE: configFile.secure,
  HOST: configFile.hostname,
  PORT: configFile.port,
  CONFIGURATION: 'debug',
  SUBDIR: configFile.subdir,
  FORMS_SUBDIR: configFile.formsSubdir,

  get buildDir() { return './build'; },
  get outDir() { return this.buildDir + '/www'; },
  get URL_BASE_PATH() { return (this.SECURE ? 'https' : 'http') + '://' + this.HOST + ':' + this.PORT + this.SUBDIR },
  get FORMS_URL_BASE_PATH() { return (this.SECURE ? 'https' : 'http') + '://' + this.HOST + ':' + this.PORT + this.FORMS_SUBDIR },
  get WS_BASE_PATH() { return (this.SECURE ? 'wss' : 'ws') + '://' + this.HOST + ':' + this.PORT + this.SUBDIR; },
  watch: false,
};

function setProd() {
  config.DEBUG = false;
  config.EXPERIMENTAL = false;
  config.CONFIGURATION = 'prod';
}

function srcWatch(spec) {
  const result = gulp.src(spec);

  if(!config.watch)
    return result;

  return result.pipe(watch(spec));
}

gulp.task('clean-output', [], function() {
  return del([config.outDir]);
});

function buildApp() {
  var clientBrowserify = browserify({
    entries: ['client/index.js'],
    cache: {},
    packageCache: {},
    debug: config.DEBUG,
    bare: true,
  });

  // Force using the d3 browser build instead of the node build
  clientBrowserify.require('./node_modules/d3/build/d3.js', {expose: 'd3'});

  if(!config.DEBUG) {
    clientBrowserify.transform(
      babelify.configure({
        presets: [
          ['env', {
            targets: {
              browsers: ['last 2 versions', 'not ie < 11']
            },
            useBuiltins: true,
          }]
        ]
      })
    );
  }

  clientBrowserify.transform(ngHtml2Js({
    module: 'investigator.Templates',
    requireAngular: true,
    baseDir: './client/',
  }))

  var formsBrowserify = browserify({
    entries: ['client/www/forms/index.js'],
    cache: {},
    packageCache: {},
    debug: config.DEBUG,
    bare: true,
  });

  // Force using the d3 browser build instead of the node build
  formsBrowserify.require('./node_modules/d3/build/d3.js', {expose: 'd3'});

  if(!config.DEBUG) {
    formsBrowserify.transform(
      babelify.configure({
        presets: [
          ['env', {
            targets: {
              browsers: ['last 2 versions']
            },
            useBuiltins: true,
          }]
        ]
      })
    );
  }

  formsBrowserify.transform(ngHtml2Js({
    module: 'Forms.Templates',
    requireAngular: true,
    baseDir: './client/',
  }))

  if(config.watch) {
    clientBrowserify = watchify(clientBrowserify);
    clientBrowserify.on('update', bundleClient);
    clientBrowserify.on('log', obj => console.log(obj));
    formsBrowserify = watchify(formsBrowserify);
    formsBrowserify.on('update', bundleForms);
    formsBrowserify.on('log', obj => console.log(obj));
  }

  function bundleClient() {
    return clientBrowserify
      .bundle()
      .on('error', err => console.error(err))
      // Pretend the browserify bundle is a file js/bundle.js
      .pipe(source('bundle.js'))
      .pipe(buffer())
      .pipe(debug({title: 'pre-sourcemaps'}))
      .pipe(sourcemaps.init({loadMaps: true}))
        // Transform the pipeline
        .pipe(config.DEBUG ? debug({title: 'Skipping uglify'}) : uglify({mangle: false}))
      .pipe(debug({title: 'post-uglify'}))
      .pipe(sourcemaps.write(''))
      .pipe(gulp.dest(config.outDir + '/js'))
      .pipe(debug({title: 'bundle end'}));
  }

  function bundleForms() {
    return formsBrowserify
      .bundle()
      .on('error', err => console.error(err))
      // Pretend the browserify bundle is a file js/bundle.js
      .pipe(source('forms-bundle.js'))
      .pipe(buffer())
      .pipe(debug({title: 'pre-sourcemaps'}))
      .pipe(sourcemaps.init({loadMaps: true}))
        // Transform the pipeline
        .pipe(config.DEBUG ? debug({title: 'Skipping uglify'}) : uglify({mangle: false}))
      .pipe(debug({title: 'post-uglify'}))
      .pipe(sourcemaps.write(''))
      .pipe(gulp.dest(config.outDir + '/js'))
      .pipe(debug({title: 'bundle end'}));
  }

  return es.merge([
      srcWatch(['client/www/static/**'])
        .pipe(gulp.dest(config.outDir + '/static')),
      srcWatch([
          'node_modules/bootswatch/paper/bootstrap.min.css',
          'node_modules/codemirror/lib/codemirror.css',
          'node_modules/codemirror/addon/hint/show-hint.css',
          'node_modules/angular/angular-csp.css',
          'client/www/js/app.css',
        ])
        .pipe(concat('js/app.css'))
        .pipe(gulp.dest(config.outDir)),
      bundleClient(),
      bundleForms(),
      srcWatch('client/www/**/*.shtml')
        .pipe(preprocess({context: config}))
        .pipe(rename({extname: '.html'}))
        .pipe(gulp.dest(config.outDir))
    ]).pipe(debug());
}

gulp.task('watch-dev', ['clean-output'], function() {
  config.watch = true;
  concat = continuousConcat;
  buildApp();
});

gulp.task('build-dev', ['clean-output'], function() {
  config.watch = false;
  buildApp();
});

gulp.task('build-exp-prod', ['clean-output'], function() {
  config.watch = false;
  setExpProd();
  buildApp();
});

gulp.task('build-prod', [], function() {
  config.watch = false;
  setProd();
  buildApp();
});
