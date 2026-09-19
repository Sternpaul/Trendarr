const axios = require('axios');

async function getRadarrProfiles() {
    const url = process.env.RADARR_URL;
    const apiKey = process.env.RADARR_API_KEY;
    if (!url || !apiKey) throw new Error('RADARR_URL or RADARR_API_KEY is not configured in .env');

    const res = await axios.get(`${url}/api/v3/qualityprofile`, {
        headers: { 'X-Api-Key': apiKey }
    });
    return res.data;
}

async function getSonarrProfiles() {
    const url = process.env.SONARR_URL;
    const apiKey = process.env.SONARR_API_KEY;
    if (!url || !apiKey) throw new Error('SONARR_URL or SONARR_API_KEY is not configured in .env');

    const res = await axios.get(`${url}/api/v3/qualityprofile`, {
        headers: { 'X-Api-Key': apiKey }
    });
    return res.data;
}

async function getRadarrRootFolders() {
    const url = process.env.RADARR_URL;
    const apiKey = process.env.RADARR_API_KEY;
    if (!url || !apiKey) throw new Error('RADARR_URL or RADARR_API_KEY is not configured in .env');

    const res = await axios.get(`${url}/api/v3/rootfolder`, {
        headers: { 'X-Api-Key': apiKey }
    });
    return res.data;
}

async function getSonarrRootFolders() {
    const url = process.env.SONARR_URL;
    const apiKey = process.env.SONARR_API_KEY;
    if (!url || !apiKey) throw new Error('SONARR_URL or SONARR_API_KEY is not configured in .env');

    const res = await axios.get(`${url}/api/v3/rootfolder`, {
        headers: { 'X-Api-Key': apiKey }
    });
    return res.data;
}

function formatFreeSpace(bytes) {
    if (!bytes && bytes !== 0) return 'N/A';
    const gigabytes = bytes / (1024 * 1024 * 1024);
    if (gigabytes >= 1000) {
        return `${(gigabytes / 1024).toFixed(2)} TB free`;
    }
    return `${gigabytes.toFixed(1)} GB free`;
}

async function getPairedRootFolders() {
    const [radarrFolders, sonarrFolders] = await Promise.all([
        getRadarrRootFolders(),
        getSonarrRootFolders()
    ]);

    const pairs = [];

    radarrFolders.forEach(rf => {
        // Look for matching base path in Sonarr (e.g. /media/movies -> /media/series)
        const base = rf.path.replace(/\/(movies|media\/movies).*$/, '');
        const matchingSonarr = sonarrFolders.find(sf => sf.path.startsWith(base)) || sonarrFolders[0];

        if (matchingSonarr) {
            pairs.push({
                radarrPath: rf.path,
                sonarrPath: matchingSonarr.path,
                freeSpace: formatFreeSpace(rf.freeSpace || matchingSonarr.freeSpace),
                rawFreeSpace: rf.freeSpace || 0,
                label: base || rf.path
            });
        }
    });

    // Sort so the drive with the most free space comes first
    pairs.sort((a, b) => b.rawFreeSpace - a.rawFreeSpace);

    return pairs;
}

function applyPresetToItems(items, preset) {
    const p = (preset || '1080p').toLowerCase();

    items.forEach(item => {
        const qualityName = (item.quality?.name || item.name || '').toLowerCase();

        if (p === '4k' || p === '2160p') {
            item.allowed = qualityName.includes('2160p') || qualityName.includes('4k');
        } else if (p === 'any') {
            item.allowed = qualityName.includes('720p') || qualityName.includes('1080p') || qualityName.includes('2160p');
        } else {
            item.allowed = qualityName.includes('1080p');
        }
    });

    const firstAllowed = items.find(i => i.allowed);
    const cutoffId = firstAllowed ? (firstAllowed.quality ? firstAllowed.quality.id : firstAllowed.id) : 1;

    return { items, cutoffId };
}

async function createRadarrProfile(name, preset = '1080p') {
    const existing = await getRadarrProfiles();
    if (!existing || existing.length === 0) {
        throw new Error('No existing Radarr profiles found to clone.');
    }

    const baseProfile = JSON.parse(JSON.stringify(existing[0]));
    delete baseProfile.id;
    baseProfile.name = name;

    const { items, cutoffId } = applyPresetToItems(baseProfile.items, preset);
    baseProfile.items = items;
    baseProfile.cutoff = cutoffId;
    baseProfile.upgradeAllowed = true;

    console.log(`[${new Date().toISOString()}] Creating Radarr profile "${name}" with preset "${preset}"...`);
    const res = await axios.post(`${process.env.RADARR_URL}/api/v3/qualityprofile`, baseProfile, {
        headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    return res.data;
}

async function createSonarrProfile(name, preset = '1080p') {
    const existing = await getSonarrProfiles();
    if (!existing || existing.length === 0) {
        throw new Error('No existing Sonarr profiles found to clone.');
    }

    const baseProfile = JSON.parse(JSON.stringify(existing[0]));
    delete baseProfile.id;
    baseProfile.name = name;

    const { items, cutoffId } = applyPresetToItems(baseProfile.items, preset);
    baseProfile.items = items;
    baseProfile.cutoff = cutoffId;
    baseProfile.upgradeAllowed = true;

    console.log(`[${new Date().toISOString()}] Creating Sonarr profile "${name}" with preset "${preset}"...`);
    const res = await axios.post(`${process.env.SONARR_URL}/api/v3/qualityprofile`, baseProfile, {
        headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    return res.data;
}

async function createBothProfiles(name, preset = '1080p') {
    const [radarrProfile, sonarrProfile] = await Promise.all([
        createRadarrProfile(name, preset),
        createSonarrProfile(name, preset)
    ]);
    return {
        radarrProfileId: radarrProfile.id,
        sonarrProfileId: sonarrProfile.id,
        profileName: name,
        preset
    };
}

async function verifySetup() {
    const { getProfileConfig, isSetupComplete } = require('./config');
    if (!isSetupComplete()) {
        return false;
    }

    const config = getProfileConfig();

    try {
        const [radarrProfiles, sonarrProfiles, radarrRoots, sonarrRoots] = await Promise.all([
            getRadarrProfiles(),
            getSonarrProfiles(),
            getRadarrRootFolders(),
            getSonarrRootFolders()
        ]);

        const radarrProfileExists = radarrProfiles.some(p => p.id === config.radarrQualityProfileId);
        const sonarrProfileExists = sonarrProfiles.some(p => p.id === config.sonarrQualityProfileId);
        const radarrRootExists = radarrRoots.some(r => r.path === config.radarrRootFolder);
        const sonarrRootExists = sonarrRoots.some(s => s.path === config.sonarrRootFolder);

        return radarrProfileExists && sonarrProfileExists && radarrRootExists && sonarrRootExists;
    } catch (e) {
        console.error(`[${new Date().toISOString()}] Error verifying setup in Radarr/Sonarr:`, e.message);
        return false;
    }
}

module.exports = {
    getRadarrProfiles,
    getSonarrProfiles,
    getRadarrRootFolders,
    getSonarrRootFolders,
    getPairedRootFolders,
    createRadarrProfile,
    createSonarrProfile,
    createBothProfiles,
    verifySetup
};
