const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const { ProvidePlugin } = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");

const config = require("./config.js");

module.exports = (env) => {
  const { publicPath, analyzeBundle } = { ...config, ...env };

  // output filename: deployment config
  const outputFilename = "[name].[contenthash].bundle.js";

  // HtmlWebpackPlugin: deployment config
  const htmlConfig = {
    inject: false,
    filename: "headstart.php",
    templateContent: ({ htmlWebpackPlugin }) =>
      `${htmlWebpackPlugin.tags.headTags}
      ${htmlWebpackPlugin.tags.bodyTags}`,
  };

  // MiniCssExtractPlugin: deployment config
  const miniCssConfig = {
    filename: "[name].[contenthash].css",
  };

  return {
    devtool: "eval-source-map",

    entry: {
      headstart: "./vis/index.ts",
    },

    output: {
      filename: outputFilename,
      path: path.resolve(__dirname, "dist"),
      publicPath: publicPath,
      library: {
        name: "headstart",
        type: "var",
      },
      clean: true,
    },

    devServer: {
      open: true,
      static: [
        path.resolve(__dirname, "dist/"),
      ],
      devMiddleware: { publicPath: "/dist/", writeToDisk: true },
    },

    resolve: {
      extensions: [".js", ".jsx", ".ts", ".tsx"],
      alias: {
        // Aliases for the root frontend folder (vis) and the folder where
        // code of components is mostly located (vis/js)
        "@": path.resolve(__dirname, "vis/"),
        "@js": path.resolve(__dirname, "vis/js/"),

        // Aliases for hypher and markjs are created for more convenient
        // import of them from the node_modules/ folder
        hypher: "hypher/dist/jquery.hypher.js",
        markjs: "mark.js/dist/jquery.mark.js",
      },
    },

    plugins: [
      new HtmlWebpackPlugin(htmlConfig),
      new ProvidePlugin({
        process: "process/browser",
        jQuery: "jquery",
      }),
      new MiniCssExtractPlugin(miniCssConfig),
      ...(analyzeBundle ? [new BundleAnalyzerPlugin()] : []),
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "node_modules/leaflet/dist/images"),
            to: "images",
          },
        ],
      }),
    ],

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.[j]sx?$/,
          exclude: /node_modules/,
          use: "babel-loader",
        },
        {
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
          type: "asset/resource",
          generator: {
            filename: "fonts/[name][ext]",
          },
        },
        {
          test: /\.(png|jpe?g|gif)$/i,
          type: "asset/resource",
          generator: {
            filename: "images/[name][ext]",
          },
        },
        {
          test: /\.(sa|sc)ss$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: "css-loader",
              options: {
                url: true,
                esModule: false,
              },
            },
            {
              loader: "sass-loader",
              options: {
                additionalData: `$skin: "${process.env.SKIN || ""}";`,
                sassOptions: {
                  includePaths: ["node_modules"],
                  silenceDeprecations: ["import"],
                },
              },
            },
          ],
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: "css-loader",
              options: { url: true, esModule: false },
            },
          ],
        },
        { test: /\.csl$/, type: "asset/source" },
      ],
    },

    optimization: {
      // deterministic = stable hashes between builds
      moduleIds: "deterministic",
      // single = optimized for import into same page
      runtimeChunk: "single",
      splitChunks: {
        // max chunk size in B
        maxSize: 500000,
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
          },
        },
      },
    },
  };
};
