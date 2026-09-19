const axios = require('axios');
const { getProfileConfig } = require('./config');

async function getSonarrHeaders() {
    return {
        'X-Api-Key': process.env.SONARR_API_KEY,
        'Content-Type': 'application/json'
    };
}

// 1. Look up the exact series metadata Sonarr expects using TVDB ID (or title fallback)
// 2. Submit a POST request to add the series to Sonarr's library and monitor all episodes.
async function addSeriesToSonarr(tvdbId, seriesTitle) {
    const baseUrl = process.env.SONARR_URL;
    const headers = await getSonarrHeaders();

    if (!baseUrl || !process.env.SONARR_API_KEY) {
        throw new Error('SONARR_URL or SONARR_API_KEY is not configured in .env');
    }

    try {
        // Step 1: Lookup series in Sonarr
        const searchTerm = tvdbId ? `tvdb:${tvdbId}` : seriesTitle;
        console.log(`[${new Date().toISOString()}] Looking up series "${seriesTitle}" (${searchTerm}) in Sonarr...`);
        
        const lookupRes = await axios.get(`${baseUrl}/api/v3/series/lookup?term=${encodeURIComponent(searchTerm)}`, { headers });
        if (!lookupRes.data || lookupRes.data.length === 0) {
            throw new Error(`Series "${seriesTitle}" not found in Sonarr lookup.`);
        }

        // Pick matching series from lookup results
        let seriesData = null;
        if (tvdbId) {
            seriesData = lookupRes.data.find(s => s.tvdbId === tvdbId) || lookupRes.data[0];
        } else {
            seriesData = lookupRes.data[0];
        }

        console.log(`[${new Date().toISOString()}] Found "${seriesData.title}" via Sonarr lookup. Preparing payload...`);

        // Ensure all seasons are set to monitored
        const monitoredSeasons = (seriesData.seasons || []).map(season => ({
            ...season,
            monitored: true
        }));

        // Resolve Quality Profile ID from config or env
        const profileConfig = getProfileConfig();
        const profileId = profileConfig.sonarrQualityProfileId || parseInt(process.env.SONARR_QUALITY_PROFILE_ID || '1', 10);

        // Step 2: Build the payload Sonarr expects
        const payload = {
            title: seriesData.title,
            qualityProfileId: profileId,
            titleSlug: seriesData.titleSlug,
            images: seriesData.images,
            tvdbId: seriesData.tvdbId,
            year: seriesData.year,
            rootFolderPath: profileConfig.sonarrRootFolder || process.env.SONARR_ROOT_FOLDER || '/tv',
            seasonFolder: true,
            monitored: true,
            seasons: monitoredSeasons,
            addOptions: {
                searchForMissingEpisodes: true,
                ignoreEpisodesWithFiles: false,
                ignoreEpisodesWithoutFiles: false
            }
        };

        // Step 3: Send POST request to add series to library
        console.log(`[${new Date().toISOString()}] Sending POST to add "${seriesData.title}" to Sonarr library...`);
        const addRes = await axios.post(`${baseUrl}/api/v3/series`, payload, { headers });
        console.log(`[${new Date().toISOString()}] Successfully added "${seriesData.title}" to Sonarr.`);
        return addRes.data;
    } catch (error) {
        if (error.response) {
            console.error(`[${new Date().toISOString()}] Error adding series to Sonarr:`, error.response.data);
        } else {
            console.error(`[${new Date().toISOString()}] Error reaching Sonarr:`, error.message);
        }
        throw error;
    }
}

module.exports = { addSeriesToSonarr };
