import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

const API_URL = 'https://teacher-availability-app.onrender.com';
const socket = io(API_URL);

// --- Main App: Handles Auth Routing ---
export default function App() {
    const [token, setToken] = useState(localStorage.getItem('teacher-token') || null);
    const [view, setView] = useState(token ? 'dashboard' : 'login');

    const handleLoginSuccess = (newToken) => {
        localStorage.setItem('teacher-token', newToken);
        setToken(newToken);
        setView('dashboard');
    };

    const handleLogout = () => {
        // Optimistically update UI before removing token to prevent flicker
        setView('login');
        localStorage.removeItem('teacher-token');
        setToken(null);
    };

    // Renders the correct view based on auth state
    const renderView = () => {
        switch (view) {
            case 'login':
                return <Login onLoginSuccess={handleLoginSuccess} onSwitchToRegister={() => setView('register')} />;
            case 'register':
                return <Register onSwitchToLogin={() => setView('login')} />;
            case 'dashboard':
                return <TeacherDashboard token={token} onLogout={handleLogout} />;
            default:
                return <Login onLoginSuccess={handleLoginSuccess} onSwitchToRegister={() => setView('register')} />;
        }
    };

    return (
        <div className="app-container">
            <div className="widget-wrapper">
                {renderView()}
            </div>
        </div>
    );
}

// --- Login Component ---
function Login({ onLoginSuccess, onSwitchToRegister }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
            onLoginSuccess(response.data.token);
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h2 className="form-title">Teacher Login</h2>
            {error && <p className="error-message">{error}</p>}
            <form onSubmit={handleSubmit} className="form-body">
                <div className="input-group">
                    <input id="email-address" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field input-field-top" placeholder="Email address" />
                    <input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input-field input-field-bottom" placeholder="Password" />
                </div>
                <div>
                    <button type="submit" className="submit-button" disabled={isLoading}>
                        {isLoading ? 'Signing in...' : 'Sign in'}
                    </button>
                </div>
            </form>
            <p className="switch-form-text">
                Don't have an account?{' '}
                <button onClick={onSwitchToRegister} className="switch-form-button">
                    Register here
                </button>
            </p>
        </div>
    );
}

// --- Register Component ---
function Register({ onSwitchToLogin }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [roomno, setRoomno] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);
        try {
            await axios.post(`${API_URL}/api/auth/register`, { name, email, password, phone, roomno });
            setSuccess('Registration successful! Redirecting to login...');
            setTimeout(() => onSwitchToLogin(), 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h2 className="form-title">Create Teacher Account</h2>
            {error && <p className="error-message">{error}</p>}
            {success && <p className="success-message">{success}</p>}
            <form onSubmit={handleSubmit} className="form-body">
                 <input name="name" type="text" value={name} onChange={e => setName(e.target.value)} required className="input-field input-field-top" placeholder="Full Name" />
                 <input name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field" placeholder="Email address" />
                 <input name="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required className="input-field" placeholder="Phone Number" />
                 <input name="roomno" type="text" value={roomno} onChange={e => setRoomno(e.target.value)} required className="input-field" placeholder="Room Number" />
                 <input name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input-field input-field-bottom" placeholder="Password" />
                <div>
                    <button type="submit" className="submit-button" disabled={isLoading}>
                        {isLoading ? 'Registering...' : 'Register'}
                    </button>
                </div>
            </form>
            <p className="switch-form-text">
                Already have an account?{' '}
                <button onClick={onSwitchToLogin} className="switch-form-button">
                    Login here
                </button>
            </p>
        </div>
    );
}

// --- Helper function to format seconds into HH:MM:SS ---
const formatTime = (totalSeconds) => {
    if (totalSeconds < 0) totalSeconds = 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return [hours, minutes, seconds]
        .map(v => v < 10 ? "0" + v : v)
        .join(":");
};

// --- Teacher Dashboard Component ---
function TeacherDashboard({ token, onLogout }) {
    const [isAvailable, setIsAvailable] = useState(false);
    const [teacherName, setTeacherName] = useState('Teacher');
    const [error, setError] = useState('');
    const [availableTime, setAvailableTime] = useState(0); // Time from DB
    const [sessionDuration, setSessionDuration] = useState(0); // Live timer for current session
    const [queries, setQueries] = useState([]);
    const tokenRef = useRef(token); // Use ref to avoid re-running effects when token changes

    // Effect for fetching all initial data on component mount
    useEffect(() => {
        let currentTeacherId;
        try {
            const decodedToken = JSON.parse(atob(tokenRef.current.split('.')[1]));
            currentTeacherId = decodedToken.id;
        } catch (e) {
            console.error("Invalid token:", e);
            onLogout();
            return;
        }

        socket.emit('joinRoom', currentTeacherId);

        const fetchInitialData = async () => {
            try {
                const headers = { 'x-auth-token': tokenRef.current };
                const [teachersRes, timeRes, queriesRes] = await Promise.all([
                    axios.get(`${API_URL}/api/teachers`, { headers }),
                    axios.get(`${API_URL}/api/teachers/my-time`, { headers }),
                    axios.get(`${API_URL}/api/queries/teacher`, { headers })
                ]);

                const currentTeacher = teachersRes.data.find(t => t._id === currentTeacherId);
                if (currentTeacher) {
                    setIsAvailable(currentTeacher.isAvailable);
                    setTeacherName(currentTeacher.name);
                }
                setAvailableTime(timeRes.data.totalAvailableTime);
                setQueries(queriesRes.data);
            } catch (err) {
                console.error("Error fetching initial data:", err);
                if (err.response?.status === 401 || err.response?.status === 400) {
                   onLogout(); // Token is invalid or expired
                } else {
                   setError("Could not load dashboard data.");
                }
            }
        };

        fetchInitialData();
    }, [onLogout]);

    // Effect for the live session timer
    useEffect(() => {
        let timer;
        if (isAvailable) {
            timer = setInterval(() => {
                setSessionDuration(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isAvailable]);

    // Effect for handling incoming socket events
    useEffect(() => {
        const handleNewQuery = (newQuery) => {
            setQueries(prevQueries => [newQuery, ...prevQueries]);
        };
        const handleQueryUpdate = (updatedQuery) => {
            if (updatedQuery.status === 'ended') {
                setQueries(prevQueries => prevQueries.filter(q => q._id !== updatedQuery._id));
            }
        };
        socket.on('newQuery', handleNewQuery);
        socket.on('queryUpdated', handleQueryUpdate);
        return () => {
            socket.off('newQuery', handleNewQuery);
            socket.off('queryUpdated', handleQueryUpdate);
        };
    }, []);

    const handleToggle = async () => {
        const newStatus = !isAvailable;
        try {
            await axios.put(
                `${API_URL}/api/teachers/status`,
                { isAvailable: newStatus },
                { headers: { 'x-auth-token': token } }
            );
            setIsAvailable(newStatus);

            if (!newStatus) {
                // If status changed to unavailable, re-fetch time to get accurate total
                const timeRes = await axios.get(`${API_URL}/api/teachers/my-time`, { headers: { 'x-auth-token': token } });
                setAvailableTime(timeRes.data.totalAvailableTime);
                setSessionDuration(0); // Reset live session timer
            }
        } catch (err) {
            setError('Failed to update status. Please try again.');
        }
    };

    const handleEndMeeting = async (queryId) => {
        try {
            await axios.put(`${API_URL}/api/queries/${queryId}/end`, {}, {
                headers: { 'x-auth-token': token }
            });
            // Query will be removed from the list via the 'queryUpdated' socket event
        } catch (err) {
            setError("Could not end the meeting. Please try again.");
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1 className="dashboard-title">Teacher Dashboard</h1>
                <p className="welcome-message">Welcome, {teacherName}!</p>
            </div>
            
            <div className="time-tracker">
                Today's Available Time: <strong>{formatTime(availableTime + sessionDuration)}</strong>
            </div>

            <div className="status-section">
                <p className="status-text">Your current status is:</p>
                <span className={`status-badge ${isAvailable ? 'status-available' : 'status-unavailable'}`}>
                    {isAvailable ? 'Available' : 'Not Available'}
                </span>
                
                {error && <p className="error-message">{error}</p>}

                <div className="toggle-wrapper">
                    <label htmlFor="availability-toggle" className="toggle-label">
                        <div className="toggle-switch">
                            <input type="checkbox" id="availability-toggle" className="sr-only" checked={isAvailable} onChange={handleToggle} />
                            <div className="toggle-bg"></div>
                            <div className={`toggle-dot ${isAvailable ? 'toggled' : ''}`}></div>
                        </div>
                        <div className="toggle-text">
                            Toggle Availability
                        </div>
                    </label>
                </div>
            </div>

            <div className="queries-section">
                <h2 className="queries-title">Pending Queries ({queries.length})</h2>
                {queries.length > 0 ? (
                    <ul className="queries-list">
                        {queries.map(query => (
                            <li key={query._id} className="query-item">
                                <div className="query-content">
                                    <p className="query-student"><strong>From:</strong> {query.studentName}</p>
                                    <p className="query-text">{query.queryText}</p>
                                </div>
                                <button
                                    onClick={() => handleEndMeeting(query._id)}
                                    className="end-meeting-button"
                                >
                                    End Meeting
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="no-queries-text">No pending queries right now.</p>
                )}
            </div>

            <button onClick={onLogout} className="logout-button">
                Logout
            </button>
        </div>
    );
}