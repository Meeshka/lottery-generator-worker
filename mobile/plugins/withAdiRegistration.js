const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const token = process.env.ADI_REGISTRATION_TOKEN;
    const buildProfile = process.env.EAS_BUILD_PROFILE;
    const needsAdiRegistration = buildProfile === 'preview';

    const assetsDir = path.join(
      config.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'assets'
    );
    const targetFile = path.join(assetsDir, 'adi-registration.properties');

    if (!needsAdiRegistration) {
      try {
        await fs.promises.unlink(targetFile);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      return config;
    }

    if (!token) {
      throw new Error('ADI_REGISTRATION_TOKEN is required for the preview build profile.\n' +
          'Either run `export ADI_REGISTRATION_TOKEN=...` before running the build\n' +
          'or make the file `adi-registration.properties` in the assets directory.');
    }

    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(
      targetFile,
      `${token}\n`,
      'utf8'
    );

    return config;
  }]);
};
