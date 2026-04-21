const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Respect --mode from CLI; default to production for safety
const mode = process.env.NODE_ENV || 'production';

module.exports = {
  mode,
  target: 'electron-renderer',
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  resolve: { extensions: ['.js', '.jsx'] },
  module: {
    rules: [
      { test: /\.jsx?$/, exclude: /node_modules/, use: 'babel-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      {
        test: /\.(woff2?|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: { filename: 'fonts/[name][hash][ext]' }
      },
      {
        test: /\.(png|jpe?g|gif|svg|webp)$/i,
        type: 'asset/resource',
        generator: { filename: 'assets/[name][hash][ext][query]' }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
  template: './src/index.html',
  filename: 'index.html',
  inject: false // keep your manual <script src="bundle.js">
    })
  ],
  // Enable source maps in all modes to diagnose runtime errors precisely (temporary; safe to switch back later)
  devtool: 'source-map'
};