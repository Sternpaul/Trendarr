const fs = require('fs');
const path = require('path');

// Small persistent runtime state (survives Docker restarts via the ./data volume)
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const STATE_FILE = path.join(dataDir, 'state.json');

function getState() {
    if (fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        } catch (e) {
            console.error(`[${new Date().toISOString()}] Error reading state.json:`, e.message);
        }
    }
    return {};
}

function updateState(patch) {
    const state = { ...getState(), ...patch };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    return state;
}

module.exports = { getState, updateState };
