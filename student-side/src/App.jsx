// student-app/src/App.js

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:5000';
const socket = io(API_URL);

// --- Main App Component ---
export default function App() {
    const [teachers, setTeachers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [myQueries, setMyQueries] = useState(() => {
        try {
            const savedQueries = localStorage.getItem('studentQueries');
            return savedQueries ? JSON.parse(savedQueries) : [];
        } catch (error) {
            console.error("Failed to parse queries from localStorage", error);
            return [];
        }
    });

    useEffect(() => {
        // Fetch initial teacher list via HTTP on component mount
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

        // Listen for real-time status updates from Socket.IO
        socket.on('statusUpdate', (updatedTeachers) => setTeachers(updatedTeachers));

        return () => {
            socket.off('statusUpdate');
        };
    }, []);

    useEffect(() => {
        // Listen for updates to your own submitted queries
        const handleQueryUpdate = (updatedQuery) => {
            setMyQueries(prevQueries => {
                const newQueries = prevQueries.map(q => q._id === updatedQuery._id ? updatedQuery : q);
                localStorage.setItem('studentQueries', JSON.stringify(newQueries));
                return newQueries;
            });
        };
        socket.on('queryUpdated', handleQueryUpdate);
        return () => socket.off('queryUpdated', handleQueryUpdate);
    }, []);

    // Adds a newly submitted query to the top of the list
    const addMyQuery = (newQuery) => {
        setMyQueries(prevQueries => {
            const updatedQueries = [newQuery, ...prevQueries];
            localStorage.setItem('studentQueries', JSON.stringify(updatedQueries));
            return updatedQueries;
        });
    };

    return (
        <div className="student-dashboard-container">
            <header className="dashboard-header">
                <div className="header-content">
                    <h1 className="header-title">Teacher Availability</h1>
                    <p className="header-subtitle">Real-time status of your teachers</p>
                </div>
            </header>
            <main>
                <div className="main-content">
                    <div className="student-actions-grid">
                        <QueryForm availableTeachers={teachers.filter(t => t.isAvailable)} onQuerySubmit={addMyQuery} />
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
function QueryForm({ availableTeachers, onQuerySubmit }) {
    const [studentName, setStudentName] = useState('');
    const [queryText, setQueryText] = useState('');
    const [teacherId, setTeacherId] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        // If the selected teacher becomes unavailable, reset the selection
        if (teacherId && !availableTeachers.find(t => t._id === teacherId)) {
            setTeacherId('');
        }
    }, [availableTeachers, teacherId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (!studentName || !queryText || !teacherId) {
            setError('Please fill out all fields.');
            return;
        }
        try {
            const response = await axios.post(`${API_URL}/api/queries`, {
                studentName, queryText, teacherId
            });
            onQuerySubmit(response.data);
            setSuccess('Your query has been sent!');
            setStudentName('');
            setQueryText('');
            setTeacherId('');
            setTimeout(() => setSuccess(''), 3000); // Clear success message after 3s
        } catch (err) {
            setError('Failed to send query. Please try again.');
        }
    };

    return (
        <div className="form-card">
            <h3 className="form-card-title">Raise a Query</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="studentName">Your Name</label>
                    <input id="studentName" type="text" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Enter your name" required />
                </div>
                <div className="form-group">
                    <label htmlFor="teacherId">Select a Teacher</label>
                    <select id="teacherId" value={teacherId} onChange={e => setTeacherId(e.target.value)} required>
                        <option value="" disabled>-- Select an available teacher --</option>
                        {availableTeachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="queryText">Your Query</label>
                    <textarea id="queryText" value={queryText} onChange={e => setQueryText(e.target.value)} rows="3" placeholder="What is your question?" required></textarea>
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