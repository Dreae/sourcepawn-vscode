'use strict';

const path = require('path');

const config = {
  target: 'node',
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};

const client_config = {
  ...config,
  entry: './index.ts',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  }
};

const server_config = {
  ...config,
  entry: './server/src/server.ts',
  output: {
    path: path.resolve(__dirname, 'out/server'),
    filename: 'server.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  }
};

module.exports = [
  client_config, server_config
];