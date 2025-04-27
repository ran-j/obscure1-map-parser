const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Obscure1MapParser',
        authors: 'Ran-j',
        description: 'Obscure 1 Game Map Parser'
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        name: 'obscure1-map-parser',
        productName: 'Obscure 1 Map Parser',
        categories: ['Utility'],
        maintainer: 'Ran-j',
        homepage: 'https://github.com/ran-j/obscure1-map-parser'
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        name: 'obscure1-map-parser',
        productName: 'Obscure 1 Map Parser',
        categories: ['Utility'],
        homepage: 'https://github.com/ran-j/obscure1-map-parser'
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
