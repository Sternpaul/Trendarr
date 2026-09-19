const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const CONFIG_FILE = path.join(dataDir, 'config.json');

function getProfileConfig() {
    let savedConfig = {};
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        } catch (e) {
            console.error(`[${new Date().toISOString()}] Error reading config.json:`, e.message);
        }
    }

    const radarrQualityProfileId = savedConfig.radarrQualityProfileId 
        || (process.env.RADARR_QUALITY_PROFILE_ID ? parseInt(process.env.RADARR_QUALITY_PROFILE_ID, 10) : null);
        
    const sonarrQualityProfileId = savedConfig.sonarrQualityProfileId 
        || (process.env.SONARR_QUALITY_PROFILE_ID ? parseInt(process.env.SONARR_QUALITY_PROFILE_ID, 10) : null);

    const radarrRootFolder = savedConfig.radarrRootFolder || process.env.RADARR_ROOT_FOLDER || null;
    const sonarrRootFolder = savedConfig.sonarrRootFolder || process.env.SONARR_ROOT_FOLDER || null;

    return {
        radarrQualityProfileId,
        sonarrQualityProfileId,
        radarrRootFolder,
        sonarrRootFolder,
        profileName: savedConfig.profileName || null,
        configuredAt: savedConfig.configuredAt || null
    };
}

function saveProfileConfig({ 
    radarrQualityProfileId, 
    sonarrQualityProfileId, 
    radarrRootFolder, 
    sonarrRootFolder, 
    profileName 
}) {
    const existing = getProfileConfig();
    const config = {
        radarrQualityProfileId: radarrQualityProfileId ? parseInt(radarrQualityProfileId, 10) : existing.radarrQualityProfileId,
        sonarrQualityProfileId: sonarrQualityProfileId ? parseInt(sonarrQualityProfileId, 10) : existing.sonarrQualityProfileId,
        radarrRootFolder: radarrRootFolder || existing.radarrRootFolder,
        sonarrRootFolder: sonarrRootFolder || existing.sonarrRootFolder,
        profileName: profileName || existing.profileName || 'Custom Profile',
        configuredAt: new Date().toISOString()
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`[${new Date().toISOString()}] Saved Trendarr media configuration to data/config.json:`, config);
    return config;
}

function isSetupComplete() {
    const config = getProfileConfig();
    return Boolean(
        config.radarrQualityProfileId &&
        config.sonarrQualityProfileId &&
        config.radarrRootFolder &&
        config.sonarrRootFolder
    );
}

module.exports = {
    getProfileConfig,
    saveProfileConfig,
    isSetupComplete
};
