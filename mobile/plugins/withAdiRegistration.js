const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const token = process.env.ADI_REGISTRATION_TOKEN;

    if (!token) {
      throw new Error('ADI_REGISTRATION_TOKEN is not set');
    }

    const assetsDir = path.join(
      config.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'assets'
    );

    await fs.promises.mkdir(assetsDir, { recursive: true });

    const targetFile = path.join(assetsDir, 'adi-registration.properties');
    await fs.promises.writeFile(targetFile, `${token}\n`, 'utf8');

    return config;
  }]);
};