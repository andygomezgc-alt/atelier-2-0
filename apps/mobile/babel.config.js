module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Reanimated's plugin must be last per its docs.
    plugins: ["react-native-reanimated/plugin"],
  };
};
