import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import './App.css';

const API_URL = 'https://teacher-availability-app.onrender.com';
const socket = io(API_URL);

// --- Main App: Handles Auth Routing ---
export default function App() {
    // Attempt to load token and student info from localStorage on initial load
    const [token, setToken] = useState(localStorage.getItem('student-token'));
    const [student, setStudent] = useState(() => {
        const savedStudent = localStorage.getItem('student-info');
        try {
            return savedStudent ? JSON.parse(savedStudent) : null;
        } catch {
            return null;
        }
    });

    const [view, setView] = useState(token && student ? 'dashboard' : 'login');

    const handleLoginSuccess = (newToken, studentData) => {
        localStorage.setItem('student-token', newToken);
        localStorage.setItem('student-info', JSON.stringify(studentData));
        setToken(newToken);
        setStudent(studentData);
        setView('dashboard');
    };

    const handleLogout = () => {
        // Clear student-specific data from localStorage
        if (student) {
            localStorage.removeItem(`studentQueries_${student.id}`);
        }
        localStorage.removeItem('student-token');
        localStorage.removeItem('student-info');

        setToken(null);
        setStudent(null);
        setView('login');
    };

    // Render the correct view based on the current state (login, register, or dashboard)
    const renderView = () => {
        switch (view) {
            case 'login':
                return <Login onLoginSuccess={handleLoginSuccess} onSwitchToRegister={() => setView('register')} />;
            case 'register':
                return <Register onSwitchToLogin={() => setView('login')} />;
            case 'dashboard':
                return <StudentDashboard student={student} onLogout={handleLogout} />;
            default:
                return <Login onLoginSuccess={handleLoginSuccess} onSwitchToRegister={() => setView('register')} />;
        }
    };

    return <div className="student-app-container">{renderView()}</div>;
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
            const response = await axios.post(`${API_URL}/api/student/auth/login`, { email, password });
            onLoginSuccess(response.data.token, response.data.student);
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-form-container">
            <h2 className="form-title">Student Login</h2>
            {error && <p className="form-error">{error}</p>}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" required />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />
                </div>
                <button type="submit" className="form-submit-btn" disabled={isLoading}>
                    {isLoading ? 'Logging in...' : 'Login'}
                </button>
            </form>
            <p className="switch-form-text">
                No account? <button onClick={onSwitchToRegister} className="switch-form-link">Register Here</button>
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
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);
        try {
            await axios.post(`${API_URL}/api/student/auth/register`, { name, email, password });
            setSuccess('Registration successful! Please log in.');
            setTimeout(() => onSwitchToLogin(), 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-form-container">
            <h2 className="form-title">Create Student Account</h2>
            {error && <p className="form-error">{error}</p>}
            {success && <p className="form-success">{success}</p>}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="name">Full Name</label>
                    <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your full name" required />
                </div>
                <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" required />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" required />
                </div>
                <button type="submit" className="form-submit-btn" disabled={isLoading}>
                    {isLoading ? 'Registering...' : 'Register'}
                </button>
            </form>
            <p className="switch-form-text">
                Already registered? <button onClick={onSwitchToLogin} className="switch-form-link">Login Here</button>
            </p>
        </div>
    );
}


// --- Student Dashboard: The main view after logging in ---
function StudentDashboard({ student, onLogout }) {
    const [teachers, setTeachers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [myQueries, setMyQueries] = useState(() => {
        try {
            // Load queries specific to the logged-in student
            const savedQueries = localStorage.getItem(`studentQueries_${student.id}`);
            return savedQueries ? JSON.parse(savedQueries) : [];
        } catch (error) {
            console.error("Failed to parse queries from localStorage", error);
            return [];
        }
    });

    // Effect to fetch initial teacher data and listen for status updates
    useEffect(() => {
        const fetchInitialTeachers = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/teachers`);
                setTeachers(response.data);
            } catch (error) {
                console.error("Could not fetch teachers:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialTeachers();

        socket.on('statusUpdate', (updatedTeachers) => setTeachers(updatedTeachers));
        return () => socket.off('statusUpdate');
    }, []);

    // Effect to listen for updates to your own queries
    useEffect(() => {
        const handleQueryUpdate = (updatedQuery) => {
            setMyQueries(prevQueries => {
                const newQueries = prevQueries.map(q => q._id === updatedQuery._id ? updatedQuery : q);
                localStorage.setItem(`studentQueries_${student.id}`, JSON.stringify(newQueries));
                return newQueries;
            });
        };
        socket.on('queryUpdated', handleQueryUpdate);
        return () => socket.off('queryUpdated', handleQueryUpdate);
    }, [student.id]);

    const addMyQuery = (newQuery) => {
        setMyQueries(prevQueries => {
            const updatedQueries = [newQuery, ...prevQueries];
            localStorage.setItem(`studentQueries_${student.id}`, JSON.stringify(updatedQueries));
            return updatedQueries;
        });
    };

    return (
        <div className="student-dashboard-container">
            <header className="dashboard-header">
                <div className="header-content">
                    <h1 className="header-title">Student Dashboard</h1>
                    <p className="header-subtitle">Welcome, {student.name}!</p>
                <button onClick={onLogout} className="logout-button-student">Logout</button>
                </div>
            </header>
            <main>
                <div className="main-content">
                    <div className="student-actions-grid">
                        <QueryForm
                            availableTeachers={teachers.filter(t => t.isAvailable)}
                            onQuerySubmit={addMyQuery}
                            studentName={student.name}
                        />
                        <MyQueries queries={myQueries} />
                    </div>

                    <h2 className="section-title">All Teachers</h2>
                    {isLoading ? (
                        <p className="loading-text">Loading teacher statuses...</p>
                    ) : (
                        <div className="teachers-grid">
                            {teachers.map((teacher) => (
                                <TeacherCard key={teacher._id} teacher={teacher} />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// --- Teacher Card Component ---
function TeacherCard({ teacher }) {
    return (
        <div className="teacher-card">
            <div className="card-content">
                <div className="card-header">
                    <div className={`status-indicator ${teacher.isAvailable ? 'available' : 'unavailable'}`}></div>
                    <div className="teacher-info">
                        <h3 className="teacher-name">{teacher.name}</h3>
                        <p className="teacher-detail">{teacher.email}</p>
                        <p className="teacher-detail"><strong>Room:</strong> {teacher.roomno}</p>
                        <p className="teacher-detail"><strong>Phone:</strong> {teacher.phone}</p>
                    </div>
                </div>
                <div className="card-footer">
                    <span className={`status-pill ${teacher.isAvailable ? 'pill-available' : 'pill-unavailable'}`}>
                        {teacher.isAvailable ? 'Available' : 'Not Available'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// --- Query Form Component ---
function QueryForm({ availableTeachers, onQuerySubmit, studentName }) {
    const [queryText, setQueryText] = useState('');
    const [teacherId, setTeacherId] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (teacherId && !availableTeachers.find(t => t._id === teacherId)) {
            setTeacherId('');
        }
    }, [availableTeachers, teacherId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (!queryText || !teacherId) {
            setError('Please select a teacher and write your query.');
            return;
        }
        try {
            const response = await axios.post(`${API_URL}/api/queries`, {
                studentName, // Use name from logged-in student
                queryText,
                teacherId
            });
            onQuerySubmit(response.data);
            setSuccess('Your query has been sent!');
            setQueryText('');
            setTeacherId('');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to send query. Please try again.');
        }
    };

    return (
        <div className="form-card">
            <h3 className="form-card-title">Raise a Query</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="teacherId">Select a Teacher</label>
                    <select id="teacherId" value={teacherId} onChange={e => setTeacherId(e.target.value)} required>
                        <option value="" disabled>-- Select an available teacher --</option>
                        {availableTeachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="queryText">Your Query</label>
                    <textarea id="queryText" value={queryText} onChange={e => setQueryText(e.target.value)} rows="4" placeholder="What is your question?" required></textarea>
                </div>
                {error && <p className="form-error">{error}</p>}
                {success && <p className="form-success">{success}</p>}
                <button type="submit" className="form-submit-btn" disabled={availableTeachers.length === 0}>
                    {availableTeachers.length > 0 ? 'Send Query' : 'No Teachers Available'}
                </button>
            </form>
        </div>
    );
}

// --- My Queries Component ---
function MyQueries({ queries }) {
    const handleResolve = async (queryId, resolution) => {
        try {
            await axios.put(`${API_URL}/api/queries/${queryId}/resolve`, { resolution });
        } catch (error) {
            console.error("Failed to resolve query", error);
            alert("Could not submit feedback. Please try again.");
        }
    };

    const getStatusInfo = (query) => {
        if (query.resolution) {
            return {
                text: `Resolved: ${query.resolution.replace('_', ' ')}`,
                className: `status-res-${query.resolution}`
            };
        }
        if (query.status === 'ended') {
            return { text: 'Awaiting Feedback', className: 'status-ended' };
        }
        return { text: 'Pending', className: 'status-pending' };
    };

    return (
        <div className="my-queries-card">
            <h3 className="form-card-title">My Queries</h3>
            <div className="my-queries-list">
                {queries.length === 0 ? (
                    <p className="no-queries-text">You haven't submitted any queries yet.</p>
                ) : (
                    queries.map(q => {
                        const status = getStatusInfo(q);
                        return (
                            <div key={q._id} className="my-query-item">
                                <p className="my-query-text">{q.queryText}</p>
                                <div className="my-query-footer">
                                    <span className={`query-status-tag ${status.className}`}>
                                        {status.text}
                                    </span>
                                    {q.status === 'ended' && !q.resolution && (
                                        <div className="resolution-buttons">
                                            <button onClick={() => handleResolve(q._id, 'satisfied')} className="btn-satisfied">Satisfied</button>
                                            <button onClick={() => handleResolve(q._id, 'not_satisfied')} className="btn-not-satisfied">Not Satisfied</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    );
}