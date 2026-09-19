const axios = require('axios');
const { getProfileConfig } = require('./config');

async function getRadarrHeaders() {
    return {
        'X-Api-Key': process.env.RADARR_API_KEY,
        'Content-Type': 'application/json'
    };
}

// 1. First we look up the exact metadata Radarr expects using the TMDB ID
// 2. We then submit a POST request to add it directly to Radarr's library and trigger download.
async function addMovieToRadarr(tmdbId) {
    const baseUrl = process.env.RADARR_URL;
    const headers = await getRadarrHeaders();

    try {
        // Step 1: Lookup movie data in Radarr using TMDB id
        console.log(`[${new Date().toISOString()}] Looking up TMDB ID ${tmdbId} in Radarr...`);
        const lookupRes = await axios.get(`${baseUrl}/api/v3/movie/lookup?term=tmdb:${tmdbId}`, { headers });
        if (!lookupRes.data || lookupRes.data.length === 0) {
            throw new Error('Movie not found in Radarr lookup');
        }

        const movieData = lookupRes.data[0];
        console.log(`[${new Date().toISOString()}] Found "${movieData.title}" via Radarr lookup. Preparing payload...`);

        // Resolve Quality Profile ID from config or env
        const profileConfig = getProfileConfig();
        const profileId = profileConfig.radarrQualityProfileId || parseInt(process.env.RADARR_QUALITY_PROFILE_ID, 10);

        // Step 2: Build the payload Radarr expects
        const payload = {
            title: movieData.title,
            qualityProfileId: profileId,
            titleSlug: movieData.titleSlug,
            images: movieData.images, // Let radarr grab TMDB posters
            tmdbId: movieData.tmdbId,
            year: movieData.year,
            rootFolderPath: profileConfig.radarrRootFolder || process.env.RADARR_ROOT_FOLDER || '/movies',
            monitored: true,
            addOptions: {
                searchForMovie: true // Instantly search indexers like Prowlarr/qBittorrent
            }
        };

        // Step 3: Send POST request to add movie to library
        console.log(`[${new Date().toISOString()}] Sending POST to add "${movieData.title}" to Radarr library...`);
        const addRes = await axios.post(`${baseUrl}/api/v3/movie`, payload, { headers });
        console.log(`[${new Date().toISOString()}] Successfully added "${movieData.title}" to Radarr.`);
        return addRes.data;
    } catch (error) {
        if (error.response) {
            console.error(`[${new Date().toISOString()}] Error adding movie to Radarr:`, error.response.data);
        } else {
            console.error(`[${new Date().toISOString()}] Error reaching Radarr:`, error.message);
        }
        throw error;
    }
}

module.exports = { addMovieToRadarr };
