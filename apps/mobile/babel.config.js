module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Worklets plugin (reanimated v4 lo movió acá) debe ir último per docs.
    plugins: ["react-native-worklets/plugin"],
  };
};
