const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
app.use(express.json());

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(session({
    secret: 'a-very-secret-key-for-your-captcha-app',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 600000 }
}));

const SALT_ROUNDS = 10;

// --- Analysis Helper Functions (Now Secure on Backend) ---

const calculateHumanScore = (path, interactionTime) => {
    // --- THIS FUNCTION IS NOW FULLY IMPLEMENTED ---
    console.log(`Analyzing with: interactionTime=${interactionTime}ms, pathPoints=${path?.length || 0}`);
    let score = 0;
    
    // 1. Behavioral Timing
    if (interactionTime < 500) return 0; // Instant click is a bot
    if (interactionTime > 1500) score += 30;
    
    // 2. Mouse Movement Analysis
    if (!path || path.length < 15) {
        console.log("Not enough mouse data to analyze path.");
        return score; // Not enough mouse data, rely on timing
    }

    let totalDistance = 0;
    const velocities = [];

    // Calculate distances and velocities between points
    for (let i = 1; i < path.length; i++) {
        const p1 = path[i-1];
        const p2 = path[i];
        const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        totalDistance += distance;
        const time = p2.t - p1.t;
        if (time > 10) { // Only consider meaningful time intervals
            velocities.push(distance / time);
        }
    }
    
    // Calculate path complexity (curvy vs. straight)
    const startPoint = path[0];
    const endPoint = path[path.length - 1];
    const straightLineDistance = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
    const complexity = totalDistance / (straightLineDistance || 1);
    
    // Calculate velocity variance (smooth vs. jerky)
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / (velocities.length || 1);
    const velocityVariance = velocities.reduce((acc, v) => acc + Math.pow(v - avgVelocity, 2), 0) / (velocities.length || 1);

    console.log(`Path Analysis: Complexity=${complexity.toFixed(2)}, Vel. Variance=${velocityVariance.toFixed(2)}`);

    // Award points for human-like characteristics
    if (complexity > 1.2) score += 20;       // Path is curved, not a straight line
    if (path.length > 40) score += 20;       // More movement data is better
    if (velocityVariance > 0.05) score += 30; // Speed was inconsistent
    
    console.log(`Final Human Score: ${score}`);
    return score;
};

// NEW: Server-side function to analyze keystroke dynamics
const analyzeKeystrokes = (events) => {
    if (!events || events.length < 5) {
        // Not enough data to analyze, fail safely
        return false;
    }

    const delays = [];
    for (let i = 1; i < events.length; i++) {
        const delay = events[i].t - events[i - 1].t;
        delays.push(delay);
    }

    const averageDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    
    // Check for inhumanly fast typing. Bots often have near-zero delay.
    const tooFastCount = delays.filter(d => d < 40).length;

    console.log(`Keystroke Analysis: Avg Delay=${averageDelay.toFixed(2)}ms, Fast Strokes=${tooFastCount}`);

    // If the average delay is less than 50ms, it's highly suspicious.
    // If more than half the strokes are unnaturally fast, it's also suspicious.
    if (averageDelay < 50 || tooFastCount > events.length / 2) {
        console.log("Keystroke pattern rejected as robotic.");
        return false;
    }

    return true;
};

// --- Main Verification Endpoint ---
app.post('/api/captcha/verify', async (req, res) => {
    // --- NEW: Add this logging block for debugging ---
    console.log('---');
    console.log(`[${new Date().toLocaleTimeString()}] Request received for /api/captcha/verify`);
    console.log('Request Body:', req.body);
    console.log('Session ID:', req.session.id);
    console.log('---');
    
    try {
        const { mousePath, interactionTime, captchaInput, keyEvents } = req.body;

        // Scenario 1: Verify a text challenge submission
        if (captchaInput) {
            if (!req.session.captchaHash) {
                return res.status(400).json({ verified: false, message: 'No challenge active.' });
            }
            const isTextCorrect = await bcrypt.compare(captchaInput.toLowerCase(), req.session.captchaHash);
            
            // NEW: Analyze keystrokes in addition to checking the text
            const areKeystrokesHuman = analyzeKeystrokes(keyEvents);

            if (isTextCorrect && areKeystrokesHuman) {
                req.session.captchaVerified = true;
                req.session.captchaHash = null;
                return res.json({ verified: true });
            } else {
                // Generate a new challenge if either check fails
                const message = isTextCorrect ? 'Typing pattern seems automated. Please try again.' : 'Incorrect text. Please try again.';
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let captchaText = '';
                for (let i = 0; i < 6; i++) { captchaText += chars.charAt(Math.floor(Math.random() * chars.length)); }
                const hash = await bcrypt.hash(captchaText.toLowerCase(), SALT_ROUNDS);
                req.session.captchaHash = hash;
                return res.status(401).json({ verified: false, message, captchaText });
            }
        }
        
        // ... (Behavioral check logic remains the same as before) ...
        const score = calculateHumanScore(mousePath, interactionTime);
        if (score > 50) {
            req.session.captchaVerified = true;
            return res.json({ verified: true });
        } else {
            // Behavioral check failed, issue a text challenge
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let captchaText = '';
            for (let i = 0; i < 6; i++) { captchaText += chars.charAt(Math.floor(Math.random() * chars.length)); }
            const hash = await bcrypt.hash(captchaText.toLowerCase(), SALT_ROUNDS);
            req.session.captchaHash = hash;
            return res.json({
                verified: false,
                challengeRequired: true,
                captchaText
            });
        }
    } catch (error) {
        console.error("CAPTCHA verification error:", error);
        res.status(500).json({ message: 'Server error during verification.' });
    }
});

// --- Simplified Login Endpoint (remains the same) ---
app.post('/api/login', async (req, res) => {
    if (!req.session.captchaVerified) {
        return res.status(403).json({ message: 'Forbidden: CAPTCHA not completed.' });
    }
    req.session.captchaVerified = false; // Invalidate after use
    // ... your login logic
    res.status(200).json({ message: `Login successful!` });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`));

