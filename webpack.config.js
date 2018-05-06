'use strict';

const packageJson = require('./package.json');
const path = require('path');
const configFile = require('./server/config.js');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

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

  get buildDir() { return 'build'; },
  get outDir() { return this.buildDir + '/www'; },
  get URL_BASE_PATH() { return (this.SECURE ? 'https' : 'http') + '://' + this.HOST + ':' + this.PORT + this.SUBDIR },
  get FORMS_URL_BASE_PATH() { return (this.SECURE ? 'https' : 'http') + '://' + this.HOST + ':' + this.PORT + this.FORMS_SUBDIR },
  get WS_BASE_PATH() { return (this.SECURE ? 'wss' : 'ws') + '://' + this.HOST + ':' + this.PORT + this.SUBDIR; },
  watch: false,
};

module.exports = function(env) {
  const prod = env && env.production;

  const baseOptions = {
    mode: prod ? 'production' : 'development',
    devtool: 'source-map',
    module: {
      rules: [
        { 
          test: /\.js$/,
          use: 'angularjs-template-loader',
        },
        {
          // Give raw HTML to the angularjs-template-loader
          test: /\.html$/,
          exclude: [
            path.resolve(__dirname, 'client/www'),
          ],
          use: ['raw-loader'],
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
          ],
        },
        {
          // Ignore font files
          test: /\.(?:ttf|woff2|woff|eot|svg)$/,
          use: 'ignore-loader',
        },
      ],
    },
  };

  return [
    Object.assign({
      entry: './client/index.js',
      plugins: [
        new CleanWebpackPlugin([config.buildDir] + '/www'),
        new HtmlWebpackPlugin({
          URL_BASE_PATH: config.URL_BASE_PATH,
          CLIENT_VERSION: config.CLIENT_VERSION,
          WS_BASE_PATH: config.WS_BASE_PATH,

          template: 'client/www/index.html',
        }),
        new MiniCssExtractPlugin({
          filename: 'js/[name].css',
          chunkFilename: 'js/[id].css',
        }),
        new CopyWebpackPlugin([
          { from: 'static/**/*', context: 'client/www/', to: '' },
        ], {}),
      ],
      output: {
        filename: 'js/bundle.js',
        path: path.resolve(__dirname, config.outDir),
      },
    }, baseOptions),
    Object.assign({
      entry: './client/www/forms/index.js',
      plugins: [
        new HtmlWebpackPlugin({
          URL_BASE_PATH: config.URL_BASE_PATH,
          CLIENT_VERSION: config.CLIENT_VERSION,
          WS_BASE_PATH: config.WS_BASE_PATH,

          filename: 'forms/support-new.html',
          template: 'client/www/forms/support-new.html',
        }),
        new HtmlWebpackPlugin({
          URL_BASE_PATH: config.URL_BASE_PATH,
          CLIENT_VERSION: config.CLIENT_VERSION,
          WS_BASE_PATH: config.WS_BASE_PATH,

          filename: 'forms/impact.html',
          template: 'client/www/forms/impact.html',
        }),
        new HtmlWebpackPlugin({
          URL_BASE_PATH: config.URL_BASE_PATH,
          CLIENT_VERSION: config.CLIENT_VERSION,
          WS_BASE_PATH: config.WS_BASE_PATH,

          filename: 'forms/impact-static.html',
          template: 'client/www/forms/impact-static.html',
        }),
        new MiniCssExtractPlugin({
          filename: 'js/forms[name].css',
          chunkFilename: 'js/forms[id].css',
        }),
      ],
      output: {
        filename: 'js/forms-bundle.js',
        path: path.resolve(__dirname, config.outDir),
      },
    }, baseOptions),
  ];
};
