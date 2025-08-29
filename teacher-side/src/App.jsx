import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css'; // Import the CSS file

// --- Configuration ---
// Make sure this points to your backend server URL
const API_URL = 'http://localhost:5000'; 
const socket = io(API_URL);

// --- Main App Component ---
export default function App() {
    const [token, setToken] = useState(localStorage.getItem('teacher-token') || null);
    const [view, setView] = useState(token ? 'dashboard' : 'login'); // 'login', 'register', 'dashboard'

    const handleLoginSuccess = (newToken) => {
        localStorage.setItem('teacher-token', newToken);
        setToken(newToken);
        setView('dashboard');
    };

    const handleLogout = () => {
        localStorage.removeItem('teacher-token');
        setToken(null);
        setView('login');
    };

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
            onLoginSuccess(response.data.token);
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please try again.');
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
                    <button type="submit" className="submit-button">
                        Sign in
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
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [roomno, setRoomno] = useState('');
    const [phone , setPhoneno] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            await axios.post(`${API_URL}/api/auth/register`, { name, email, password , roomno , phone });
            setSuccess('Registration successful! Please log in.');
            setTimeout(() => onSwitchToLogin(), 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        }
    };

    return (
        <div>
            <h2 className="form-title">Create Account</h2>
            {error && <p className="error-message">{error}</p>}
            {success && <p className="success-message">{success}</p>}
            <form onSubmit={handleSubmit} className="form-body">
                 <input name="name" type="text" value={name} onChange={e => setName(e.target.value)} required className="input-field input-field-top" placeholder="Full Name" />
                 <input name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field" placeholder="Email address" />
                 <input id="email-address" name="phoneno" type="text" value={phone} onChange={e => setPhoneno(e.target.value)} required className="input-field input-field-top" placeholder="Phone No." />
                 <input name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input-field input-field-bottom" placeholder="Password" />
                 <input id="email-address" name="roomno" type="text" value={roomno} onChange={e => setRoomno(e.target.value)} required className="input-field input-field-top" placeholder="Room No." />
                <div>
                    <button type="submit" className="submit-button">
                        Register
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

// --- Teacher Dashboard Component ---
function TeacherDashboard({ token, onLogout }) {
    const [isAvailable, setIsAvailable] = useState(false);
    const [teacherName, setTeacherName] = useState('Teacher');
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchInitialStatus = async () => {
             try {
                const decodedToken = JSON.parse(atob(token.split('.')[1]));
                const teacherId = decodedToken.id;
                
                const response = await axios.get(`${API_URL}/api/teachers`);
                const currentTeacher = response.data.find(t => t._id === teacherId);

                if (currentTeacher) {
                    setIsAvailable(currentTeacher.isAvailable);
                    setTeacherName(currentTeacher.name);
                }
            } catch (err) {
                console.error("Error fetching initial status:", err);
                setError("Could not load your status.");
            }
        };
        fetchInitialStatus();
    }, [token]);

    const handleToggle = async () => {
        const newStatus = !isAvailable;
        try {
            await axios.put(
                `${API_URL}/api/teachers/status`,
                { isAvailable: newStatus },
                { headers: { 'x-auth-token': token } }
            );
            setIsAvailable(newStatus);
        } catch (err) {
            setError('Failed to update status. Please try again.');
            console.error(err);
        }
    };

    return (
        <div className="dashboard-container">
            <h1 className="dashboard-title">Teacher Dashboard</h1>
            <p className="welcome-message">Welcome, {teacherName}!</p>
            
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

            <button onClick={onLogout} className="logout-button">
                Logout
            </button>
        </div>
    );
}
