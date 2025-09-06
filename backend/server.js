require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // In production, configure this for specific origins

// --- 1. API Key and Temporary Challenge Storage (Production: Use a Database/Redis) ---
const VALID_API_KEYS = {
  [process.env.API_KEY_LOGIN_SERVICE]: { name: 'WebApp Login Service' },
  [process.env.API_KEY_PASSWORD_RESET]: { name: 'Password Reset Service' },
};

// This store holds the correct answers temporarily.
// In production, use a proper cache like Redis with a TTL (Time-To-Live)
const challengeStore = new Map();

const SALT_ROUNDS = 10;

// --- 2. Authentication Middleware ---
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  if (!apiKey || !VALID_API_KEYS[apiKey]) {
    console.warn(`Authentication failed: Invalid or missing API Key.`);
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }
  req.clientApp = VALID_API_KEYS[apiKey].name;
  next();
};

// --- 3. Analysis Helper Functions ---

// -- Function to analyze cursor movement and interaction timing --
const calculateHumanScore = (path, interactionTime) => {
    console.log(`Analyzing with: interactionTime=${interactionTime}ms, pathPoints=${path?.length || 0}`);
    let score = 0;
    
    // A. Behavioral Timing Analysis
    if (interactionTime < 500) return 0; // Instant click is almost certainly a bot
    if (interactionTime > 1500) score += 30;
    
    // B. Mouse Movement Analysis
    if (!path || path.length < 15) {
        console.log("Not enough mouse data to analyze path.");
        return score; // Rely on timing if path is too short
    }

    let totalDistance = 0;
    const velocities = [];

    for (let i = 1; i < path.length; i++) {
        const p1 = path[i-1];
        const p2 = path[i];
        const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        totalDistance += distance;
        const time = p2.t - p1.t;
        if (time > 10) velocities.push(distance / time);
    }
    
    const startPoint = path[0];
    const endPoint = path[path.length - 1];
    const straightLineDistance = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
    const complexity = totalDistance / (straightLineDistance || 1);
    
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / (velocities.length || 1);
    const velocityVariance = velocities.reduce((acc, v) => acc + Math.pow(v - avgVelocity, 2), 0) / (velocities.length || 1);

    console.log(`Path Analysis: Complexity=${complexity.toFixed(2)}, Vel. Variance=${velocityVariance.toFixed(2)}`);

    if (complexity > 1.2) score += 20;
    if (path.length > 40) score += 20;
    if (velocityVariance > 0.05) score += 30;
    
    console.log(`Final Human Score: ${score}`);
    return score;
};

// -- Function to analyze keystroke dynamics --
const analyzeKeystrokes = (events) => {
    if (!events || events.length < 5) return true; // Not enough data, pass by default

    const delays = [];
    for (let i = 1; i < events.length; i++) {
        delays.push(events[i].t - events[i - 1].t);
    }
    const averageDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    const tooFastCount = delays.filter(d => d < 40).length;

    console.log(`Keystroke Analysis: Avg Delay=${averageDelay.toFixed(2)}ms, Fast Strokes=${tooFastCount}`);

    if (averageDelay < 50 || tooFastCount > events.length / 2) {
        console.log("Keystroke pattern rejected as robotic.");
        return false;
    }
    return true;
};

// --- 4. Unified Verification Endpoint ---
app.post('/api/captcha/verify', authenticateApiKey, async (req, res) => {
    try {
        const { mousePath, interactionTime, captchaInput, challengeToken, keyEvents } = req.body;

        // --- Flow A: Advanced (Behavioral) Verification ---
        if (mousePath && interactionTime) {
            console.log(`[${req.clientApp}] Performing advanced behavioral verification.`);
            const score = calculateHumanScore(mousePath, interactionTime);

            if (score > 50) {
                // Behavioral check passed
                return res.json({ success: true, message: 'Verification successful.' });
            } else {
                // Behavioral check failed, so issue a text challenge as a fallback.
                console.log(`[${req.clientApp}] Behavioral check failed. Issuing text challenge.`);
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let captchaText = '';
                for (let i = 0; i < 6; i++) { captchaText += chars.charAt(Math.floor(Math.random() * chars.length)); }
                
                const hash = await bcrypt.hash(captchaText.toLowerCase(), SALT_ROUNDS);
                const newChallengeToken = crypto.randomBytes(16).toString('hex');
                challengeStore.set(newChallengeToken, { hash });
                setTimeout(() => challengeStore.delete(newChallengeToken), 120000);

                return res.json({
                    success: false,
                    challengeRequired: true,
                    captchaText,
                    challengeToken: newChallengeToken
                });
            }
        }

        // --- Flow B: Simple (Text Challenge) Verification ---
        if (captchaInput && challengeToken) {
            console.log(`[${req.clientApp}] Performing text challenge verification for token ${challengeToken}.`);
            const challenge = challengeStore.get(challengeToken);
            if (!challenge) {
                return res.status(400).json({ success: false, error: 'Invalid or expired challenge token.' });
            }
            challengeStore.delete(challengeToken); // Invalidate token immediately

            const isTextCorrect = await bcrypt.compare(captchaInput.toLowerCase(), challenge.hash);
            const areKeystrokesHuman = analyzeKeystrokes(keyEvents);

            if (isTextCorrect && areKeystrokesHuman) {
                return res.json({ success: true, message: 'CAPTCHA passed.' });
            } else {
                return res.status(401).json({ success: false, error: 'CAPTCHA verification failed.' });
            }
        }

        // --- Flow C: Request for a Simple Challenge ---
        // This is triggered if the body is empty or doesn't match the flows above.
        console.log(`[${req.clientApp}] Issuing a new text challenge by request.`);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let captchaText = '';
        for (let i = 0; i < 6; i++) { captchaText += chars.charAt(Math.floor(Math.random() * chars.length)); }
        
        const hash = await bcrypt.hash(captchaText.toLowerCase(), SALT_ROUNDS);
        const newChallengeToken = crypto.randomBytes(16).toString('hex');
        challengeStore.set(newChallengeToken, { hash });
        setTimeout(() => challengeStore.delete(newChallengeToken), 120000);

        return res.json({
            success: false,
            challengeRequired: true,
            captchaText,
            challengeToken: newChallengeToken
        });

    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({ error: 'Server error during verification.' });
    }
});


// The old /challenge endpoint is no longer needed.
// The consuming application will have its own login endpoint.

const PORT = 3001;
app.listen(PORT, () => console.log(`Insight CAPTCHA API running on http://localhost:${PORT}`));

