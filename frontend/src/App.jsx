import React, { useState } from 'react';
import Captcha from './Captcha';

// Configure your backend API endpoint
const API_URL = 'http://localhost:3001';

function App() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password123');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(Date.now());

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!isCaptchaVerified) {
      setFormMessage('Please complete the CAPTCHA verification first.');
      return;
    }
    
    setIsSubmitting(true);
    setFormMessage('Logging in...');

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Use withCredentials to send the session cookie
        credentials: 'include', 
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      setFormMessage(data.message);

      if (!response.ok) {
        // If login fails, reset the CAPTCHA
        setIsCaptchaVerified(false); 
        setCaptchaKey(Date.now()); // Change key to force re-mount
      }
    } catch (error) {
      console.error('Login failed:', error);
      setFormMessage('Error: Could not connect to the server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center text-white p-4">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700">
        <h1 className="text-3xl font-bold text-center mb-6 text-blue-400">Secure Login</h1>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          
          <Captcha 
            key={captchaKey} // Use key to reset component state when login fails
            apiUrl={API_URL}
            onVerified={(status) => setIsCaptchaVerified(status)}
          />
          
          <button type="submit" disabled={!isCaptchaVerified || isSubmitting} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold transition-all duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? 'Logging In...' : 'Login'}
          </button>
        </form>

        {formMessage && <p className="mt-4 text-center text-sm font-medium p-3 rounded-md bg-gray-700">{formMessage}</p>}
      </div>
    </div>
  );
}

export default App;

