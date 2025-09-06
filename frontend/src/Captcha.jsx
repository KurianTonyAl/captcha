import React, { useState, useEffect, useRef } from 'react';

const Captcha = ({ onVerified }) => {
    const [status, setStatus] = useState('pending'); 
    const [challenge, setChallenge] = useState({ text: '', required: false });
    const [userInput, setUserInput] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // --- Behavioral Data Collection ---
    const [mousePath, setMousePath] = useState([]);
    const [mountTime, setMountTime] = useState(0);
    const [keyEvents, setKeyEvents] = useState([]);
    const wrapperRef = useRef(null);
    const canvasRef = useRef(null);

    // --- Record component mount time ---
    useEffect(() => {
        setMountTime(Date.now());
    }, []);

    // --- Passive Mouse Tracking Effect ---
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || status !== 'pending') return;
        const handleMouseMove = (e) => {
            const rect = wrapper.getBoundingClientRect();
            setMousePath(prev => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top, t: Date.now() }]);
        };
        wrapper.addEventListener('mousemove', handleMouseMove);
        return () => wrapper.removeEventListener('mousemove', handleMouseMove);
    }, [status]);

    // --- Canvas Drawing Effect ---
    useEffect(() => {
        if (!challenge.required || !challenge.text) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 38px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < challenge.text.length; i++) {
            ctx.save();
            ctx.fillStyle = `hsl(${Math.random() * 360}, 60%, 70%)`;
            const x = canvas.width / 2 + (i - challenge.text.length / 2) * 25 + (Math.random() - 0.5) * 10;
            const y = canvas.height / 2 + (Math.random() - 0.5) * 15;
            ctx.translate(x, y);
            ctx.rotate(Math.random() * 0.4 - 0.2);
            ctx.fillText(challenge.text[i], 0, 0);
            ctx.restore();
        }
    }, [challenge.text, challenge.required]);

    const handleApiVerification = async (payload) => {
        setIsLoading(true);
        setMessage('');
        try {
            // CRITICAL CHANGE: Use the full backend URL
            const response = await fetch('http://localhost:3001/api/captcha/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Important for sessions/cookies
                body: JSON.stringify(payload),
            });
            const data = await response.json();

            if (data.verified) {
                setStatus('verified');
                onVerified(true); // Notify parent component
            } else if (data.challengeRequired) {
                setStatus('challenge');
                setChallenge({ text: data.captchaText, required: true });
                setMessage(data.message || 'Please complete the security check.');
                onVerified(false);
            } else {
                setStatus('challenge');
                setChallenge({ text: data.captchaText || challenge.text, required: true });
                setMessage(data.message || 'Verification failed. Please try again.');
                onVerified(false);
            }
        } catch (error) {
            console.error("CAPTCHA API Error:", error);
            setMessage('Error: Could not connect to verification service.');
            onVerified(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCheckboxClick = () => {
        if (isLoading) return;
        const interactionTime = Date.now() - mountTime;
        handleApiVerification({ mousePath, interactionTime });
    };

    const handleChallengeSubmit = (e) => {
        e.preventDefault();
        handleApiVerification({ captchaInput: userInput, keyEvents });
        setUserInput('');
        setKeyEvents([]);
    };
    
    const handleKeyDown = (e) => {
        setKeyEvents(prev => [...prev, { key: e.key, t: Date.now() }]);
    };
    
    if (status === 'challenge') {
        return (
             <div ref={wrapperRef} className="bg-gray-900 p-4 rounded-lg border border-gray-700 w-full max-w-sm mx-auto space-y-4">
                <p className="text-xs text-center text-yellow-400">{message}</p>
                <div className="flex items-center justify-center">
                    <canvas ref={canvasRef} width="200" height="50" className="rounded-md bg-gray-800" />
                </div>
                <form onSubmit={handleChallengeSubmit} className="space-y-3">
                    <input
                        type="text"
                        placeholder="Enter text from image"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                        required
                    />
                    <button type="submit" disabled={isLoading} className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">
                        {isLoading ? 'Verifying...' : 'Verify'}
                    </button>
                </form>
            </div>
        );
    }
    
    const getCheckboxContent = () => {
        if (status === 'verified') return <svg xmlns="http://www.w3.org/2001/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-400"><polyline points="20 6 9 17 4 12"></polyline></svg>;
        if (isLoading) return <div className="w-6 h-6 border-4 border-gray-400 border-t-blue-500 rounded-full animate-spin"></div>;
        return <div className="w-6 h-6 border-2 border-gray-500 rounded-sm"></div>;
    };

    return (
        <div ref={wrapperRef} className="bg-gray-900 p-4 rounded-lg border border-gray-700 w-full max-w-sm mx-auto">
            <div className={`flex items-center gap-4 p-3 rounded-md transition-colors ${status === 'pending' ? 'cursor-pointer hover:bg-gray-800' : ''}`}
                onClick={handleCheckboxClick}>
                <div className="flex items-center justify-center w-8 h-8 bg-gray-900 border border-gray-600 rounded-md">
                    {getCheckboxContent()}
                </div>
                <span className="text-gray-300 font-medium">
                    {status === 'verified' ? 'You are verified' : 'I am not a robot'}
                </span>
            </div>
        </div>
    );
};

export default Captcha;

