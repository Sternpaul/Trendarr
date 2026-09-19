const axios = require('axios');

async function getTrendingMovies() {
    const apiKey = process.env.TMDB_API_KEY;
    const url1 = `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}&page=1`;
    const url2 = `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}&page=2`;
    
    try {
        console.log(`[${new Date().toISOString()}] Calling TMDB API...`);
        const [res1, res2] = await Promise.all([
            axios.get(url1),
            axios.get(url2)
        ]);
        console.log(`[${new Date().toISOString()}] TMDB API responded successfully.`);
        // Return 40 movies so we have a large pool to filter out duplicates from
        return [...res1.data.results, ...res2.data.results];
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching from TMDB:`, error.message);
        return [];
    }
}

async function getMovieDetails(tmdbId) {
    const apiKey = process.env.TMDB_API_KEY;
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`;
    
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        return null;
    }
}

// Genre IDs to exclude: 10763 (News), 10764 (Reality), 10767 (Talk)
const EXCLUDED_TV_GENRE_IDS = [10763, 10764, 10767];

async function getTrendingSeries() {
    const apiKey = process.env.TMDB_API_KEY;
    const url1 = `https://api.themoviedb.org/3/trending/tv/week?api_key=${apiKey}&page=1`;
    const url2 = `https://api.themoviedb.org/3/trending/tv/week?api_key=${apiKey}&page=2`;
    
    try {
        console.log(`[${new Date().toISOString()}] Calling TMDB API for trending TV series...`);
        const [res1, res2] = await Promise.all([
            axios.get(url1),
            axios.get(url2)
        ]);
        console.log(`[${new Date().toISOString()}] TMDB TV API responded successfully.`);
        const allShows = [...res1.data.results, ...res2.data.results];

        // Filter out Reality, News, and Talk shows
        const filteredShows = allShows.filter(show => {
            if (!show.genre_ids || !Array.isArray(show.genre_ids)) return true;
            return !show.genre_ids.some(id => EXCLUDED_TV_GENRE_IDS.includes(id));
        });

        console.log(`[${new Date().toISOString()}] Filtered ${allShows.length} shows down to ${filteredShows.length} scripted series.`);
        return filteredShows;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching trending series from TMDB:`, error.message);
        return [];
    }
}

async function getSeriesDetails(tmdbId) {
    const apiKey = process.env.TMDB_API_KEY;
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&append_to_response=external_ids`;
    
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching series details for TMDB ID ${tmdbId}:`, error.message);
        return null;
    }
}

module.exports = { 
    getTrendingMovies, 
    getMovieDetails, 
    getTrendingSeries, 
    getSeriesDetails 
};

