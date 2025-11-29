// config-overrides.js - Webpack configuration overrides for Create React App
const webpack = require('webpack');

module.exports = function override(config) {
  // Add fallbacks for Node.js core modules used by rsocket libraries
  config.resolve.fallback = {
    ...config.resolve.fallback,
    buffer: require.resolve('buffer/'),
    stream: false,
    util: false,
  };

  // Add buffer polyfill plugin
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  return config;
};
