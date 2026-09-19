const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTrendingMovies, getMovieDetails, getTrendingSeries, getSeriesDetails } = require('./tmdb.js');

// Save the files in a dedicated 'data' folder to allow persistent Docker volumes
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const SENT_MOVIES_FILE = path.join(dataDir, 'sent_movies.json');
const SENT_SERIES_FILE = path.join(dataDir, 'sent_series.json');

// Ensure files exist on startup
if (!fs.existsSync(SENT_MOVIES_FILE)) {
    fs.writeFileSync(SENT_MOVIES_FILE, JSON.stringify([]));
}
if (!fs.existsSync(SENT_SERIES_FILE)) {
    fs.writeFileSync(SENT_SERIES_FILE, JSON.stringify([]));
}

function getSentMovies() {
    if (fs.existsSync(SENT_MOVIES_FILE)) {
        return JSON.parse(fs.readFileSync(SENT_MOVIES_FILE, 'utf-8'));
    }
    return [];
}

function saveSentMovie(id) {
    const sentMovies = getSentMovies();
    if (!sentMovies.includes(id)) {
        sentMovies.push(id);
        fs.writeFileSync(SENT_MOVIES_FILE, JSON.stringify(sentMovies));
    }
}

function getSentSeries() {
    if (fs.existsSync(SENT_SERIES_FILE)) {
        return JSON.parse(fs.readFileSync(SENT_SERIES_FILE, 'utf-8'));
    }
    return [];
}

function saveSentSeries(id) {
    const sentSeries = getSentSeries();
    if (!sentSeries.includes(id)) {
        sentSeries.push(id);
        fs.writeFileSync(SENT_SERIES_FILE, JSON.stringify(sentSeries));
    }
}

async function sendWeeklyMovies(client) {
    console.log(`[${new Date().toISOString()}] Fetching and sending trending movies...`);
    const channelId = process.env.DISCORD_CHANNEL_ID;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error(`[${new Date().toISOString()}] Discord channel with ID ${channelId} not found.`);
            return;
        }

        const movies = await getTrendingMovies();
        if (movies.length === 0) {
            console.log(`[${new Date().toISOString()}] No movies to send or fetch failed.`);
            return channel.send('Failed to fetch trending movies this week or there are none.');
        }

        const sentMovies = getSentMovies();
        const newMovies = movies.filter(m => !sentMovies.includes(m.id)).slice(0, 10); // get top 10 NEW movies

        if (newMovies.length === 0) {
            console.log(`[${new Date().toISOString()}] All trending movies have already been sent.`);
            return channel.send('No new trending movies to send this week.');
        }

        await channel.send('🎬 **Here is your selection of new trending movies!**\nClick the button underneath any movie to start downloading it immediately.');

        for (const movie of newMovies) {
            // Mark as sent
            saveSentMovie(movie.id);

            // Determine release year
            const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
            
            // Fetch IMDb ID using TMDB details
            let imdbId = '';
            let imdbRating = 'N/A';
            
            const details = await getMovieDetails(movie.id);
            if (details && details.imdb_id) {
                imdbId = details.imdb_id;
                
                // Fetch IMDb rating via OMDB API if key is configured
                const omdbKey = process.env.OMDB_API_KEY;
                if (omdbKey) {
                    try {
                        const omdbRes = await axios.get(`http://www.omdbapi.com/?apikey=${omdbKey}&i=${imdbId}`);
                        if (omdbRes.data && omdbRes.data.imdbRating) {
                            imdbRating = omdbRes.data.imdbRating;
                        }
                    } catch (e) {
                        console.error('Failed to fetch OMDB rating', e.message);
                    }
                }
            }

            const imdbValue = imdbId ? `[${imdbRating}](https://www.imdb.com/title/${imdbId}/)` : imdbRating;

            const embed = new EmbedBuilder()
                .setTitle(`${movie.title} (${year})`)
                .setDescription(movie.overview || 'No description available.')
                .addFields(
                    { name: 'IMDb Rating ⭐', value: imdbValue, inline: true }
                )
                .setImage(`https://image.tmdb.org/t/p/w500${movie.poster_path}`)
                .setColor('#E50914'); // Netflix Red color theme

            // Create the Interactive "Add to Radarr" button
            const button = new ButtonBuilder()
                .setCustomId(`add_movie_${movie.id}`) // Storing the TMDB identifier in the button ID
                .setLabel('Add to Radarr')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📥');

            const row = new ActionRowBuilder().addComponents(button);

            // Send to discord channel
            await channel.send({ embeds: [embed], components: [row] });
        }
        console.log(`[${new Date().toISOString()}] Successfully sent ${newMovies.length} movies to Discord.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending movies:`, error);
    }
}

async function sendWeeklySeries(client) {
    console.log(`[${new Date().toISOString()}] Fetching and sending trending TV series...`);
    const channelId = process.env.DISCORD_SERIES_CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error(`[${new Date().toISOString()}] Discord series channel with ID ${channelId} not found.`);
            return;
        }

        const seriesList = await getTrendingSeries();
        if (seriesList.length === 0) {
            console.log(`[${new Date().toISOString()}] No series to send or fetch failed.`);
            return channel.send('Failed to fetch trending TV series this week or there are none.');
        }

        const sentSeries = getSentSeries();
        const newSeries = seriesList.filter(s => !sentSeries.includes(s.id)).slice(0, 10); // top 10 NEW series

        if (newSeries.length === 0) {
            console.log(`[${new Date().toISOString()}] All trending TV series have already been sent.`);
            return channel.send('No new trending TV series to send this week.');
        }

        await channel.send('📺 **Here is your selection of new trending TV series!**\nClick the button underneath any series to start monitoring and downloading all episodes immediately.');

        for (const show of newSeries) {
            // Mark as sent
            saveSentSeries(show.id);

            // Determine release year
            const year = show.first_air_date ? show.first_air_date.split('-')[0] : 'N/A';
            
            // Fetch series details for external IDs (IMDb, TVDB) and season count
            let imdbId = '';
            let imdbRating = 'N/A';
            let seasonsCount = 'N/A';
            let status = '';
            
            const details = await getSeriesDetails(show.id);
            if (details) {
                if (details.number_of_seasons) {
                    seasonsCount = `${details.number_of_seasons} Season${details.number_of_seasons > 1 ? 's' : ''}`;
                }
                if (details.status) {
                    status = details.status;
                }

                if (details.external_ids && details.external_ids.imdb_id) {
                    imdbId = details.external_ids.imdb_id;
                    
                    // Fetch IMDb rating via OMDB API if key is configured
                    const omdbKey = process.env.OMDB_API_KEY;
                    if (omdbKey) {
                        try {
                            const omdbRes = await axios.get(`http://www.omdbapi.com/?apikey=${omdbKey}&i=${imdbId}`);
                            if (omdbRes.data && omdbRes.data.imdbRating) {
                                imdbRating = omdbRes.data.imdbRating;
                            }
                        } catch (e) {
                            console.error('Failed to fetch OMDB rating for series:', e.message);
                        }
                    }
                }
            }

            const imdbValue = imdbId ? `[${imdbRating}](https://www.imdb.com/title/${imdbId}/)` : imdbRating;

            const fields = [
                { name: 'IMDb Rating ⭐', value: imdbValue, inline: true },
                { name: 'Seasons 📺', value: seasonsCount, inline: true }
            ];
            if (status) {
                fields.push({ name: 'Status 📡', value: status, inline: true });
            }

            const posterUrl = show.poster_path 
                ? `https://image.tmdb.org/t/p/w500${show.poster_path}` 
                : null;

            const embed = new EmbedBuilder()
                .setTitle(`${show.name} (${year})`)
                .setDescription(show.overview || 'No description available.')
                .addFields(fields)
                .setColor('#00C0FF'); // Sonarr Sky Blue color theme

            if (posterUrl) {
                embed.setImage(posterUrl);
            }

            // Create the Interactive "Add to Sonarr" button
            const button = new ButtonBuilder()
                .setCustomId(`add_series_${show.id}`) // Storing TMDB ID in button customId
                .setLabel('Add to Sonarr')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📺');

            const row = new ActionRowBuilder().addComponents(button);

            // Send to discord channel
            await channel.send({ embeds: [embed], components: [row] });
        }
        console.log(`[${new Date().toISOString()}] Successfully sent ${newSeries.length} TV series to Discord.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending TV series:`, error);
    }
}

function startCronJobs(client) {
    const movieSchedule = process.env.CRON_SCHEDULE || '0 17 * * 5';
    const seriesSchedule = process.env.CRON_SCHEDULE_SERIES || movieSchedule;

    // Schedule movies cron job
    cron.schedule(movieSchedule, () => {
        console.log(`[${new Date().toISOString()}] Running scheduled weekly trending movies cron job...`);
        sendWeeklyMovies(client);
    });
    console.log(`[${new Date().toISOString()}] Movies cron job scheduled successfully with expression: "${movieSchedule}"`);

    // Schedule series cron job (can run at same or different time)
    cron.schedule(seriesSchedule, () => {
        console.log(`[${new Date().toISOString()}] Running scheduled weekly trending series cron job...`);
        sendWeeklySeries(client);
    });
    console.log(`[${new Date().toISOString()}] Series cron job scheduled successfully with expression: "${seriesSchedule}"`);
}

module.exports = { startCronJobs, sendWeeklyMovies, sendWeeklySeries };

