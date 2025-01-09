const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: {
      resolve: {
        fallback: {
          stream: require.resolve('stream-browserify'),
          buffer: require.resolve('buffer/'),
          util: require.resolve('util/'),
          process: require.resolve('process/browser'),
        },
      },
      plugins: [
        new webpack.ProvidePlugin({
          process: 'process/browser',
          Buffer: ['buffer', 'Buffer'],
        }),
      ],
    },
  },
};