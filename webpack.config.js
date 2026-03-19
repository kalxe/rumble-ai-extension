import path from 'path';
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: {
    background: './src/background.js',
    content: './src/content.js',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      'sodium-native': path.resolve(__dirname, 'src/shims/sodium-native.js'),
      'sodium-universal': path.resolve(__dirname, 'src/shims/sodium-native.js'),
      'process/browser': 'process/browser.js',
    },
    fallback: {
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer',
      path: false,
      fs: false,
      os: false,
      net: false,
      tls: false,
      http: false,
      https: false,
      url: false,
      zlib: false,
      vm: false,
      process: 'process/browser',
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: '.',
          transform(content) {
            // Fix paths for dist/ — remove "dist/" prefix since files are in same folder
            const manifest = JSON.parse(content.toString());
            manifest.background.service_worker = manifest.background.service_worker.replace('dist/', '');
            manifest.content_scripts[0].js = manifest.content_scripts[0].js.map(f => f.replace('dist/', ''));
            return JSON.stringify(manifest, null, 2);
          },
        },
        { from: 'popup', to: 'popup' },
        { from: 'icons', to: 'icons' },
      ],
    }),
  ],
  optimization: {
    minimize: false,
  },
};
